// Review exclusive postings. The token stays in this tab (sessionStorage) and
// goes only to the worker, in the Authorization header.
(() => {
  "use strict";
  const { el } = Masar;
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content;
  const $ = (id) => document.getElementById(id);
  const KEY = "masar.admin";
  try { $("token").value = sessionStorage.getItem(KEY) || ""; } catch { /* private mode */ }

  const call = (path, method = "GET") => fetch(`${API}${path}`, {
    method, headers: { Authorization: `Bearer ${$("token").value.trim()}` },
  }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }))
    .catch(() => ({ ok: false, status: 0, data: {} })); // offline: "could not load", not an uncaught error

  function card(p) {
    const li = el("li", "posting");
    // the screening bot's verdict and why
    const RISK = { green: "سليم", yellow: "يحتاج نظرة", red: "احتيال محتمل" };
    if (p.risk) {
      li.append(el("span", `risk risk-${p.risk}`, RISK[p.risk]));
      if (p.reasons) li.append(el("p", "posting-pref", p.reasons.replace(/\n/g, "  |  ")));
    }
    li.append(el("h3", "posting-title", p.title),
      el("p", "posting-who", `${p.company} — ${p.city}، ${p.country} — ${p.employment} / ${p.workplace} / ${p.level}`),
      el("p", "posting-pref", `تواصل: ${p.contact_email}${p.website ? `  |  ${p.website}` : ""}`),
      el("p", "posting-pref", `يطلب: ${p.required}${p.preferred ? `  |  يُفضّل: ${p.preferred}` : ""}${p.salary ? `  |  ${p.salary}` : ""}`));
    const desc = el("p", "admin-desc", p.description);
    desc.dir = "auto";
    li.append(desc);
    if (p.status === "pending") {
      const actions = el("div", "posting-actions");
      for (const [act, label, cls] of [["approve", "انشر", "btn-primary"], ["reject", "ارفض", "btn-quiet"]]) {
        const b = el("button", `btn ${cls} btn-small`, label);
        b.type = "button";
        b.onclick = async () => { b.disabled = true; const r = await call(`/board/admin/${p.id}/${act}`, "POST"); if (r.ok) li.remove(); else b.disabled = false; };
        actions.append(b);
      }
      li.append(actions);
    }
    return li;
  }

  $("login").addEventListener("submit", async () => {
    try { sessionStorage.setItem(KEY, $("token").value.trim()); } catch { /* private mode */ }
    $("meta").textContent = "…";
    const state = $("state").value;
    const r = await Masar.allPages((o) => call(`/board/admin?status=${state}&offset=${o}`), "postings");
    if (!r.ok) { $("meta").textContent = r.status === 401 ? "الرمز غير صحيح." : "تعذّر التحميل."; $("list").replaceChildren(); return; }
    $("meta").textContent = r.data.postings.length ? Masar.count(r.data.postings.length, "posting", "ar") : "لا توجد إعلانات هنا.";
    $("list").replaceChildren(...r.data.postings.map(card));
  });

  // ---------- support conversations ----------
  const TOPIC = { account: "الحساب", cv: "صانع السيرة", apply: "التقديم", employer: "شركة", bug: "مشكلة تقنية", other: "غير ذلك" };
  const send = (path, body) => fetch(`${API}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${$("token").value.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.ok);
  const when = (iso) => new Date(iso).toLocaleString("ar-SA-u-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  let current = null;

  async function tickets() {
    $("sup-chat").hidden = true;
    $("sup-meta").textContent = "…";
    const state = $("sup-state").value;
    const r = await Masar.allPages((o) => call(`/support/admin?status=${state}&offset=${o}`), "tickets");
    if (!r.ok) { $("sup-meta").textContent = r.status === 401 ? "اكتب رمز الإدارة فوق أولاً." : "تعذّر التحميل."; return; }
    const waiting = r.data.tickets.filter((t) => t.last_author === "visitor").length;
    $("sup-meta").textContent = r.data.tickets.length ? `المحادثات: ${r.data.tickets.length}، تنتظر ردّك: ${waiting}` : "لا توجد محادثات هنا.";
    $("sup-list").replaceChildren(...r.data.tickets.map((t) => {
      const li = el("li");
      const b = el("button", "ticket-row");
      b.type = "button";
      b.append(el("strong", null, `${t.name}، ${TOPIC[t.topic] || t.topic}`),
        el("span", t.last_author === "visitor" ? "badge-new" : "muted", t.last_author === "visitor" ? "ينتظر ردّك" : when(t.updated_at)));
      b.onclick = () => thread(t.id);
      li.append(b);
      return li;
    }));
  }

  async function thread(id) {
    current = id;
    const r = await call(`/support/admin/${id}`);
    if (!r.ok) return;
    const { ticket, messages } = r.data;
    $("sup-who").textContent = `${ticket.name}  |  ${ticket.email}  |  ${TOPIC[ticket.topic] || ticket.topic}`;
    $("sup-bubbles").replaceChildren(...messages.map((m) => {
      const li = el("li", `bubble ${m.author === "team" ? "from-me" : "from-team"}`);
      const p = el("p", null, m.text);
      p.dir = "auto";
      li.append(el("span", "bubble-who", m.author === "team" ? "فريق مسار" : ticket.name), p, el("time", null, when(m.created_at)));
      return li;
    }));
    $("sup-chat").hidden = false;
    $("sup-text").focus();
  }

  async function reply(close) {
    const text = $("sup-text").value.trim();
    if (!current || (!text && !close)) return;
    if (await send(`/support/admin/${current}`, { text, close })) {
      $("sup-text").value = "";
      if (close) tickets(); else thread(current);
    }
  }
  $("sup-load").onclick = tickets;

  // ---------- visitors ----------
  const PAGES = { index: "الرئيسية", jobs: "الإعلانات", job: "صفحة إعلان", swipe: "السحب", cv: "صانع السيرة",
    applications: "طلباتي", dashboard: "مؤشر السوق", employers: "الشركات", guide: "الدليل", account: "الحساب",
    support: "الدعم", privacy: "الخصوصية", terms: "الشروط" };
  $("stats-load").onclick = async () => {
    $("stats-meta").textContent = "…";
    const r = await call("/stats");
    if (!r.ok) { $("stats-meta").textContent = r.status === 401 ? "اكتب رمز الإدارة فوق أولاً." : "تعذّر التحميل."; return; }
    const { days, pages, refs } = r.data;
    const sum = (k) => days.reduce((a, d) => a + d[k], 0);
    const views = sum("views"), visitors = sum("visitors"), phone = sum("phone");
    $("stats-meta").textContent = views
      ? `زوار: ${visitors}، مشاهدات: ${views}، من الجوال: ${Math.round((phone / views) * 100)}٪`
      : "لا زيارات مسجلة بعد. تبدأ الأرقام من أول زيارة للموقع المنشور.";
    const max = Math.max(1, ...days.map((d) => d.visitors));
    $("stats-days").replaceChildren(...days.map((d) => {
      const li = el("li", "bar-row");
      const track = el("span", "bar-track");
      const seg = el("span", "seg req");
      seg.style.width = `${(d.visitors / max) * 100}%`;
      track.append(seg);
      li.append(el("span", "bar-label", d.day.slice(5)), track, el("span", "bar-value", String(d.visitors)));
      return li;
    }));
    $("stats-pages").replaceChildren(...pages.map((p) => el("li", null, `${PAGES[p.page] || p.page}: ${p.views}`)));
    $("stats-refs").replaceChildren(...(refs.length ? refs.map((x) => el("li", null, `${x.host}: ${x.views}`)) : [el("li", "muted", "لا شيء بعد")]));
    $("stats").hidden = false;
  };
  $("sup-send").addEventListener("submit", (e) => { e.preventDefault(); reply(false); });
  $("sup-close").onclick = () => reply(true);
})();
