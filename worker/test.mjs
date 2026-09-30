// node worker/test.mjs - checks the CV worker without a network or a key:
// the audit on its own, then both endpoints with Gemini replaced by a stub.
import assert from "node:assert/strict";
import { audit, mentions } from "./src/audit.js";
import worker from "./src/index.js";

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
let reply = {};
globalThis.fetch = async () => new Response(JSON.stringify(
  { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }), { status: 200 });
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
}

// ---- D1 in memory (node:sqlite, the whole schema.sql) for the database paths ----
const { DatabaseSync } = await import("node:sqlite");
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
console.log("worker tests passed");
