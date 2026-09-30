// Masar CV worker: holds the Gemini key so the static site never sees it.
//
//   POST /parse   {text}                 -> {profile}
//   POST /tailor  {profile, job, lang}   -> {cv, coverage, removed}
//
// Nothing is stored. Contact details never reach this worker: the page strips
// them before sending and adds them back when it renders the CV.
//
// The model is told to use only the student's own facts, and audit() enforces
// it afterwards: a skill the posting wants but the profile lacks, or a number
// the profile never states, is removed and reported rather than trusted.

import { audit, covers, mentions, numbersIn, restore, strings, str } from "./audit.js";
import { board } from "./board.js";
import { auth } from "./auth.js";
import { support } from "./support.js";
import { stats } from "./stats.js";
import { talent } from "./talent.js";

const MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest"];
const MAX_BODY = 40_000;
const HOURLY_LIMIT = 30; // per IP, per isolate: a speed bump, not a wall

const hits = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const cors = allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : null;
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
    });

    if (!cors) return reply(403, { error: "origin" });
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        ...cors, "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Masar-Session", "Access-Control-Max-Age": "86400" } });
    }
    const path = new URL(request.url).pathname;
    // student accounts; only signing in is rate limited, a signed-in device syncs freely
    if (path.startsWith("/auth/")) {
      if (path === "/auth/google" && limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });
      try {
        const out = await auth(request, env, path);
        return out ? reply(200, out) : reply(404, { error: "path" });
      } catch (e) {
        if (!e.code) console.error(e.stack || e);
        return reply(e.status || 500, { error: e.code || "server", ...e.extra });
      }
    }
    // opt-in student cards employers can search, and their invitations
    if (path === "/talent" || path.startsWith("/talent/")) {
      if (request.method === "POST" && path === "/talent/invite" && limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });
      try { return reply(200, (await talent(request, env, path)) || { error: "path" }); }
      catch (e) { if (!e.code) console.error(e.stack || e); return reply(e.status || 500, { error: e.code || "server" }); }
    }
    // visitor counts: no cookies, no IP stored
    if (path === "/hit" || path === "/stats") {
      try { return reply(200, (await stats(request, env, path)) || { error: "path" }); }
      catch (e) { if (!e.code) console.error(e.stack || e); return reply(e.status || 500, { error: e.code || "server" }); }
    }
    // the support assistant answers from the facts below, rate limited like the CV tools
    if (path === "/support/ask" && request.method === "POST") {
      if (limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });
      const raw = await request.text();
      if (raw.length > 3000) return reply(413, { error: "size" });
      try { return reply(200, await ask(JSON.parse(raw), env)); }
      catch (e) { if (!e.code) console.error(e.stack || e); return reply(e.status || 502, { error: e.code || "upstream" }); }
    }
    // support conversations; opening one and writing in it are rate limited
    if (path.startsWith("/support/")) {
      try {
        const out = await support(request, env, path, () => limited(request.headers.get("CF-Connecting-IP") || "?"));
        return out ? reply(200, out) : reply(404, { error: "path" });
      } catch (e) {
        if (!e.code) console.error(e.stack || e);
        return reply(e.status || 500, { error: e.code || "server" });
      }
    }
    // exclusive postings; reading the public list is not rate limited
    if (path.startsWith("/board/")) {
      if (request.method === "POST" && limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });
      try {
        const out = await board(request, env, path);
        return out ? reply(200, out) : reply(404, { error: "path" });
      } catch (e) {
        if (!e.code) console.error(e.stack || e);
        return reply(e.status || 500, { error: e.code || "server" });
      }
    }
    if (request.method !== "POST") return reply(405, { error: "method" });
    if (!["/parse", "/tailor", "/interview", "/linkedin"].includes(path)) return reply(404, { error: "path" });
    if (limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });

    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "size" });
    let input;
    try { input = JSON.parse(raw); } catch { return reply(400, { error: "json" }); }

    try {
      const handle = { "/parse": parse, "/tailor": tailor, "/interview": interview, "/linkedin": linkedin }[path];
      return reply(200, await handle(input, env));
    } catch (e) {
      if (!e.code) console.error(e.stack || e); // a bug here, not an upstream answer
      return reply(e.status || 502, { error: e.code || "upstream" });
    }
  },
};

function limited(ip) {
  const hour = Math.floor(Date.now() / 3_600_000);
  const key = `${ip}:${hour}`;
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) hits.clear();
  return n > HOURLY_LIMIT;
}

const fail = (status, code) => Object.assign(new Error(code), { status, code });

async function gemini(env, prompt) {
  let last = fail(502, "upstream");
  // a busy moment at Google passes in a second or two: the first model gets
  // a second try after the fallback, with a short pause between tries
  for (const [i, model] of [...MODELS, MODELS[0]].entries()) {
    if (i) await new Promise((ok) => setTimeout(ok, 1200));
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (r.status === 401 || r.status === 403) throw fail(502, "key");
    if (!r.ok) {
      console.error(`gemini ${model}: HTTP ${r.status}`);
      last = fail(r.status === 429 || r.status >= 500 ? 429 : 502, r.status === 429 || r.status >= 500 ? "busy" : "upstream");
      continue;
    }
    const data = await r.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    try { return JSON.parse(text); } catch { last = fail(502, "bad_json"); }
  }
  throw last;
}

// ---------- endpoints ----------

async function parse(input, env) {
  const text = str(input?.text, 20_000);
  if (text.length < 80) throw fail(400, "too_short");
  const out = await gemini(env, `Split this CV into the fields of a form. Copy the student's own words and keep every fact; do not invent, translate or summarise facts away. Contact details were removed on purpose.

experience and projects: one entry per paragraph, entries separated by a blank line. First line of an entry: title or project name, organisation, location, work arrangement (remote, part-time) and dates exactly as written. Following lines: its points, one per line.
skills: one string per group as written, e.g. "Microsoft Excel: pivot tables, lookups".
other: everything else worth keeping, one per line: headline or target role, work authorisation or iqama, driving licence, availability, relocation, coursework, links to work.
city: the city the student lives in, if stated.
graduation: the study period exactly as written, e.g. "2021-2026", or the graduation year if only that is given.
In experience, the first line keeps the organisation name apart from its location.

Return JSON only, in this shape:
{"city":"","university":"","degree":"","major":"","graduation":"","gpa":"","skills":[""],"experience":"","projects":"","certificates":[""],"languages":[""],"other":""}

CV:
${text}`);

  const known = new Set(numbersIn(text));
  const honest = (block) => str(block, 6000).split("\n")
    .filter((line) => numbersIn(line).every((n) => known.has(n))).join("\n");
  return { profile: {
    university: str(out.university, 160), degree: str(out.degree, 120), major: str(out.major, 120),
    graduation: str(out.graduation, 40), gpa: numbersIn(out.gpa).every((n) => known.has(n)) ? str(out.gpa, 20) : "",
    skills: strings(out.skills, 60).filter((s) => mentions(text, s)),
    experience: honest(out.experience), projects: honest(out.projects),
    certificates: strings(out.certificates, 20), languages: strings(out.languages, 10),
    city: mentions(text, str(out.city, 60)) ? str(out.city, 60) : "", other: honest(out.other),
  } };
}

// the student's profile (no contact fields) and the posting, as both /tailor and /interview read them
function inputs(input) {
  const p = input?.profile || {};
  const profile = {
    university: str(p.university, 160), degree: str(p.degree, 120), major: str(p.major, 120),
    graduation: str(p.graduation, 40), gpa: str(p.gpa, 20), skills: str(p.skills, 1500),
    experience: str(p.experience, 6000), projects: str(p.projects, 6000),
    certificates: str(p.certificates, 1500), languages: str(p.languages, 300), other: str(p.other, 1500),
  };
  const source = Object.values(profile).join("\n");
  if (source.replace(/\s/g, "").length < 40) throw fail(400, "too_short");

  const job = input?.job || {};
  const listed = { required: strings(job.required, 30), preferred: strings(job.preferred, 30) };
  const pasted = str(job.description, 12_000);
  const lang = input?.lang === "ar" ? "Arabic" : "English";
  const posting = pasted
    ? pasted
    : `${str(job.title, 200)} at ${str(job.company, 120)}\nRequired skills: ${listed.required.join(", ")}\nPreferred skills: ${listed.preferred.join(", ")}`;
  return { profile, source, job, listed, pasted, lang, posting };
}

// Likely interview questions for this posting, each with a pointer to what in
// the student's own profile answers it. Where the profile has nothing, the tip
// says so and suggests how to prepare, rather than inventing an experience.
async function interview(input, env) {
  const { source, lang, posting } = inputs(input);
  const out = await gemini(env, `You are preparing a student for a job interview. Return JSON only:
{"questions":[{"q":"the question","why":"what the interviewer is checking, one sentence","tip":"how THIS student can answer, pointing to a specific item in PROFILE; or, if PROFILE has nothing for it, say so plainly and suggest one concrete way to prepare"}]}

Rules:
- 8 questions: 4 technical ones about the skills and tasks the POSTING names, 2 about the student's own projects or experience in PROFILE, 2 behavioural (teamwork, a problem, learning something fast).
- Never claim the student did or knows something PROFILE does not state. Refer to their items by name.
- No generic filler ("be confident", "research the company") unless tied to something specific.
- Write everything in ${lang}. Skill and tool names stay as written.

POSTING:
${posting}

PROFILE:
${source}`);
  const questions = (Array.isArray(out?.questions) ? out.questions : []).slice(0, 10)
    .map((x) => ({ q: str(x?.q, 400), why: str(x?.why, 400), tip: str(x?.tip, 800) })).filter((x) => x.q);
  if (!questions.length) throw fail(502, "bad_json");
  return { questions };
}

// What the support assistant may say about Masar. It answers from these facts
// only; anything else goes to the team through a support conversation.
const FACTS = `Masar (مسار) is a free site for students and new graduates in Saudi Arabia and the Gulf.
- Postings: internships, co-op (تدريب تعاوني), part-time for students and entry-level jobs in data, software and IT, accounting and finance, engineering, marketing and HR. Collected daily from open job platforms and Google Jobs for Saudi Arabia; each links to its source. Exclusive postings come straight from companies and are reviewed before they go live. Postings page: jobs.html, with filters for field, country, type, experience and level, and a "saved" filter.
- Masar never asks for fees. A posting that asks for money, an ID copy or contact on WhatsApp/Telegram is a scam: report it through support.
- CV builder (cv.html): upload a PDF or Word CV (a scanned image cannot be read - paste the text instead) or fill the form; it tailors the CV to a posting using only the student's own facts, removes what they lack, and shows what the posting asks that they do not have. Save as PDF or as Word (docx; use Word for an Arabic CV, because screening systems read Arabic inside a PDF reversed), earlier CVs are kept, interview questions, LinkedIn headline and About. Each finished CV shows its ATS check.
- ATS check (ats.html): upload a PDF or Word CV and optionally pick a posting or paste a description; it shows exactly the text a screening system reads, what breaks it (a scanned image, two columns, tables, text boxes, contact in the page header, joined letters like fi, Arabic inside a PDF, missing sections, dates or contact) with fixed points for each, a content score (numbers and results in the experience points, points starting with an action verb, no duty phrases like "Responsible for", a summary, at least six skills, a LinkedIn link), and which of the posting's skills are found. The ATS score is half reading and half content without a posting, and 30% reading, 30% content, 40% match with one; 85+ is excellent, 70+ good, 50+ needs work. The file is read in the browser and never uploaded. There is no single ATS; the score is fixed rules, not a prediction of any company's system.
- Apply: on exclusive postings students apply from the CV page or by swiping on swipe.html (right to apply, left to skip, 5 seconds to undo). Contact details go to the company only after the student ticks consent. One application per email per posting.
- My applications (applications.html): whether the company opened the CV, shortlist, rank among applicants, one reminder to the company after 7 days without a reply.
- Accounts are optional (account.html): sign in with Google only, no password, so there is no password to reset. Signing in keeps the profile, CVs, applications and saved postings in sync across devices. The profile can be edited there. "Delete my account" in account.html deletes everything stored for it.
- Without an account everything stays in the browser; clearing site data removes it.
- Employers post for free on employers.html with a work email on their own domain; they see applicants on a private link.
- The site can be installed as an app from the browser menu.
- Email replies from support are not available yet; answers appear on the support page.
- Privacy: privacy.html. Terms: terms.html.`;

async function ask(input, env) {
  const q = str(input?.q, 600);
  if (q.length < 3) throw fail(400, "field:text");
  const out = await gemini(env, `You answer questions about the Masar website for its support page. Return JSON only:
{"answer":"","confident":true}

Rules:
- Answer only from FACTS. If FACTS do not cover the question, or it is about the person's own account, a bug, a specific posting or company, or anything needing a human, set confident false and say briefly that the team will help through a support conversation.
- Reply in the language of the question (Arabic in a friendly Gulf-neutral tone, or English). 1-4 short sentences. Name the page to open when one fits (for example "صفحة حسابك"), without URLs.
- Never ask for passwords, ID numbers or card numbers. Never promise a job.

FACTS:
${FACTS}

QUESTION:
${q}`);
  const answer = str(out?.answer, 1200);
  if (!answer) throw fail(502, "bad_json");
  return { answer, confident: out?.confident !== false };
}

// A LinkedIn headline and About section from the student's own profile. No
// posting: the profile is aimed at the role the student targets (other, or
// what the experience shows). The same rules as the CV: nothing invented.
async function linkedin(input, env) {
  const { source, lang } = inputs({ ...input, job: { description: "none" } });
  const out = await gemini(env, `You are writing a student's LinkedIn profile text. Return JSON only:
{"headline":"","about":"","skills":[""],"tips":[""]}

Rules:
- Use only facts found in PROFILE. Never add a skill, employer, title, number or achievement it does not state.
- headline: at most 200 characters: the role the student targets (from PROFILE if stated, else what their studies and experience show), then 3-5 core skills or a concrete strength, separated by " | ". Add "Open to co-op" or "Open to internships" only if PROFILE says the student is looking for one.
- about: 3 short paragraphs, first person, at most 1,500 characters in all: who the student is and what they are studying or doing; the evidence - 2-3 things they built or achieved, with numbers only where PROFILE gives them; what they want next and where (city, country, co-op or internship) if PROFILE says.
- No stock phrases ("passionate", "hard-working", "fast learner", "team player", "results-driven", "eager to leverage", "looking for an opportunity", "able to work under pressure"). No emojis. No level words the student did not use ("expert", "advanced", "proficient").
- skills: up to 10 skills from PROFILE for LinkedIn's Skills section, most marketable first, as LinkedIn spells them ("Microsoft Excel", "Power BI", "SQL"). A skill PROFILE marks as basic or course-only stays out of the headline and goes last here.
- tips: 3-4 short, specific things this student should add to their LinkedIn profile, based on what PROFILE shows is missing (a certificate to add under Licenses, a project to put in Featured, a test score). No generic advice.
- Write headline and about in ${lang}; skill names stay as written. Write tips in Arabic.

PROFILE:
${source}`);
  const headline = str(out?.headline, 220), about = str(out?.about, 2600);
  if (!headline || !about) throw fail(502, "bad_json");
  return { headline, about, skills: strings(out?.skills, 10), tips: strings(out?.tips, 5) };
}

async function tailor(input, env) {
  const { profile, source, job, listed, pasted, lang, posting } = inputs(input);

  const cv = await gemini(env, `You are tailoring a student's CV to one job posting. Return JSON only.

Hard rules:
- Use only facts found in PROFILE. Never add a skill, tool, employer, title, date, number or achievement that PROFILE does not state. If the posting wants something PROFILE lacks, leave it out.
- You may rephrase, reorder, merge or drop the student's own points, and use the posting's wording for things the student really did.
- Tie a skill to a job or project only where PROFILE says it was used there. Keep qualifiers such as "basic" or "in progress".
- No stock phrases ("eager to leverage", "passionate", "results-driven", "looking for an opportunity", "fast learner", "able to work under pressure", "team player", "hard-working"); recruiters skip them. Say what the student did instead.
- No level words the student did not use ("proficient", "expert", "strong", "advanced"), and no activity PROFILE does not name: knowing SQL is not "writing SQL queries".
- Keep every date range, location, work arrangement (remote, part-time), metric and qualifier PROFILE states. Keep a point that carries a number or a result (what the work led to) unless an item has more than 5.
- Write a point as what the student achieved, not a routine duty, when PROFILE gives the result ("Reviewed 120+ invoices a day" beats "Responsible for invoices"). Never invent the result or the number.
- education dates: the graduation year only ("2027"); if the study is still in progress, "Expected 2027".
- Experience and projects newest first, as on a normal CV; work in progress is the newest.
- dates holds dates only; "part time", "remote" and the like go in location.
- Never name the employer of the POSTING. If the posting is for another field than PROFILE, still write an honest CV of what the student has; do not stretch facts to fit.
- Bullets start with an action verb, 3 to 5 per item when PROFILE has them, most relevant first.
- Write in ${lang}. Keep tool and skill names in their usual Latin spelling.
- Fix spelling, grammar, capitalisation and spacing ("power bi" -> "Power BI", "excel" -> "Excel"); that changes no fact.
- Drop pointers such as "see GitHub" or "link below"; the page adds the links itself.
- languages: the mother tongue as "Arabic (Native)". For any other language keep only a test and its score if PROFILE has one ("English (IELTS 6.5)", "English (STEP 85)"); drop self-rated levels such as good, very good, intermediate or fluent, and write just the language name. Every language PROFILE lists stays in the list: "English very good" becomes "English", never nothing.
- summary: 2-3 sentences aimed at this posting, only from PROFILE: the field the student targets, what they bring to the employer, and the evidence for it from their experience or projects. If PROFILE states availability, work authorisation or iqama, or readiness to relocate, the last sentence carries all of them as written.
- headline: if PROFILE states a headline or target role, use it as written; otherwise the student's role and 3-4 core skills, e.g. "Data Analyst | Excel, Power BI, SQL".
- experience: org is the organisation name only; its city or region goes in location, together with the work arrangement.
- skills: every technical skill PROFILE lists, with its qualifier ("Tableau (course only)"), most relevant to the posting first. Always in groups, one string each, in this order: "Technical: tools and languages", "Specialised: field skills such as data cleaning, reporting, dashboard design", "Soft skills: ..." - soft skills only when PROFILE lists them, and never invented. Skip an empty group. Licences do not go here.
- certificates: newest first, each as "Name | Provider | hours | year" with the parts PROFILE gives; leave out the hours when under 10.
- additional: work authorisation or iqama, driving licence, availability, relocation, coursework and similar facts from PROFILE, one per string.
- job_required, job_preferred: arrays of short names of the tools and technical skills the POSTING asks for (required / nice to have), e.g. ["Microsoft 365", "network troubleshooting"]. Every posting names some; never leave job_required empty. Not degrees, enrolment, languages or years of experience.

Shape:
{"headline":"","summary":"","skills":[""],"experience":[{"title":"","org":"","location":"","dates":"","bullets":[""]}],"projects":[{"name":"","tools":"","dates":"","bullets":[""]}],"education":[{"degree":"","major":"","school":"","dates":"","gpa":""}],"certificates":[""],"languages":[""],"additional":[""],"job_required":[""],"job_preferred":[""]}

POSTING:
${posting}

PROFILE:
${JSON.stringify(profile, null, 1)}`);

  // a listed posting's skills come from our own extraction; a pasted one's from the model
  // models sometimes answer these lists with one comma-separated string
  // languages are not skills to cover, whatever the model says
  const LANGUAGE = /^(arabic|english|french|urdu|العربية|الإنجليزية|الانجليزية)$/i;
  const list = (v) => strings(typeof v === "string" ? v.split(/[,،]/) : v, 30).filter((s) => !LANGUAGE.test(s));
  const required = pasted ? list(cv.job_required) : listed.required;
  const preferred = pasted ? list(cv.job_preferred) : listed.preferred;
  delete cv.job_required; delete cv.job_preferred;

  // Skills to watch for in free text: the posting's, every name the market
  // index knows (sent by the page), and any the model listed on its own.
  const watch = [...required, ...preferred, ...strings(input?.vocabulary, 300), ...strings(cv.skills)]
    .filter((s) => s.length <= 40);
  const removed = audit(cv, source, watch);
  const all = [...cv.experience, ...cv.projects];
  restore(cv.experience, profile.experience, lang === "Arabic", all);
  restore(cv.projects, profile.projects, lang === "Arabic", all);
  // Coverage forgives qualifiers: "Advanced Excel" is covered by "Excel". The
  // audit above stays literal, so the CV still cannot claim "advanced".
  const has = (s) => covers(source, s, true);
  return {
    cv, removed,
    coverage: {
      required, matched: required.filter(has), missing: required.filter((s) => !has(s)),
      preferred_missing: preferred.filter((s) => !has(s)),
    },
  };
}

