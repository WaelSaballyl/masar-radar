// Student accounts: sign in with Google, then keep the browser's saved data
// (profile, CVs, applications, saved postings) the same on every device.
//
//   GET  /auth/config                 -> {google}  the public OAuth client id
//   POST /auth/google {credential}    -> {token, user}   Google's ID token in, a session out
//   GET  /auth/me                     (Bearer) -> {user}
//   POST /auth/logout                 (Bearer) -> {ok}
//   GET  /auth/data                   (Bearer) -> {data, rev}
//   POST /auth/data {data, base}      (Bearer) -> {rev} | 409 {data, rev} when another device wrote first
//   POST /auth/delete                 (Bearer) -> {ok}   the account and everything stored for it
//
// No passwords: Google proves who the person is. The session token is
// returned once and only its SHA-256 is stored, like the employers' links.

const CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const SESSION_DAYS = 60;
const MAX_DATA = 900_000;
// the only keys a device may store; anything else in a push is dropped
export const SYNC_KEYS = ["masar.profile", "masar.me", "masar.cvs", "masar.receipts", "masar.saved", "masar.applied", "masar.skipped", "masar.tickets"];

const refuse = (code, status) => Object.assign(new Error(code), { status, code });
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const part = (s) => JSON.parse(new TextDecoder().decode(b64url(s)));

// Google's signing keys change every few days; kept for an hour per isolate
let keys = null, keysUntil = 0;
async function googleKeys(refresh) {
  if (!keys || refresh || Date.now() > keysUntil) {
    const r = await fetch(CERTS);
    if (!r.ok) throw refuse("google", 502);
    keys = (await r.json()).keys || [];
    keysUntil = Date.now() + 3_600_000;
  }
  return keys;
}

// Checks an ID token from Google Identity Services: signature (RS256 with
// Google's published key), issuer, audience (our client id), expiry and a
// verified email. Returns the claims or throws 401.
export async function verifyGoogle(credential, clientId, now = Date.now()) {
  const pieces = String(credential || "").split(".");
  if (pieces.length !== 3 || !clientId) throw refuse("token", 401);
  let head, claims;
  try { head = part(pieces[0]); claims = part(pieces[1]); } catch { throw refuse("token", 401); }
  if (head.alg !== "RS256") throw refuse("token", 401);
  let jwk = (await googleKeys()).find((k) => k.kid === head.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === head.kid);
  if (!jwk) throw refuse("token", 401);
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(pieces[2]),
    new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`));
  if (!ok || !ISSUERS.includes(claims.iss) || claims.aud !== clientId || !(claims.exp * 1000 > now)
      || !claims.sub || !claims.email || claims.email_verified !== true) throw refuse("token", 401);
  return claims;
}

async function readJson(request, max) {
  const raw = await request.text();
  if (raw.length > max) throw refuse("size", 413);
  try { return JSON.parse(raw); } catch { throw refuse("json", 400); }
}

async function session(request, env) {
  const token = bearer(request);
  if (!/^[a-f0-9]{48}$/.test(token)) throw refuse("session", 401);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha(token), new Date().toISOString()).first();
  if (!row) throw refuse("session", 401);
  return row;
}

const person = (u) => ({ name: u.name || "", email: u.email, picture: u.picture || "" });

// keeps only the allowed keys, each a string (what localStorage holds)
export function clean(data) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  for (const k of SYNC_KEYS) if (typeof data[k] === "string") out[k] = data[k];
  return out;
}

export async function auth(request, env, path) {
  const now = new Date().toISOString();
  if (path === "/auth/config" && request.method === "GET") return { google: env.GOOGLE_CLIENT_ID || "" };

  if (path === "/auth/google" && request.method === "POST") {
    const { credential } = await readJson(request, 8_000);
    const c = await verifyGoogle(credential, env.GOOGLE_CLIENT_ID);
    const name = String(c.name || "").slice(0, 120), picture = /^https:\/\//.test(c.picture || "") ? c.picture.slice(0, 400) : "";
    let user = await env.DB.prepare("SELECT id FROM users WHERE google_sub = ?").bind(c.sub).first();
    if (user) {
      await env.DB.prepare("UPDATE users SET email = ?, name = ?, picture = ?, last_login = ? WHERE id = ?")
        .bind(c.email, name, picture, now, user.id).run();
    } else {
      user = { id: crypto.randomUUID().replace(/-/g, "") };
      await env.DB.prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(user.id, c.sub, c.email, name, picture, now, now).run();
    }
    const token = hex(crypto.getRandomValues(new Uint8Array(24)));
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(user.id, now),
      env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(await sha(token), user.id, now, expires),
    ]);
    return { token, user: person({ email: c.email, name, picture }) };
  }

  const user = await session(request, env);
  if (path === "/auth/me" && request.method === "GET") return { user: person(user) };
  if (path === "/auth/logout" && request.method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha(bearer(request))).run();
    return { ok: true };
  }
  if (path === "/auth/data" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT data, rev FROM user_data WHERE user_id = ?").bind(user.id).first();
    return row ? { data: JSON.parse(row.data), rev: row.rev } : { data: {}, rev: 0 };
  }
  if (path === "/auth/data" && request.method === "POST") {
    const input = await readJson(request, MAX_DATA + 10_000);
    const data = JSON.stringify(clean(input.data));
    if (data.length > MAX_DATA) throw refuse("size", 413);
    const base = Number.isInteger(input.base) ? input.base : 0;
    // written only on top of the version this device last saw; otherwise the
    // device gets the newer copy back, merges it, and sends again
    const res = base === 0
      ? await env.DB.prepare("INSERT INTO user_data (user_id, data, rev, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING")
        .bind(user.id, data, now).run()
      : await env.DB.prepare("UPDATE user_data SET data = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND rev = ?")
        .bind(data, now, user.id, base).run();
    if (!res.meta.changes) {
      const row = await env.DB.prepare("SELECT data, rev FROM user_data WHERE user_id = ?").bind(user.id).first();
      throw Object.assign(refuse("conflict", 409), { extra: row ? { data: JSON.parse(row.data), rev: row.rev } : { data: {}, rev: 0 } });
    }
    return { rev: base + 1 };
  }
  if (path === "/auth/delete" && request.method === "POST") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM user_data WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM talent WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM invites WHERE user_id = ?").bind(user.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
    ]);
    return { ok: true };
  }
  return null;
}
