// node worker/test.mjs - checks the CV worker without a network or a key:
// the audit on its own, then both endpoints with Gemini replaced by a stub.
import assert from "node:assert/strict";
import { audit, mentions } from "./src/audit.js";
import worker from "./src/index.js";

// ---- mentions: short names must stand alone ----
assert.ok(mentions("SQL, R and Python", "R"));
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

// coverage forgives "Advanced", the audit does not
reply = { summary: "Uses advanced Excel daily.", skills: ["Excel"] };
r = await call("/tailor", { profile: { skills: "Excel, SQL", experience: "Built weekly Excel reports for a retail shop in Riyadh." },
  job: { title: "Analyst", company: "X", required: ["Advanced Excel", "Data modeling"] } });
out = await r.json();
assert.deepEqual(out.coverage.matched, ["Advanced Excel"]);
assert.deepEqual(out.coverage.missing, ["Data modeling"]);
assert.equal(out.cv.summary, "", "the CV may not claim 'advanced'");

console.log("worker tests passed");
