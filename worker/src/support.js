// Support: a conversation between a visitor and Masar's team, like a chat.
//
//   POST /support/tickets {name, email, topic, text}  -> {id, token}  opens one
//   GET  /support/tickets/<id>          (Bearer token) -> {ticket, messages}
//   POST /support/tickets/<id> {text}   (Bearer token) -> {ok}          the visitor writes
//   GET  /support/admin?status=open     (ADMIN_TOKEN)  -> {tickets}
//   GET  /support/admin/<id>            (ADMIN_TOKEN)  -> {ticket, messages}
//   POST /support/admin/<id> {text, close}             -> {ok}          the team answers
//
// The visitor keeps the ticket's token (only its hash is stored), so no account
// is needed; a signed-in student's tickets also carry their user id. Replies
// show on the support page, which checks for new ones while it is open.

const TOPICS = ["account", "cv", "apply", "employer", "bug", "other"];
const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const refuse = (code, status) => Object.assign(new Error(code), { status, code });
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
const same = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length > 0 && x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
};
async function body(request) {
  const raw = await request.text();
  if (raw.length > 12_000) throw refuse("size", 413);
  try { return JSON.parse(raw); } catch { throw refuse("json", 400); }
}

// the signed-in student, when there is one; a ticket works without it
async function userOf(request, env) {
  const token = request.headers.get("X-Masar-Session") || "";
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const row = await env.DB.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .bind(await sha(token), new Date().toISOString()).first();
  return row ? row.user_id : null;
}

async function thread(env, id) {
  const ticket = await env.DB.prepare("SELECT id, name, email, topic, status, created_at, updated_at FROM support_tickets WHERE id = ?").bind(id).first();
  if (!ticket) throw refuse("path", 404);
  const { results } = await env.DB.prepare(
    "SELECT author, text, created_at FROM support_messages WHERE ticket_id = ? ORDER BY created_at, rowid LIMIT 300",
  ).bind(id).all();
  return { ticket, messages: results };
}

export async function support(request, env, path, limited) {
  const now = new Date().toISOString();
  if (path === "/support/tickets" && request.method === "POST") {
    if (limited()) throw refuse("rate", 429);
    const input = await body(request);
    const name = text(input.name, 80), email = text(input.email, 120), msg = text(input.text, 4000);
    const topic = TOPICS.includes(input.topic) ? input.topic : "other";
    if (!name) throw refuse("field:name", 400);
    if (!EMAIL.test(email)) throw refuse("field:email", 400);
    if (msg.length < 10) throw refuse("field:text", 400);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const token = hex(crypto.getRandomValues(new Uint8Array(24)));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO support_tickets (id, token_hash, user_id, name, email, topic, status, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
        .bind(id, await sha(token), await userOf(request, env), name, email, topic, now, now),
      env.DB.prepare("INSERT INTO support_messages (ticket_id, author, text, created_at) VALUES (?, 'visitor', ?, ?)").bind(id, msg, now),
    ]);
    return { id, token };
  }

  const own = path.match(/^\/support\/tickets\/([a-f0-9]{12})$/);
  if (own) {
    const row = await env.DB.prepare("SELECT token_hash FROM support_tickets WHERE id = ?").bind(own[1]).first();
    if (!row || !same(await sha(bearer(request)), row.token_hash)) throw refuse("ticket", 401);
    if (request.method === "GET") return thread(env, own[1]);
    if (request.method === "POST") {
      if (limited()) throw refuse("rate", 429);
      const msg = text((await body(request)).text, 4000);
      if (msg.length < 2) throw refuse("field:text", 400);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO support_messages (ticket_id, author, text, created_at) VALUES (?, 'visitor', ?, ?)").bind(own[1], msg, now),
        // a closed conversation opens again when the visitor writes
        env.DB.prepare("UPDATE support_tickets SET status = 'open', updated_at = ? WHERE id = ?").bind(now, own[1]),
      ]);
      return { ok: true };
    }
  }

  if (path.startsWith("/support/admin")) {
    if (!same(bearer(request), env.ADMIN_TOKEN || "")) throw refuse("admin", 401);
    if (path === "/support/admin" && request.method === "GET") {
      const status = new URL(request.url).searchParams.get("status") === "closed" ? "closed" : "open";
      const { results } = await env.DB.prepare(
        `SELECT t.id, t.name, t.email, t.topic, t.status, t.updated_at,
                (SELECT author FROM support_messages m WHERE m.ticket_id = t.id ORDER BY created_at DESC, rowid DESC LIMIT 1) AS last_author
         FROM support_tickets t WHERE t.status = ? ORDER BY t.updated_at DESC LIMIT 200`,
      ).bind(status).all();
      return { tickets: results };
    }
    const m = path.match(/^\/support\/admin\/([a-f0-9]{12})$/);
    if (m && request.method === "GET") return thread(env, m[1]);
    if (m && request.method === "POST") {
      const input = await body(request);
      const msg = text(input.text, 4000);
      const batch = [];
      if (msg) batch.push(env.DB.prepare("INSERT INTO support_messages (ticket_id, author, text, created_at) VALUES (?, 'team', ?, ?)").bind(m[1], msg, now));
      batch.push(env.DB.prepare("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?").bind(input.close ? "closed" : "open", now, m[1]));
      await env.DB.batch(batch);
      return { ok: true };
    }
  }
  return null;
}
