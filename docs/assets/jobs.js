// Every active posting from data/jobs.json, grouped by where it can be done
// from (the Gulf first) and newest first inside each group. Text from the data
// goes in through textContent only.
(() => {
  "use strict";
  const { el, safeUrl, count, ago, place, countryName, GULF } = Masar;
  const $ = (id) => document.getElementById(id);
  const PAGE = 40;
  let applied = [];
  try { applied = JSON.parse(Masar.store.get("masar.applied") || "[]"); } catch { /* a damaged copy */ }

  const GROUPS = [
    ["exclusive", "حصري على مسار"],
    ["gulf", "السعودية والخليج"],
    ["anywhere", "عن بُعد من أي مكان"],
    ["region", "الشرق الأوسط، دون تحديد دولة"],
    ["other", "خارج الخليج"],
  ];
  const { LEVELS, MODES, KINDS, ROLES, yearsText: YEARS, fit, has, mine } = Masar;
  const ENTRY = ["Intern", "Junior"];
  const MID_UP = ["Mid", "Senior", "Lead", "Manager"];

  let postings = [];
  let shown = PAGE;
  Masar.initTheme();

  // "الرياض، السعودية" for the Gulf; country names elsewhere, never Israel
  function whereText(p, group) {
    if (group === "exclusive") group = "gulf"; // employers post Gulf jobs only
    if (group === "anywhere") return "عن بُعد من أي مكان";
    if (group === "region") return "الشرق الأوسط";
    const codes = p.countries.filter((c) => (group === "gulf" ? GULF.includes(c) : c !== "IL"));
    const names = codes.slice(0, 3).map((c) => countryName(c, "ar"));
    const city = (p.location || "").split(",")[0].trim();
    if (group === "gulf" && city && !/^[A-Z]{2}$/.test(city) && !names.includes(city)) names.unshift(city);
    return names.join("، ") || "خارج الخليج";
  }

  // ---------- the student's own view: saved postings and skill match ----------

  const SAVED = "masar.saved";
  let saved = [];
  try { saved = JSON.parse(Masar.store.get(SAVED) || "[]"); } catch { /* a damaged copy */ }
  const toggleSaved = (id) => {
    saved = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id];
    Masar.store.set(SAVED, JSON.stringify(saved));
  };
  function card(p, group) {
    const li = el("li", p.exclusive ? "posting exclusive" : "posting");
    const top = el("div", "posting-top");
    if (p.exclusive) top.append(el("span", "badge-exclusive", "حصري على مسار"));
    if (KINDS[p.kind] && p.kind !== "job") top.append(el("span", "tag tag-training", KINDS[p.kind]));
    if (LEVELS[p.level] && !(p.level === "Intern" && p.kind !== "job")) top.append(el("span", `level level-${ENTRY.includes(p.level) ? p.level.toLowerCase() : "other"}`, LEVELS[p.level]));
    if (p.years != null) top.append(el("span", "tag", YEARS(p.years)));
    if (MODES[p.mode]) top.append(el("span", "tag", MODES[p.mode]));
    top.append(el("span", "posting-age", ago(p.posted_at, "ar")));

    const title = el("h3", "posting-title");
    const link = el("a", null, p.title);
    link.href = `job.html?${p.exclusive ? "ex" : "id"}=${encodeURIComponent(p.id)}`;
    link.dir = "auto";
    title.append(link);
    const who = el("p", "posting-who");
    const company = el("span", "posting-company", p.company);
    company.dir = "auto";
    // a monogram stands in for the logo job feeds do not carry
    const logo = el("span", "co-logo", (p.company || "?").trim().charAt(0).toUpperCase());
    logo.setAttribute("aria-hidden", "true");
    who.append(logo, company, el("span", "posting-where", whereText(p, group)));
    li.append(top, title, who);

    const f = fit(p);
    if (f) li.append(el("p", `posting-fit${f.have / f.of >= 0.6 ? " good" : ""}`, `عندك ${f.have} من ${f.of} مهارات مطلوبة`));
    const required = p.skills.filter((s) => s[1]).map((s) => s[0]);
    const preferred = p.skills.filter((s) => !s[1]).map((s) => s[0]);
    if (required.length) {
      const chips = el("p", "posting-skills");
      chips.append(el("span", "posting-label", "يطلب:"));
      // each skill opens every posting that asks for it
      required.slice(0, 8).forEach((s) => {
        const a = el("a", `skill${mine() && has(s) ? " have" : ""}`, s);
        a.href = `jobs.html?q=${encodeURIComponent(s)}`;
        chips.append(a);
      });
      li.append(chips);
    }
    if (preferred.length) li.append(el("p", "posting-pref", `ويُفضّل: ${preferred.slice(0, 6).join("، ")}`));
    if (p.deadline) li.append(el("p", "posting-pref", `آخر موعد للتقديم: ${Masar.date(p.deadline, "ar")}`));

    const actions = el("div", "posting-actions");
    const href = safeUrl(p.url);
    // an exclusive posting is applied to here: the CV made for it goes to the employer
    if (p.exclusive) {
      if (applied.includes(p.id)) actions.append(el("span", "tag app-done", "قدّمت على هذا الإعلان"));
      else {
        const go = el("a", "btn btn-primary btn-small", "قدّم عبر مسار");
        go.href = `cv.html?ex=${encodeURIComponent(p.id)}`;
        actions.append(go);
      }
      if (href) {
        const site = el("a", "btn btn-quiet btn-small", "الإعلان في موقع الشركة");
        site.href = href; site.target = "_blank"; site.rel = "noopener";
        actions.append(site);
      }
    } else {
      if (href) {
        const open = el("a", "btn btn-primary btn-small", "افتح الإعلان");
        open.href = href; open.target = "_blank"; open.rel = "noopener";
        actions.append(open);
      }
      const cv = el("a", "btn btn-quiet btn-small", "جهّز سيرتي لهذا الإعلان");
      cv.href = `cv.html?job=${encodeURIComponent(p.id)}`;
      actions.append(cv);
    }
    actions.append(saveButton(p), shareButton(p));
    li.append(actions);
    return li;
  }

  function saveButton(p) {
    const b = el("button", "icon-btn");
    b.type = "button";
    const paint = () => {
      b.textContent = saved.includes(p.id) ? "★ محفوظ" : "☆ احفظ";
      b.setAttribute("aria-pressed", saved.includes(p.id));
    };
    paint();
    b.onclick = () => { toggleSaved(p.id); paint(); if ($("saved").checked) render(); };
    return b;
  }
  function shareButton(p) {
    const b = el("button", "icon-btn", "شارك");
    b.type = "button";
    b.onclick = async () => {
      const url = new URL(`job.html?${p.exclusive ? "ex" : "id"}=${encodeURIComponent(p.id)}`, location.href).href;
      const text = `${p.title}، ${p.company}`;
      try {
        if (navigator.share) await navigator.share({ title: text, text, url });
        else { await navigator.clipboard.writeText(`${text}\n${url}`); b.textContent = "نُسخ الرابط"; }
      } catch { /* the share sheet was closed */ }
    };
    return b;
  }

  // ---------- filters, kept in the address so a filtered list can be shared ----------

  const FILTERS = ["q", "where", "type", "exp", "level", "role", "sort"];
  const TRAINING = ["coop", "internship", "student"];

  function matches(p) {
    const [where, type, exp, level, role] = ["where", "type", "exp", "level", "role"].map((k) => $(k).value);
    const q = $("q").value.trim().toLowerCase();
    if ($("saved").checked && !saved.includes(p.id)) return false;
    if (where === "gulf" && p.group !== "gulf" && !p.exclusive) return false;
    if (/^[A-Z]{2}$/.test(where) && !p.countries.includes(where)) return false;
    if (where === "near" && p.group === "other") return false;
    if (where === "remote" && p.mode !== "remote" && p.group !== "anywhere") return false;
    if (type === "training" && !TRAINING.includes(p.kind)) return false;
    if (type && type !== "training" && p.kind !== type) return false;
    // training asks for no experience; otherwise only postings that state the years
    if (exp === "0" && !(p.years === 0 || TRAINING.includes(p.kind))) return false;
    if (exp === "2" && !(p.years != null && p.years <= 2)) return false;
    if (exp === "5" && !(p.years >= 3 && p.years <= 5)) return false;
    if (exp === "6" && !(p.years > 5)) return false;
    if (level === "entry" && !ENTRY.includes(p.level)) return false;
    if (level === "mid" && !MID_UP.includes(p.level)) return false;
    if (role && p.role !== role) return false;
    return !q || `${p.title} ${p.company} ${p.skills.map((s) => s[0]).join(" ")}`.toLowerCase().includes(q);
  }

  function render() {
    let rows = postings.filter(matches);
    const byFit = $("sort").value === "fit";
    if (byFit) {
      const score = (p) => { const f = fit(p); return f ? f.have / f.of : -1; };
      rows = rows.slice().sort((a, b) => score(b) - score(a));
    }
    const companies = new Set(rows.map((p) => p.company)).size;
    const exp = $("exp").value;
    let meta = rows.length
      ? `${count(rows.length, "posting")} من ${count(companies, "company")}.`
        + (exp && exp !== "0" ? " نعرض الإعلانات التي تذكر سنوات الخبرة فقط." : "")
      : $("saved").checked ? "لم تحفظ إعلانات بعد. اضغط ☆ احفظ على أي إعلان."
        : "لا توجد إعلانات تطابق هذا الاختيار. وسّع المكان أو الخبرة.";
    if (byFit && !mine()) meta += " لترتيبها حسب مهاراتك، أضف مهاراتك في صفحة سيرتك أولاً.";
    $("meta").textContent = meta;

    const box = $("groups");
    box.replaceChildren();
    let left = shown;
    // sorted by fit: one list; otherwise grouped by where the work is
    const groups = byFit ? [["all", "الأقرب لمهاراتك أولاً"]] : GROUPS;
    for (const [key, label] of groups) {
      const inGroup = key === "all" ? rows : rows.filter((p) => p.group === key);
      if (!inGroup.length || left <= 0) continue;
      const section = el("section", "posting-group");
      const head = el("h2", null, label);
      head.append(el("span", "group-count", count(inGroup.length, "posting")));
      const list = el("ul", "postings");
      inGroup.slice(0, left).forEach((p) => list.append(card(p, key === "all" ? p.group : key)));
      left -= inGroup.length;
      section.append(head, list);
      box.append(section);
    }
    const more = $("more");
    more.hidden = shown >= rows.length;
    more.textContent = `اعرض المزيد (بقي ${rows.length - shown})`;
  }

  function toAddress() {
    const q = new URLSearchParams();
    FILTERS.forEach((k) => { if ($(k).value.trim() && !(k === "sort" && $(k).value === "new")) q.set(k, $(k).value.trim()); });
    history.replaceState(null, "", q.toString() ? `?${q}` : location.pathname);
  }
  const given = new URLSearchParams(location.search);
  FILTERS.forEach((k) => { if (given.get(k)) $(k).value = given.get(k); });

  // Exclusive postings live in the worker's database, not in jobs.json; the
  // collected list still shows if the worker cannot be reached.
  const API = document.querySelector('meta[name="masar-api"]').content;
  const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const KIND = { coop: "coop", internship: "internship" };
  const exclusive = fetch(`${API}/board/postings`).then((r) => r.json()).then((d) => d.postings.map((p) => ({
    id: p.id, title: p.title, company: p.company, location: p.city, url: p.apply_url, level: p.level,
    posted_at: (p.created_at || "").slice(0, 10), role: "", countries: [p.country], regions: [], mode: p.workplace,
    skills: [...list(p.required).map((s) => [s, 1]), ...list(p.preferred).map((s) => [s, 0])],
    kind: KIND[p.employment] || "job", years: null, deadline: p.expires_at, exclusive: true, group: "exclusive",
  }))).catch(() => []);

  Promise.all([fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()), exclusive]).then(([d, ex]) => {
    postings = [...ex, ...d.postings
      .map((p) => ({ ...p, kind: p.employment || "job", group: place(p) === "unknown" ? "other" : place(p) }))
      .sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""))];
    const roles = [...new Set(postings.map((p) => p.role).filter((r) => ROLES[r]))];
    roles.forEach((r) => { const o = el("option", null, ROLES[r]); o.value = r; $("role").append(o); });
    if (given.get("role")) $("role").value = given.get("role");
    chips();
    render();
  }).catch(() => { $("meta").textContent = "تعذّر تحميل الإعلانات. حدّث الصفحة بعد قليل."; });

  // the chosen filters above the results, each with its own x, and one reset
  const DEFAULTS = { q: "", where: "", type: "", exp: "", level: "", role: "", sort: "new" };
  function chips() {
    const box = $("chips");
    box.replaceChildren();
    const on = FILTERS.filter((k) => $(k).value.trim() !== DEFAULTS[k]);
    const label = (k) => (k === "q" ? `"${$(k).value.trim()}"` : $(k).selectedOptions[0].textContent);
    on.forEach((k) => {
      const c = el("button", "chip", label(k));
      c.type = "button";
      c.setAttribute("aria-label", `احذف فلتر ${label(k)}`);
      c.append(el("span", "chip-x", "×"));
      c.onclick = () => { $(k).value = DEFAULTS[k]; changed(); };
      box.append(c);
    });
    if ($("saved").checked) {
      const c = el("button", "chip", "المحفوظة");
      c.type = "button";
      c.append(el("span", "chip-x", "×"));
      c.onclick = () => { $("saved").checked = false; changed(); };
      box.append(c);
    }
    const any = box.children.length > 0;
    if (any) {
      const all = el("button", "chip-clear", "امسح الكل");
      all.type = "button";
      all.onclick = reset;
      box.append(all);
    }
    $("reset").hidden = !any;
    $("open-filters").textContent = any ? `فلترة (${box.children.length - 1})` : "فلترة";
  }
  function reset() {
    FILTERS.forEach((k) => { $(k).value = DEFAULTS[k]; });
    $("saved").checked = false;
    changed();
  }
  function changed() { shown = PAGE; toAddress(); chips(); render(); }
  $("reset").addEventListener("click", reset);
  const sheet = (open) => {
    $("side").classList.toggle("open", open);
    $("open-filters").setAttribute("aria-expanded", open);
    document.body.classList.toggle("sheet-open", open);
  };
  $("open-filters").addEventListener("click", () => sheet(true));
  $("close-filters").addEventListener("click", () => sheet(false));
  chips();

  $("filters").addEventListener("input", changed);
  $("more").addEventListener("click", () => { shown += PAGE; render(); });
})();
