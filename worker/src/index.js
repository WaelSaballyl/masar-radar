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

import { audit, mentions, numbersIn, strings, str } from "./audit.js";

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
        ...cors, "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" } });
    }
    if (request.method !== "POST") return reply(405, { error: "method" });
    const path = new URL(request.url).pathname;
    if (path !== "/parse" && path !== "/tailor") return reply(404, { error: "path" });
    if (limited(request.headers.get("CF-Connecting-IP") || "?")) return reply(429, { error: "rate" });

    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { error: "size" });
    let input;
    try { input = JSON.parse(raw); } catch { return reply(400, { error: "json" }); }

    try {
      return reply(200, path === "/parse" ? await parse(input, env) : await tailor(input, env));
    } catch (e) {
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
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (r.status === 401 || r.status === 403) throw fail(502, "key");
    if (!r.ok) { last = fail(r.status === 429 ? 429 : 502, r.status === 429 ? "busy" : "upstream"); continue; }
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

async function tailor(input, env) {
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

  const cv = await gemini(env, `You are tailoring a student's CV to one job posting. Return JSON only.

Hard rules:
- Use only facts found in PROFILE. Never add a skill, tool, employer, title, date, number or achievement that PROFILE does not state. If the posting wants something PROFILE lacks, leave it out.
- You may rephrase, reorder, merge or drop the student's own points, and use the posting's wording for things the student really did.
- Tie a skill to a job or project only where PROFILE says it was used there. Keep qualifiers such as "basic" or "in progress".
- No stock phrases ("eager to leverage", "passionate", "results-driven"); say what the student did.
- Keep every date range, location, work arrangement (remote, part-time), metric and qualifier PROFILE states; a study period stays the whole period, not just its last year. Keep a point that carries a number or a result (what the work led to) unless an item has more than 4.
- Experience and projects newest first, as on a normal CV.
- Never name the employer of the POSTING. If the posting is for another field than PROFILE, still write an honest CV of what the student has; do not stretch facts to fit.
- Bullets start with an action verb, at most 4 per item, most relevant first.
- Write in ${lang}. Keep tool and skill names in their usual Latin spelling.
- summary: 2-3 sentences aimed at this posting, only from PROFILE. If PROFILE states availability, work authorisation or iqama, or readiness to relocate, the last sentence carries all of them as written.
- headline: if PROFILE states a headline or target role, use it as written; otherwise the student's role and 3-4 core skills, e.g. "Data Analyst | Excel, Power BI, SQL".
- experience: org is the organisation name only; its city or region goes in location, together with the work arrangement.
- skills: the student's skills from PROFILE, most relevant to the posting first. With more than 8, group them as "Group: a, b, c", one string per group. Soft skills and licences do not go here.
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
  const list = (v) => strings(typeof v === "string" ? v.split(/[,،]/) : v, 30);
  const required = pasted ? list(cv.job_required) : listed.required;
  const preferred = pasted ? list(cv.job_preferred) : listed.preferred;
  delete cv.job_required; delete cv.job_preferred;

  // Skills to watch for in free text: the posting's, every name the market
  // index knows (sent by the page), and any the model listed on its own.
  const watch = [...required, ...preferred, ...strings(input?.vocabulary, 300), ...strings(cv.skills)]
    .filter((s) => s.length <= 40);
  const removed = audit(cv, source, watch);
  // Coverage forgives qualifiers: "Advanced Excel" is covered by "Excel". The
  // audit above stays literal, so the CV still cannot claim "advanced".
  const QUALIFIERS = /\b(advanced|strong|basic|good|solid|excellent|proficiency|proficient|knowledge|experience|skills?|hands-on|of|in|with|and|the)\b/gi;
  const has = (s) => {
    if (mentions(source, s)) return true;
    const core = s.replace(QUALIFIERS, " ").split(/[\s/,]+/).filter((w) => w.length > 1);
    return core.length > 0 && core.every((w) => mentions(source, w));
  };
  return {
    cv, removed,
    coverage: {
      required, matched: required.filter(has), missing: required.filter((s) => !has(s)),
      preferred_missing: preferred.filter((s) => !has(s)),
    },
  };
}

