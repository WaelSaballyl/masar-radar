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

    // nothing to read: every other check would be about an empty page
    if (count < 40) {
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

  // job: { title, required: [skill], preferred: [skill] } from a Masar posting,
  // or { description } pasted: its skills are the rules that match it.
  // patterns: docs/data/skills.json (radar.skills.js_pattern of each rule).
  function match(text, job, patterns) {
    const rx = (name) => (patterns[name] ? new RegExp(patterns[name], "u") : null);
    const has = (t, name) => { const r = rx(name); return r ? r.test(t) : t.toLowerCase().includes(name.toLowerCase()); };
    let { required = [], preferred = [], title = "" } = job;
    if (job.description) {
      // skills named only after "nice to have" / "preferred" are preferred
      const d = job.description;
      const cut = d.search(/nice[\s-]to[\s-]have|preferred|preferably|is a plus|are a plus|bonus|desirable|advantage|يفضّل|يفضل|ميزة إضافية|مهارات إضافية/i);
      const all = Object.keys(patterns).filter((n) => has(d, n));
      required = cut < 0 ? all : all.filter((n) => has(d.slice(0, cut), n));
      preferred = all.filter((n) => !required.includes(n));
      const head = job.description.split("\n").map((l) => l.trim()).find(Boolean) || "";
      title = head.split(/\s+[-–|،,]\s+/)[0];
      if (words(title).length > 8) title = "";
    }
    const flat = text.normalize("NFKC");
    const found = (list) => list.filter((n) => has(flat, n));
    const req = found(required), pref = found(preferred);
    // "Junior Data Analyst" is found in "Data Analyst Intern": the level is not the job
    const core = title.replace(/\b(?:junior|jr\.?|senior|sr\.?|intern(?:ship)?|trainee|graduate|entry[\s-]level|co-?op|associate|lead|m\/w\/d|f\/m\/d)\b|\(.*?\)|متدرب|مبتدئ|حديث التخرج/gi, " ")
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

  window.MasarATS = { analyze, match, twoColumns, headingOf, SECTIONS, DATE };
})();
