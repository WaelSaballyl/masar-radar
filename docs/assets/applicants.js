// The employer's applicants. The private link is applicants.html#<id>.<token>:
// the token stays in the fragment (never sent as a URL) and goes to the worker
// only in the Authorization header. Each CV arrives as blocks and is rebuilt
// with textContent (cvkit.js fromBlocks).
(() => {
  "use strict";
  const { el } = Masar;
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content;
  const $ = (id) => document.getElementById(id);
  // the private link carries the token; a signed-in company uses its account instead
  const [id, linkToken] = location.hash.slice(1).split(".");
  const token = linkToken || Masar.store.get("masar.employerSession") || "";
  const STATUS = { new: "جديد", shortlisted: "في القائمة المختصرة", rejected: "مستبعد" };
  const call = (path, method = "GET") => fetch(`${API}/board/manage/${id}${path}`, {
    method, headers: { Authorization: `Bearer ${token}` },
  }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));

  let apps = [];

  function card(a) {
    const li = el("li", "posting");
    const top = el("div", "posting-top");
    top.append(el("span", `tag app-${a.status}`, STATUS[a.status]));
    if (a.required) top.append(el("span", "level level-intern", `يطابق ${a.matched} من ${a.required} مهارات مطلوبة`));
    if (a.boosted_at) top.append(el("span", "badge-new", "★ مهتم فعلاً"));
    if (a.nudged_at) top.append(el("span", "badge-new", "ذكّرك بطلبه"));
    top.append(el("span", "posting-age", Masar.ago(a.created_at.slice(0, 10), "ar")));
    const name = el("h3", "posting-title", a.name);
    name.dir = "auto";
    const who = el("p", "posting-who");
    const mail = el("a", null, a.email);
    mail.href = `mailto:${a.email}`; mail.dir = "ltr";
    who.append(mail);
    if (a.phone) { const tel = el("a", null, a.phone); tel.href = `tel:${a.phone.replace(/[^\d+]/g, "")}`; tel.dir = "ltr"; who.append("  |  ", tel); }
    if (a.link) { const s = el("span", null, a.link); s.dir = "ltr"; who.append("  |  ", s); }

    const actions = el("div", "posting-actions");
    const view = el("button", "btn btn-primary btn-small", "اعرض السيرة");
    view.type = "button";
    view.onclick = () => show(a);
    actions.append(view);
    const moves = a.status === "new" ? [["shortlisted", "أضفه للقائمة المختصرة"], ["rejected", "استبعده"]]
      : [["new", "أرجعه إلى الجدد"]];
    for (const [to, label] of moves) {
      const b = el("button", "btn btn-quiet btn-small", label);
      b.type = "button";
      b.onclick = async () => {
        b.disabled = true;
        const r = await call(`/${a.id}/${to}`, "POST");
        if (r.ok) { a.status = to; render(); } else b.disabled = false;
      };
      actions.append(b);
    }
    li.append(top, name, who, actions);
    return li;
  }

  function render() {
    const want = $("show").value;
    const shown = apps.filter((a) => !want || a.status === want);
    $("list").replaceChildren(...shown.map(card));
    if (!shown.length && apps.length) $("list").append(el("li", "muted", "لا يوجد متقدمون في هذه القائمة."));
  }

  async function show(a) {
    const r = await call(`/${a.id}`);
    if (!r.ok) return;
    const paper = $("cv-paper");
    paper.replaceChildren();
    MasarCV.fromBlocks(paper, r.data.paper);
    // an Arabic CV has Arabic section headings, whatever script the name is in
    const ar = /[؀-ۿ]/.test(paper.querySelector("h2")?.textContent || paper.textContent.slice(0, 200));
    paper.lang = ar ? "ar" : "en";
    paper.dir = ar ? "rtl" : "ltr";
    $("result").hidden = false;
    $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  $("show").addEventListener("change", render);
  $("close").addEventListener("click", () => { $("result").hidden = true; });
  $("print").addEventListener("click", () => {
    const paper = $("cv-paper"), title = document.title;
    document.title = `${paper.querySelector("h1")?.textContent || "CV"} - CV`;
    paper.classList.add("print-size");
    paper.style.setProperty("--fit", "1");
    window.addEventListener("afterprint", () => {
      document.title = title;
      paper.classList.remove("print-size");
      paper.style.removeProperty("--fit");
    }, { once: true });
    window.print();
  });

  if (!id || !token) {
    $("meta").textContent = "افتح الصفحة من الرابط الخاص الذي ظهر لك بعد نشر الإعلان، أو ";
    const a = el("a", null, "ادخل بحساب شركتك");
    a.href = "employer.html";
    $("meta").append(a, ".");
    return;
  }
  call("").then((r) => {
    if (!r.ok) {
      $("meta").textContent = r.status === 401 ? "الرابط غير صحيح أو قديم. إذا فقدته، راسلنا من إيميل العمل ونرسل لك رابطاً جديداً."
        : "تعذّر التحميل. جرّب مرة ثانية.";
      return;
    }
    const { posting } = r.data;
    apps = r.data.applications;
    $("head").textContent = `المتقدمون: ${posting.title}`;
    const state = posting.status === "live" ? "الإعلان منشور" : "الإعلان قيد المراجعة ولم يُنشر بعد";
    $("meta").textContent = `${posting.company}، ${posting.city}. ${state}. `
      + (apps.length ? `${Masar.count(apps.length, "applicant", "ar")}، الأقرب لمتطلباتك أولاً.` : "لم يتقدم أحد بعد.");
    render();
    // a live posting may also look for candidates who opted in
    if (posting.status === "live") {
      $("talent").hidden = false;
      search();
      // the dashboard's "find candidates" opens straight on the search
      if (new URLSearchParams(location.search).has("talent")) $("talent").scrollIntoView({ block: "start" });
    }
  });

  // ---------- candidates who opted in ----------
  const API_BASE = document.querySelector('meta[name="masar-api"]').content;
  const SEEK = { coop: "يبحث عن تدريب تعاوني", internship: "يبحث عن تدريب", student: "يبحث عن دوام طلابي", job: "يبحث عن وظيفة" };
  const COUNTRY = { SA: "السعودية", AE: "الإمارات", QA: "قطر", KW: "الكويت", BH: "البحرين", OM: "عُمان" };
  async function search() {
    $("t-meta").textContent = "…";
    const q = new URLSearchParams({ posting: id, field: $("t-field").value, country: $("t-country").value, q: $("t-q").value.trim() });
    const r = await fetch(`${API_BASE}/talent/search?${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (x) => ({ ok: x.ok, data: await x.json() })).catch(() => ({ ok: false }));
    if (!r.ok) { $("t-meta").textContent = "تعذّر البحث الآن."; return; }
    const { cards } = r.data;
    $("t-meta").textContent = cards.length ? `المرشحون: ${cards.length}` : "لا يوجد مرشحون بهذه الفلاتر بعد.";
    $("cands").replaceChildren(...cards.map((c) => {
      const li = el("li", "cand");
      li.append(el("strong", null, c.target || c.major || "طالب"),
        el("p", null, [c.degree, c.major, c.university, c.graduation && `تخرّج ${c.graduation}`].filter(Boolean).join("، ")),
        el("p", null, [c.city, COUNTRY[c.country], SEEK[c.seeking], c.relocate && "مستعد للانتقال"].filter(Boolean).join("، ")));
      const sk = el("p", "skills-line", c.skills.join(", "));
      li.append(sk);
      // skills the student passed a Masar test in
      if (c.verified && c.verified.length) {
        const v = el("p", "skills-line");
        c.verified.forEach((name) => { const b = el("span", "verified-skill", `✓ ${name}`); b.dir = "ltr"; v.append(b, " "); });
        v.append(el("span", "muted small", "موثّقة باختبار مسار"));
        li.append(v);
      }
      const b = el("button", "btn btn-small " + (c.invited ? "btn-quiet" : "btn-primary"), c.invited ? "دعوته" : "ادعُه للتقديم");
      b.type = "button";
      b.disabled = c.invited;
      b.onclick = async () => {
        b.disabled = true;
        const x = await fetch(`${API_BASE}/talent/invite`, { method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ posting: id, card: c.id }) }).catch(() => null);
        if (x && x.ok) { b.textContent = "دعوته"; b.className = "btn btn-small btn-quiet"; }
        else { b.disabled = false; b.textContent = x && x.status === 429 ? "وصلت لحد الدعوات اليوم" : "تعذّرت الدعوة"; }
      };
      li.append(b);
      return li;
    }));
  }
  $("t-go").onclick = search;
})();
