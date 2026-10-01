// The company dashboard: sign in with the work Google account (worker
// /employer/google refuses free mail), then the company's postings with their
// applicants, and the way into the candidate search. Company sessions are kept
// apart from student ones (masar.employerSession, never synced).
(() => {
  "use strict";
  const { el, store } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]').content;
  const KEY = "masar.employerSession", WHO = "masar.employer";
  const token = () => store.get(KEY) || "";
  const call = async (path, body) => {
    const r = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token()}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await r.json().catch(() => ({}));
    if (r.status === 401) { forget(); throw Object.assign(new Error("session"), { status: 401 }); }
    return { status: r.status, ...out };
  };
  const forget = () => { localStorage.removeItem(KEY); localStorage.removeItem(WHO); };
  const STATUS = { live: "منشور", review: "قيد المراجعة" };

  async function show() {
    const signed = !!token();
    $("out").hidden = signed;
    $("in").hidden = !signed;
    Masar.accountButton();
    if (!signed) { google(); return; }
    let me;
    try { me = await call("/employer/me"); } catch { show(); return; }
    if (me.status !== 200) { $("co-name").textContent = "تعذّر تحميل لوحتك. حدّث الصفحة بعد قليل."; return; }
    store.set(WHO, JSON.stringify(me.employer));
    Masar.accountButton();
    const e = me.employer;
    $("co-name").textContent = e.company || "لوحة الشركة";
    $("co-email").textContent = e.email;
    const f = $("co-profile").elements;
    f.company.value = e.company; f.website.value = e.website;
    if (!e.company) $("co-status").textContent = "اكتب اسم شركتك كما يظهر للطلاب، ثم احفظ.";

    const ps = me.postings;
    const sum = (k) => ps.reduce((n, p) => n + (p[k] || 0), 0);
    const stat = (n, label) => { const d = el("div", "fact"); d.append(el("strong", null, String(n)), el("span", null, label)); return d; };
    $("stats").replaceChildren(stat(ps.filter((p) => p.status === "live").length, "إعلانات منشورة"),
      stat(sum("applicants"), "متقدمون"), stat(sum("unseen"), "لم تفتح سيرهم بعد"), stat(sum("boosted"), "مهتمون فعلاً"));
    $("postings").replaceChildren(...(ps.length ? ps.map((p) => {
      const li = el("li", "dash-posting");
      const h = el("h3", null, p.title);
      h.dir = "auto";
      const meta = el("p", "muted small", `${p.city}، نُشر ${Masar.ago(p.created_at.slice(0, 10), "ar")}، ينتهي ${Masar.date(p.expires_at, "ar")}`);
      const tags = el("p", "dash-tags");
      tags.append(el("span", `tag${p.status === "live" ? " tag-live" : ""}`, STATUS[p.status]));
      if (p.verified) tags.append(el("span", "tag", "موثّق"));
      if (p.unseen) tags.append(el("span", "badge-new", `${p.unseen} جديد`));
      const acts = el("p", "dash-row-actions");
      const open = el("a", "btn btn-primary btn-small", p.applicants ? `المتقدمون (${p.applicants})` : "صفحة المتقدمين");
      open.href = `applicants.html#${p.id}`;
      acts.append(open);
      if (p.status === "live") {
        const view = el("a", "btn btn-quiet btn-small", "الإعلان كما يراه الطلاب");
        view.href = `job.html?ex=${encodeURIComponent(p.id)}`;
        acts.append(view);
      }
      li.append(h, meta, tags, acts);
      return li;
    }) : [el("li", "muted", "ما عندك إعلانات بعد. انشر أول إعلان، ويظهر هنا مع متقدميه.")]));

    const live = ps.filter((p) => p.status === "live");
    const sel = $("talent-posting");
    sel.replaceChildren(...live.map((p) => { const o = el("option", null, p.title); o.value = p.id; return o; }));
    $("talent-go").hidden = !live.length;
    sel.hidden = !live.length;
    $("talent-note").textContent = live.length ? "" : "يفتح البحث بعد نشر أول إعلان لك.";
    const go = () => { $("talent-go").href = `applicants.html?talent=1#${sel.value}`; };
    sel.onchange = go;
    if (live.length) go();
    if (location.hash === "#talent") $("talent").scrollIntoView({ block: "start" });
  }

  $("co-profile").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const r = await call("/employer/profile", { company: f.company.value, website: f.website.value }).catch(() => null);
    $("co-status").textContent = r && r.status === 200 ? "حُفظ." : r && r.error === "field:company" ? "اكتب اسم الشركة." : "تعذّر الحفظ.";
    if (r && r.status === 200) { store.set(WHO, JSON.stringify(r.employer)); $("co-name").textContent = r.employer.company; }
  });
  $("logout").onclick = async () => { await call("/employer/logout", {}).catch(() => {}); forget(); show(); };

  let loaded = null;
  async function google() {
    try {
      const { google: clientId } = await fetch(`${API}/auth/config`).then((r) => r.json());
      if (!clientId) { $("out-status").textContent = "الدخول غير مفعّل بعد."; return; }
      loaded ||= new Promise((ok, fail) => {
        const s = document.createElement("script");
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true; s.onload = ok; s.onerror = fail;
        document.head.append(s);
      });
      await loaded;
      window.google.accounts.id.initialize({ client_id: clientId, callback: signIn, ux_mode: "popup", context: "signin" });
      window.google.accounts.id.renderButton($("google-btn"), { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with",
        locale: store.get("masar.lang") === "en" ? "en" : "ar", width: 320, logo_alignment: "left" });
    } catch {
      $("out-status").textContent = "تعذّر تحميل زر Google. تأكد من الاتصال وحدّث الصفحة.";
    }
  }
  async function signIn({ credential }) {
    $("out-status").textContent = "جارٍ الدخول…";
    try {
      const r = await fetch(`${API}/employer/google`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
      const out = await r.json();
      if (!r.ok) {
        $("out-status").textContent = out.error === "work_email" ? "هذا إيميل شخصي (Gmail وأمثاله). ادخل بحساب Google الخاص بعمل شركتك، أو انشر من صفحة الشركات بإيميل العمل."
          : out.error === "rate" ? "محاولات كثيرة. انتظر قليلاً ثم جرّب." : "تعذّر التحقق من الحساب. جرّب مرة ثانية.";
        return;
      }
      store.set(KEY, out.token);
      store.set(WHO, JSON.stringify(out.employer));
      $("out-status").textContent = "";
      show();
    } catch {
      $("out-status").textContent = "تعذّر الاتصال. جرّب مرة ثانية.";
    }
  }

  show();
})();
