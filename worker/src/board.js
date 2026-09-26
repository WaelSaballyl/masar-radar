// Exclusive postings: employers submit, an admin approves, the site lists.
//
//   POST /board/postings                 employer submits      -> {id}
//   GET  /board/postings                 approved, unexpired   -> {postings}
//   GET  /board/admin?status=pending     admin (Bearer token)  -> {postings}
//   POST /board/admin/<id>/<approve|reject|relink>
//   POST /board/apply                    student applies       -> {ok}
//   GET  /board/manage/<id>              employer (Bearer link token) -> {posting, applications}
//   GET  /board/manage/<id>/<app>        one CV                -> {paper}
//   POST /board/manage/<id>/<app>/<new|shortlisted|rejected>
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
const refuse = (code, status) => Object.assign(new Error(code), { status, code });
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)));
const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
const same = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length > 0 && x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
};
async function body(request) {
  const raw = await request.text();
  if (raw.length > 60_000) throw refuse("size", 413);
  try { return JSON.parse(raw); } catch { throw refuse("json", 400); }
}

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
  if (!same(bearer(request), env.ADMIN_TOKEN || "")) throw refuse("admin", 401);
}

// the employer's private link carries a token; only its hash is stored
async function owner(request, env, id) {
  const row = await env.DB.prepare("SELECT manage_hash FROM postings WHERE id = ?").bind(id).first();
  if (!row || !row.manage_hash || !same(await sha(bearer(request)), row.manage_hash)) throw refuse("manage", 401);
}

// A student applies with the CV the builder made for this posting: contact
// details they agreed to send, and the paper as blocks (tag, class, text).
async function apply(input, env) {
  const a = { posting_id: text(input.posting_id, 12), name: text(input.name, 120), email: text(input.email, 160).toLowerCase(),
    phone: text(input.phone, 30), link: text(input.link, 300) };
  if (input.consent !== true) throw bad("consent");
  if (a.name.length < 2) throw bad("name");
  if (!EMAIL.test(a.email)) throw bad("email");
  const paper = JSON.stringify(input.paper);
  if (!Array.isArray(input.paper) || !input.paper.length || paper.length > 40_000) throw bad("paper");
  const n = (v) => Math.max(0, Math.min(99, Number.parseInt(v, 10) || 0));
  const today = new Date().toISOString().slice(0, 10);
  const open = await env.DB.prepare("SELECT 1 FROM postings WHERE id = ? AND status = 'approved' AND expires_at >= ?")
    .bind(a.posting_id, today).first();
  if (!open) throw refuse("closed", 404);
  try {
    await env.DB.prepare(
      `INSERT INTO applications (id, posting_id, created_at, name, email, phone, link, matched, required, paper)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(newId(), a.posting_id, new Date().toISOString(), a.name, a.email, a.phone, a.link,
      n(input.matched), n(input.required), paper).run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw refuse("applied", 409);
    throw e;
  }
  return { ok: true };
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
  if (!EMAIL.test(p.contact_email)) throw bad("contact_email");
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

  const id = newId(), manage = newToken();
  await env.DB.prepare(
    `INSERT INTO postings (id, status, created_at, reviewed_at, expires_at, company, website, contact_email, title, city,
       country, workplace, employment, level, description, required, preferred, salary, apply_url, risk, reasons, manage_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, status, now.toISOString(), status === "pending" ? null : now.toISOString(), expires.toISOString().slice(0, 10),
    p.company, p.website, p.contact_email, p.title, p.city, p.country, p.workplace, p.employment, p.level,
    p.description, p.required, p.preferred, p.salary, p.apply_url, risk, reasons.join("\n"), await sha(manage)).run();
  // the same answer whatever the verdict: a rejected scammer learns nothing
  return { id, manage };
}

export async function board(request, env, path) {
  const today = new Date().toISOString().slice(0, 10);
  if (path === "/board/postings" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC} FROM postings WHERE status = 'approved' AND expires_at >= ? ORDER BY reviewed_at DESC LIMIT 200`,
    ).bind(today).all();
    return { postings: results };
  }
  if (path === "/board/postings" && request.method === "POST") return submit(await body(request), env);
  if (path === "/board/apply" && request.method === "POST") return apply(await body(request), env);

  // the employer's applicants: best match first
  const own = path.match(/^\/board\/manage\/([a-f0-9]{12})(?:\/([a-f0-9]{12}))?(?:\/(new|shortlisted|rejected))?$/);
  if (own) {
    const [, id, app, set] = own;
    await owner(request, env, id);
    if (!app && request.method === "GET") {
      const posting = await env.DB.prepare("SELECT id, title, company, city, status, expires_at FROM postings WHERE id = ?").bind(id).first();
      const { results } = await env.DB.prepare(
        `SELECT id, created_at, status, name, email, phone, link, matched, required FROM applications WHERE posting_id = ?
         ORDER BY (matched * 1.0 / max(required, 1)) DESC, created_at LIMIT 500`,
      ).bind(id).all();
      // a rejected posting reads as "in review": its sender learns nothing
      return { posting: { ...posting, status: posting.status === "approved" ? "live" : "review" }, applications: results };
    }
    if (app && !set && request.method === "GET") {
      const row = await env.DB.prepare("SELECT paper FROM applications WHERE id = ? AND posting_id = ?").bind(app, id).first();
      if (!row) throw refuse("path", 404);
      return { paper: JSON.parse(row.paper) };
    }
    if (app && set && request.method === "POST") {
      await env.DB.prepare("UPDATE applications SET status = ? WHERE id = ? AND posting_id = ?").bind(set, app, id).run();
      return { ok: true };
    }
  }

  if (path === "/board/admin" && request.method === "GET") {
    await admin(request, env);
    const status = new URL(request.url).searchParams.get("status") || "pending";
    const { results } = await env.DB.prepare(
      `SELECT ${PUBLIC}, status, contact_email, risk, reasons FROM postings WHERE status = ? ORDER BY created_at DESC LIMIT 100`,
    ).bind(status).all();
    return { postings: results };
  }
  const m = path.match(/^\/board\/admin\/([a-f0-9]{12})\/(approve|reject|relink)$/);
  if (m && request.method === "POST") {
    await admin(request, env);
    // an employer who lost the private link: a new one replaces it, sent on by the admin
    if (m[2] === "relink") {
      const manage = newToken();
      await env.DB.prepare("UPDATE postings SET manage_hash = ? WHERE id = ?").bind(await sha(manage), m[1]).run();
      return { manage };
    }
    await env.DB.prepare("UPDATE postings SET status = ?, reviewed_at = ? WHERE id = ?")
      .bind(m[2] === "approve" ? "approved" : "rejected", new Date().toISOString(), m[1]).run();
    return { ok: true };
  }
  return null;
}
