// The ATS check: what a CV-screening system can read from a file, and how
// many of a posting's skills it finds. Pure functions over text (no page, no
// network), shared by ats.html and the CV builder, and tested in
// worker/test.mjs. Every result comes from a fixed rule with a fixed weight,
// so the same file always gets the same score and each point lost is named.
(() => {
  "use strict";

  // headings screening systems file a CV under; anything else is read as text
  const SECTIONS = {
    summary: ["summary", "professional summary", "profile", "professional profile", "objective", "career objective",
      "about me", "نبذة", "نبذة عني", "الملخص", "ملخص", "الملخص المهني", "الهدف الوظيفي", "الهدف المهني"],
    experience: ["experience", "work experience", "professional experience", "employment", "employment history",
      "work history", "internships", "internship", "internship experience", "relevant experience",
      "الخبرات", "الخبرة", "الخبرات العملية", "الخبرة العملية", "الخبرات المهنية", "الخبرة المهنية", "التدريب", "الخبرات والتدريب", "التدريب التعاوني"],
    education: ["education", "academic background", "education and training", "academic qualifications",
      "التعليم", "المؤهلات العلمية", "المؤهل العلمي", "المؤهلات الأكاديمية", "التعليم الأكاديمي"],
    skills: ["skills", "technical skills", "core skills", "key skills", "skills and tools", "competencies",
      "core competencies", "technical proficiencies", "المهارات", "المهارات التقنية", "المهارات الفنية", "المهارات والأدوات"],
    projects: ["projects", "academic projects", "personal projects", "key projects", "المشاريع", "المشاريع الأكاديمية"],
    certifications: ["certifications", "certificates", "licenses and certifications", "licenses & certifications",
      "courses", "certifications and courses", "training and certifications", "الشهادات", "الدورات", "الشهادات والدورات", "الدورات التدريبية"],
    languages: ["languages", "اللغات"],
    volunteering: ["volunteering", "volunteer experience", "volunteer work", "العمل التطوعي", "التطوع"],
    awards: ["awards", "honors", "honours", "achievements", "awards and achievements", "الجوائز", "الإنجازات"],
    additional: ["additional information", "interests", "activities", "extracurricular activities", "معلومات إضافية", "الأنشطة"],
  };
  const HEADING = new Map(Object.entries(SECTIONS).flatMap(([k, list]) => list.map((h) => [h, k])));
  const headingOf = (line) => HEADING.get(line.normalize("NFKC").toLowerCase()
    .replace(/^[\s•\-–*#\d.]+/, "").replace(/[\s:：]+$/, "").replace(/\s+/g, " ")) || null;

  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const PHONE = /(?:\+|\b00|\b0)\d[\d\s\-()]{7,16}\d/;
  const LINK = /\b(?:linkedin\.com\/in|github\.com)\/[\w-]+/gi;
  const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
    + "|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر"
    + "|كانون الثاني|شباط|آذار|نيسان|أيار|حزيران|تموز|آب|أيلول|تشرين الأول|تشرين الثاني|كانون الأول";
  const NOW = "present|current|now|today|حتى الآن|الآن|حاليا|حالياً|للآن";
  const DATE = new RegExp(`(?:${MONTHS})\\.?\\s*(?:19|20)\\d\\d|\\b(?:0?[1-9]|1[0-2])[/.](?:19|20)\\d\\d\\b`
    + `|\\b(?:19|20)\\d\\d\\s*[-–—]\\s*(?:(?:19|20)\\d\\d\\b|${NOW})|(?:${NOW})\\s*[-–—]\\s*(?:19|20)\\d\\d`, "giu");

  const ARABIC = /[؀-ۿ]/g;
  const SHAPED = /[ﭐ-﷿ﹰ-﻿]/g; // Arabic presentation forms: a search for the word misses them
  const LIGATURE = /[ﬀ-ﬆ]/;              // ﬁ ﬂ ﬀ: "Certiﬁcates" is not "Certificates"
  const GARBLED = /[�-]|\(cid:\d+\)/g;

  const words = (t) => t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));

  // Two columns: some x on the page that almost no line crosses, with a real
  // share of the lines on each side of it. lines = [[x0, x1], ...] per line.
  function twoColumns(lines, width) {
    if (lines.length < 12) return false;
    for (let f = 0.2; f <= 0.8; f += 0.01) {
      const x = width * f;
      let cross = 0, left = 0, right = 0;
      for (const line of lines) {
        if (line.some(([a, b]) => a < x && b > x)) { cross++; continue; }
        if (line.some(([, b]) => b <= x)) left++;
        if (line.some(([a]) => a >= x)) right++;
      }
      if (cross <= lines.length * 0.1 && left >= lines.length * 0.25 && right >= lines.length * 0.25) return true;
    }
    return false;
  }

  // doc: { text, kind: "pdf"|"docx"|"masar", pages, images, columns, tables, textboxes, headerContact }
  function analyze(doc) {
    const text = doc.text || "";
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const count = words(text).length;
    const checks = [];
    const add = (id, ok, weight, fix, info) => checks.push({ id, ok, weight: ok ? 0 : weight, fix, info });

    const sections = [...new Set(lines.map(headingOf).filter(Boolean))];
    const email = (text.match(EMAIL) || [])[0] || "";
    const phone = (text.match(PHONE) || []).find((p) => p.replace(/\D/g, "").length >= 9) || "";
    const first = (lines[0] || "").split(/\s*[|,•]\s*/)[0];
    const name = /^[\p{L}\s.'-]{3,60}$/u.test(first) && first.trim().split(/\s+/).length >= 2
      && first.trim().split(/\s+/).length <= 5 && !headingOf(first) ? first.trim() : "";
    const dates = (text.match(DATE) || []).length;
    const letters = (text.match(/\p{L}/gu) || []).length || 1;
    const fields = { name, email, phone, links: [...new Set(text.match(LINK) || [])], sections, dates, words: count,
                     pages: doc.pages || 0, kind: doc.kind };

    // nothing to read (a scan, an image): every other check would be about an empty page; a short
    // but readable CV is scored, and loses its points on length and missing sections instead
    if (count < 12) {
      add("no_text", false, 100);
      return { score: 0, checks, fields };
    }
    const garbled = (text.match(GARBLED) || []).length;
    add("garbled", garbled / text.length < 0.01, 40, null, garbled);
    if (LIGATURE.test(text)) {
      add("ligatures", false, 8, null, [...new Set(text.split(/\s+/).filter((w) => LIGATURE.test(w)))].slice(0, 6));
    }
    const arabic = (text.match(ARABIC) || []).length + (text.match(SHAPED) || []).length;
    if (doc.kind === "pdf" || doc.kind === "masar-ar") {
      add("arabic_pdf", arabic / letters < 0.15, 15);
    }
    if (doc.kind === "pdf") add("columns", !doc.columns, 15);
    if (doc.kind === "docx") {
      add("tables", !doc.tables, 10, null, doc.tables);
      add("textboxes", !doc.textboxes, 15, null, doc.textboxes);
      add("columns", !doc.columns, 15);
    }
    // contact kept in the page header: one problem, not three
    if (doc.headerContact) add("header_contact", false, 15);
    else {
      add("email", !!email, 12);
      add("phone", !!phone, 8);
    }
    add("name", !!name, 5);
    add("experience", sections.includes("experience") || sections.includes("projects"), 10);
    add("education", sections.includes("education"), 10);
    add("skills", sections.includes("skills"), 10);
    if (sections.includes("experience") || sections.includes("projects")) add("dates", dates > 0, 5);
    add("length", count >= 200, 5, null, count);
    if (doc.pages) add("pages", doc.pages <= 2, 5, null, doc.pages);
    if (doc.images) checks.push({ id: "images", ok: true, weight: 0, note: true, info: doc.images });
    const score = Math.max(0, 100 - checks.reduce((s, c) => s + c.weight, 0));
    return { score, checks, fields };
  }

  // ---------- what the CV says: the part a recruiter scores after the system has read it ----------
  // Reading is pass/fail, so any tidy file reads 100; this is graded. Points are
  // the ones recruiters' guides give: results with numbers, a verb leading each
  // point, no duty phrases, a summary, a real skills list, a LinkedIn link.
  const VERBS_EN = new Set(("accelerated achieved advised analysed analyzed assessed assisted audited automated boosted built "
    + "calculated cleaned cleansed coached collaborated collected compiled completed conducted configured constructed contributed "
    + "coordinated created cut defined delivered deployed designed developed directed documented drafted drove earned edited "
    + "engineered established evaluated executed expanded extracted facilitated forecasted founded generated grew handled "
    + "identified implemented improved increased initiated installed integrated interviewed introduced launched led maintained "
    + "managed mapped measured mentored migrated modeled modelled monitored negotiated operated optimised optimized organised "
    + "organized oversaw owned participated performed piloted planned prepared presented processed produced programmed published "
    + "queried raised ranked reconciled recommended redesigned reduced refactored researched resolved reviewed ran saved scaled "
    + "scraped secured segmented served shipped simplified solved standardized streamlined supervised supported surveyed taught "
    + "tested tracked trained transformed translated validated visualised visualized won wrote").split(" "));
  const arKey = (w) => w.replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى$/, "ي");
  const VERBS_AR = new Set(("طورت حللت صممت بنيت اعددت نفذت قدت ادرت انشات جمعت نظفت رفعت خفضت حسنت اطلقت دربت قدمت كتبت "
    + "شاركت ساهمت نظمت اتممت انجزت راجعت اشرفت تابعت حققت وفرت اتمتت استخرجت عرضت وثقت نشرت درست قست ربطت اختبرت "
    + "تطوير تحليل تصميم بناء اعداد تنفيذ قيادة ادارة انشاء جمع تنظيف تحسين خفض رفع اطلاق تدريب تقديم كتابة مشاركة "
    + "المشاركة المساهمة مساهمة تنظيم انجاز مراجعة الاشراف اشراف متابعة اتمتة تحقيق توفير استخراج عرض توثيق قياس ربط اختبار "
    + "اعد بني طور حلل صمم نفذ قاد ادار انشا جمع حسن").split(" "));
  const WEAK = /\b(?:responsible for|duties (?:included|include)|tasked with|worked on|helped (?:with|to)|in charge of|involved in)\b|مسؤول(?:ة)? عن|كنت مسؤول|من مهامي|ساعدت في/gi;
  const PRONOUN = /(?:^|\s)(?:I|my|me)(?=\s|$)/;
  // a number that is a result, not a year or a date: 30%, 1,200, 3x, ١٥
  const YEARISH = /^(?:19|20)\d\d$/;

  // the lines under Experience / Projects / Volunteering: role lines (short, with a date) are not points
  function points(lines) {
    const out = [];
    let inside = false;
    for (const raw of lines) {
      const h = headingOf(raw);
      if (h) { inside = ["experience", "projects", "volunteering"].includes(h); continue; }
      if (!inside) continue;
      const line = raw.replace(/^[\s•●▪◦‣∙·*\-–]+/, "").trim();
      const n = words(line).length;
      DATE.lastIndex = 0;
      // "Sales Dashboard, Power BI, SQL": a name and its tools, not a point
      if (n < 4 || (DATE.test(line) && n < 12) || (n <= 8 && (line.match(/[,،|]/g) || []).length >= 2)) continue;
      out.push(line);
    }
    return out;
  }
  const hasResult = (p) => {
    const nums = p.replace(DATE, " ").match(/[٠-٩]+|\d+(?:[.,]\d+)*/g) || [];
    return /%|٪/.test(p) || nums.some((d) => !YEARISH.test(d));
  };
  const leadsWithVerb = (p) => {
    const first = (p.match(/^[\p{L}\p{M}]+/u) || [""])[0];
    return VERBS_EN.has(first.toLowerCase()) || VERBS_AR.has(arKey(first));
  };

  function content(text) {
    const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const pts = points(lines);
    const sections = new Set(lines.map(headingOf).filter(Boolean));
    const checks = [];
    // graded: the share of the target reached earns that share of the points
    const graded = (id, share, target, weight, info) => {
      const lost = Math.round(weight * (1 - Math.min(1, share / target)));
      checks.push({ id, ok: lost === 0, weight: lost, info });
    };
    const n = pts.length;
    const numbered = pts.filter(hasResult).length;
    const verbed = pts.filter(leadsWithVerb).length;
    graded("results", n ? numbered / n : 0, 0.5, 30, [numbered, n]);
    graded("verbs", n ? verbed / n : 0, 0.7, 20, [verbed, n]);
    const weak = [...new Set((pts.join("\n").match(WEAK) || []).map((w) => w.toLowerCase()))];
    checks.push({ id: "weak", ok: !weak.length, weight: Math.min(10, weak.length * 5), info: weak });
    const long = pts.filter((p) => words(p).length > 35).length;
    checks.push({ id: "long", ok: !long, weight: Math.min(10, long * 5), info: long });
    const pron = pts.filter((p) => PRONOUN.test(p)).length;
    checks.push({ id: "pronouns", ok: !pron, weight: pron ? 5 : 0, info: pron });
    checks.push({ id: "summary", ok: sections.has("summary"), weight: sections.has("summary") ? 0 : 10 });
    // skills listed: the lines under the Skills heading, split on commas, bullets and bars
    let inSkills = false;
    const skills = [];
    for (const l of lines) {
      const h = headingOf(l);
      if (h) { inSkills = h === "skills"; continue; }
      if (inSkills) skills.push(...l.split(/[,،•|;/]|\s{2,}|\t/).map((s) => s.replace(/^[^:]{0,30}:\s*/, "").trim()).filter((s) => s && words(s).length <= 5));
    }
    graded("skill_count", skills.length, 6, 10, skills.length);
    const linked = /linkedin\.com\/in\//i.test(text || "");
    checks.push({ id: "linkedin", ok: linked, weight: linked ? 0 : 5 });
    const score = Math.max(0, 100 - checks.reduce((s, c) => s + c.weight, 0));
    return { score, checks, points: n };
  }

  // job: { title, required: [skill], preferred: [skill] } from a Masar posting,
  // or { description } pasted: its skills are the rules that match it.
  // patterns: docs/data/skills.json (radar.skills.js_pattern of each rule).
  function match(text, job, patterns) {
    const rx = (name) => (patterns[name] ? new RegExp(patterns[name], "u") : null);
    const has = (t, name) => { const r = rx(name); return r ? r.test(t) : t.toLowerCase().includes(name.toLowerCase()); };
    let { required = [], preferred = [], title = "" } = job;
    if (job.description) {
      // a skill is preferred when every sentence naming it says so ("SAP is an advantage"),
      // or it sits under a "Nice to have:" heading; named anywhere else, it is required
      const d = job.description;
      const PREF = /nice[\s-]to[\s-]have|preferred|preferably|is a plus|are a plus|bonus|desirable|advantage|يفضّل|يفضل|ميزة إضافية|مهارات إضافية/i;
      const all = Object.keys(patterns).filter((n) => has(d, n));
      const parts = [];
      let under = false;
      for (const line of d.split("\n")) {
        const t = line.trim();
        if (!t) continue;
        // a heading line ("Nice to have:", "Requirements:") starts or ends a preferred block
        if (/[:：]\s*$/.test(t) || /^#/.test(t)) under = PREF.test(t);
        t.split(/(?<=[.!?؟])\s+/).forEach((s) => parts.push([s, under || PREF.test(s)]));
      }
      required = all.filter((n) => parts.some(([s, pref]) => !pref && has(s, n)));
      preferred = all.filter((n) => !required.includes(n));
      const head = job.description.split("\n").map((l) => l.trim()).find(Boolean) || "";
      title = head.split(/\s+[-–|،,]\s+/)[0];
      if (words(title).length > 8) title = "";
    }
    const flat = text.normalize("NFKC");
    const found = (list) => list.filter((n) => has(flat, n));
    const req = found(required), pref = found(preferred);
    // "Junior Data Analyst" is found in "Data Analyst Intern": the level is not the job
    // "Senior Data Analyst - Acquisition 🇫🇷": the job is before the dash
    const core = title.split(/\s+[-–—|]\s+/)[0].replace(/[^\p{L}\p{N}\s.+#&/()-]/gu, " ").replace(/\b(?:junior|jr\.?|senior|sr\.?|intern(?:ship)?|trainee|graduate|entry[\s-]level|co-?op|associate|lead|m\/w\/d|f\/m\/d)\b|\(.*?\)|متدرب|مبتدئ|حديث التخرج/gi, " ")
      .replace(/\s+/g, " ").trim();
    const titleHit = !!core && flat.toLowerCase().includes(core.toLowerCase());
    const total = required.length + preferred.length * 0.5 + (title ? 1 : 0);
    const got = req.length + pref.length * 0.5 + (titleHit ? 1 : 0);
    return {
      score: total ? Math.round((got / total) * 100) : null,
      title: core ? title : "", core, titleHit,
      required, preferred,
      matched: req, missing: required.filter((n) => !req.includes(n)),
      preferredMatched: pref, preferredMissing: preferred.filter((n) => !pref.includes(n)),
    };
  }

  // The one percentage. With a posting: 30% how the file reads, 30% what it
  // says, 40% how it matches the posting; without one, reading and content
  // half each. A file the system cannot read scores nothing, whatever it says.
  const overall = (read, said, matchScore) => (read === 0 ? 0 : matchScore == null
    ? Math.round((read + said) / 2) : Math.round(read * 0.3 + said * 0.3 + matchScore * 0.4));
  const level = (score) => (score >= 85 ? "good" : score >= 70 ? "fair" : score >= 50 ? "work" : "poor");

  // A saved CV (cvkit toBlocks: [tag, class, children]) as the lines a parser
  // gets: each heading, paragraph and list item on its own line.
  const BLOCK = new Set(["h1", "h2", "p", "li", "div", "ul"]);
  function blocksText(blocks) {
    let out = "";
    const walk = (list, depth) => {
      if (!Array.isArray(list) || depth > 6) return;
      for (const b of list) {
        if (typeof b === "string") out += b;
        else if (Array.isArray(b)) {
          walk(b[2], depth + 1);
          if (BLOCK.has(String(b[0]).toLowerCase())) { if (!out.endsWith("\n")) out += "\n"; } else out += " ";
        }
      }
    };
    walk(blocks, 0);
    return out.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  }
  // No CV made yet: the profile's own words under the headings a parser knows
  function profileText(p) {
    p = p || {};
    const part = (head, v) => (v && String(v).trim() ? `${head}\n${String(v).trim()}\n` : "");
    return [p.name, [p.city, p.phone, p.email, p.link].filter(Boolean).join(" | "), "",
      part("Education", [p.degree, p.major, p.university, p.graduation].filter(Boolean).join(", ")),
      part("Experience", p.experience), part("Projects", p.projects), part("Skills", p.skills),
      part("Certifications", p.certificates), part("Languages", p.languages)].filter((x) => x !== undefined).join("\n").trim();
  }

  // The student's CV in this browser: the newest one made in the builder, else
  // the profile. null when there is neither.
  function myCV() {
    const store = window.Masar && window.Masar.store;
    if (!store) return null;
    const read = (k, empty) => { try { return JSON.parse(store.get(k) || empty) || JSON.parse(empty); } catch { return JSON.parse(empty); } };
    const cvs = read("masar.cvs", "[]");
    const newest = Array.isArray(cvs) && cvs[0];
    if (newest && newest.paper) return { from: "cv", label: newest.label || "", lang: newest.lang, text: blocksText(newest.paper) };
    const p = read("masar.profile", "{}");
    if (!(p.skills || p.experience || p.projects)) return null;
    return { from: "profile", label: "", lang: "en", text: profileText(p) };
  }

  window.MasarATS = { analyze, content, match, overall, level, twoColumns, headingOf, blocksText, profileText, myCV, SECTIONS, DATE };
})();
