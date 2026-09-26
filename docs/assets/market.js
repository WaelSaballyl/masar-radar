// Market index: every chart is recomputed in the browser from data/jobs.json
// whenever a filter changes. Data-derived text is written with textContent.
(() => {
  "use strict";
  const { el, safeUrl, countryName, store } = Masar;

  const I18N = {
    ar: {
      brand: "مسار", nav_label: "الأقسام", nav_coop: "فرص التدريب", nav_jobs: "الإعلانات", nav_emp: "للشركات", nav_how: "كيف نبني المؤشر",
      nav_market: "مؤشر السوق", nav_cv: "سيرتك", theme_label: "تبديل المظهر",
      title: "مؤشر سوق وظائف البيانات",
      lede: "المهارات والأدوار والدول في الإعلانات المفتوحة الآن. اختر دولتك والدول التي تفضّلها لترى السوق الذي يخصّك.",
      filters_title: "الفلاتر", scope: "ما الذي أعرضه", scope_all: "كل الإعلانات", scope_mine: "دولتي والمفضّلة",
      home: "دولتي", prefs: "الدول المفضّلة", add_pref: "أضف دولة", add_pref_option: "+ أضف دولة",
      remove_pref: "أزل {name}", remote: "مع العمل عن بُعد من أي مكان",
      level: "المستوى", level_any: "كل المستويات", level_entry: "تدريب ومبتدئ", level_mid: "متوسط فأعلى",
      role: "الدور", role_any: "كل الأدوار", reset: "إعادة الضبط",
      meta: "النتيجة: {postings} من {companies}. آخر تحديث {date}.",
      meta_none: "لا توجد إعلانات تطابق اختيارك.",
      load_failed: "تعذّر تحميل البيانات. حدّث الصفحة بعد قليل.",
      skills_title: "المهارات الأكثر طلباً",
      skills_note: "نسبة الإعلانات التي تطلب كل مهارة. الرقم بجانب الشريط للمطلوبة فقط.",
      required: "مطلوبة", preferred: "مفضّلة",
      roles_title: "الأدوار", roles_note: "عدد الإعلانات لكل دور.",
      levels_title: "المستوى المطلوب", levels_note: "من التدريب إلى الإدارة، بالترتيب.",
      where_title: "أين الفرص",
      where_note: "الدول التي يمكن أن يكون فيها الموظَّف. الإعلان المفتوح لأكثر من دولة يُحسب لكل منها.",
      anywhere: "عن بُعد من أي مكان", unspecified: "غير محدد", other: "خارج الخليج", region: "الشرق الأوسط عموماً",
      tip_skill: "{name}: مطلوبة في {req} من {of} ({share})، ومفضّلة في {pref}.",
      tip_count: "{label}: {n} ({share}).",
      no_data: "لا بيانات لهذا الاختيار.",
      list_title: "الإعلانات",
      list_empty: "لا توجد إعلانات تطابق اختيارك. أضف دولة مفضّلة، أو فعّل العمل عن بُعد من أي مكان، أو اعرض كل الإعلانات.",
      more: "اعرض المزيد ({n} متبقية)", open_posting: "افتح الإعلان", requires: "تطلب:",
      footer_data: "البيانات من الواجهات العامة لـ", and: "و",
      footer_code: "مسار مشروع مفتوح المصدر:", footer_repo: "الشيفرة على GitHub", list_sep: "، ",
      roles: {
        "Data Analyst": "محلل بيانات", "Data Engineer": "مهندس بيانات", "Data Scientist": "عالم بيانات",
        "ML Engineer": "مهندس تعلّم آلي", "Analytics Engineer": "مهندس تحليلات",
        "BI Developer": "مطوّر ذكاء أعمال", "Business Analyst": "محلل أعمال", "Other (Data)": "أخرى",
      },
      levels: {
        Intern: "تدريب", Junior: "مبتدئ", Mid: "متوسط", Senior: "خبير",
        Lead: "قائد فريق", Manager: "مدير", Unknown: "غير مذكور",
      },
    },
    en: {
      brand: "Masar", nav_label: "Sections", nav_coop: "Internships", nav_jobs: "Postings", nav_emp: "Employers", nav_how: "How it works",
      nav_market: "Market index", nav_cv: "Your CV", theme_label: "Switch theme",
      title: "Data jobs market index",
      lede: "Skills, roles and countries in the postings open right now. Choose your country and the ones you prefer to see the market that is yours.",
      filters_title: "Filters", scope: "Show", scope_all: "All postings", scope_mine: "My countries",
      home: "My country", prefs: "Preferred countries", add_pref: "Add a country", add_pref_option: "+ Add a country",
      remove_pref: "Remove {name}", remote: "Include remote from anywhere",
      level: "Level", level_any: "All levels", level_entry: "Internship and junior", level_mid: "Mid and above",
      role: "Role", role_any: "All roles", reset: "Reset",
      meta: "Showing {postings} from {companies}. Updated {date}.",
      meta_none: "No postings match your selection.",
      load_failed: "The data could not be loaded. Refresh the page in a moment.",
      skills_title: "Most requested skills",
      skills_note: "Share of postings that ask for each skill. The number beside each bar counts required only.",
      required: "Required", preferred: "Preferred",
      roles_title: "Roles", roles_note: "Postings per role.",
      levels_title: "Level asked for", levels_note: "From internship to management, in order.",
      where_title: "Where the openings are",
      where_note: "Countries where the hire may be based. A posting open to several countries counts for each.",
      anywhere: "Remote from anywhere", unspecified: "Not stated", other: "Outside the Gulf", region: "Middle East, any country",
      tip_skill: "{name}: required in {req} of {of} ({share}), preferred in {pref}.",
      tip_count: "{label}: {n} ({share}).",
      no_data: "No data for this selection.",
      list_title: "Postings",
      list_empty: "No postings match your selection. Add a preferred country, include remote from anywhere, or show all postings.",
      more: "Show more ({n} left)", open_posting: "Open posting", requires: "Requires:",
      footer_data: "Data from the public APIs of", and: "and",
      footer_code: "Masar is open source:", footer_repo: "code on GitHub", list_sep: ", ",
      roles: {
        "Data Analyst": "Data analyst", "Data Engineer": "Data engineer", "Data Scientist": "Data scientist",
        "ML Engineer": "ML engineer", "Analytics Engineer": "Analytics engineer",
        "BI Developer": "BI developer", "Business Analyst": "Business analyst", "Other (Data)": "Other",
      },
      levels: {
        Intern: "Internship", Junior: "Junior", Mid: "Mid", Senior: "Senior",
        Lead: "Lead", Manager: "Manager", Unknown: "Not stated",
      },
    },
  };

  const L = Masar.i18n(I18N, {
    ar: "مؤشر سوق وظائف البيانات — مسار",
    en: "Data jobs market index — Masar",
  });
  const t = (key, vars) => L.t(key, vars);
  const count = (n, noun) => Masar.count(n, noun, L.lang);
  const pct = (share) => Masar.pct(share, L.lang);
  const dict = () => I18N[L.lang];

  const LEVELS = ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager", "Unknown"];
  const ENTRY = ["Intern", "Junior"];
  const MID_UP = ["Mid", "Senior", "Lead", "Manager"];
  // Masar serves Saudi Arabia first, then the rest of the Gulf; these are the
  // only countries a visitor can pick. Other Arab countries come later.
  const GULF = ["SA", "AE", "QA", "KW", "BH", "OM"];
  const inGulf = (c) => GULF.includes(c);

  const DEFAULTS = { scope: "mine", home: "SA", prefs: [], remote: true, level: "", role: "" };
  const PAGE = 30;

  let postings = [];
  let updatedAt = null;
  let failed = false;
  let shown = PAGE;
  let state = loadState();

  function loadState() {
    try {
      const s = { ...DEFAULTS, ...JSON.parse(store.get("masar.filters") || "{}") };
      if (!["all", "mine"].includes(s.scope)) s.scope = "mine";
      if (!inGulf(s.home)) s.home = "SA";
      s.prefs = (Array.isArray(s.prefs) ? s.prefs : []).filter((c) => inGulf(c) && c !== s.home);
      s.remote = s.remote !== false;
      if (!["", "entry", "mid"].includes(s.level)) s.level = "";
      if (typeof s.role !== "string") s.role = "";
      return s;
    } catch { return { ...DEFAULTS }; }
  }
  const saveState = () => store.set("masar.filters", JSON.stringify(state));

  // ---------- filtering ----------

  const isAnywhere = (p) => p.regions.includes("Worldwide")
    || (p.mode === "remote" && !p.countries.length && !p.regions.length);

  // "Remote, EMEA" names no country but does reach the Gulf. "Americas,
  // Europe, Israel" is tagged Middle East because of Israel alone, so a
  // posting that names Israel never counts as open to the Gulf.
  const gulfByRegion = (p) => !p.countries.length && p.regions.includes("Middle East")
    && !/israel/i.test(p.location);

  function inMyCountries(p) {
    const wanted = new Set([state.home, ...state.prefs]);
    return p.countries.some((c) => wanted.has(c)) || gulfByRegion(p);
  }

  function matches(p) {
    if (state.level === "entry" && !ENTRY.includes(p.level)) return false;
    if (state.level === "mid" && !MID_UP.includes(p.level)) return false;
    if (state.role && p.role !== state.role) return false;
    if (state.scope === "mine") return inMyCountries(p) || (state.remote && isAnywhere(p));
    return true;
  }

  // ---------- charts ----------

  const tip = document.getElementById("tip");
  function showTip(text, x, y) {
    tip.textContent = text;
    tip.classList.add("on");
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.min(Math.max(8, x - w / 2), innerWidth - w - 8)}px`;
    tip.style.top = `${Math.max(8, y - h - 14)}px`;
  }
  const hideTip = () => tip.classList.remove("on");

  // One row: label, bar segments scaled to max, a direct value label, and a
  // hover/focus tooltip. The whole row is the hit target, larger than the mark.
  function barRow(label, segs, max, valueText, tipText) {
    const li = el("li", "bar-row");
    li.tabIndex = 0;
    li.setAttribute("aria-label", tipText);
    const track = el("span", "bar-track");
    segs.forEach(([cls, v]) => {
      if (!v) return;
      const s = el("span", `seg ${cls}`);
      s.style.width = `${(v / max) * 100}%`;
      track.append(s);
    });
    li.append(el("span", "bar-label", label), track, el("span", "bar-value", valueText));
    li.addEventListener("pointermove", (e) => showTip(tipText, e.clientX, e.clientY));
    li.addEventListener("pointerleave", hideTip);
    li.addEventListener("focus", () => { const r = li.getBoundingClientRect(); showTip(tipText, r.left + r.width / 2, r.top); });
    li.addEventListener("blur", hideTip);
    return li;
  }

  function fill(listId, rows) {
    const list = document.getElementById(listId);
    list.replaceChildren(...(rows.length ? rows : [el("li", "no-data", t("no_data"))]));
  }

  function countChart(listId, entries, n, labelOf) {
    const max = Math.max(1, ...entries.map(([, v]) => v));
    fill(listId, entries.map(([key, v]) => {
      const label = labelOf(key);
      return barRow(label, [["req", v]], max, String(v),
                    t("tip_count", { label, n: count(v, "posting"), share: pct(v / n) }));
    }));
  }

  function renderCharts(rows) {
    const n = rows.length;
    const req = new Map(), pref = new Map();
    rows.forEach((p) => p.skills.forEach(([s, r]) => { const m = r ? req : pref; m.set(s, (m.get(s) || 0) + 1); }));
    const skills = [...new Set([...req.keys(), ...pref.keys()])]
      .map((s) => [s, req.get(s) || 0, pref.get(s) || 0])
      .sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0]))
      .slice(0, 12);
    const max = Math.max(1, ...skills.map(([, r, p]) => r + p));
    fill("chart-skills", n ? skills.map(([s, r, p]) => barRow(
      s, [["req", r], ["pref", p]], max, pct(r / n),
      t("tip_skill", { name: s, req: r, pref: p, of: count(n, "posting"), share: pct(r / n) }))) : []);

    const roles = new Map();
    rows.forEach((p) => roles.set(p.role || "Other (Data)", (roles.get(p.role || "Other (Data)") || 0) + 1));
    countChart("chart-roles", [...roles].sort((a, b) => b[1] - a[1]), n, (r) => dict().roles[r] || r);

    // ordinal: fixed order, never sorted by size
    const levels = new Map(LEVELS.map((l) => [l, 0]));
    rows.forEach((p) => { const l = LEVELS.includes(p.level) ? p.level : "Unknown"; levels.set(l, levels.get(l) + 1); });
    countChart("chart-levels", n ? [...levels].filter(([l, v]) => v || l !== "Unknown") : [], n,
               (l) => dict().levels[l]);

    const where = new Map();
    const bump = (k) => where.set(k, (where.get(k) || 0) + 1);
    rows.forEach((p) => {
      // countries outside the Gulf are not named; each posting counts once there
      if (p.countries.some(inGulf)) p.countries.filter(inGulf).forEach(bump);
      else if (isAnywhere(p)) bump("_any");
      else if (gulfByRegion(p)) bump("_region");
      else if (p.countries.length || p.regions.length) bump("_other");
      else bump("_unknown");
    });
    const whereName = { _any: "anywhere", _unknown: "unspecified", _other: "other", _region: "region" };
    countChart("chart-where", [...where].sort((a, b) => b[1] - a[1]), n,
               (k) => (whereName[k] ? t(whereName[k]) : countryName(k, L.lang)));
  }

  // ---------- postings ----------

  function whereText(p) {
    const gulf = p.countries.filter(inGulf);
    if (gulf.length) return gulf.map((c) => countryName(c, L.lang)).join(t("list_sep"));
    if (isAnywhere(p)) return t("anywhere");
    if (gulfByRegion(p)) return t("region");
    if (p.countries.length || p.regions.length) return t("other");
    return p.location || "—";
  }

  function renderList(rows) {
    const list = document.getElementById("jobs");
    const more = document.getElementById("more");
    list.replaceChildren();
    if (!rows.length) { list.append(el("li", "empty", t("list_empty"))); more.hidden = true; return; }
    rows.slice(0, shown).forEach((p) => {
      const li = el("li", "job");
      const who = el("div");
      who.append(el("span", "job-title", p.title), el("span", "job-company", p.company));
      const needed = p.skills.filter(([, r]) => r).map(([s]) => s).slice(0, 6);
      if (needed.length) who.append(el("span", "req-skills", `${t("requires")} ${needed.join(t("list_sep"))}`));
      const lvl = LEVELS.includes(p.level) ? p.level : "Unknown";
      const cls = lvl === "Intern" ? "level-intern" : lvl === "Junior" ? "level-junior" : "level-other";
      li.append(who, el("span", "job-where", whereText(p)), el("span", `level ${cls}`, dict().levels[lvl]));
      const href = safeUrl(p.url);
      if (href) {
        const a = el("a", null, t("open_posting"));
        a.href = href; a.rel = "noopener"; a.target = "_blank";
        li.append(a);
      } else li.append(el("span"));
      list.append(li);
    });
    const left = rows.length - shown;
    more.hidden = left <= 0;
    if (left > 0) more.textContent = t("more", { n: left });
  }

  // ---------- controls ----------

  const countriesOffered = () => [...GULF];

  function option(value, text, selected) {
    const o = el("option", null, text);
    o.value = value;
    if (selected) o.selected = true;
    return o;
  }

  function renderControls() {
    const offered = countriesOffered();
    if (!offered.includes(state.home)) offered.unshift(state.home);
    document.getElementById("home").replaceChildren(
      ...offered.map((c) => option(c, countryName(c, L.lang), c === state.home)));

    const add = document.getElementById("add-pref");
    add.replaceChildren(option("", t("add_pref_option"), true),
      ...offered.filter((c) => c !== state.home && !state.prefs.includes(c))
        .map((c) => option(c, countryName(c, L.lang))));

    const chips = document.getElementById("pref-chips");
    chips.querySelectorAll(".chip").forEach((c) => c.remove());
    state.prefs.forEach((c) => {
      const name = countryName(c, L.lang);
      const chip = el("button", "chip");
      chip.type = "button";
      chip.setAttribute("aria-label", t("remove_pref", { name }));
      chip.append(el("span", null, name), el("span", "x", "✕"));
      chip.querySelector(".x").setAttribute("aria-hidden", "true");
      chip.addEventListener("click", () => { state.prefs = state.prefs.filter((x) => x !== c); update(); });
      chips.insertBefore(chip, add);
    });

    document.querySelectorAll('input[name="scope"]').forEach((r) => { r.checked = r.value === state.scope; });
    const remote = document.getElementById("remote");
    remote.checked = state.remote;
    remote.disabled = state.scope !== "mine";
    remote.closest(".check").style.opacity = remote.disabled ? 0.55 : 1;
    document.getElementById("level").value = state.level;

    const roleSelect = document.getElementById("role");
    const roles = [...new Set(postings.map((p) => p.role).filter(Boolean))].sort();
    if (state.role && !roles.includes(state.role)) state.role = "";
    roleSelect.replaceChildren(option("", t("role_any"), !state.role),
      ...roles.map((r) => option(r, dict().roles[r] || r, r === state.role)));
  }

  function renderMeta(rows) {
    const meta = document.getElementById("match-meta");
    if (failed) { meta.textContent = t("load_failed"); return; }
    if (!updatedAt) { meta.textContent = ""; return; }
    if (!rows.length) { meta.textContent = t("meta_none"); return; }
    meta.textContent = t("meta", {
      postings: count(rows.length, "posting"),
      companies: count(new Set(rows.map((p) => p.company)).size, "company"),
      date: Masar.date(updatedAt, L.lang),
    });
  }

  function render() {
    L.apply();
    renderControls();
    const rows = postings.filter(matches);
    renderMeta(rows);
    renderCharts(rows);
    renderList(rows);
  }

  function update() { shown = PAGE; saveState(); render(); }

  document.getElementById("filters").addEventListener("change", (e) => {
    const f = e.target;
    if (f.name === "scope") state.scope = f.value;
    else if (f.id === "home") { state.home = f.value; state.prefs = state.prefs.filter((c) => c !== f.value); }
    else if (f.id === "add-pref" && f.value) state.prefs = [...state.prefs, f.value];
    else if (f.id === "remote") state.remote = f.checked;
    else if (f.id === "level") state.level = f.value;
    else if (f.id === "role") state.role = f.value;
    else return;
    update();
  });
  document.getElementById("reset").addEventListener("click", () => { state = { ...DEFAULTS, prefs: [] }; update(); });
  document.getElementById("more").addEventListener("click", () => { shown += PAGE; render(); });
  document.getElementById("lang-toggle").addEventListener("click", () => { L.toggle(); render(); });
  addEventListener("scroll", hideTip, { passive: true });
  Masar.initTheme();

  render();
  fetch("data/jobs.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((d) => { postings = d.postings || []; updatedAt = d.updated_at; render(); })
    .catch(() => { failed = true; render(); });
})();
