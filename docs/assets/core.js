// Shared by every Masar page: storage, language, theme, and the formatting
// rules that are easy to get wrong in Arabic. Loaded before the page script.
window.Masar = (() => {
  "use strict";
  const html = document.documentElement;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
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
  };

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
  const TABS = [["./", "home", "الرئيسية"], ["jobs.html", "jobs", "الإعلانات"], ["swipe.html", "swipe", "سحب"],
                ["cv.html", "cv", "سيرتك"], ["applications.html", "apps", "طلباتي"]];
  const noTabs = ["swipe.html", "admin.html", "applicants.html"].includes(here) || /[?&]embed=/.test(location.search);
  if (!noTabs && document.querySelector(".topbar")) {
    const bar = el("nav", "tabbar");
    bar.setAttribute("aria-label", "التنقل السريع");
    TABS.forEach(([href, icon, label]) => {
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

  // Sections marked .reveal rise into place the first time they are seen.
  // Without script, or with reduced motion, they are simply there.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    html.classList.add("motion");
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((n) => io.observe(n));
  }

  return { store, count, pct, date, ago, place, GULF, countryName, el, safeUrl, i18n, initTheme, nav,
           LEVELS, MODES, KINDS, ROLES, mine, has, fit, yearsText, logo, siteIcon, verifiedBadge, learnUrl };
})();
