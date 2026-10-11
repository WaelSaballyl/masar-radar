// Visitor counts, without cookies or IP addresses: each page view adds one to
// (day, page) and, when it came from another site, to (day, referring host).
// A browser marks its first view of the day itself (localStorage), which
// gives daily visitors without identifying anyone.
//
//   POST /hit   {p, r, v, m}   page, referring host, first view today, phone
//   GET  /stats                (ADMIN_TOKEN) -> {days, pages, refs}

import { refuse, bearer, same } from "./util.js";

const PAGE = /^[a-z0-9-]{1,40}$/;
const HOST = /^[a-z0-9.-]{3,80}$/;
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview/i;

export async function stats(request, env, path) {
  const day = new Date().toISOString().slice(0, 10);
  if (path === "/hit" && request.method === "POST") {
    if (BOT.test(request.headers.get("User-Agent") || "")) return { ok: true };
    const raw = await request.text();
    if (raw.length > 400) return { ok: true };
    let h;
    try { h = JSON.parse(raw); } catch { return { ok: true }; }
    const page = PAGE.test(h.p) ? h.p : "other";
    const host = typeof h.r === "string" && HOST.test(h.r) ? h.r : "";
    const q = [env.DB.prepare(
      `INSERT INTO hits (day, page, views, visitors, phone) VALUES (?, ?, 1, ?, ?)
       ON CONFLICT(day, page) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors, phone = phone + excluded.phone`,
    ).bind(day, page, h.v ? 1 : 0, h.m ? 1 : 0)];
    if (host) {
      q.push(env.DB.prepare("INSERT INTO refs (day, host, views) VALUES (?, ?, 1) ON CONFLICT(day, host) DO UPDATE SET views = views + 1")
        .bind(day, host));
    }
    await env.DB.batch(q);
    return { ok: true };
  }
  if (path === "/stats" && request.method === "GET") {
    if (!same(bearer(request), env.ADMIN_TOKEN || "")) throw refuse("admin", 401);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [days, pages, refs] = await Promise.all([
      env.DB.prepare("SELECT day, sum(views) views, sum(visitors) visitors, sum(phone) phone FROM hits WHERE day >= ? GROUP BY day ORDER BY day").bind(since).all(),
      env.DB.prepare("SELECT page, sum(views) views FROM hits WHERE day >= ? GROUP BY page ORDER BY views DESC LIMIT 20").bind(since).all(),
      env.DB.prepare("SELECT host, sum(views) views FROM refs WHERE day >= ? GROUP BY host ORDER BY views DESC LIMIT 20").bind(since).all(),
    ]);
    return { days: days.results, pages: pages.results, refs: refs.results };
  }
  return null;
}
