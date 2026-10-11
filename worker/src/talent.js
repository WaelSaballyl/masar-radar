// Students who opt in can be found by employers, without their identity:
// the public card holds what they study and can do, never a name, email,
// phone or link. An employer with an approved posting searches the cards and
// invites a student to apply; the student sees the invitation on their account
// page and applies (or not) the usual way, which is when contact details go.
//
//   PUT-like  POST /talent            (session) {card} -> {ok}   show or refresh my card
//             POST /talent/hide       (session)        -> {ok}   take it down
//             GET  /talent/mine       (session)        -> {card, invites}
//             GET  /talent/search?posting=<id>&field=&q=&country=&offset=  (posting's manage token) -> {cards, next}
//             POST /talent/invite     (posting's manage token) {posting, card} -> {ok}

import { employerOf } from "./employer.js";

const FIELD = ["data", "tech", "finance", "engineering", "marketing", "hr"];
const COUNTRY = ["SA", "AE", "QA", "KW", "BH", "OM", "other"];
const SEEKING = ["", "coop", "internship", "student", "job"];
const DAILY_INVITES = 30;
const SEARCH_PAGE = 100;
const refuse = (code, status) => Object.assign(new Error(code), { status, code });
const text = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
const same = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length > 0 && x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
};
// contact details have no place on a card, even pasted into a field
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+|00)?\d[\d\s-]{7,}\d|https?:\/\/\S+|www\.\S+|linkedin|wa\.me/gi;
const scrub = (s) => s.replace(CONTACT, "").replace(/\s+/g, " ").trim();

export function card(input) {
  const c = input && typeof input === "object" ? input : {};
  const out = {
    target: scrub(text(c.target, 80)), field: FIELD.includes(c.field) ? c.field : "data",
    country: COUNTRY.includes(c.country) ? c.country : "", city: scrub(text(c.city, 60)),
    university: scrub(text(c.university, 120)), major: scrub(text(c.major, 100)), degree: scrub(text(c.degree, 60)),
    graduation: (String(c.graduation || "").match(/(?:19|20)\d\d/g) || []).pop() || "",
    skills: scrub(text(c.skills, 600)).split(/[,،\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 25),
    seeking: SEEKING.includes(c.seeking) ? c.seeking : "", relocate: !!c.relocate,
  };
  if (!out.skills.length && !out.major) throw refuse("field:skills", 400);
  return out;
}

export async function user(request, env) {
  const token = bearer(request);
  if (!/^[a-f0-9]{48}$/.test(token)) throw refuse("session", 401);
  const row = await env.DB.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha(token), new Date().toISOString()).first();
  if (!row) throw refuse("session", 401);
  return row.user_id;
}

async function employer(request, env, posting) {
  if (!/^[a-f0-9]{12}$/.test(posting || "")) throw refuse("manage", 401);
  const row = await env.DB.prepare("SELECT manage_hash, status, owner_id FROM postings WHERE id = ?").bind(posting).first();
  if (!row) throw refuse("manage", 401);
  const company = row.owner_id ? await employerOf(request, env) : null;
  if (!(company && company.id === row.owner_id) && (!row.manage_hash || !same(await sha(bearer(request)), row.manage_hash))) throw refuse("manage", 401);
  // only a live posting may reach out: a rejected sender learns nothing new
  if (row.status !== "approved") throw refuse("not_live", 403);
}

export async function talent(request, env, path) {
  const now = new Date().toISOString();
  const url = new URL(request.url);
  const body = async () => {
    const raw = await request.text();
    if (raw.length > 6000) throw refuse("size", 413);
    try { return JSON.parse(raw); } catch { throw refuse("json", 400); }
  };

  if (path === "/talent" && request.method === "POST") {
    const uid = await user(request, env);
    const c = card((await body()).card);
    await env.DB.prepare(`INSERT INTO talent (id, user_id, card, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET card = excluded.card, updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID().replace(/-/g, "").slice(0, 12), uid, JSON.stringify(c), now).run();
    return { ok: true };
  }
  if (path === "/talent/hide" && request.method === "POST") {
    const uid = await user(request, env);
    await env.DB.prepare("DELETE FROM talent WHERE user_id = ?").bind(uid).run();
    return { ok: true };
  }
  if (path === "/talent/mine" && request.method === "GET") {
    const uid = await user(request, env);
    const row = await env.DB.prepare("SELECT card FROM talent WHERE user_id = ?").bind(uid).first();
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.title, p.company, p.city, p.expires_at, i.created_at FROM invites i JOIN postings p ON p.id = i.posting_id
        WHERE i.user_id = ? AND p.status = 'approved' AND p.expires_at >= ? ORDER BY i.created_at DESC LIMIT 50`,
    ).bind(uid, now.slice(0, 10)).all();
    return { card: row ? JSON.parse(row.card) : null, invites: results };
  }
  if (path === "/talent/search" && request.method === "GET") {
    const posting = url.searchParams.get("posting");
    await employer(request, env, posting);
    const field = url.searchParams.get("field") || "", country = url.searchParams.get("country") || "";
    const q = text(url.searchParams.get("q"), 60).toLowerCase();
    const offset = Math.min(Math.max(parseInt(url.searchParams.get("offset"), 10) || 0, 0), 100_000);
    // the filters run in SQL, so every card is reachable however many there are
    const { results } = await env.DB.prepare(
      // skills the student passed a Masar test in travel with the card as "verified"
      `SELECT t.id, t.card, t.updated_at, EXISTS(SELECT 1 FROM invites i WHERE i.card_id = t.id AND i.posting_id = ?) AS invited,
              (SELECT group_concat(v.skill, '|') FROM verified_skills v WHERE v.user_id = t.user_id) AS verified
         FROM talent t
        WHERE (? = '' OR json_extract(t.card, '$.field') = ?)
          AND (? = '' OR json_extract(t.card, '$.country') = ?)
          AND (? = '' OR lower(coalesce(json_extract(t.card, '$.target'), '') || ' ' || coalesce(json_extract(t.card, '$.major'), '') || ' '
                 || coalesce((SELECT group_concat(s.value, ' ') FROM json_each(t.card, '$.skills') s), '')) LIKE ? ESCAPE '\\')
        ORDER BY t.updated_at DESC, t.id LIMIT ? OFFSET ?`,
    ).bind(posting, field, field, country, country, q, `%${q.replace(/[\\%_]/g, "\\$&")}%`, SEARCH_PAGE + 1, offset).all();
    const cards = results.slice(0, SEARCH_PAGE).map((r) => ({ id: r.id, invited: !!r.invited, updated_at: r.updated_at, ...JSON.parse(r.card),
                                                             verified: r.verified ? r.verified.split("|") : [] }));
    return { cards, next: results.length > SEARCH_PAGE ? offset + SEARCH_PAGE : null };
  }
  if (path === "/talent/invite" && request.method === "POST") {
    const input = await body();
    await employer(request, env, input.posting);
    const target = await env.DB.prepare("SELECT user_id FROM talent WHERE id = ?").bind(String(input.card || "")).first();
    if (!target) throw refuse("path", 404);
    const today = await env.DB.prepare("SELECT count(*) n FROM invites WHERE posting_id = ? AND created_at >= ?")
      .bind(input.posting, now.slice(0, 10)).first();
    if (today.n >= DAILY_INVITES) throw refuse("rate", 429);
    await env.DB.prepare("INSERT OR IGNORE INTO invites (posting_id, card_id, user_id, created_at) VALUES (?, ?, ?, ?)")
      .bind(input.posting, input.card, target.user_id, now).run();
    return { ok: true };
  }
  return null;
}
