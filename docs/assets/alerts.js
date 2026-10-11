// The alerts page: saved searches and followed companies (Masar.alerts in
// core.js), each with the postings that are new since it was last marked
// read. Postings come from jobs.json plus the exclusive board, as on the
// postings page.
(() => {
  "use strict";
  const { el, alerts, count, countryName } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]').content;
  const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const KIND = { coop: "coop", internship: "internship" };
  let postings = [];

  const link = (p) => {
    const li = el("li", "posting");
    const a = el("a", null, p.title);
    a.href = p.exclusive ? `job.html?ex=${encodeURIComponent(p.id)}` : `job.html?id=${encodeURIComponent(p.id)}`;
    a.dir = "auto";
    const h = el("h3", "posting-title");
    h.append(a);
    const who = el("p", "posting-who", [p.company, p.countries.map((c) => countryName(c, "ar")).slice(0, 2).join("، "), p.posted_at ? Masar.ago(p.posted_at, "ar") : ""].filter(Boolean).join("، "));
    who.dir = "auto";
    li.append(h, who);
    return li;
  };
  const toJobs = (f) => {
    const q = new URLSearchParams();
    ["q", "where", "type", "role", "field"].forEach((k) => { if (f[k]) q.set(k, f[k]); });
    if (f.company) return `companies.html?c=${encodeURIComponent(f.company)}`;
    return `jobs.html${q.toString() ? `?${q}` : ""}`;
  };

  function render() {
    const rows = alerts.check(postings);
    const fresh = rows.reduce((n, r) => n + r.fresh.length, 0);
    $("alerts-meta").textContent = !rows.length ? "ما عندك تنبيهات بعد. أضف واحداً من فوق، أو من صفحة الإعلانات بعد ما تختار الفلاتر، أو من صفحة أي شركة."
      : fresh ? `إعلانات جديدة في تنبيهاتك: ${fresh}.` : "ما في جديد منذ آخر مرة. نعرض لك هنا كل إعلان جديد يطابق تنبيهاتك.";
    $("alert-list").replaceChildren(...rows.map(({ alert, all, fresh: news }) => {
      const box = el("section", "alert-card");
      const head = el("div", "alert-head");
      const title = el("h2", null, alerts.label(alert.f));
      title.dir = "auto";
      head.append(title, el("span", news.length ? "badge-new" : "muted small", news.length ? `${news.length} جديد` : `${count(all.length, "posting")} الآن`));
      box.append(head);
      if (news.length) {
        const ul = el("ul", "postings");
        news.slice(0, 12).forEach((p) => ul.append(link(p)));
        box.append(ul);
        if (news.length > 12) box.append(el("p", "muted small", `وغيرها ${news.length - 12}.`));
      }
      const acts = el("div", "alert-actions");
      const open = el("a", "btn btn-quiet btn-small", "افتحها كلها");
      open.href = toJobs(alert.f);
      acts.append(open);
      if (news.length) {
        const read = el("button", "btn btn-quiet btn-small", "علّمها مقروءة");
        read.type = "button";
        read.onclick = () => { alerts.markSeen(alert.id, all); render(); };
        acts.append(read);
      }
      const drop = el("button", "btn btn-quiet btn-small", "احذف التنبيه");
      drop.type = "button";
      drop.onclick = () => { alerts.remove(alert.id); render(); };
      acts.append(drop);
      box.append(acts);
      return box;
    }));
  }

  $("alert-new").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const a = alerts.add(f);
    $("new-status").textContent = a ? "أضفنا التنبيه. من الآن نعرض لك كل إعلان جديد يطابقه." : "اختر مسمى أو مكاناً أو نوعاً على الأقل.";
    if (a) { e.target.reset(); render(); }
  });

  // a link from elsewhere can carry the search to save: alerts.html?q=SQL&where=SA
  const given = new URLSearchParams(location.search);
  const wanted = Object.fromEntries(["q", "where", "type", "role", "field", "company"].filter((k) => given.get(k)).map((k) => [k, given.get(k)]));

  const exclusive = Masar.boardPostings().then((rows) => rows.map((p) => ({
    id: p.id, title: p.title, company: p.company, posted_at: (p.created_at || "").slice(0, 10), role: "", countries: [p.country],
    regions: [], mode: p.workplace, skills: [...list(p.required).map((s) => [s, 1]), ...list(p.preferred).map((s) => [s, 0])],
    kind: KIND[p.employment] || "job", field: p.field || "data", exclusive: true,
  }))).catch(() => []);
  Promise.all([fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()), exclusive]).then(([d, ex]) => {
    postings = [...ex, ...d.postings.map((p) => ({ ...p, kind: p.employment || "job" }))]
      .sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""));
    if (Object.keys(wanted).length) {
      alerts.add(wanted);
      history.replaceState(null, "", location.pathname);
    }
    render();
  }).catch(() => { $("alerts-meta").textContent = "تعذّر تحميل الإعلانات. حدّث الصفحة بعد قليل."; });
})();
