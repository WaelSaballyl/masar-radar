// node worker/dev.mjs - serves the worker on :8787 with Gemini replaced by a
// canned reply, so the page can be tried without a key. The reply includes a
// skill and a number the profile lacks, to show the audit removing them.
import http from "node:http";
import worker from "./src/index.js";

const canned = (prompt) => prompt.startsWith("Split this CV") ? {
  university: "King Saud University", degree: "BSc", major: "Information Systems", graduation: "2026",
  gpa: "4.5", skills: ["Excel", "SQL", "Power BI", "Python"],
  experience: "Data intern, Riyadh Municipality, Summer 2025\nCleaned permit data in Excel\nBuilt a Power BI report",
  projects: "Sales dashboard, Power BI\nModelled 3 years of sales", certificates: ["Google Data Analytics"], languages: ["Arabic", "English"],
} : {
  summary: "Information Systems student who builds Excel and Power BI reports. Skilled in Tableau and Airflow.",
  skills: ["SQL", "Power BI", "Excel", "Python", "Tableau"],
  experience: [{ title: "Data Intern", org: "Riyadh Municipality", dates: "Summer 2025",
    bullets: ["Cleaned permit data in Excel for monthly reporting", "Built a Power BI report used by 40 managers"] }],
  projects: [{ name: "Sales dashboard", tools: "Power BI", bullets: ["Modelled 3 years of sales"] }],
  education: [{ degree: "BSc", major: "Information Systems", school: "King Saud University", dates: "2026", gpa: "4.5" }],
  certificates: ["Google Data Analytics"], languages: ["Arabic (native)", "English (fluent)"],
};

globalThis.fetch = async (_url, init) => {
  const prompt = JSON.parse(init.body).contents[0].parts[0].text;
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(canned(prompt)) }] } }] }));
};

const env = { GEMINI_API_KEY: "dev", ALLOWED_ORIGINS: "http://localhost:8765" };
http.createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  const r = await worker.fetch(new Request(`http://localhost:8787${req.url}`, {
    method: req.method, headers: req.headers, body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : body,
  }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(await r.text());
}).listen(8787, () => console.log("dev worker on http://localhost:8787"));
