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
  // an employer that opens CVs quickly (reply_days from /board/postings)
  const replyBadge = (days) => {
    if (days == null || days > 7) return null;
    const b = el("span", "badge-fast", days <= 1 ? "تفتح السير خلال يوم" : days <= 3 ? "تفتح السير خلال أيام" : "تفتح السير خلال أسبوع");
    b.title = "متوسط الوقت حتى تفتح الشركة سير المتقدمين، من طلبات حقيقية";
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
  const SYNC = ["masar.profile", "masar.me", "masar.cvs", "masar.receipts", "masar.saved", "masar.applied", "masar.skipped", "masar.tickets", "masar.alerts"];
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

  // Job alerts: saved searches (masar.alerts, synced) and, per alert, the
  // postings already shown (masar.alertSeen, this browser only). A posting is
  // new for an alert when it matches and was not there the last time. Email
  // alerts wait for the domain; until then the site shows them on a visit.
  const ALERTS = "masar.alerts", SEEN = "masar.alertSeen";
  const readJSON = (k, empty) => { try { return JSON.parse(store.get(k) || empty) || JSON.parse(empty); } catch { return JSON.parse(empty); } };
  const TRAINING_KINDS = ["coop", "internship", "student"];
  const alerts = {
    list: () => readJSON(ALERTS, "[]").filter((a) => a && a.id),
    add(f) {
      const clean = Object.fromEntries(["q", "where", "type", "role", "field", "company"].filter((k) => f[k]).map((k) => [k, String(f[k]).trim()]));
      if (!Object.keys(clean).length) return null;
      const same = alerts.list().find((a) => JSON.stringify(a.f) === JSON.stringify(clean));
      if (same) return same;
      const a = { id: Math.random().toString(36).slice(2, 10), f: clean };
      store.set(ALERTS, JSON.stringify([...alerts.list(), a].slice(-20)));
      return a;
    },
    remove(id) {
      store.set(ALERTS, JSON.stringify(alerts.list().filter((a) => a.id !== id)));
      const seen = readJSON(SEEN, "{}"); delete seen[id]; store.set(SEEN, JSON.stringify(seen));
    },
    matches(p, f) {
      const kind = p.kind || p.employment || "job";
      if (f.company && p.company.trim().toLowerCase() !== f.company.toLowerCase()) return false;
      if (f.where === "gulf" && place(p) !== "gulf" && !p.exclusive) return false;
      if (/^[A-Z]{2}$/.test(f.where || "") && !p.countries.includes(f.where)) return false;
      if (f.type === "training" && !TRAINING_KINDS.includes(kind)) return false;
      if (f.type && f.type !== "training" && kind !== f.type) return false;
      if (f.role && p.role !== f.role) return false;
      if (f.field && (p.field || "data") !== f.field) return false;
      const q = (f.q || "").toLowerCase();
      return !q || `${p.title} ${p.company} ${p.skills.map((s) => s[0]).join(" ")}`.toLowerCase().includes(q);
    },
    // [{ alert, all, fresh }] for postings as the pages build them; a new alert sees nothing as new
    check(postings) {
      const seen = readJSON(SEEN, "{}");
      let changed = false;
      const out = alerts.list().map((a) => {
        const all = postings.filter((p) => alerts.matches(p, a.f));
        if (!seen[a.id]) { seen[a.id] = all.map((p) => p.id).slice(0, 400); changed = true; }
        const old = new Set(seen[a.id]);
        return { alert: a, all, fresh: all.filter((p) => !old.has(p.id)) };
      });
      if (changed) store.set(SEEN, JSON.stringify(seen));
      return out;
    },
    markSeen(id, postings) {
      const seen = readJSON(SEEN, "{}");
      seen[id] = postings.map((p) => p.id).slice(0, 400);
      store.set(SEEN, JSON.stringify(seen));
    },
    label(f) {
      const parts = [];
      if (f.q) parts.push(`«${f.q}»`);
      if (f.company) parts.push(`إعلانات ${f.company}`);
      if (f.role) parts.push(ROLES[f.role] || f.role);
      if (f.field) parts.push(`مجال ${FIELDS[f.field] || f.field}`);
      if (f.type) parts.push({ training: "تدريب بأنواعه", coop: "تدريب تعاوني", internship: "تدريب", student: "دوام طلابي", job: "وظيفة" }[f.type] || f.type);
      if (f.where) parts.push(f.where === "gulf" ? "السعودية والخليج" : /^[A-Z]{2}$/.test(f.where) ? countryName(f.where, "ar") : f.where);
      return parts.join("، ");
    },
  };

  // One menu for every page, so no page forgets a section. The home page
  // calls nav(lang) again when its language changes. The student's own pages
  // (applications, alerts, saved) live in the account menu, not here; the
  // employer pages get their own menu, like a separate site for companies.
  const NAV = [
    ["jobs.html", "الإعلانات", "Postings"],
    ["swipe.html", "قدّم بالسحب", "Swipe to apply"],
    ["cv.html", "سيرتك", "Your CV"],
    ["ats.html", "فحص ATS", "ATS check"],
    ["companies.html", "الشركات", "Companies"],
    ["dashboard.html", "مؤشر السوق", "Market index"],
    ["premium.html", "المميّز ✦", "Premium ✦"],
  ];
  const EMPLOYER_NAV = [
    ["employers.html", "الرئيسية", "Home"],
    ["employers.html#post", "أعلن عن وظيفتك", "Post a job"],
    ["employer.html", "لوحة الشركة", "Company dashboard"],
    ["employer.html#talent", "ابحث عن مرشحين", "Find candidates"],
  ];
  const here = location.pathname.split("/").pop() || "index.html";
  const employerSide = ["employers.html", "employer.html", "applicants.html"].includes(here);
  if (employerSide) html.classList.add("employer-side");
  function nav(lang = "ar") {
    const box = document.querySelector(".topbar .nav");
    if (!box) return;
    box.replaceChildren(...(employerSide ? EMPLOYER_NAV : NAV).map(([href, ar, en]) => {
      const a = el("a", null, lang === "en" ? en : ar);
      a.href = href;
      if (href === here || href === here + location.hash) a.setAttribute("aria-current", "page");
      return a;
    }));
    // the other side of the site, at the end of the bar (Bayt's "for employers")
    const tools = document.querySelector(".topbar .tools");
    if (tools) {
      let other = tools.querySelector(".side-link");
      if (!other) { other = el("a", "side-link"); tools.append(other); }
      other.href = employerSide ? "./" : "employers.html";
      other.textContent = employerSide ? (lang === "en" ? "For job seekers ›" : "للباحثين عن عمل ‹") : (lang === "en" ? "For employers ›" : "للشركات ‹");
    }
    const mark = document.querySelector(".topbar .wordmark");
    if (mark && employerSide && !mark.querySelector(".side-tag")) mark.append(el("span", "side-tag", lang === "en" ? "Employers" : "للشركات"));
  }
  nav();

  // The account menu: the student's own pages, signed in or not (applications
  // and alerts work from this browser too). On the employer side it is the
  // company's account instead.
  function accountButton(lang = store.get("masar.lang") === "en" && document.getElementById("lang-toggle") ? "en" : "ar") {
    const tools = document.querySelector(".topbar .tools");
    if (!tools) return;
    const en = lang === "en";
    tools.querySelector(".account-menu")?.remove();
    if (employerSide) {
      const co = readJson("masar.employer", "null");
      const a = el("a", `tool account-btn${co ? " in" : ""}`, co ? (co.company || co.email || "?").trim().charAt(0).toUpperCase() : en ? "Sign in" : "دخول");
      a.href = "employer.html";
      a.classList.add("account-menu");
      a.setAttribute("aria-label", co ? `${en ? "Company account" : "حساب الشركة"}: ${co.company || co.email}` : en ? "Company sign in" : "دخول الشركات");
      tools.prepend(a);
      return;
    }
    const u = account.user;
    const box = el("div", "account-menu");
    const btn = el("button", `tool account-btn${u ? " in" : ""}`, u ? (u.name || u.email || "?").trim().charAt(0).toUpperCase() : en ? "Sign in" : "دخول");
    btn.type = "button";
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-label", u ? `${en ? "Your account" : "حسابك"}: ${u.name || u.email}` : en ? "Sign in and your pages" : "الدخول وصفحاتك");
    const menu = el("div", "account-pop");
    menu.hidden = true;
    if (u) {
      const who = el("p", "account-pop-who");
      who.append(el("strong", null, u.name || ""), el("span", null, u.email || ""));
      who.lastChild.dir = "ltr";
      menu.append(who);
    }
    const items = [
      ["account.html", u ? (en ? "My profile" : "ملفي وحسابي") : (en ? "Sign in or create an account" : "الدخول أو إنشاء حساب")],
      ["applications.html", en ? "My applications" : "طلباتي"],
      ["alerts.html", en ? "Job alerts" : "تنبيهات الوظائف"],
      ["jobs.html?saved=1", en ? "Saved postings" : "الإعلانات المحفوظة"],
      ["tests.html", en ? "Skill tests" : "اختبارات المهارات"],
    ];
    items.forEach(([href, label]) => {
      const a = el("a", null, label);
      a.href = href;
      if (href === here) a.setAttribute("aria-current", "page");
      menu.append(a);
    });
    if (u) {
      const out = el("button", "account-pop-out", en ? "Sign out" : "تسجيل الخروج");
      out.type = "button";
      out.onclick = async () => { await account.call("/auth/logout", {}).catch(() => {}); account.forget(); location.reload(); };
      menu.append(out);
    }
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); if (!menu.hidden) menu.querySelector("a")?.focus(); };
    document.addEventListener("click", (e) => { if (!box.contains(e.target)) close(); });
    box.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); btn.focus(); } });
    box.append(btn, menu);
    tools.prepend(box);
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
    me: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  };
  const TABS = [["./", "home", "الرئيسية", "Home"], ["jobs.html", "jobs", "الإعلانات", "Postings"], ["swipe.html", "swipe", "سحب", "Swipe"],
                ["cv.html", "cv", "سيرتك", "CV"], ["account.html", "me", "حسابي", "Account"]];
  const english = () => store.get("masar.lang") === "en";
  const noFoot = ["swipe.html", "admin.html", "applicants.html"].includes(here) || /[?&]embed=/.test(location.search);
  const noTabs = noFoot || employerSide;
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
  if (!noFoot && document.querySelector(".topbar")) {
    // Montserrat 800 is declared in masar.css; the browser fetches it when these letters are drawn
    const mark = el("div", "foot-mark reveal");
    mark.setAttribute("aria-hidden", "true");
    [..."MASAR"].forEach((c, i) => { const s = el("span", null, c); s.style.setProperty("--i", i); mark.append(s); });
    const radar = el("div", "foot-radar", "• RADAR •");
    radar.setAttribute("aria-hidden", "true");
    const legal = el("p", "foot-legal");
    const link = (href, text) => { const a = el("a", null, text); a.href = href; return a; };
    legal.append(el("span", null, `© ${new Date().getFullYear()} مسار`), link("privacy.html", "الخصوصية"),
      link("guide.html", "دليل التدريب التعاوني"), link("ats.html", "فحص ATS"), link("companies.html", "الشركات"), link("alerts.html", "تنبيهات الوظائف"), link("tests.html", "اختبارات المهارات"), link("premium.html", "مسار المميّز"), link("l/interview-data-analyst.html", "أسئلة المقابلات"), link("employers.html", "للشركات"), link("support.html", "الدعم الفني"),
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

  // ---------- English on every page ----------
  // The home page and the market index translate themselves (their own
  // lang-toggle). Every other page gets an EN/ع button here, and in English
  // assets/en.js swaps each piece of interface text for its English, including
  // text drawn later (results, messages). Data is never translated: posting
  // titles, companies, descriptions, CVs and chat messages stay as written.
  const ownI18n = !!document.getElementById("lang-toggle");
  if (!ownI18n && document.querySelector(".topbar .tools")) {
    const b = el("button", "tool", english() ? "ع" : "EN");
    b.type = "button";
    b.lang = english() ? "ar" : "en";
    b.setAttribute("aria-label", english() ? "العربية" : "English");
    b.onclick = () => { store.set("masar.lang", english() ? "ar" : "en"); location.reload(); };
    document.querySelector(".topbar .tools").prepend(b);
  }
  if (english() && !ownI18n) {
    const s = document.createElement("script");
    s.src = "assets/en.js?v=13";
    s.onload = translate;
    document.head.append(s);
  }
  function translate() {
    const D = window.MASAR_EN;
    if (!D) return;
    const patterns = D.patterns.map(([rx, en]) => [new RegExp(rx), en]);
    const AR = /[؀-ۿ]/;
    // keys and values compared trimmed: the node keeps its own spacing
    const exact = Object.fromEntries(Object.entries(D.exact).map(([k, v]) => [k.trim(), v.trim()]));
    // country names as Intl writes them in Arabic ("ألمانيا") -> English
    try {
      const ar = new Intl.DisplayNames(["ar"], { type: "region" }), en = new Intl.DisplayNames(["en"], { type: "region" });
      "SA AE QA KW BH OM EG JO LB IQ SY PS YE MA DZ TN LY SD US CA GB IE DE FR NL BE LU CH AT ES PT IT PL CZ SE NO DK FI EE LT LV RO BG GR TR IL CY IN PK BD SG MY ID PH VN TH JP KR CN HK TW AU NZ BR MX AR CL CO PE ZA NG KE UA HU SK SI HR RS"
        .split(" ").forEach((c) => { exact[ar.of(c)] ??= en.of(c); });
    } catch { /* an old browser keeps the Arabic names */ }
    const tr = (s, depth = 0) => {
      const t = s.trim();
      if (!t || !AR.test(t)) return null;
      if (exact[t] != null) return s.replace(t, exact[t]);
      if (D.months[t]) return s.replace(t, D.months[t]);
      if (depth > 2) return null;
      // parts joined by the Arabic comma ("الرياض، أمس", "SQL، Excel") are
      // translated one by one and joined with the English comma
      const pieces = (part) => part.split(/\s*،\s*/).map((x) => (x ? tr(x, depth + 1) ?? x : x).trim()).join(", ");
      for (const [rx, en] of patterns) {
        const m = t.match(rx);
        if (m) return s.replace(t, en.replace(/\$(\d)/g, (_, i) => { const part = m[i] || ""; return tr(part, depth + 1) ?? pieces(part); }));
      }
      if (t.includes("،")) return s.replace(t, pieces(t));
      return null;
    };
    const SKIP = ".paper, .bubbles, .li-out, .bot-answer, .land-list, .job-desc, .job-title, .posting-title, .posting-company, "
      + ".posting-who, .ats-raw, .ats-fields dd, .ats-kw .chips, .swipe-title, .swipe-desc, .reel-title, .reel-desc, .rail-title, .rail-co, .cand, .admin-desc, textarea, script, style, [translate=no]";
    const ATTRS = ["placeholder", "aria-label", "title"];
    const text = (n) => {
      if (n.parentElement?.closest(SKIP)) return;
      const out = tr(n.nodeValue);
      if (out != null && out !== n.nodeValue) n.nodeValue = out;
    };
    // a text box's own words are the user's; its placeholder is ours
    const SKIP_ATTR = SKIP.replace("textarea, ", "");
    const attrs = (node) => ATTRS.forEach((a) => {
      const v = node.getAttribute?.(a);
      const out = v && !node.closest(SKIP_ATTR) ? tr(v) : null;
      if (out != null && out !== v) node.setAttribute(a, out);
    });
    const walk = (root) => {
      if (root.nodeType === 3) { text(root); return; }
      if (root.nodeType !== 1) return;
      attrs(root);
      if (root.closest?.(SKIP)) return;
      root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(",")).forEach(attrs);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) text(n);
    };
    html.lang = "en";
    html.dir = "ltr";
    document.title = tr(document.title) ?? document.title;
    walk(document.body);
    new MutationObserver((muts) => muts.forEach((m) => {
      if (m.type === "childList") m.addedNodes.forEach(walk);
      else if (m.type === "characterData") text(m.target);
      else attrs(m.target);
    })).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const ask = window.confirm.bind(window);
    window.confirm = (msg) => ask(tr(String(msg)) ?? msg);
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

  // A long list laid out before the web fonts arrive is laid out again for
  // each font that lands (three passes of ~300ms on a mid-range phone). Pages
  // wait for the fonts, at most 1.5 s, before drawing their big lists once.
  const fontsReady = () => Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(),
                                         new Promise((ok) => setTimeout(ok, 1500))]);

  return { store, count, pct, date, ago, place, alerts, GULF, fontsReady, countryName, el, safeUrl, i18n, initTheme, nav, account, accountButton,
           LEVELS, MODES, KINDS, ROLES, FIELDS, FIELDS_EN, mine, has, fit, yearsText, logo, siteIcon, verifiedBadge, replyBadge, learnUrl };
})();
