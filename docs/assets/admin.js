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
  }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

  function card(p) {
    const li = el("li", "posting");
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
    const r = await call(`/board/admin?status=${$("state").value}`);
    if (!r.ok) { $("meta").textContent = r.status === 401 ? "الرمز غير صحيح." : "تعذّر التحميل."; $("list").replaceChildren(); return; }
    $("meta").textContent = r.data.postings.length ? Masar.count(r.data.postings.length, "posting", "ar") : "لا توجد إعلانات هنا.";
    $("list").replaceChildren(...r.data.postings.map(card));
  });
})();
