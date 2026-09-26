// Exclusive postings: employers submit, an admin approves, the site lists.
//
//   POST /board/postings                 employer submits      -> {id}
//   GET  /board/postings                 approved, unexpired   -> {postings}
//   GET  /board/admin?status=pending     admin (Bearer token)  -> {postings}
//   POST /board/admin/<id>/<approve|reject>
//
// Anything a person typed is stored as text and returned as JSON; the pages
// render it with textContent. The employer's email is never in a public reply.

const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|gmx|yandex|mail)\.[a-z.]+$/i;
const WORKPLACE = ["onsite", "hybrid", "remote"];
const EMPLOYMENT = ["full_time", "part_time", "internship", "coop", "contract"];
const LEVEL = ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager"];
const COUNTRY = ["SA", "AE", "QA", "KW", "BH", "OM"];
const PUBLIC = "id, company, website, title, city, country, workplace, employment, level, description, required, preferred, salary, apply_url, created_at, expires_at";

const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const skills = (v) => text(v, 600).split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20).join(", ");
const url = (v) => {
  const s = text(v, 300);
  if (!s) return "";
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return /^https?:$/.test(u.protocol) ? u.href : ""; }
  catch { return ""; }
};
const bad = (field) => Object.assign(new Error(field), { status: 400, code: `field:${field}` });

// Screening by fixed rules, not a model: the same posting always gets the same
// verdict, the reason is known, and wording cannot talk its way past a
// WhatsApp link. red is rejected silently (a scammer learns nothing), yellow
// waits for a person, green waits too until AUTO_APPROVE is "1".
const SCAM = /رسوم|رسم تسجيل|تحويل مبلغ|ايداع|إيداع|آيبان|ايبان|\biban\b|صورة (?:ال)?هوية|صورة (?:ال)?جواز|registration fee|training fee|deposit|pay (?:a|the) fee|bank account|passport copy|id copy|wa\.me|whatsapp|واتساب|واتس اب|telegram|تيليجرام|t\.me\//i;
const DATA = /data|بيانات|analy|تحليل|\bbi\b|business intelligence|ذكاء الأعمال|sql|python|power ?bi|tableau|excel|dashboard|machine learning|تعلم الآلة|statistic|إحصاء|report/i;
const host = (s) => { try { return new URL(s).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function screen(p, duplicate = false) {
  const red = [], yellow = [];
  const all = `${p.title}\n${p.description}\n${p.salary}\n${p.apply_url}`;
  if (SCAM.test(all)) red.push("طلب رسوم أو بيانات شخصية أو تواصل عبر واتساب/تيليجرام");
  const site = host(p.website), mail = p.contact_email.split("@")[1] || "";
  if (!site) yellow.push("لا يوجد موقع للشركة");
  else if (mail !== site && !mail.endsWith(`.${site}`) && !site.endsWith(`.${mail}`)) yellow.push(`دومين الإيميل (${mail}) لا يطابق الموقع (${site})`);
  if (!DATA.test(`${p.title} ${p.required}`)) yellow.push("الوظيفة لا تبدو وظيفة بيانات");
  const pay = Math.max(0, ...(p.salary.replace(/[,٬]/g, "").match(/\d+/g) || []).map(Number));
  if (["internship", "coop"].includes(p.employment) && pay > 15000) yellow.push("مكافأة تدريب عالية بشكل غير معتاد");
  if (/(?:\+|00)?9665\d{8}|(?<!\d)05\d{8}(?!\d)/.test(p.description.replace(/[\s-]/g, ""))) yellow.push("رقم جوال داخل الوصف");
  if ((p.description.match(/!/g) || []).length > 5 || (p.description.match(/\p{Extended_Pictographic}/gu) || []).length > 5) yellow.push("علامات تعجب أو رموز تعبيرية كثيرة");
  if (duplicate) yellow.push("الإعلان نفسه أُرسل من الشركة نفسها خلال أسبوعين");
  return { risk: red.length ? "red" : yellow.length ? "yellow" : "green", reasons: [...red, ...yellow] };
}

async function admin(request, env) {
  const given = new TextEncoder().encode((request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""));
  const wanted = new TextEncoder().encode(env.ADMIN_TOKEN || "");
  if (!wanted.length || given.length !== wanted.length || !crypto.subtle.timingSafeEqual(given, wanted)) {
    throw Object.assign(new Error("admin"), { status: 401, code: "admin" });
  }
}

async function submit(input, env) {
  const p = {
    company: text(input.company, 120), website: url(input.website), contact_email: text(input.contact_email, 160).toLowerCase(),
    title: text(input.title, 140), city: text(input.city, 80), country: text(input.country, 2).toUpperCase(),
    workplace: text(input.workplace, 20), employment: text(input.employment, 20), level: text(input.level, 20),
    description: text(input.description, 8000), required: skills(input.required), preferred: skills(input.preferred),
    salary: text(input.salary, 80), apply_url: url(input.apply_url),
  };
  if (input.website_confirm) throw bad("bot");  // a hidden field only bots fill in
  for (const f of ["company", "title", "city"]) if (p[f].length < 2) throw bad(f);
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(p.contact_email)) throw bad("contact_email");
  if (FREE_MAIL.test(p.contact_email)) throw bad("work_email");
  if (!COUNTRY.includes(p.country)) throw bad("country");
  if (!WORKPLACE.includes(p.workplace)) throw bad("workplace");
  if (!EMPLOYMENT.includes(p.employment)) throw bad("employment");
  if (!LEVEL.includes(p.level)) throw bad("level");
  if (p.description.length < 150) throw bad("description");
  if (!p.required) throw bad("required");

  // a deadline the employer gives, within 90 days; 30 days otherwise
  const now = new Date();
  const until = new Date(text(input.deadline, 10) || 0);
  const max = new Date(now.getTime() + 90 * 86_400_000);
  const expires = until > now && until <= max ? until : new Date(now.getTime() + 30 * 86_400_000);

  const since = new Date(now.getTime() - 14 * 86_400_000).toISOString();
  const dup = await env.DB.prepare(
    "SELECT 1 FROM postings WHERE lower(company) = lower(?) AND lower(title) = lower(?) AND created_at >= ? LIMIT 1",
  ).bind(p.company, p.title, since).first();
  const { risk, reasons } = screen(p, !!dup);
  const status = risk === "red" ? "rejected" : risk === "green" && env.AUTO_APPROVE === "1" ? "approved" : "pending";

  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  await env.DB.prepare(
    `INSERT INTO postings (id, status, created_at, reviewed_at, expires_at, company, website, contact_email, title, city,
       country, workplace, employment, level, description, required, preferred, salary, apply_url, risk, reasons)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, status, now.toISOString(), status === "pending" ? null : now.toISOString(), expires.toISOString().slice(0, 10),
    p.company, p.website, p.contact_email, p.title, p.city, p.country, p.workplace, p.employment, p.level,
    p.description, p.required, p.preferred, p.salary, p.apply_url, risk, reasons.join("\n")).run();
  // the same answer whatever the verdict: a rejected scammer learns nothing
  return { id };
}

export async function board(request, env, path) {
  const today = new Date().toISOString().slice(0, 10);
  if (path === "/board/postings" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC} FROM postings WHERE status = 'approved' AND expires_at >= ? ORDER BY reviewed_at DESC LIMIT 200`,
    ).bind(today).all();
    return { postings: results };
  }
  if (path === "/board/postings" && request.method === "POST") return submit(await request.json(), env);

  if (path === "/board/admin" && request.method === "GET") {
    await admin(request, env);
    const status = new URL(request.url).searchParams.get("status") || "pending";
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC}, status, contact_email, risk, reasons FROM postings WHERE status = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(status).all();
    return { postings: results };
  }
  const m = path.match(/^\/board\/admin\/([a-f0-9]{12})\/(approve|reject)$/);
  if (m && request.method === "POST") {
    await admin(request, env);
    await env.DB.prepare("UPDATE postings SET status = ?, reviewed_at = ? WHERE id = ?")
      .bind(m[2] === "approve" ? "approved" : "rejected", new Date().toISOString(), m[1]).run();
    return { ok: true };
  }
  return null;
}
