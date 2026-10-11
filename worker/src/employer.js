// Company accounts, apart from student accounts: HR signs in with the Google
// account of their work email (Google Workspace), never a free-mail one. A
// signed-in company sees all its postings and their applicants in one place
// (employer.html) instead of keeping one private link per posting; the link
// still works for companies without an account.
//
//   POST /employer/google  {credential}           -> {token, employer}
//   GET  /employer/me      (session)              -> {employer, postings}
//   POST /employer/profile (session) {company, website} -> {employer}
//   POST /employer/logout  (session)              -> {ok}

import { verifyGoogle } from "./auth.js";
import { refuse, hex, sha, bearer, line, body } from "./util.js";

const SESSION_DAYS = 30;
export const FREE_MAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|gmx|yandex|mail)\.[a-z.]+$/i;
const site = (v) => line(v, 120).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/.*$/, "").toLowerCase();
const show = (e) => ({ email: e.email, name: e.name || "", company: e.company || "", website: e.website || "", domain: e.domain });

// the company signed in on this request, or null (never throws: a manage link may be used instead)
export async function employerOf(request, env) {
  const token = bearer(request);
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT e.* FROM employer_sessions s JOIN employers e ON e.id = s.employer_id WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha(token), new Date().toISOString()).first();
}

export async function employer(request, env, path, verify = verifyGoogle) {
  const now = new Date().toISOString();
  if (path === "/employer/google" && request.method === "POST") {
    const { credential } = await body(request, 8000);
    const c = await verify(credential, env.GOOGLE_CLIENT_ID);
    const email = String(c.email || "").toLowerCase();
    if (FREE_MAIL.test(email)) throw refuse("work_email", 403);
    const domain = email.split("@")[1] || "";
    let row = await env.DB.prepare("SELECT * FROM employers WHERE google_sub = ?").bind(c.sub).first();
    if (row) {
      await env.DB.prepare("UPDATE employers SET email = ?, name = ?, last_login = ? WHERE id = ?").bind(email, line(c.name, 120), now, row.id).run();
    } else {
      // the company name and site start from the domain; the company edits them on its dashboard
      row = { id: crypto.randomUUID().replace(/-/g, ""), email, name: line(c.name, 120), domain, company: "", website: domain };
      await env.DB.prepare(`INSERT INTO employers (id, google_sub, email, name, domain, company, website, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(row.id, c.sub, email, row.name, domain, "", domain, now, now).run();
    }
    const token = hex(crypto.getRandomValues(new Uint8Array(24)));
    await env.DB.prepare("INSERT INTO employer_sessions (token_hash, employer_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha(token), row.id, now, new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()).run();
    const fresh = await env.DB.prepare("SELECT * FROM employers WHERE id = ?").bind(row.id).first();
    return { token, employer: show(fresh) };
  }

  const e = await employerOf(request, env);
  if (!e) throw refuse("session", 401);
  if (path === "/employer/me" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.title, p.city, p.status, p.created_at, p.expires_at, p.verified,
              (SELECT COUNT(*) FROM applications a WHERE a.posting_id = p.id) AS applicants,
              (SELECT COUNT(*) FROM applications a WHERE a.posting_id = p.id AND a.viewed_at IS NULL) AS unseen,
              (SELECT COUNT(*) FROM applications a WHERE a.posting_id = p.id AND a.boosted_at IS NOT NULL) AS boosted
         FROM postings p WHERE p.owner_id = ? ORDER BY p.created_at DESC LIMIT 100`,
    ).bind(e.id).all();
    // a rejected posting reads as "in review", as on the private link
    return { employer: show(e), postings: results.map((p) => ({ ...p, status: p.status === "approved" ? "live" : "review" })) };
  }
  if (path === "/employer/profile" && request.method === "POST") {
    const input = await body(request, 8000);
    const company = line(input.company, 120), website = site(input.website);
    if (!company) throw refuse("field:company", 400);
    await env.DB.prepare("UPDATE employers SET company = ?, website = ? WHERE id = ?").bind(company, website || e.domain, e.id).run();
    return { employer: show({ ...e, company, website: website || e.domain }) };
  }
  if (path === "/employer/logout" && request.method === "POST") {
    await env.DB.prepare("DELETE FROM employer_sessions WHERE token_hash = ?").bind(await sha(bearer(request))).run();
    return { ok: true };
  }
  return null;
}
