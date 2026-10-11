// The companies page: every company with an open posting in jobs.json (plus
// those posting on Masar itself), how many postings, where, and the skills it
// asks for most. companies.html?c=<name> shows one company. Built in the
// browser from the same data as the postings page; nothing is stored.
(() => {
  "use strict";
  const { el, countryName, GULF, ROLES } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]')?.content || "https://masar-cv.masar-cv.workers.dev";
  const params = new URLSearchParams(location.search);
  const key = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);

  function group(postings) {
    const by = new Map();
    for (const p of postings) {
      if (!p.company) continue;
      const k = key(p.company);
      if (!by.has(k)) by.set(k, { name: p.company, postings: [], skills: new Map(), countries: new Set(), logo: null, onMasar: false, latest: "" });
      const c = by.get(k);
      c.postings.push(p);
      if (!c.logo && p.logo) c.logo = p.logo;
      if (p.exclusive) c.onMasar = true;
      p.countries.forEach((x) => c.countries.add(x));
      p.skills.filter((s) => s[1]).forEach(([s]) => c.skills.set(s, (c.skills.get(s) || 0) + 1));
      if ((p.posted_at || "") > c.latest) c.latest = p.posted_at || "";
    }
    return [...by.values()].map((c) => ({ ...c, top: [...c.skills].sort((a, b) => b[1] - a[1]).map(([s]) => s) }))
      .sort((a, b) => (b.onMasar - a.onMasar) || (b.postings.length - a.postings.length) || b.latest.localeCompare(a.latest));
  }

  const where = (c) => [...c.countries].filter((x) => x !== "IL").sort((a, b) => GULF.includes(b) - GULF.includes(a))
    .slice(0, 3).map((x) => countryName(x, "ar")).join("، ");
  const logoOf = (c) => Masar.logo({ company: c.name, logo: c.logo }, "co-logo");

  function card(c) {
    const li = el("li", "co-card");
    const a = el("a", "co-link");
    a.href = `companies.html?c=${encodeURIComponent(c.name)}`;
    const name = el("strong", "co-name", c.name);
    name.dir = "auto";
    a.append(logoOf(c), name);
    li.append(a);
    const n = c.postings.length;
    li.append(el("p", "muted small", `${Masar.count(n, "posting", "ar")}${where(c) ? `، ${where(c)}` : ""}`));
    if (c.onMasar) li.append(el("span", "badge-exclusive", "تنشر على مسار"));
    if (c.top.length) {
      const chips = el("p", "posting-skills");
      c.top.slice(0, 4).forEach((s) => chips.append(el("span", "skill", s)));
      li.append(chips);
    }
    return li;
  }

  let all = [];
  function renderList() {
    const q = $("co-search").value.trim().toLowerCase();
    const w = $("co-where").value;
    const shown = all.filter((c) => (!q || c.name.toLowerCase().includes(q) || c.top.some((s) => s.toLowerCase() === q))
      && (!w || (w === "gulf" ? [...c.countries].some((x) => GULF.includes(x)) : c.countries.has(w))));
    $("co-count").textContent = shown.length ? `${Masar.count(shown.length, "company", "ar")}` : "ما لقينا شركة بهذا البحث.";
    $("co-list").replaceChildren(...shown.slice(0, 300).map(card));
  }

  function one(c) {
    document.title = `${c.name}: الإعلانات والمهارات المطلوبة — مسار`;
    $("head").hidden = true; $("co-list").hidden = true; $("co-count").hidden = true;
    const box = $("co-one");
    box.hidden = false;
    const back = el("a", "muted", "كل الشركات");
    back.href = "companies.html";
    const h1 = el("h1", "co-title");
    h1.append(logoOf(c), el("span", null, c.name));
    h1.lastChild.dir = "auto";
    const facts = el("p", "section-lede", `عندها ${Masar.count(c.postings.length, "posting", "ar")} الآن${where(c) ? ` في ${where(c)}` : ""}.`);
    box.replaceChildren(back, h1, facts);
    if (c.onMasar) box.append(el("p", null, "هذه الشركة تنشر إعلاناتها على مسار مباشرة، فتقدّم لها بسيرتك من هنا."));
    if (c.top.length) {
      box.append(el("h2", null, "المهارات التي تطلبها أكثر"));
      const chips = el("p", "posting-skills");
      c.top.slice(0, 12).forEach((s) => {
        const a = el("a", `skill${Masar.mine() && Masar.has(s) ? " have" : ""}`, s);
        a.href = `jobs.html?q=${encodeURIComponent(s)}`;
        chips.append(a);
      });
      box.append(chips);
      if (Masar.mine()) {
        const lack = c.top.slice(0, 8).filter((s) => !Masar.has(s));
        box.append(el("p", "muted", lack.length ? `من أكثر ما تطلبه وليس في مهاراتك: ${lack.join("، ")}.` : "عندك كل المهارات التي تطلبها أكثر."));
      }
    }
    const roles = [...new Set(c.postings.map((p) => ROLES[p.role]).filter(Boolean))];
    if (roles.length) box.append(el("p", "muted", `أدوارها: ${roles.join("، ")}.`));
    box.append(el("h2", null, "إعلاناتها المفتوحة"));
    const ul = el("ul", "postings");
    c.postings.sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || "")).forEach((p) => {
      const li = el("li", "posting");
      const a = el("a", null, p.title);
      a.href = p.exclusive ? `job.html?ex=${encodeURIComponent(p.id)}` : `job.html?id=${encodeURIComponent(p.id)}`;
      a.dir = "auto";
      const h = el("h3", "posting-title");
      h.append(a);
      li.append(h, el("p", "posting-who", [p.countries.map((x) => countryName(x, "ar")).slice(0, 2).join("، "), p.posted_at ? Masar.ago(p.posted_at, "ar") : ""].filter(Boolean).join("، ")));
      ul.append(li);
    });
    box.append(ul);
    const follow = el("p", "co-follow");
    const btn = el("button", "btn btn-quiet", "نبّهني بإعلاناتها الجديدة");
    btn.type = "button";
    btn.onclick = () => { Masar.alerts.add({ company: c.name }); btn.textContent = "أضفناها لتنبيهاتك"; btn.disabled = true; };
    const see = el("a", null, "تنبيهاتي");
    see.href = "alerts.html";
    follow.append(btn, " ", see);
    box.append(follow);
  }

  const collected = fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => d.postings);
  const exclusive = Masar.boardPostings().then((rows) => rows.map((p) => ({
    id: p.id, title: p.title, company: p.company, countries: [p.country], posted_at: (p.created_at || "").slice(0, 10),
    skills: [...list(p.required).map((s) => [s, 1]), ...list(p.preferred).map((s) => [s, 0])], role: "",
    logo: Masar.siteIcon(p.website), exclusive: true,
  }))).catch(() => []);
  Promise.all([collected, exclusive]).then(([a, b]) => {
    all = group([...b, ...a]);
    const wanted = params.get("c");
    const c = wanted && all.find((x) => key(x.name) === key(wanted));
    if (c) { one(c); return; }
    $("co-search").addEventListener("input", renderList);
    $("co-where").addEventListener("change", renderList);
    renderList();
    if (wanted) $("co-count").textContent = "هذه الشركة ما عندها إعلان مفتوح الآن. هذه كل الشركات.";
  }).catch(() => { $("co-count").textContent = "تعذّر تحميل الشركات. حدّث الصفحة بعد قليل."; });
})();
