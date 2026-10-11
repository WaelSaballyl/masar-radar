// node worker/test.mjs - checks the CV worker without a network or a key:
// the audit on its own, then both endpoints with Gemini replaced by a stub.
import assert from "node:assert/strict";
import { audit, mentions } from "./src/audit.js";
import worker, { cleanDraft } from "./src/index.js";

// ---- mentions: short names must stand alone ----
assert.ok(mentions("SQL, R and Python", "R"));
assert.ok(mentions("excel , power bi,sql,, python", "SQL"), "a student's lowercase sql");
assert.ok(!mentions("Riyadh branch", "R"));
assert.ok(!mentions("Research and reporting", "R"));
assert.ok(mentions("Built dashboards in PowerBI", "Power BI"));
assert.ok(!mentions("Excel and SQL", "Tableau"));

// ---- audit: the model's additions are removed and reported ----
const source = "Excel SQL Python\nBuilt a sales dashboard in Excel for 3 branches\nGPA 4.5";
const cv = {
  summary: "Analyst who knows Excel and SQL. Expert in Tableau and Power BI. Served 12 branches.",
  skills: ["Excel", "SQL", "Tableau"],
  experience: [{ title: "Intern", org: "Shop", dates: "2024", bullets: [
    "Built a sales dashboard in Excel covering 3 branches",
    "Cut reporting time by 40%",
    "Automated reports with Tableau",
  ] }],
  education: [{ degree: "BSc", major: "IS", school: "KSU", dates: "", gpa: "4.5" }],
};
const removed = audit(cv, source, ["Excel", "SQL", "Tableau", "Power BI"]);
assert.equal(cv.summary, "Analyst who knows Excel and SQL.");
assert.deepEqual(cv.skills, ["Excel", "SQL"]);
assert.deepEqual(cv.experience[0].bullets, ["Built a sales dashboard in Excel covering 3 branches"]);
assert.equal(cv.experience[0].dates, "", "2024 is not in the source");
assert.equal(cv.education[0].gpa, "4.5");
assert.ok(removed.some((r) => r.why === "number:40"));
assert.ok(removed.some((r) => r.why === "skill:Tableau"));
assert.equal(new Set(removed.map((r) => r.where)).has("skills"), true);

// Arabic-Indic digits count as the same numbers
assert.deepEqual(audit({ summary: "خدمت ٣ فروع." }, "3 فروع", []), []);

// ---- endpoints, with Gemini stubbed ----
const env = { GEMINI_API_KEY: "test", ALLOWED_ORIGINS: "https://waelsaballyl.github.io" };
let reply = {}, lastPrompt = "";
globalThis.fetch = async (url, init) => (lastPrompt = String(init?.body || ""), new Response(JSON.stringify(
  { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 }));
const call = (path, body, origin = "https://waelsaballyl.github.io") => worker.fetch(
  new Request(`https://w.example${path}`, { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) }), env);

assert.equal((await call("/tailor", {}, "https://evil.example")).status, 403);
assert.equal((await call("/nope", {})).status, 404);

reply = { summary: "Data analyst.", skills: ["Excel", "Tableau"],
          experience: [{ title: "Intern", org: "Shop", dates: "", bullets: ["Used Tableau daily"] }] };
let r = await call("/tailor", {
  profile: { skills: "Excel, SQL", experience: "Intern at Shop. Built Excel reports." },
  job: { title: "Data Analyst", company: "X", required: ["SQL", "Tableau"], preferred: ["Python"] },
});
let out = await r.json();
assert.equal(r.status, 200);
assert.deepEqual(out.cv.skills, ["Excel"]);
assert.deepEqual(out.cv.experience[0].bullets, []);
assert.deepEqual(out.coverage.matched, ["SQL"]);
assert.deepEqual(out.coverage.missing, ["Tableau"]);
assert.deepEqual(out.coverage.preferred_missing, ["Python"]);

// a skill outside the posting still counts when the market knows it, or when
// the model itself listed it
reply = { summary: "Knows Excel. Skilled in Airflow. Uses Looker.", skills: ["Excel", "Looker"] };
r = await call("/tailor", { profile: { skills: "Excel, SQL", experience: "Built weekly Excel reports for a retail shop in Riyadh." },
  job: { title: "Analyst", company: "X", required: ["SQL"] }, vocabulary: ["Airflow"] });
out = await r.json();
assert.equal(out.cv.summary, "Knows Excel.");

reply = { skills: ["Python", "Spark"], gpa: "4.9", experience: "Intern, Shop, 2024\nCut costs by 90%\nBuilt reports" };
r = await call("/parse", { text: "Python developer. Intern at Shop in 2024, built reports for the team. ".repeat(2) });
out = await r.json();
assert.deepEqual(out.profile.skills, ["Python"]);
assert.equal(out.profile.gpa, "");
assert.equal(out.profile.experience, "Intern, Shop, 2024\nBuilt reports");

// grouped skills: the label is free, the items are checked one by one
const grouped = { skills: ["BI tools: Power BI (DAX), Tableau", "Excel"] };
const gr = audit(grouped, "Power BI with DAX, Excel", []);
assert.deepEqual(grouped.skills, ["BI tools: Power BI, DAX", "Excel"]);
assert.ok(gr.some((r) => r.text === "Tableau"));
const intact = { skills: ["Microsoft Excel: pivot tables, lookups"] };
audit(intact, "Microsoft Excel: pivot tables, lookups", []);
assert.deepEqual(intact.skills, ["Microsoft Excel: pivot tables, lookups"]);

// a dropped sentence of the student's own comes back, attached to its bullet
import { restore } from "./src/audit.js";
const items = [{ title: "Data Analyst", org: "Kaner Group", bullets: [
  "Built 10+ Power BI dashboards and Excel reports that showed sales patterns by product",
  "Collected and cleaned sales datasets in SQL and Python"] }];
const back = restore(items, "Data Analyst | Kaner Group, Cyprus | 2025\n• Collected and cleaned sales datasets in SQL and Python.\n"
  + "• Built 10+ Power BI dashboards and Excel reports that showed sales patterns by product. "
  + "They flagged slow-moving products for management and cut report preparation time.", false);
assert.deepEqual(back, ["They flagged slow-moving products for management and cut report preparation time."]);
assert.match(items[0].bullets[0], /by product\. They flagged slow-moving/);
assert.equal(items[0].bullets.length, 2);
// nothing restored into an Arabic CV from English notes, or when all is covered
assert.deepEqual(restore(items, "Data Analyst | Kaner Group\n• They flagged slow-moving products for management and cut report preparation time.", true), []);

// a sentence already used by another item is not copied into this one
const pool = [{ name: "Graduation dashboard", bullets: ["Built an attendance dashboard in Power BI"] },
              { name: "Titanic analysis", bullets: ["Analysed Titanic survival in Python with pandas"] }];
assert.deepEqual(restore([pool[0]], "Graduation dashboard, Power BI\nBuilt an attendance dashboard in Power BI.\n"
  + "Titanic survival analysis in Python with pandas and matplotlib.", false, pool), []);

// coverage forgives "Advanced", the audit does not
reply = { summary: "Uses advanced Excel daily.", skills: ["Excel"] };
r = await call("/tailor", { profile: { skills: "Excel, SQL", experience: "Built weekly Excel reports for a retail shop in Riyadh." },
  job: { title: "Analyst", company: "X", required: ["Advanced Excel", "Data modeling"] } });
out = await r.json();
assert.deepEqual(out.coverage.matched, ["Advanced Excel"]);
assert.deepEqual(out.coverage.missing, ["Data modeling"]);
assert.equal(out.cv.summary, "", "the CV may not claim 'advanced'");

// exclusive postings: the screening bot
import { screen, board } from "./src/board.js";
const post = (x = {}) => ({ title: "Data Analyst Co-op", description: "Build Power BI dashboards and SQL reports.",
  salary: "3,000 SAR", apply_url: "", website: "https://www.acme.sa/", contact_email: "hr@acme.sa",
  required: "SQL, Excel", employment: "coop", ...x });
assert.deepEqual(screen(post()), { risk: "green", reasons: [] });
assert.equal(screen(post({ description: "Send your CV on WhatsApp to apply" })).risk, "red");
assert.equal(screen(post({ description: "رسوم التسجيل 500 ريال" })).risk, "red");
assert.equal(screen(post({ contact_email: "hr@other.com" })).risk, "yellow");
assert.equal(screen(post({ contact_email: "jobs@careers.acme.sa" })).risk, "green", "a subdomain of the site is fine");
assert.equal(screen(post({ title: "Sales Representative", required: "Negotiation" })).risk, "yellow");
assert.equal(screen(post({ title: "Accountant Co-op", required: "IFRS, Excel", description: "Month-end close." })).risk, "green", "accounting is one of the fields");
assert.equal(screen(post({ title: "Civil Engineering Trainee", required: "AutoCAD", description: "Site visits." })).risk, "green");
assert.equal(screen(post({ salary: "25000" })).risk, "yellow");
assert.equal(screen(post({ description: "Call 0551234567 now" })).risk, "yellow");
assert.equal(screen(post(), true).risk, "yellow");

// interview questions come back trimmed; an empty answer is an error, not an empty list
reply = { questions: [{ q: "How would you clean sales data in SQL?", why: "SQL basics", tip: "Talk about your Retail Co internship." }, { q: "" }] };
r = await call("/interview", { profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." },
  job: { title: "Data Analyst", company: "X", required: ["SQL"] } });
out = await r.json();
assert.equal(r.status, 200);
assert.equal(out.questions.length, 1);
reply = { questions: [] };
r = await call("/interview", { profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." },
  job: { title: "Data Analyst", company: "X", required: ["SQL"] } });
assert.equal(r.status, 502);

// LinkedIn text needs no posting; an answer without a headline is an error
reply = { headline: "Data Analyst | Excel, SQL", about: "I study IS at KSU.", skills: ["SQL", "Excel"], tips: ["أضف شهادتك"] };
r = await call("/linkedin", { profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." } });
out = await r.json();
assert.equal(r.status, 200);
assert.equal(out.headline, "Data Analyst | Excel, SQL");
assert.deepEqual(out.skills, ["SQL", "Excel"]);
reply = { about: "x" };
r = await call("/linkedin", { profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." } });
assert.equal(r.status, 502);

// voice: style from free writing; a summary number the student never gave is dropped
reply = { tone: "direct", traits: ["analytical", "x"], voice: "تكتب بجمل قصيرة", verbs_ar: ["حلّلت", "راجعْتُ", "أستمع", "عملت"], verbs_en: ["Analyzed", "Worked"], words: ["أرقام"],
  summary: "Information systems student. Cut report time by 90%." };
r = await call("/voice", { sample: "انا احب الارقام وسويت داشبورد للمبيعات بالاكسل ووفرت وقت كثير على الفريق", lang: "en",
  profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." } });
out = await r.json();
assert.equal(r.status, 200);
assert.equal(out.tone, "direct");
assert.deepEqual(out.traits, ["analytical"]);
assert.deepEqual(out.verbs_ar, ["حلّلت", "راجعت"], "vowel marks go (shadda stays), present tense and weak verbs go");
assert.deepEqual(out.verbs_en, ["Analyzed"]);
assert.equal(out.summary, "", "90 is in neither the profile nor the sample");
reply = { tone: "warm", traits: ["learner"], voice: "دافئ", summary: "Student who cleaned sales data in SQL." };
r = await call("/voice", { sample: "my email is me@x.com and I love learning new tools every week honestly", lang: "en",
  profile: { skills: "SQL, Excel", experience: "Intern at Retail Co, cleaned sales data in SQL." } });
out = await r.json();
assert.equal(out.summary, "Student who cleaned sales data in SQL.");
assert.ok(!/me@x\.com/.test(lastPrompt || ""), "contact details never reach the model");
r = await call("/voice", { sample: "قصير" });
assert.equal(r.status, 400);
reply = { nothing: true };
r = await call("/voice", { sample: "this is a long enough sample about me and my work" });
assert.equal(r.status, 502);

// shared rate limits: a binding that says no wins; without bindings the backstop decides
import { limit } from "./src/index.js";
const no = { limit: async () => ({ success: false }) }, yes = { limit: async () => ({ success: true }) };
assert.equal(await limit({ AI_LIMIT: no }, "1.2.3.4", "ai"), true);
assert.equal(await limit({ ADMIN_LIMIT: no }, "1.2.3.4", "admin"), true);
assert.equal(await limit({ ADMIN_LIMIT: yes }, "1.2.3.4", "admin"), false);
assert.equal(await limit({}, "1.2.3.4", "hit"), false, "no binding: page views are not counted in memory");
r = await worker.fetch(new Request("https://w.example/stats", { headers: { Origin: "https://waelsaballyl.github.io" } }), { ...env, ADMIN_LIMIT: no });
assert.equal(r.status, 429, "guessing the admin token is cut off");

import { sameDomain } from "./src/board.js";
assert.ok(sameDomain("acme.sa", "acme.sa"));
assert.ok(sameDomain("careers.acme.sa", "acme.sa"));
assert.ok(!sameDomain("gmail.com", "acme.sa"));
assert.ok(!sameDomain("notacme.sa", "acme.sa"), "a longer name is not a subdomain");

// ---- accounts: Google's ID token is checked, never trusted ----
import { verifyGoogle, clean } from "./src/auth.js";
{
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [jwk] }));
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sign = async (claims, kid = "k1") => {
    const head = enc({ alg: "RS256", kid, typ: "JWT" }), body = enc(claims);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
  };
  const good = { iss: "https://accounts.google.com", aud: "client-1", sub: "123", email: "s@uni.edu.sa",
    email_verified: true, exp: Math.floor(Date.now() / 1000) + 600 };
  assert.equal((await verifyGoogle(await sign(good), "client-1")).sub, "123");
  const refused = async (token, id = "client-1") => assert.equal(await verifyGoogle(token, id).catch((e) => e.status), 401);
  await refused(await sign(good), "another-app");
  await refused(await sign({ ...good, exp: Math.floor(Date.now() / 1000) - 5 }));
  await refused(await sign({ ...good, email_verified: false }));
  await refused(await sign({ ...good, iss: "https://evil.example" }));
  await refused(await sign(good, "unknown-key"));
  const t = (await sign(good)).split(".");
  await refused(`${t[0]}.${enc({ ...good, sub: "999" })}.${t[2]}`); // claims changed after signing
  await refused("not-a-token");
  assert.deepEqual(clean({ "masar.saved": "[1]", "masar.session": "x", "masar.profile": { a: 1 } }), { "masar.saved": "[1]" });
}

// ---- talent cards never carry contact details ----
import { card } from "./src/talent.js";
{
  const c = card({ target: "Data Analyst, call 0551234567", skills: "SQL, Excel, me@x.com, https://linkedin.com/in/me",
    university: "KSU", major: "IS", graduation: "2023 - 2027", field: "evil", country: "SA", seeking: "coop", relocate: 1 });
  assert.equal(c.field, "data");
  assert.equal(c.graduation, "2027");
  assert.ok(!/055|@|http|linkedin/i.test(JSON.stringify(c)), JSON.stringify(c));
  assert.deepEqual(c.skills, ["SQL", "Excel"]);
  assert.throws(() => card({}), /field:skills/);
}

// ---- the ATS check (docs/assets/atskit.js) and the skill rules it matches with ----
import { readFileSync } from "node:fs";
import vm from "node:vm";
{
  const ctx = { window: {} };
  vm.runInNewContext(readFileSync(new URL("../docs/assets/atskit.js", import.meta.url), "utf8"), ctx);
  const { analyze, content, match, twoColumns, overall, level, blocksText, profileText } = ctx.window.MasarATS;
  // a saved CV's blocks read back one line per heading, paragraph and point
  assert.equal(blocksText([["h1", "", ["Sara Ahmed"]], ["h2", "", ["Experience"]],
    ["div", "cv-item", [["p", "cv-row", [["strong", "", ["Intern, Savola"]], ["span", "", ["2024"]]]], ["ul", "", [["li", "", ["Built 6 dashboards"]], ["li", "", ["Cut errors by 30%"]]]]]]]),
    ["Sara Ahmed", "Experience", "Intern, Savola 2024", "Built 6 dashboards", "Cut errors by 30%"].join("\n"));
  assert.ok(profileText({ name: "Sara", skills: "SQL, Excel", experience: "Built dashboards" }).includes("Skills\nSQL, Excel"));
  assert.equal(overall(90, 70, null), 80);
  assert.equal(overall(100, 50, 50), 65);
  assert.equal(overall(0, 100, 100), 0, "an unreadable file scores nothing");
  assert.equal(level(85), "good"); assert.equal(level(69), "work");
  // content is graded: a tidy file of duties is not a strong CV
  const duties = ["Sara Ahmed", "Experience", "Data Analyst Intern, Savola, Jun 2024 - Sep 2024",
    "Responsible for making reports for the team every week", "Worked on dashboards in Power BI for managers",
    "Helped with cleaning data in Excel sheets", "Skills", "SQL, Excel"].join("\n");
  const weak = content(duties);
  assert.deepEqual([...weak.checks.filter((c) => !c.ok).map((c) => c.id)], ["results", "verbs", "weak", "summary", "skill_count", "linkedin"]);
  assert.ok(weak.score < 30, String(weak.score));
  const results = ["Sara Ahmed", "linkedin.com/in/sara", "Summary", "Statistics graduate.", "Experience",
    "Data Analyst Intern, Savola, Jun 2024 - Sep 2024", "Built 6 Power BI dashboards used by 40 branch managers",
    "Automated a weekly Excel report, saving 5 hours a week", "Sales Dashboard, Power BI, SQL",
    "Cleaned sales rows in SQL, cutting errors by 30%", "Skills", "SQL, Excel, Power BI, Python, Tableau, Statistics"].join("\n");
  assert.equal(content(results).score, 100, JSON.stringify(content(results).checks.filter((c) => !c.ok)));
  assert.equal(content(results).points, 3, "a project's name and tools is not a point");
  // Arabic verbs with a shadda, and years are not results
  const ar = content(["الخبرات", "طوّرت لوحات Power BI للإدارة في الفرع الرئيسي", "عملت على تقارير المبيعات في سنة 2024 كاملة"].join("\n"));
  assert.deepEqual([...ar.checks.find((c) => c.id === "verbs").info], [1, 2]);
  assert.deepEqual([...ar.checks.find((c) => c.id === "results").info], [0, 2]);
  const body = "Sara Ahmed\nJeddah | sara@example.com | +966 50 111 2222\nSummary\n" + "Analyst who builds dashboards. ".repeat(50)
    + "\nExperience\nData Analyst Intern, Savola, Jun 2024 - Sep 2024\nBuilt Power BI dashboards\nEducation\nB.Sc. Statistics, KAU, 2024\nSkills\nSQL, Excel, Power BI";
  const clean = analyze({ text: body, kind: "pdf", pages: 1 });
  assert.equal(clean.score, 100, JSON.stringify(clean.checks.filter((c) => !c.ok)));
  assert.equal(clean.fields.name, "Sara Ahmed");
  assert.deepEqual([...clean.fields.sections], ["summary", "experience", "education", "skills"]);
  // a scanned CV has no text at all
  assert.equal(analyze({ text: "", kind: "pdf", pages: 1 }).score, 0);
  // what really breaks reading, each named with its weight
  const lig = analyze({ text: body.replace("Summary", "Summary\nCertiﬁcates"), kind: "pdf", pages: 1 });
  assert.deepEqual([...lig.checks.filter((c) => !c.ok).map((c) => c.id)], ["ligatures"]);
  const arabic = analyze({ text: body + "\nنبذة\nطالب نظم معلومات في جامعة الملك سعود ".repeat(30), kind: "pdf", pages: 1 });
  assert.ok(arabic.checks.some((c) => c.id === "arabic_pdf" && !c.ok));
  const header = analyze({ text: body.replace(/.*sara@.*\n/, ""), kind: "docx", headerContact: true, tables: 1 });
  assert.deepEqual([...header.checks.filter((c) => !c.ok).map((c) => c.id)].sort(), ["header_contact", "tables"]);
  assert.equal(header.score, 75);
  // Arabic headings count too
  assert.ok(analyze({ text: body.replace("Experience", "الخبرات العملية:"), kind: "masar" }).fields.sections.includes("experience"));
  // two columns: nothing crosses the gutter, text on both sides; one column with dates on the right is not
  const cols = Array.from({ length: 30 }, (_, i) => (i % 2 ? [[40, 180]] : [[220, 560]]));
  assert.ok(twoColumns(cols, 595));
  const single = Array.from({ length: 30 }, (_, i) => (i % 6 ? [[40, 400 + (i % 4) * 40]] : [[40, 300], [470, 555]]));
  assert.ok(!twoColumns(single, 595));

  // the rules as the browser gets them (python -m radar.export_site writes them)
  const rules = JSON.parse(readFileSync(new URL("../docs/data/skills.json", import.meta.url), "utf8"));
  const rx = Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, new RegExp(v, "u")]));
  const hits = (t) => Object.keys(rx).filter((k) => rx[k].test(t));
  assert.ok(hits("SQL, R and PowerBI").includes("R") && hits("SQL, R and PowerBI").includes("Power BI"));
  assert.ok(!hits("Riyadh research").includes("R"), "R stays case-sensitive");
  assert.ok(hits("خبرة في اكسل").includes("Excel"), "Arabic words need a Unicode \\b");
  assert.ok(!hits("ml").includes("Machine Learning") && hits("ML models").includes("Machine Learning"));

  const m = match(body, { title: "Data Analyst", required: ["SQL", "Power BI", "Tableau"], preferred: ["Excel"] }, rules);
  assert.deepEqual([...m.matched], ["SQL", "Power BI"]);
  assert.deepEqual([...m.missing], ["Tableau"]);
  assert.equal(m.score, Math.round((2 + 0.5 + 1) / (3 + 0.5 + 1) * 100));
  const pasted = match(body, { description: "Junior Data Analyst - Riyadh\nWe need SQL, Python and Tableau. " + "x ".repeat(40) }, rules);
  assert.deepEqual([...pasted.required].sort(), ["Python", "SQL", "Tableau"]);
  assert.equal(pasted.title, "Junior Data Analyst");
  assert.ok(pasted.titleHit, "the level word is not part of the job");
  const nice = match(body, { description: "Data Analyst\nMust know SQL and Excel. Nice to have: Looker, dbt. " + "x ".repeat(40) }, rules);
  assert.deepEqual([...nice.required].sort(), ["Excel", "SQL"]);
  assert.deepEqual([...nice.preferred].sort(), ["Looker", "dbt"]);
  // "X is an advantage" in its own point is preferred even before the other requirements
  const adv = match(body, { description: ["Employee Relations Specialist", "- Experience with SAP is an advantage.", "- Strong Excel skills.", "x ".repeat(40)].join("\n") }, rules);
  assert.ok(adv.required.includes("Excel") && !adv.required.includes("SAP"));
  assert.deepEqual([...adv.preferred], ["SAP"]);
}

// ---- one contact rule: the worker strips exactly what the browser's cvkit.js strips ----
{
  const util = await import("./src/util.js");
  const ctx = { window: {}, Masar: { el() {} } };
  vm.runInNewContext(readFileSync(new URL("../docs/assets/cvkit.js", import.meta.url), "utf8"), ctx);
  const web = ctx.window.MasarCV;
  const gone = ["+966 55 123 4567", "0551234567", "00966551234567", "me@x.com", "linkedin.com/in/x", "https://github.com/x", "coursera.org/verify/ABC",
                // a Saudi mobile written bare (the reviewer's samples: the old card rule caught these)
                "966551234567", "966 55 123 4567", "551234567", "55 123 4567", "966-55-123-4567"];
  const kept = ["2022 - 2026", "4.2 / 5", "(2021-2026)", "GPA 3.8 / 4", "Riyadh 2019 - 2023", "5,000 records", "SAR 5000", "cut costs 15% across 5 branches"];
  for (const s of gone) {
    const line = `Call ${s} today`;
    assert.equal(util.stripContact(line), web.stripContact(line, {}), `same on both sides: ${s}`);
    assert.equal(util.stripContact(line).replace(/\s+/g, " "), "Call today", `stripped: ${s}`);
  }
  for (const s of kept) {
    assert.equal(util.stripContact(s), s, `not contact: ${s}`);
    assert.equal(web.stripContact(s, {}), s, `not contact in the browser: ${s}`);
  }
  // the patterns themselves are the same text, so a change on one side fails here
  for (const k of ["EMAIL", "LINK", "PHONE", "SA_MOBILE"]) assert.equal(String(util[k]), String(web[k]), k);
  assert.equal(util.isPhone.toString().replace(/\s+/g, " "), web.isPhone.toString().replace(/\s+/g, " "));
  // a talent card and the voice sample go through the same rule
  assert.deepEqual(card({ skills: "SQL, 2022 - 2026, +966 55 123 4567, coursera.org/verify/ABC" }).skills, ["SQL", "2022 - 2026"]);
  // cards also drop any run of 8+ digits and @handles, whatever the shared rule misses
  for (const n of ["966551234567", "966 55 123 4567", "551234567", "55 123 4567", "call me 966-55-123-4567", "12345678", "1234 5678 90"]) {
    const c = card({ target: `Data Analyst ${n}`, major: `IS ${n}`, university: `KSU ${n}`, city: `Riyadh ${n}`, skills: `SQL, ${n}, Excel` });
    assert.ok(!/\d{3}/.test(JSON.stringify(c)), `${n}: ${JSON.stringify(c)}`);
    assert.deepEqual(c.skills.filter((x) => x !== "call me"), ["SQL", "Excel"]);
  }
  const handle = card({ target: "Analyst @wael_s", skills: "SQL, @wael.data, C#, Power BI" });
  assert.equal(handle.target, "Analyst");
  assert.deepEqual(handle.skills, ["SQL", "C#", "Power BI"]);
  const numbers = card({ target: "Analyst of 5,000 records, SAR 5000", major: "ISO 27001", skills: "SQL" });
  assert.deepEqual([numbers.target, numbers.major], ["Analyst of 5,000 records, SAR 5000", "ISO 27001"]);
}

// ---- D1 in memory (node:sqlite, the whole schema.sql) for the database paths ----
const { DatabaseSync } = await import("node:sqlite");
// Workers' constant-time compare, which Node lacks
crypto.subtle.timingSafeEqual ??= (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
function memoryD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return {
    raw: db,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
      return st;
    },
    async batch(list) { const out = []; for (const st of list) out.push(await st.run()); return out; },
  };
}
const hexSha = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))]
  .map((b) => b.toString(16).padStart(2, "0")).join("");
const postTo = (path, data) => new Request(`https://w${path}`, { method: "POST", body: JSON.stringify(data) });

// ---- "really interested": three a month per email, first in the employer's list ----
{
  const env = { DB: memoryD1() };
  const receipts = [];
  for (let i = 0; i < 5; i++) {
    // Sara applies to four postings, Omar to the fifth
    env.DB.raw.exec(`INSERT INTO postings (id, status, created_at, expires_at, company, contact_email, title, city, workplace, employment, level, description)
                     VALUES ('p0000000000${i}', 'approved', '2026-09-01', '2099-01-01', 'Co', 'hr@co.sa', 'Analyst', 'Riyadh', 'onsite', 'internship', 'Intern', 'x')`);
    const r = String(i).repeat(48);
    receipts.push(r);
    env.DB.raw.prepare(`INSERT INTO applications (id, posting_id, created_at, name, email, matched, required, paper, receipt_hash)
                        VALUES (?, ?, '2026-09-0${i + 1}', 'S', ?, ?, 4, '[]', ?)`)
      .run(`a${i}`, `p0000000000${i}`, i < 4 ? "sara@x.com" : "omar@x.com", 4 - (i % 4), await hexSha(r));
  }
  for (let i = 0; i < 3; i++) {
    const out = await board(postTo("/board/boost", { receipt: receipts[i + 1] }), env, "/board/boost");
    assert.equal(out.boosts_left, 2 - i);
  }
  await assert.rejects(board(postTo("/board/boost", { receipt: receipts[0] }), env, "/board/boost"), /boosts/, "a fourth this month is refused");
  await assert.rejects(board(postTo("/board/boost", { receipt: receipts[1] }), env, "/board/boost"), /boosts|boost/);
  // another student keeps their own three
  assert.equal((await board(postTo("/board/boost", { receipt: receipts[4] }), env, "/board/boost")).boosts_left, 2);
  const mineOut = await board(postTo("/board/mine", { receipts: [receipts[0]] }), env, "/board/mine");
  assert.equal(mineOut.boosts_left, 0);
}

// ---- skill tests: answers stay on the worker, a pass verifies, one try a day ----
{
  const { skilltests, TESTS } = await import("./src/skilltests.js");
  const env = { DB: memoryD1() };
  const token = "c".repeat(48);
  env.DB.raw.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 'u1', '2026-01-01', '2099-01-01')").run(await hexSha(token));
  const as = (path, method, data) => new Request(`https://w${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const list = await skilltests(new Request("https://w/tests"), env, "/tests");
  assert.ok(list.tests.some((t) => t.slug === "sql"));
  for (const [slug, t] of Object.entries(TESTS)) {
    for (const x of t.questions) assert.equal(new Set([x.a, ...x.w]).size, 4, `${slug}: four different options for "${x.q}"`);
  }
  const shown = await skilltests(new Request("https://w/tests/sql"), env, "/tests/sql");
  assert.ok(!JSON.stringify(shown).includes('"a"'), "the answers are not sent");
  // six right of eight passes (75%)
  const answers = Object.fromEntries(TESTS.sql.questions.map((x, i) => [i, i < 6 ? x.a : x.w[0]]));
  const out = await skilltests(as("/tests/sql", "POST", { answers }), env, "/tests/sql");
  assert.deepEqual([out.score, out.of, out.passed, [...out.wrong]], [6, 8, true, [6, 7]]);
  await assert.rejects(skilltests(as("/tests/sql", "POST", { answers }), env, "/tests/sql"), /wait/, "one attempt a day");
  const mine = await skilltests(as("/tests/mine", "GET"), env, "/tests/mine");
  assert.deepEqual(mine.verified.map((v) => [v.skill, v.score]), [["SQL", 75]]);
  assert.ok(mine.next.sql);
  // five of eight does not pass
  const low = Object.fromEntries(TESTS.excel.questions.map((x, i) => [i, i < 5 ? x.a : "x"]));
  assert.equal((await skilltests(as("/tests/excel", "POST", { answers: low }), env, "/tests/excel")).passed, false);
  await assert.rejects(skilltests(new Request("https://w/tests/sql", { method: "POST", body: "{}" }), env, "/tests/sql"), /session/);
}
// ---- company accounts: work Google accounts only; their postings open without the private link ----
{
  const { employer } = await import("./src/employer.js");
  const env = { DB: memoryD1(), GOOGLE_CLIENT_ID: "x" };
  const fake = (email) => async () => ({ sub: `g-${email}`, email, name: "HR" });
  const signIn = (email) => employer(new Request("https://w/employer/google", { method: "POST", body: JSON.stringify({ credential: "t" }) }), env, "/employer/google", fake(email));
  await assert.rejects(signIn("someone@gmail.com"), /work_email/, "free mail is not a company");
  const { token, employer: co } = await signIn("hr@acme.sa");
  assert.equal(co.domain, "acme.sa");
  const auth = (path, method = "GET", data) => new Request(`https://w${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data ? { body: JSON.stringify(data) } : {}) });
  const ad = { company: "Acme", website: "acme.sa", contact_email: "someone@else.com", title: "Data Analyst Co-op", city: "Riyadh", country: "SA",
    workplace: "onsite", employment: "coop", level: "Intern", field: "data", required: "SQL, Excel",
    description: "Join our analytics team as a co-op trainee. You will clean sales data in SQL, build weekly Excel reports and present findings to the regional managers every month." };
  await assert.rejects(board(new Request("https://w/board/postings", { method: "POST", body: JSON.stringify(ad) }), env, "/board/postings"), /company_account/, "no posting without a company account");
  const posted = await board(new Request("https://w/board/postings", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(ad) }), env, "/board/postings");
  const row = env.DB.raw.prepare("SELECT owner_id, contact_email, verified FROM postings WHERE id = ?").get(posted.id);
  assert.equal(row.contact_email, "hr@acme.sa", "the confirmed work email, not the typed one");
  assert.equal(row.verified, 1);
  const me = await employer(auth("/employer/me"), env, "/employer/me");
  assert.deepEqual(me.postings.map((p) => [p.id, p.applicants]), [[posted.id, 0]]);
  const list = await board(auth(`/board/manage/${posted.id}`), env, `/board/manage/${posted.id}`);
  assert.equal(list.applications.length, 0, "the owner opens applicants with the account");
  const { token: other } = await signIn("hr@other.sa");
  await assert.rejects(board(new Request(`https://w/board/manage/${posted.id}`, { headers: { Authorization: `Bearer ${other}` } }), env, `/board/manage/${posted.id}`), /manage/);
}

// ---- talent search filters in SQL and pages: card 620 of 620 is still found ----
{
  const { talent } = await import("./src/talent.js");
  const env = { DB: memoryD1() };
  const manage = "d".repeat(48);
  env.DB.raw.prepare(`INSERT INTO postings (id, status, created_at, expires_at, company, contact_email, title, city, workplace, employment, level, description, manage_hash)
                      VALUES ('a00000000001', 'approved', '2026-09-01', '2099-01-01', 'Co', 'hr@co.sa', 'Analyst', 'Riyadh', 'onsite', 'coop', 'Intern', 'x', ?)`).run(await hexSha(manage));
  const put = env.DB.raw.prepare("INSERT INTO talent (id, user_id, card, updated_at) VALUES (?, ?, ?, ?)");
  for (let i = 0; i < 620; i++) {
    // the oldest card is the only finance one in Qatar, with a skill nobody else has
    const c = i === 0 ? { target: "Accountant", field: "finance", country: "QA", major: "Accounting", skills: ["Tableau", "Excel"] }
      : { target: "Data Analyst", field: "data", country: i % 2 ? "SA" : "AE", major: "IS", skills: i === 5 ? ["SQL", "Power BI"] : ["SQL", "Excel"] };
    put.run(`c${String(i).padStart(11, "0")}`, `u${i}`, JSON.stringify(c), `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`);
  }
  const find = (params) => talent(new Request(`https://w/talent/search?${new URLSearchParams({ posting: "a00000000001", ...params })}`,
    { headers: { Authorization: `Bearer ${manage}` } }), env, "/talent/search");
  const seen = new Set();
  let page = await find({}), pages = 1;
  page.cards.forEach((c) => seen.add(c.id));
  while (page.next !== null) { page = await find({ offset: page.next }); pages++; page.cards.forEach((c) => seen.add(c.id)); }
  assert.equal(seen.size, 620, "every card is reachable by paging");
  assert.equal(pages, 7);
  assert.deepEqual((await find({ q: "TABLEAU" })).cards.map((c) => c.id), ["c00000000000"], "text search reaches past the newest 500");
  assert.deepEqual((await find({ field: "finance" })).cards.map((c) => c.id), ["c00000000000"]);
  assert.equal((await find({ country: "QA" })).cards.length, 1);
  const ae = await find({ country: "AE", field: "data" });
  assert.equal(ae.cards.length, 100);
  assert.ok(ae.cards.every((c) => c.country === "AE" && c.field === "data"));
  assert.equal(ae.next, 100);
  assert.deepEqual((await find({ q: "sql power" })).cards.map((c) => c.id), ["c00000000005"], "skills read as one line, like before");
  assert.equal((await find({ q: "%" })).cards.length, 0, "% is a letter, not a wildcard");
  assert.equal((await find({ q: "accountant", field: "data" })).cards.length, 0);
  await assert.rejects(talent(new Request("https://w/talent/search?posting=a00000000001"), env, "/talent/search"), /manage/);
}

// ---- support: a ticket opens without an account, its token or ADMIN_TOKEN reads it ----
{
  const { support } = await import("./src/support.js");
  const env = { DB: memoryD1(), ADMIN_TOKEN: "e".repeat(40) };
  const call = (path, method = "GET", data, token) => support(new Request(`https://w${path}`, { method,
    headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(data ? { body: JSON.stringify(data) } : {}) }), env, path, async () => false);
  const { id, token } = await call("/support/tickets", "POST", { name: "Sara", email: "s@x.com", topic: "cv", text: "My CV will not download." });
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.equal((await call(`/support/tickets/${id}`, "GET", null, token)).messages.length, 1);
  await assert.rejects(call(`/support/tickets/${id}`, "GET", null, "f".repeat(48)), /ticket/);
  await assert.rejects(call(`/support/tickets/${id}`), /ticket/);
  await call(`/support/admin/${id}`, "POST", { text: "Fixed now." }, env.ADMIN_TOKEN);
  assert.deepEqual((await call(`/support/tickets/${id}`, "GET", null, token)).messages.map((m) => m.author), ["visitor", "team"]);
  assert.equal((await call("/support/admin", "GET", null, env.ADMIN_TOKEN)).tickets.length, 1);
  await assert.rejects(call("/support/admin", "GET", null, "x".repeat(40)), /admin/);
  await assert.rejects(call("/support/tickets", "POST", { name: "S", email: "s@x.com", text: "x".repeat(12_001) }), /size/);
}

// ---- visitor counts: the beacon counts, only ADMIN_TOKEN reads ----
{
  const { stats } = await import("./src/stats.js");
  const env = { DB: memoryD1(), ADMIN_TOKEN: "e".repeat(40) };
  await stats(postTo("/hit", { p: "jobs", r: "google.com", v: 1 }), env, "/hit");
  const read = (token) => stats(new Request("https://w/stats", { headers: { Authorization: `Bearer ${token}` } }), env, "/stats");
  assert.deepEqual((await read(env.ADMIN_TOKEN)).pages.map((x) => [x.page, x.views]), [["jobs", 1]]);
  await assert.rejects(read("x"), /admin/);
  await assert.rejects(read(""), /admin/);
}

// ---- long lists come in pages: the public postings, an employer's applicants, the admin queues ----
{
  const { offsetOf } = await import("./src/util.js");
  const at = (q) => new Request(`https://w/x?${q}`);
  assert.deepEqual([offsetOf(at(""), 200), offsetOf(at("offset=400"), 200), offsetOf(at("offset=399"), 200), offsetOf(at("offset=-5"), 200),
                    offsetOf(at("offset=abc"), 200), offsetOf(at("offset=9999999"), 200)], [0, 400, 200, 0, 0, 100_000]);
  const { support } = await import("./src/support.js");
  const env = { DB: memoryD1(), ADMIN_TOKEN: "e".repeat(40) };
  const manage = "d".repeat(48);
  const db = env.DB.raw;
  const post = db.prepare(`INSERT INTO postings (id, status, created_at, reviewed_at, expires_at, company, contact_email, title, city, workplace, employment, level, description, manage_hash)
                           VALUES (?, ?, ?, ?, '2099-01-01', 'Co', 'hr@co.sa', 'Analyst', 'Riyadh', 'onsite', 'coop', 'Intern', 'x', ?)`);
  const hash = await hexSha(manage);
  for (let i = 0; i < 450; i++) post.run(`b${String(i).padStart(11, "0")}`, "approved", "2026-09-01", `2026-09-01T${String(i % 24).padStart(2, "0")}:00:${String(i % 60).padStart(2, "0")}`, hash);
  for (let i = 0; i < 130; i++) post.run(`c${String(i).padStart(11, "0")}`, "pending", `2026-09-02T00:${String(i % 60).padStart(2, "0")}`, null, hash);
  const app = db.prepare(`INSERT INTO applications (id, posting_id, created_at, name, email, matched, required, paper, receipt_hash) VALUES (?, 'b00000000000', ?, 'S', ?, ?, 4, '[]', ?)`);
  for (let i = 0; i < 520; i++) app.run(`a${String(i).padStart(11, "0")}`, `2026-09-03T00:00:${String(i % 60).padStart(2, "0")}`, `s${i}@x.com`, i % 5, String(i));
  const tk = db.prepare("INSERT INTO support_tickets (id, token_hash, name, email, topic, status, created_at, updated_at) VALUES (?, 'h', 'S', 's@x.com', 'cv', 'open', '2026-09-01', ?)");
  for (let i = 0; i < 230; i++) tk.run(`d${String(i).padStart(11, "0")}`, `2026-09-01T00:00:${String(i % 60).padStart(2, "0")}`);
  // walks every page of a list and checks nothing repeats or goes missing
  const walk = async (get, key) => {
    const ids = [];
    let out = await get(0);
    ids.push(...out[key].map((x) => x.id));
    while (out.next !== null) { out = await get(out.next); ids.push(...out[key].map((x) => x.id)); }
    assert.equal(new Set(ids).size, ids.length, `${key}: no row twice`);
    return ids.length;
  };
  const as = (path, token) => new Request(`https://w${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal(await walk((o) => board(as(`/board/postings?offset=${o}`), env, "/board/postings"), "postings"), 450, "past the old 200");
  assert.equal(await walk((o) => board(as(`/board/manage/b00000000000?offset=${o}`, manage), env, "/board/manage/b00000000000"), "applications"), 520, "past the old 500");
  assert.equal(await walk((o) => board(as(`/board/admin?status=pending&offset=${o}`, env.ADMIN_TOKEN), env, "/board/admin"), "postings"), 130, "past the old 100");
  assert.equal(await walk((o) => support(as(`/support/admin?offset=${o}`, env.ADMIN_TOKEN), env, "/support/admin", async () => false), "tickets"), 230, "past the old 200");
  // the order is kept across pages: best match first for the employer
  const first = await board(as("/board/manage/b00000000000", manage), env, "/board/manage/b00000000000");
  const second = await board(as("/board/manage/b00000000000?offset=500", manage), env, "/board/manage/b00000000000");
  assert.ok(first.applications.at(-1).matched >= second.applications[0].matched);
  await assert.rejects(board(as("/board/admin?offset=100", "x"), env, "/board/admin"), /admin/);
}

// ---- retention (PDPL): applications 180 days after their posting expired, dead sessions ----
{
  const { retention, RETAIN_DAYS } = await import("./src/retention.js");
  assert.equal(RETAIN_DAYS, 180);
  const env = { DB: memoryD1() };
  const db = env.DB.raw;
  const now = new Date("2026-10-11T03:17:00Z");
  const post = db.prepare(`INSERT INTO postings (id, status, created_at, expires_at, company, contact_email, title, city, workplace, employment, level, description)
                           VALUES (?, 'approved', '2025-01-01', ?, 'Co', 'hr@co.sa', 'Analyst', 'Riyadh', 'onsite', 'coop', 'Intern', 'x')`);
  post.run("old000000000", "2026-04-13"); // expired 181 days before: its applications go
  post.run("edge00000000", "2026-04-14"); // exactly 180 days: kept one more day
  post.run("recent000000", "2026-09-01"); // expired 40 days ago: kept
  post.run("live00000000", "2099-01-01");
  const app = db.prepare("INSERT INTO applications (id, posting_id, created_at, name, email, paper) VALUES (?, ?, '2026-01-01', 'S', ?, '[]')");
  for (const [id, posting] of [["a1", "old000000000"], ["a2", "old000000000"], ["a3", "edge00000000"], ["a4", "recent000000"], ["a5", "live00000000"], ["a6", "gone00000000"]]) app.run(id, posting, `${id}@x.com`);
  const inv = db.prepare("INSERT INTO invites (posting_id, card_id, user_id, created_at) VALUES (?, 'c1', 'u1', '2026-01-01')");
  inv.run("old000000000"); inv.run("live00000000");
  const ses = db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, 'u1', '2026-01-01', ?)");
  ses.run("s-dead", "2026-10-11T03:16:59.000Z"); ses.run("s-live", "2026-12-01T00:00:00.000Z");
  const emp = db.prepare("INSERT INTO employer_sessions (token_hash, employer_id, created_at, expires_at) VALUES (?, 'e1', '2026-01-01', ?)");
  emp.run("e-dead", "2026-09-01T00:00:00.000Z"); emp.run("e-live", "2026-11-01T00:00:00.000Z");
  db.exec("UPDATE postings SET manage_hash = 'h'");
  // support: closed and untouched for a year goes; open or recent stays
  const tk = db.prepare("INSERT INTO support_tickets (id, token_hash, name, email, topic, status, created_at, updated_at) VALUES (?, 'h', 'S', 's@x.com', 'cv', ?, '2025-01-01', ?)");
  tk.run("t-old-closed", "closed", "2025-10-10T00:00:00.000Z"); tk.run("t-old-open", "open", "2025-10-10T00:00:00.000Z"); tk.run("t-new-closed", "closed", "2026-09-01T00:00:00.000Z");
  const msg = db.prepare("INSERT INTO support_messages (ticket_id, author, text, created_at) VALUES (?, 'visitor', 'hi', '2025-01-01')");
  msg.run("t-old-closed"); msg.run("t-old-closed"); msg.run("t-old-open"); msg.run("t-new-closed");
  // talent: a card whose student has not signed in for a year comes down
  const usr = db.prepare("INSERT INTO users (id, google_sub, email, created_at, last_login) VALUES (?, ?, ?, '2025-01-01', ?)");
  usr.run("u-away", "g1", "away@x.com", "2025-10-01T00:00:00.000Z"); usr.run("u-here", "g2", "here@x.com", "2026-10-01T00:00:00.000Z");
  const tal = db.prepare("INSERT INTO talent (id, user_id, card, updated_at) VALUES (?, ?, '{}', '2025-01-01')");
  tal.run("card-away", "u-away"); tal.run("card-here", "u-here");

  assert.deepEqual(await retention(env, now), { applications: 3, invites: 1, postings: 1, support_messages: 2, support_tickets: 1, talent: 1, sessions: 1, employer_sessions: 1 });
  const ids = (sql) => db.prepare(sql).all().map((r) => Object.values(r)[0]);
  assert.deepEqual(ids("SELECT id FROM applications ORDER BY id"), ["a3", "a4", "a5"], "old and orphaned applications go, the rest stay");
  assert.deepEqual(ids("SELECT posting_id FROM invites"), ["live00000000"]);
  assert.deepEqual(ids("SELECT token_hash FROM sessions"), ["s-live"]);
  assert.deepEqual(ids("SELECT token_hash FROM employer_sessions"), ["e-live"]);
  assert.equal(db.prepare("SELECT count(*) n FROM postings").get().n, 4, "postings themselves stay");
  assert.deepEqual(db.prepare("SELECT id, contact_email, manage_hash FROM postings ORDER BY id").all().map((r) => [r.id, r.contact_email, r.manage_hash]),
    [["edge00000000", "hr@co.sa", "h"], ["live00000000", "hr@co.sa", "h"], ["old000000000", "", null], ["recent000000", "hr@co.sa", "h"]],
    "the old posting loses its HR email and private link");
  assert.deepEqual(ids("SELECT id FROM support_tickets ORDER BY id"), ["t-new-closed", "t-old-open"]);
  assert.deepEqual(ids("SELECT DISTINCT ticket_id FROM support_messages ORDER BY ticket_id"), ["t-new-closed", "t-old-open"]);
  assert.deepEqual(ids("SELECT id FROM talent"), ["card-here"]);
  // a second run the same day finds nothing; the next day the edge posting's application goes
  assert.deepEqual(await retention(env, now), { applications: 0, invites: 0, postings: 0, support_messages: 0, support_tickets: 0, talent: 0, sessions: 0, employer_sessions: 0 });
  assert.equal((await retention(env, new Date("2026-10-12T03:17:00Z"))).applications, 1);
  // the Cron Trigger runs it through scheduled()
  const waits = [];
  await worker.scheduled({ cron: "17 3 * * *" }, env, { waitUntil: (p) => waits.push(p) });
  assert.equal(waits.length, 1);
  await waits[0];
}

// ---- applying needs a signed-in student; the email is the account's ----
{
  const env = { DB: memoryD1() };
  const db = env.DB.raw;
  db.exec(`INSERT INTO postings (id, status, created_at, expires_at, company, contact_email, title, city, workplace, employment, level, description)
           VALUES ('f00000000001', 'approved', '2026-09-01', '2099-01-01', 'Co', 'hr@co.sa', 'Analyst', 'Riyadh', 'onsite', 'coop', 'Intern', 'x')`);
  const signIn = async (uid, email) => {
    const token = (uid + "0".repeat(48)).replace(/[^a-f0-9]/g, "a").slice(0, 48);
    db.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, '2026-01-01')").run(uid, `g-${uid}`, email);
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, '2026-01-01', '2099-01-01')").run(await hexSha(token), uid);
    return token;
  };
  const form = { posting_id: "f00000000001", consent: true, name: "Sara A", email: "someone@else.com", phone: "0551234567", link: "", paper: [{ t: "P", x: "CV" }], matched: 2, required: 4 };
  const apply = (token, data = form) => board(new Request("https://w/board/apply", { method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(data) }), env, "/board/apply");
  const rows = () => db.prepare("SELECT name, email, user_id, paper, receipt_hash FROM applications ORDER BY created_at").all();

  await assert.rejects(apply(null), /sign_in/, "no session, no application");
  await assert.rejects(apply("f".repeat(48)), /sign_in/, "a made-up session is refused");
  assert.equal(rows().length, 0);

  const sara = await signIn("ab1", "Sara@Uni.edu.sa");
  const out = await apply(sara);
  assert.equal(out.email, "sara@uni.edu.sa", "the account's email, not the typed one");
  assert.deepEqual(rows().map((r) => [r.email, r.user_id]), [["sara@uni.edu.sa", "ab1"]]);
  assert.ok(!JSON.stringify(rows()).includes("someone@else.com"));
  await assert.rejects(apply(sara, { ...form, email: "other@x.com" }), /applied/, "one application per student per posting");
  assert.equal(rows().length, 1);

  // before the switch someone typed Omar's email; Omar signs in and replaces it, nothing of it kept
  db.prepare(`INSERT INTO applications (id, posting_id, created_at, name, email, paper, receipt_hash, status)
              VALUES ('legacy1', 'f00000000001', '2026-01-01', 'Impostor', 'omar@x.com', '[{"t":"P","x":"FAKE"}]', 'oldhash', 'shortlisted')`).run();
  // a third student cannot touch it: it is not their email
  const lina = await signIn("ab3", "lina@x.com");
  await apply(lina, { ...form, name: "Lina" });
  assert.ok(rows().some((r) => r.email === "omar@x.com" && r.name === "Impostor"), "someone else's legacy row stays");
  const omar = await signIn("ab2", "omar@x.com");
  const replaced = await apply(omar, { ...form, name: "Omar K" });
  assert.equal(replaced.replaced, true);
  const omars = rows().filter((r) => r.email === "omar@x.com");
  assert.deepEqual(omars.map((r) => [r.name, r.user_id]), [["Omar K", "ab2"]]);
  assert.ok(!omars[0].paper.includes("FAKE") && omars[0].receipt_hash !== "oldhash", "the old CV and receipt are gone");
  assert.equal(db.prepare("SELECT status FROM applications WHERE user_id = 'ab2'").get().status, "new");
  // and once replaced it is Omar's own: a second try is refused like any other
  await assert.rejects(apply(omar), /applied/);
  // a closed posting still refuses, signed in or not
  db.exec("UPDATE postings SET expires_at = '2020-01-01'");
  await assert.rejects(apply(await signIn("ab4", "new@x.com")), /closed/);
}

// ---- the employer's pasted ad: only what the ad says, only the form's options ----
{
  const ad = ["Lulu Hypermarket - Data Analyst Co-op Trainee", "Riyadh, Saudi Arabia. Apply: hr@luluhypermarket.com", "We need SQL and Excel."].join("\n");
  const d = cleanDraft({ company: "Lulu Hypermarket", title: "Data Analyst Co-op Trainee", city: "Riyadh", country: "SA",
    employment: "coop", level: "Wizard", workplace: "onsite", website: "https://www.lulu.example/jobs", salary: "5000 SAR" }, ad);
  assert.equal(d.company, "Lulu Hypermarket");
  assert.equal(d.contact_email, "hr@luluhypermarket.com", "the email comes from the text itself");
  assert.equal(d.level, "", "a choice outside the form is dropped");
  assert.equal(d.website, "", "a site the ad never names is dropped");
  assert.equal(d.salary, "", "an invented salary is dropped");
  assert.equal(d.description, ad);
  // an ad that names no company: "We" or a word inside another word is not a name
  const anon = "automotive sector company in Jeddah is looking for an Employee Relations Specialist. We need HR experience.";
  assert.equal(cleanDraft({ company: "We" }, anon).company, "");
  assert.equal(cleanDraft({ company: "Rela" }, anon).company, "");
}
console.log("worker tests passed");
