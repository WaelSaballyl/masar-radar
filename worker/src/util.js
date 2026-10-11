// Small helpers every route file shares: refusals, hashing, tokens, text
// cleaning and reading a JSON body with a size cap. One copy, so a fix to
// any of them reaches every path.

// an error the router turns into {error: code} with this status
export const refuse = (code, status) => Object.assign(new Error(code), { status, code });

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
export const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

// constant-time compare; an empty string never matches
export const same = (a, b) => {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length > 0 && x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
};

// a string field trimmed and cut to max (anything else becomes "");
// `line` also folds every run of whitespace, newlines included, into one space
export const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const line = (v, max) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// the request's JSON, refused with 413 past max characters and 400 when it is not JSON
export async function body(request, max) {
  const raw = await request.text();
  if (raw.length > max) throw refuse("size", 413);
  try { return JSON.parse(raw); } catch { throw refuse("json", 400); }
}
