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
  // an exclusive posting's logo: the icon of the company's own site
  const siteIcon = (website) => {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(website).hostname}&sz=128`; } catch { return ""; }
  };
  const yearsText = (n) => (n === 0 ? "بدون خبرة" : n === 1 ? "خبرة سنة" : n === 2 ? "خبرة سنتين" : `خبرة ${n}+ سنوات`);

  return { store, count, pct, date, ago, place, GULF, countryName, el, safeUrl, i18n, initTheme,
           LEVELS, MODES, KINDS, ROLES, mine, has, fit, yearsText, logo, siteIcon };
})();
