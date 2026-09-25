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

  return { store, count, pct, date, countryName, el, safeUrl, i18n, initTheme };
})();
