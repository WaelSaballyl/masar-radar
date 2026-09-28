// Shared by every Masar page: storage, language, theme, and the formatting
// rules that are easy to get wrong in Arabic. Loaded before the page script.
window.Masar = (() => {
  "use strict";
  const html = document.documentElement;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } changed(k); },
  };

  // Arabic counted nouns take a different form for 1, 2, 3-10, 11-99 and the
  // hundreds. A wrong form is the first thing a native reader notices.
  const AR_NOUNS = {
    posting: ["إعلان واحد", "إعلانان", "إعلانات", "إعلاناً", "إعلان"],
    company: ["شركة واحدة", "شركتان", "شركات", "شركة", "شركة"],
    applicant: ["متقدم واحد", "متقدمان", "متقدمين", "متقدماً", "متقدم"],
    application: ["طلب واحد", "طلبان", "طلبات", "طلباً", "طلب"],
  };
  const EN_NOUNS = { posting: ["posting", "postings"], company: ["company", "companies"] };

  function count(n, noun, lang) {
    if (lang === "en") return `${n} ${EN_NOUNS[noun][n === 1 ? 0 : 1]}`;
    const f = AR_NOUNS[noun];
    const r = n % 100;
    if (n === 1) return f[0];
    if (n === 2) return f[1];
    if (r >= 3 && r <= 10) return `${n} ${f[2]}`;
    if (r >= 11 && r <= 99) return `${n} ${f[3]}`;
    return `${n} ${f[4]}`;
  }

  const pct = (share, lang) => `${Math.round(share * 100)}${lang === "ar" ? "٪" : "%"}`;

  function date(iso, lang) {
    // ar-SA defaults to the Umm al-Qura calendar; the data is Gregorian.
    const locale = lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(iso));
    } catch { return String(iso).slice(0, 10); }
  }

  function countryName(code, lang) {
    try { return new Intl.DisplayNames([lang], { type: "region" }).of(code) || code; }
    catch { return code; }
  }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  function safeUrl(u) {
    try { const url = new URL(u); return /^https?:$/.test(url.protocol) ? url.href : null; }
    catch { return null; }
  }

  // dict: { ar: {...}, en: {...} }; titles: { ar, en }
  function i18n(dict, titles) {
    let lang = store.get("masar.lang") === "en" ? "en" : "ar";
    return {
      get lang() { return lang; },
      t(key, vars = {}) {
        return (dict[lang][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
      },
      apply() {
        html.lang = lang;
        html.dir = lang === "ar" ? "rtl" : "ltr";
        document.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = this.t(n.dataset.i18n); });
        document.querySelectorAll("[data-i18n-aria]").forEach((n) => { n.setAttribute("aria-label", this.t(n.dataset.i18nAria)); });
        document.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = this.t(n.dataset.i18nPh); });
        const toggle = document.getElementById("lang-toggle");
        if (toggle) {
          toggle.textContent = lang === "ar" ? "EN" : "ع";
          toggle.lang = lang === "ar" ? "en" : "ar";
          toggle.setAttribute("aria-label", lang === "ar" ? "English" : "العربية");
        }
        document.title = titles[lang];
      },
      toggle() { lang = lang === "ar" ? "en" : "ar"; store.set("masar.lang", lang); },
    };
  }

  function initTheme() {
    const saved = store.get("masar.theme");
    if (saved === "light" || saved === "dark") html.dataset.theme = saved;
    const button = document.getElementById("theme-toggle");
    if (!button) return;
    button.addEventListener("click", () => {
      const current = html.dataset.theme
        || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      const next = current === "light" ? "dark" : "light";
      html.dataset.theme = next;
      store.set("masar.theme", next);
    });
  }

  // Where a posting can be done from, for a visitor in the Gulf:
  // "gulf" names a Gulf country; "anywhere" is remote worldwide; "region" names
  // the Middle East but no country ("Remote, EMEA"); "other" is elsewhere.
  // "Americas, Europe, Israel" is tagged Middle East for Israel alone, so a
  // posting that names Israel never counts as open to the Gulf.
  const GULF = ["SA", "AE", "QA", "KW", "BH", "OM"];
  function place(p) {
    if (p.countries.some((c) => GULF.includes(c))) return "gulf";
    if (p.regions.includes("Worldwide") || (p.mode === "remote" && !p.countries.length && !p.regions.length)) return "anywhere";
    if (!p.countries.length && p.regions.includes("Middle East") && !/israel/i.test(p.location)) return "region";
    return p.countries.length || p.regions.length ? "other" : "unknown";
  }

  // "اليوم", "أمس", "قبل يومين", "قبل 3 أيام", "قبل 11 يوماً"; a date after a month
  function ago(iso, lang) {
    if (!iso) return "";
    const days = Math.round((Date.now() - new Date(`${iso}T12:00:00`)) / 86_400_000);
    if (days > 30 || days < 0) return date(iso, lang);
    if (lang === "en") return days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
    if (days === 0) return "اليوم";
    if (days === 1) return "أمس";
    if (days === 2) return "قبل يومين";
    return days <= 10 ? `قبل ${days} أيام` : `قبل ${days} يوماً`;
  }

  const LEVELS = { Intern: "تدريب", Junior: "مبتدئ", Mid: "متوسط", Senior: "خبرة عالية", Lead: "قيادي", Manager: "مدير" };
  const MODES = { remote: "عن بُعد", hybrid: "هجين", onsite: "من المقر" };
  const KINDS = { coop: "تدريب تعاوني", internship: "تدريب", student: "دوام طلابي", graduate: "برنامج خريجين", job: "وظيفة" };
  const ROLES = {
    "Data Analyst": "محلل بيانات", "Data Engineer": "مهندس بيانات", "Data Scientist": "عالم بيانات",
    "ML Engineer": "مهندس تعلّم آلة", "BI Developer": "مطوّر ذكاء أعمال", "Business Analyst": "محلل أعمال",
    "Analytics Engineer": "مهندس تحليلات",
    "Software & IT": "برمجة وتقنية", "Accounting & Finance": "محاسبة ومالية", "Engineering": "هندسة",
    "Marketing": "تسويق", "Human Resources": "موارد بشرية",
  };
  // the fields the radar collects (radar/skills.py FIELDS), in the same order
  const FIELDS = { data: "البيانات", tech: "البرمجة والتقنية", finance: "المحاسبة والمالية",
                   engineering: "الهندسة", marketing: "التسويق", hr: "الموارد البشرية" };
  const FIELDS_EN = { data: "Data", tech: "Software & IT", finance: "Accounting & Finance",
                      engineering: "Engineering", marketing: "Marketing", hr: "HR" };

  // skills the student listed in the CV builder (kept in this browser only)
  let profileText = null;
  const mine = () => {
    if (profileText === null) {
      try {
        const p = JSON.parse(store.get("masar.profile") || "{}");
        profileText = [p.skills, p.experience, p.projects, p.certificates].filter(Boolean).join("\n");
      } catch { profileText = ""; }
    }
    return profileText;
  };
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // a skill must stand alone ("R" is not the r in "Riyadh"); only a single
  // letter is matched case-sensitively
  const has = (skill) => new RegExp(`(^|[^\\p{L}\\p{N}+#])${esc(skill).replace(/\s+/g, "\\s*")}(?![\\p{L}\\p{N}+#])`,
    skill.length === 1 ? "u" : "iu").test(mine());
  function fit(p) {
    const req = p.skills.filter((s) => s[1]).map((s) => s[0]);
    if (!mine() || !req.length) return null;
    return { have: req.filter(has).length, of: req.length };
  }
  // The company logo when the feed sent one, else the company's first letter;
  // a logo that fails to load falls back to the letter too.
  function logo(p, cls) {
    const box = el("span", cls);
    box.setAttribute("aria-hidden", "true");
    const letter = () => { box.replaceChildren((p.company || "?").trim().charAt(0).toUpperCase()); box.classList.remove("has-img"); };
    if (!/^https:\/\//.test(p.logo || "")) { letter(); return box; }
    const img = document.createElement("img");
    img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.decoding = "async";
    img.onerror = letter;
    img.src = p.logo;
    box.classList.add("has-img");
    box.append(img);
    return box;
  }
  // a place to learn a skill: a course search, never a paid placement
  const learnUrl = (skill) => `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`;
  // an employer whose contact email is on its own site's domain
  const verifiedBadge = () => {
    const b = el("span", "badge-verified", "✓ موثّقة");
    b.title = "إيميل الشركة من نفس دومين موقعها";
    return b;
  };
  // an exclusive posting's logo: the icon of the company's own site
  const siteIcon = (website) => {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(website).hostname}&sz=128`; } catch { return ""; }
  };
  const yearsText = (n) => (n === 0 ? "بدون خبرة" : n === 1 ? "خبرة سنة" : n === 2 ? "خبرة سنتين" : `خبرة ${n}+ سنوات`);

  // Installable as an app: the service worker on the live site only (a local
  // preview would otherwise serve cached files), and an install button where
  // the browser offers one (Android Chrome; iPhone uses Share > Add to Home).
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    if (store.get("masar.install") === "no") return;
    e.preventDefault();
    const bar = el("div", "install-bar");
    const yes = el("button", "btn btn-primary btn-small", "ثبّت مسار على جوالك");
    const no = el("button", "icon-btn", "لاحقاً");
    yes.type = no.type = "button";
    yes.onclick = () => { e.prompt(); bar.remove(); };
    no.onclick = () => { store.set("masar.install", "no"); bar.remove(); };
    bar.append(yes, no);
    document.body.append(bar);
  }, { once: true });

  // ---------- accounts: optional; a signed-in browser keeps its data in sync ----------
  // Google proves who the student is (account.html); the worker returns a
  // session token kept here. The keys below then go to the worker on every
  // change and come back on every other device. Without an account nothing
  // leaves the browser, as before.
  const API = document.querySelector('meta[name="masar-api"]')?.content || "https://masar-cv.masar-cv.workers.dev";
  const SYNC = ["masar.profile", "masar.me", "masar.cvs", "masar.receipts", "masar.saved", "masar.applied", "masar.skipped", "masar.tickets"];
  const readJson = (k, d) => { try { return JSON.parse(store.get(k) || d); } catch { return JSON.parse(d); } };
  const account = {
    api: API,
    get token() { return store.get("masar.session") || ""; },
    get user() { return readJson("masar.user", "null"); },
    async call(path, body) {
      const r = await fetch(API + path, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${this.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const out = await r.json().catch(() => ({}));
      if (r.status === 401) { this.forget(); throw Object.assign(new Error("session"), { status: 401 }); }
      return { status: r.status, ...out };
    },
    signedIn(token, user) {
      localStorage.setItem("masar.session", token);
      localStorage.setItem("masar.user", JSON.stringify(user));
      localStorage.setItem("masar.syncRev", "0");
      localStorage.setItem("masar.syncDirty", "1"); // this device's data joins the account's
      return sync();
    },
    forget() { ["masar.session", "masar.user", "masar.syncRev", "masar.syncDirty"].forEach((k) => localStorage.removeItem(k)); },
    sync: () => sync(),
  };

  let pushTimer = null;
  function changed(k) {
    if (!SYNC.includes(k) || !account.token) return;
    try { localStorage.setItem("masar.syncDirty", "1"); } catch { /* private mode */ }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => sync().catch(() => {}), 1500);
  }
  const local = () => Object.fromEntries(SYNC.map((k) => [k, store.get(k)]).filter(([, v]) => v != null));

  // Two copies of the same key: lists are joined (an application saved on the
  // phone and one on the laptop both stay), the profile on this device wins
  // unless it is empty.
  function merge(mine, theirs) {
    const out = { ...theirs };
    for (const [k, v] of Object.entries(mine)) {
      if (!(k in theirs)) { out[k] = v; continue; }
      let a, b;
      try { a = JSON.parse(v); b = JSON.parse(theirs[k]); } catch { out[k] = v; continue; }
      if (Array.isArray(a) && Array.isArray(b)) {
        const seen = new Set();
        out[k] = JSON.stringify([...a, ...b].filter((x) => { const s = JSON.stringify(x); return !seen.has(s) && seen.add(s); }));
      } else if (a && typeof a === "object" && Object.values(a).some((x) => x)) out[k] = v;
    }
    return out;
  }

  // Brings the account's copy here, and this device's changes there.
  let syncing = null;
  function sync() {
    if (!account.token) return Promise.resolve();
    if (syncing) return syncing;
    syncing = (async () => {
      const server = await account.call("/auth/data");
      let rev = server.rev || 0, data = server.data || {};
      const dirty = localStorage.getItem("masar.syncDirty") === "1";
      const before = JSON.stringify(local());
      const seen = Number(localStorage.getItem("masar.syncRev") || 0);
      // nothing new on either side
      if (!dirty && rev <= seen) return;
      // only this device changed: its copy is sent as it is, so something
      // cleared here (the profile, a saved posting) stays cleared
      if (dirty && rev === seen && seen > 0) data = local();
      else if (dirty) data = merge(local(), data);
      // what arrives is written straight to storage, not through store.set,
      // so it does not count as a new change to send back
      for (const k of SYNC) {
        if (k in data) localStorage.setItem(k, data[k]);
      }
      if (dirty) {
        for (let tries = 0; tries < 3; tries += 1) {
          const out = await account.call("/auth/data", { data: local(), base: rev });
          if (out.status === 200) { rev = out.rev; break; }
          if (out.status !== 409) throw new Error("sync");
          rev = out.rev;
          const merged = merge(local(), out.data || {});
          for (const k of SYNC) if (k in merged) localStorage.setItem(k, merged[k]);
        }
        localStorage.setItem("masar.syncDirty", "0");
      }
      localStorage.setItem("masar.syncRev", String(rev));
      if (JSON.stringify(local()) !== before) arrived();
    })().finally(() => { syncing = null; });
    return syncing;
  }
  // data from another device reached this page after it was drawn
  function arrived() {
    if (document.querySelector(".synced-bar")) return;
    const bar = el("div", "synced-bar");
    const go = el("button", "btn btn-primary btn-small", "حدّث الصفحة");
    go.type = "button";
    go.onclick = () => location.reload();
    bar.append(el("span", null, "وصلت بياناتك من جهازك الآخر."), go);
    document.body.append(bar);
  }
  if (account.token) sync().catch(() => {});

  // One menu for every page, so no page forgets a section. The home page
  // calls nav(lang) again when its language changes.
  const NAV = [
    ["jobs.html", "الإعلانات", "Postings"],
    ["swipe.html", "قدّم بالسحب", "Swipe to apply"],
    ["cv.html", "سيرتك", "Your CV"],
    ["applications.html", "طلباتي", "My applications"],
    ["dashboard.html", "مؤشر السوق", "Market index"],
    ["employers.html", "للشركات", "Employers"],
  ];
  const here = location.pathname.split("/").pop() || "index.html";
  function nav(lang = "ar") {
    const box = document.querySelector(".topbar .nav");
    if (!box) return;
    box.replaceChildren(...NAV.map(([href, ar, en]) => {
      const a = el("a", null, lang === "en" ? en : ar);
      a.href = href;
      if (href === here) a.setAttribute("aria-current", "page");
      return a;
    }));
  }
  nav();

  // the account button: "دخول" when signed out, the student's initial when in
  function accountButton(lang = store.get("masar.lang") === "en" && document.getElementById("lang-toggle") ? "en" : "ar") {
    const tools = document.querySelector(".topbar .tools");
    if (!tools) return;
    let a = tools.querySelector(".account-btn");
    if (!a) { a = el("a", "tool account-btn"); a.href = "account.html"; tools.prepend(a); }
    const u = account.user;
    a.classList.toggle("in", !!u);
    const en = lang === "en";
    a.textContent = u ? (u.name || u.email || "?").trim().charAt(0).toUpperCase() : en ? "Sign in" : "دخول";
    a.setAttribute("aria-label", u ? `${en ? "Your account" : "حسابك"}: ${u.name || u.email}` : en ? "Sign in" : "تسجيل الدخول");
    if (here === "account.html") a.setAttribute("aria-current", "page");
  }
  accountButton();

  // Phones get the main sections as a bar under the thumb, like an app. Not on
  // the swipe feed (it fills the screen), the employer and admin pages, or a
  // posting shown inside the board.
  const ICON = {
    home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
    jobs: "M4 7h16v12H4zM9 7V5h6v2M4 12h16",
    swipe: "M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM10 12l2 2 3-4",
    cv: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
    apps: "M5 5h14M5 12h14M5 19h9M17 17l2 2 3-4",
  };
  const TABS = [["./", "home", "الرئيسية", "Home"], ["jobs.html", "jobs", "الإعلانات", "Postings"], ["swipe.html", "swipe", "سحب", "Swipe"],
                ["cv.html", "cv", "سيرتك", "CV"], ["applications.html", "apps", "طلباتي", "Applied"]];
  const english = () => store.get("masar.lang") === "en" && !!document.getElementById("lang-toggle");
  const noTabs = ["swipe.html", "admin.html", "applicants.html"].includes(here) || /[?&]embed=/.test(location.search);
  if (!noTabs && document.querySelector(".topbar")) {
    const bar = el("nav", "tabbar");
    bar.setAttribute("aria-label", "التنقل السريع");
    TABS.forEach(([href, icon, ar, en]) => {
      const label = english() ? en : ar;
      const a = el("a");
      a.href = href;
      if (href === here || (href === "./" && here === "index.html")) a.setAttribute("aria-current", "page");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", ICON[icon]);
      svg.append(path);
      a.append(svg, el("span", null, label));
      bar.append(a);
    });
    document.body.append(bar);
    html.classList.add("has-tabbar");
  }

  // The name across the whole width at the bottom of every page, in the
  // wordmark's letters (Montserrat); each letter rises in when it is reached.
  if (!noTabs && document.querySelector(".topbar")) {
    const font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Montserrat:wght@800&display=swap";
    document.head.append(font);
    const mark = el("div", "foot-mark reveal");
    mark.setAttribute("aria-hidden", "true");
    [..."MASAR"].forEach((c, i) => { const s = el("span", null, c); s.style.setProperty("--i", i); mark.append(s); });
    const radar = el("div", "foot-radar", "• RADAR •");
    radar.setAttribute("aria-hidden", "true");
    const legal = el("p", "foot-legal");
    const link = (href, text) => { const a = el("a", null, text); a.href = href; return a; };
    legal.append(el("span", null, `© ${new Date().getFullYear()} مسار`), link("privacy.html", "الخصوصية"),
      link("guide.html", "دليل التدريب التعاوني"), link("employers.html", "للشركات"), link("support.html", "الدعم الفني"),
      link("terms.html", "الشروط"));
    const box = el("div", "foot-brand");
    box.append(mark, radar, legal);
    document.body.append(box);
  }

  // One count per page view for the admin page's visitor numbers: the page's
  // name, the referring site, whether this is the browser's first view today,
  // and phone or not. No cookie, no id, and the worker stores no IP.
  if (location.protocol === "https:" && !/[?&]embed=/.test(location.search) && navigator.sendBeacon) {
    const today = new Date().toISOString().slice(0, 10);
    let first = false;
    try { first = localStorage.getItem("masar.seen") !== today; localStorage.setItem("masar.seen", today); } catch { /* private mode */ }
    let ref = "";
    try { const r = new URL(document.referrer); if (r.host !== location.host) ref = r.hostname.replace(/^www\./, ""); } catch { /* none */ }
    navigator.sendBeacon(`${API}/hit`, JSON.stringify({
      p: here.replace(/\.html$/, "") || "index", r: ref, v: first, m: matchMedia("(max-width: 720px)").matches,
    }));
  }

  // Sections marked .reveal rise into place the first time they are seen.
  // Without script, or with reduced motion, they are simply there.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    html.classList.add("motion");
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((n) => io.observe(n));
  }

  return { store, count, pct, date, ago, place, GULF, countryName, el, safeUrl, i18n, initTheme, nav, account, accountButton,
           LEVELS, MODES, KINDS, ROLES, FIELDS, FIELDS_EN, mine, has, fit, yearsText, logo, siteIcon, verifiedBadge, learnUrl };
})();
