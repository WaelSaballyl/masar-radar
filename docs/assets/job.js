// One posting on its own page: job.html?id=<collected id> or ?ex=<exclusive id>.
// A page per posting can be linked, shared and found by search engines. An
// exclusive posting is ours, so it also carries schema.org JobPosting data;
// a collected one links to its source instead and carries none (its text
// belongs to the site it came from). Everything goes in via textContent.
(() => {
  "use strict";
  const { el, safeUrl, ago, date, countryName, GULF, LEVELS, MODES, KINDS, ROLES, yearsText, fit, has, mine } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]').content;
  const params = new URLSearchParams(location.search);
  // shown beside the postings list: no page chrome, and links open in the whole window
  if (params.has("embed")) {
    document.documentElement.classList.add("embed");
    const base = document.createElement("base");
    base.target = "_top";
    document.head.append(base);
  }
  const id = params.get("id"), ex = params.get("ex");
  const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const KIND = { coop: "coop", internship: "internship" };
  const SCHEMA_TYPE = { coop: "INTERN", internship: "INTERN", full_time: "FULL_TIME", part_time: "PART_TIME", contract: "CONTRACTOR" };

  function crumb(items) {
    const nav = $("crumbs");
    items.forEach(([label, href], i) => {
      if (i) nav.append(el("span", "crumb-sep", "‹"));
      if (href) { const a = el("a", null, label); a.href = href; nav.append(a); } else nav.append(el("span", null, label));
    });
  }

  function show(p, all) {
    const country = p.countries.find((c) => GULF.includes(c)) || p.countries[0];
    document.title = `${p.title}، ${p.company} — مسار`;
    const crumbs = [["الإعلانات", "jobs.html"]];
    if (country) crumbs.push([countryName(country, "ar"), `jobs.html?where=${country}`]);
    if (ROLES[p.role]) crumbs.push([ROLES[p.role], `jobs.html?role=${encodeURIComponent(p.role)}${country ? `&where=${country}` : ""}`]);
    crumbs.push([p.title]);
    crumb(crumbs);

    const box = $("job");
    box.replaceChildren();
    const top = el("div", "posting-top");
    if (p.exclusive) top.append(el("span", "badge-exclusive", "حصري على مسار"));
    if (p.verified) top.append(Masar.verifiedBadge());
    const fast = Masar.replyBadge(p.reply_days);
    if (fast) top.append(fast);
    if (KINDS[p.kind] && p.kind !== "job") top.append(el("span", "tag tag-training", KINDS[p.kind]));
    if (LEVELS[p.level] && !(p.level === "Intern" && p.kind !== "job")) top.append(el("span", "tag", LEVELS[p.level]));
    if (p.years != null) top.append(el("span", "tag", yearsText(p.years)));
    if (MODES[p.mode]) top.append(el("span", "tag", MODES[p.mode]));
    const h1 = el("h1", "job-title", p.title);
    h1.dir = "auto";
    const city = (p.location || "").split(",")[0].trim();
    const where = [/^[A-Z]{2}$/.test(city) ? "" : city, ...p.countries.filter((c) => c !== "IL").slice(0, 3).map((c) => countryName(c, "ar"))]
      .filter((x, i, a) => x && a.indexOf(x) === i).join("، ");
    const who = el("p", "job-who");
    who.append(Masar.logo(p, "co-logo co-logo-lg"));
    const company = el("a", "job-company-link");
    company.append(el("strong", null, p.company));
    company.href = `companies.html?c=${encodeURIComponent(p.company)}`;
    company.dir = "auto";
    who.append(company, where ? `، ${where}` : "");
    const when = el("p", "muted", `نُشر ${ago(p.posted_at, "ar")}` + (p.deadline ? `، وآخر موعد للتقديم ${date(p.deadline, "ar")}` : ""));
    box.append(top, h1, who, when);

    const f = fit(p);
    const me = window.MasarATS && MasarATS.myCV();
    if (me) box.append(matchBox(p, me));
    else if (f) box.append(el("p", `posting-fit${f.have / f.of >= 0.6 ? " good" : ""}`, `عندك ${f.have} من ${f.of} مهارات مطلوبة في هذا الإعلان.`));
    else if (!mine()) {
      const hint = el("p", "muted");
      const a = el("a", null, "أضف مهاراتك");
      a.href = "cv.html";
      hint.append(a, " لنعرض لك كم منها يطلب هذا الإعلان.");
      box.append(hint);
    }

    const actions = el("div", "posting-actions");
    const href = safeUrl(p.url);
    if (p.exclusive) {
      const go = el("a", "btn btn-primary", "قدّم عبر مسار");
      go.href = `cv.html?ex=${encodeURIComponent(p.id)}`;
      actions.append(go);
    } else if (href) {
      const open = el("a", "btn btn-primary", "قدّم في موقع الإعلان");
      open.href = href; open.target = "_blank"; open.rel = "noopener";
      actions.append(open);
    }
    const cv = el("a", "btn btn-quiet", "جهّز سيرتي لهذا الإعلان");
    cv.href = `cv.html?${p.exclusive ? "ex" : "job"}=${encodeURIComponent(p.id)}`;
    const share = el("button", "icon-btn", "شارك الإعلان");
    share.type = "button";
    share.onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: document.title, url: location.href });
        else { await navigator.clipboard.writeText(location.href); share.textContent = "نُسخ الرابط"; }
      } catch { /* the share sheet was closed */ }
    };
    actions.append(cv, share);
    box.append(actions);
    // the role's interview questions page, when the radar made one
    if (p.role) {
      const page = `l/interview-${p.role.toLowerCase().replace(/\+/g, "p").replace(/#/g, "sharp").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.html`;
      fetch(page, { method: "HEAD" }).then((r) => {
        if (!r.ok) return;
        const hint = el("p", "muted");
        const a = el("a", null, `أسئلة مقابلة ${ROLES[p.role] || p.role} وكيف تجاوبها`);
        a.href = page;
        hint.append(a);
        actions.after(hint);
      }).catch(() => {});
    }

    const skills = (want, label) => {
      const names = p.skills.filter((s) => s[1] === want).map((s) => s[0]);
      if (!names.length) return;
      box.append(el("h2", null, label));
      const chips = el("p", "posting-skills");
      names.forEach((s) => {
        const a = el("a", `skill${mine() && has(s) ? " have" : ""}`, s);
        a.href = `jobs.html?q=${encodeURIComponent(s)}`;
        chips.append(a);
      });
      box.append(chips);
    };
    skills(1, "المهارات المطلوبة");
    const missing = mine() ? p.skills.filter((s) => s[1] && !has(s[0])).map((s) => s[0]) : [];
    if (missing.length) {
      const gap = el("p", "nudge");
      gap.append("ينقصك: ");
      missing.forEach((s, i) => {
        const a = el("a", null, s);
        a.href = Masar.learnUrl(s); a.target = "_blank"; a.rel = "noopener";
        gap.append(i ? "، " : "", a);
      });
      gap.append(". كل رابط يفتح دورات لهذه المهارة.");
      box.append(gap);
    }
    skills(0, "مهارات مفضّلة");

    if (p.description) {
      box.append(el("h2", null, "وصف الوظيفة"));
      const d = el("div", "job-desc", p.description);
      d.dir = "auto";
      box.append(d);
    } else if (href) {
      const src = el("p", "muted", "النص الكامل للإعلان في موقعه الأصلي: ");
      const a = el("a", null, new URL(href).hostname.replace(/^www\./, ""));
      a.href = href; a.target = "_blank"; a.rel = "noopener";
      src.append(a);
      box.append(src);
    }
    if (p.salary) box.append(el("p", null, `الراتب أو المكافأة: ${p.salary}`));

    if (p.exclusive) schema(p);

    // the same role in the same country, then the same role anywhere
    const near = all.filter((x) => x.id !== p.id && x.role && x.role === p.role)
      .sort((a, b) => (b.countries.includes(country) - a.countries.includes(country)) || (b.posted_at || "").localeCompare(a.posted_at || ""))
      .slice(0, 5);
    if (near.length) {
      $("related").hidden = false;
      $("related-list").replaceChildren(...near.map((x) => {
        const li = el("li", "posting");
        const a = el("a", null, x.title);
        a.href = `job.html?id=${encodeURIComponent(x.id)}`;
        a.dir = "auto";
        const h = el("h3", "posting-title");
        h.append(a);
        li.append(h, el("p", "posting-who", `${x.company}، ${x.countries.map((c) => countryName(c, "ar")).slice(0, 2).join("، ")}`));
        return li;
      }));
    }
  }

  // How the newest CV (or the profile) matches this posting, by the ATS check's rules
  const LEVEL = { good: "ممتاز", fair: "جيد", work: "يحتاج شغل", poor: "ضعيف" };
  function matchBox(p, me) {
    const sec = el("section", "job-match");
    sec.setAttribute("aria-labelledby", "match-h");
    const h = el("h2", null, "توافقك مع هذا الإعلان");
    h.id = "match-h";
    sec.append(h, el("p", "muted", "نحسب…"));
    fetch("data/skills.json").then((r) => r.json()).catch(() => ({})).then((patterns) => {
      const job = { title: p.title, required: p.skills.filter((s) => s[1]).map((s) => s[0]),
                    preferred: p.skills.filter((s) => !s[1]).map((s) => s[0]) };
      const m = MasarATS.match(me.text, job, patterns);
      if (m.score === null) { sec.remove(); return; }
      const num = el("p", "job-match-num", `${m.score}٪`);
      num.append(el("span", `ats-level lvl-${MasarATS.level(m.score)}`, LEVEL[MasarATS.level(m.score)]));
      const from = el("p", "muted small", me.from === "cv" ? `من آخر سيرة جهّزتها${me.label ? ` (${me.label})` : ""}.` : "من ملفك في مسار، قبل ما تجهّز سيرة.");
      from.dir = "auto";
      const parts = [num, from];
      const chips = (names, cls) => { const ul = el("ul", "chips"); names.forEach((n) => { const li = el("li", `chip ${cls}`, n); li.dir = "ltr"; ul.append(li); }); return ul; };
      const found = [...m.matched, ...m.preferredMatched], missing = [...m.missing, ...m.preferredMissing];
      if (found.length) parts.push(el("h3", null, "لقيناها في سيرتك"), chips(found, "kw-ok"));
      if (missing.length) parts.push(el("h3", null, "ما لقيناها"), chips(missing, "kw-no"));
      if (m.title && !m.titleHit) parts.push(el("p", "muted small", `المسمى «${m.core}» غير مكتوب في سيرتك، وأنظمة الفرز تبحث به.`));
      const act = el("p", "job-match-actions");
      const make = el("a", "btn btn-primary btn-small", me.from === "cv" ? "جهّز سيرة مخصصة لهذا الإعلان" : "جهّز سيرتك لهذا الإعلان");
      make.href = `cv.html?${p.exclusive ? "ex" : "job"}=${encodeURIComponent(p.id)}`;
      const file = el("a", "btn btn-quiet btn-small", "افحص ملف سيرتك معه");
      file.href = p.exclusive ? "ats.html" : `ats.html?job=${encodeURIComponent(p.id)}`;
      act.append(make, " ", file);
      parts.push(act);
      sec.replaceChildren(h, ...parts);
    });
    return sec;
  }

  function schema(p) {
    const data = {
      "@context": "https://schema.org", "@type": "JobPosting",
      title: p.title, description: p.description, datePosted: p.posted_at, validThrough: p.deadline,
      employmentType: SCHEMA_TYPE[p.employment] || "OTHER",
      hiringOrganization: { "@type": "Organization", name: p.company, ...(safeUrl(p.website) ? { sameAs: p.website } : {}) },
      jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: p.location, addressCountry: p.countries[0] } },
      ...(p.mode === "remote" ? { jobLocationType: "TELECOMMUTE", applicantLocationRequirements: { "@type": "Country", name: p.countries[0] } } : {}),
      skills: p.skills.filter((s) => s[1]).map((s) => s[0]).join(", "),
      directApply: true,
    };
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
    document.head.append(s);
  }

  const collected = fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json())
    .then((d) => d.postings.map((p) => ({ ...p, kind: p.employment || "job" })));
  const exclusive = ex ? Masar.boardPostings().then((rows) => rows.map((p) => ({
    id: p.id, title: p.title, company: p.company, website: p.website, location: p.city, url: p.apply_url, level: p.level,
    posted_at: (p.created_at || "").slice(0, 10), deadline: p.expires_at, role: "", countries: [p.country], mode: p.workplace,
    skills: [...list(p.required).map((s) => [s, 1]), ...list(p.preferred).map((s) => [s, 0])], description: p.description,
    logo: Masar.siteIcon(p.website), verified: !!p.verified, reply_days: p.reply_days,
    salary: p.salary, employment: p.employment, kind: KIND[p.employment] || "job", years: null, exclusive: true,
  }))).catch(() => []) : Promise.resolve([]);

  Promise.all([collected, exclusive]).then(([all, excl]) => {
    const p = ex ? excl.find((x) => x.id === ex) : all.find((x) => x.id === id);
    if (!p) {
      const gone = el("div");
      gone.append(el("h1", "job-title", "الإعلان غير متاح"), el("p", null, "هذا الإعلان لم يعد متاحاً، غالباً لأنه أُغلق. "));
      $("job").replaceChildren(gone);
      const a = el("a", null, "تصفّح الإعلانات المفتوحة");
      a.href = "jobs.html";
      gone.lastChild.append(a);
      return;
    }
    show(p, all);
  }).catch(() => { $("job").replaceChildren(el("p", null, "تعذّر تحميل الإعلان. حدّث الصفحة بعد قليل.")); });
})();
