// CV studio (studio.html): the student designs their own CV - six one-column
// templates, an accent colour, type and spacing - with a live A4 preview they
// can click to edit. A short style quiz (stage, field, where they apply, what
// describes them, language, length) picks the template, colour, section order
// and wording for them; two question flows write the summary and each
// experience point from their answers. Strength is scored live with the ATS
// check's content rules. Everything stays in this browser (masar.studio); the
// content is also written to masar.profile so the tailoring page can use it.
// The page renders its own Arabic/English text, so the root is translate="no".
(() => {
  "use strict";
  const { store } = Masar;
  const KEY = "masar.studio";
  const EN = store.get("masar.lang") === "en";
  const L = (ar, en) => (EN ? en : ar);
  const $ = (id) => document.getElementById(id);

  // ---------- a tiny element builder ----------
  function h(tag, props, ...kids) {
    const n = tag === "svg" || tag === "path" ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.setAttribute("class", v);
      else if (k === "value") n.value = v;
      else if (k === "checked") n.checked = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    n.append(...kids.flat(Infinity).filter((x) => x != null && x !== false && x !== ""));
    return n;
  }
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const play = (n, frames, opts) => (!calm && n?.animate ? n.animate(frames, { easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards", ...opts }) : null);
  const icon = (d) => h("svg", { viewBox: "0 0 48 48", "aria-hidden": "true", class: "st-ico" }, h("path", { d }));

  // ---------- what a CV is made of ----------
  const ICONS = {
    personal: "M24 22a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM10 40c0-8 6-12 14-12s14 4 14 12",
    summary: "M10 14h28M10 22h28M10 30h18",
    experience: "M8 16h32v22H8zM18 16v-5h12v5M8 26h32",
    education: "M4 18l20-9 20 9-20 9zM12 22v9c0 3 6 6 12 6s12-3 12-6v-9",
    projects: "M24 6l18 9-18 9-18-9zM6 24l18 9 18-9M6 33l18 9 18-9",
    skills: "M27 4L10 27h12l-3 17 19-24H26z",
    certificates: "M24 30a11 11 0 1 0 0-22 11 11 0 0 0 0 22zM17 28l-3 14 10-5 10 5-3-14",
    languages: "M24 42a18 18 0 1 0 0-36 18 18 0 0 0 0 36zM6 24h36M24 6c6 6 6 30 0 36M24 6c-6 6-6 30 0 36",
    additional: "M24 10v28M10 24h28",
  };
  const NAMES = {
    personal: L("معلوماتك", "Personal info"), summary: L("النبذة", "Summary"), experience: L("الخبرات", "Experience"),
    education: L("التعليم", "Education"), projects: L("المشاريع", "Projects"), skills: L("المهارات", "Skills"),
    certificates: L("الشهادات والدورات", "Certifications"), languages: L("اللغات", "Languages"), additional: L("معلومات إضافية", "Additional"),
  };
  // the headings printed on the CV, in the CV's own language (names screening systems know)
  const HEAD = {
    ar: { summary: "نبذة", experience: "الخبرات", education: "التعليم", projects: "المشاريع", skills: "المهارات",
          certificates: "الشهادات والدورات", languages: "اللغات", additional: "معلومات إضافية", sep: "، ", gpa: "المعدل", link: "الرابط" },
    en: { summary: "Summary", experience: "Experience", education: "Education", projects: "Projects", skills: "Skills",
          certificates: "Certifications", languages: "Languages", additional: "Additional Information", sep: ", ", gpa: "GPA", link: "Link" },
  };
  const ORDER_STUDENT = ["summary", "education", "projects", "experience", "skills", "certificates", "languages", "additional"];
  const ORDER_WORK = ["summary", "experience", "projects", "skills", "education", "certificates", "languages", "additional"];
  const TEMPLATES = [
    ["classic", L("كلاسيكي", "Classic"), L("رسمي، للجهات الحكومية والشركات الكبيرة", "Formal, for government and large firms")],
    ["modern", L("عصري", "Modern"), L("لونك واضح، للشركات الناشئة والتقنية", "Bold colour, for startups and tech")],
    ["pro", L("مهني", "Professional"), L("شريط بلونك أعلى الصفحة", "A band of your colour on top")],
    ["elegant", L("أنيق", "Elegant"), L("عناوين في الوسط بين خطين", "Centred headings between rules")],
    ["minimal", L("بسيط", "Minimal"), L("هدوء ومساحة بيضاء", "Calm, lots of white space")],
    ["compact", L("مضغوط", "Compact"), L("أكثر محتوى في صفحة واحدة", "The most on one page")],
  ];
  const ACCENTS = ["#0B5C8E", "#1F3A5F", "#2A5DB0", "#2E7D6B", "#3B4B5C", "#6B3FA0", "#B0413E", "#B8661A", "#1A1A1A"];
  const SKILLS_BY_FIELD = {
    data: ["SQL", "Excel", "Power BI", "Python", "Tableau", "Statistics", "Data Cleaning", "Data Visualization", "Pandas", "Google Sheets"],
    tech: ["JavaScript", "Python", "Git", "SQL", "React", "Java", "REST APIs", "Linux", "Docker", "AWS"],
    finance: ["Excel", "Financial Analysis", "Accounting", "Financial Modeling", "SAP", "Budgeting", "IFRS", "Power BI", "Reconciliation", "Reporting"],
    engineering: ["AutoCAD", "MATLAB", "Project Management", "SolidWorks", "Primavera P6", "Revit", "Quality Control", "HSE", "Excel", "Technical Drawing"],
    marketing: ["Social Media", "Content Writing", "Google Analytics", "SEO", "Canva", "Photoshop", "Digital Marketing", "Copywriting", "Meta Ads", "Market Research"],
    hr: ["Recruitment", "Onboarding", "HRIS", "Employee Relations", "Payroll", "Saudi Labor Law", "Training", "Excel", "Communication", "MS Office"],
    other: ["Excel", "MS Office", "Communication", "Teamwork", "Problem Solving", "Time Management", "Presentation", "Research"],
  };
  const FIELD_ACCENT = { data: "#0B5C8E", tech: "#2A5DB0", finance: "#1F3A5F", engineering: "#3B4B5C", marketing: "#B0413E", hr: "#2E7D6B", other: "#0B5C8E" };
  // verbs a point can start with, by what describes the student (all known to the ATS verb rule)
  const VERBS = {
    analytical: [["حلّلت", "Analyzed"], ["قِست", "Measured"], ["استخرجت", "Extracted"], ["قارنت", "Compared"]],
    creative: [["صمّمت", "Designed"], ["ابتكرت", "Created"], ["أطلقت", "Launched"], ["كتبت", "Wrote"]],
    leader: [["قُدت", "Led"], ["أدرت", "Managed"], ["نظّمت", "Organized"], ["درّبت", "Trained"]],
    organised: [["نظّمت", "Organized"], ["وثّقت", "Documented"], ["جدولت", "Scheduled"], ["تابعت", "Tracked"]],
    communicator: [["قدّمت", "Presented"], ["عرضت", "Communicated"], ["نسّقت", "Coordinated"], ["تواصلت مع", "Collaborated with"]],
    learner: [["طوّرت", "Developed"], ["طبّقت", "Applied"], ["أنجزت", "Completed"], ["بنيت", "Built"]],
  };
  const TRAITS = {
    analytical: [L("تحليلي", "Analytical"), "أسلوب تحليلي يحوّل الأرقام إلى قرارات", "Analytical, turning numbers into decisions."],
    creative: [L("مبدع", "Creative"), "أفكار جديدة وتصاميم تلفت الانتباه", "Creative, with fresh ideas that get noticed."],
    leader: [L("قيادي", "A leader"), "قيادة للفرق ومتابعة للعمل حتى التسليم", "Leads teams and keeps work moving to delivery."],
    organised: [L("منظّم", "Organized"), "دقة وتنظيم والتزام بالمواعيد", "Detail-minded, organized and on time."],
    communicator: [L("متواصل", "A communicator"), "تواصل واضح وعرض مقنع", "Communicates clearly and presents convincingly."],
    learner: [L("سريع التعلّم", "A fast learner"), "سرعة في تعلّم الأدوات الجديدة", "Picks up new tools fast."],
  };

  // ---------- state ----------
  const blank = () => ({
    v: 1, lang: EN ? "en" : "ar", template: "classic", accent: "#0B5C8E", font: "sans", density: "normal",
    order: [...ORDER_STUDENT], hidden: [], style: null,
    personal: { name: "", headline: "", email: "", phone: "", city: "", link: "" }, summary: "",
    experience: [], education: [], projects: [], skills: [], certificates: [], languages: [], additional: [],
  });
  const lines = (t) => (t || "").split("\n").map((l) => l.replace(/^[\s•●▪◦‣∙·*\-–]+/, "").trim()).filter(Boolean);
  // a profile from the CV page (or an uploaded CV) as a first draft
  function fromProfile(p) {
    const s = blank();
    Object.assign(s.personal, { name: p.name || "", email: p.email || "", phone: p.phone || "", city: p.city || "", link: (p.link || "").split(/\s+/)[0] || "" });
    if (p.university || p.degree || p.major) s.education.push({ school: p.university || "", degree: p.degree || "", major: p.major || "", dates: p.graduation || "", gpa: p.gpa || "" });
    s.skills = (p.skills || "").split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
    const items = (t) => (t || "").split(/\n\s*\n/).map(lines).filter((x) => x.length);
    s.experience = items(p.experience).map(([first, ...rest]) => ({ title: first, org: "", location: "", dates: "", bullets: rest }));
    s.projects = items(p.projects).map(([first, ...rest]) => ({ name: first, tools: "", dates: "", link: "", bullets: rest }));
    s.certificates = lines(p.certificates);
    s.languages = (p.languages || "").split(/[\n،,]/).map((x) => x.trim()).filter(Boolean);
    s.additional = lines(p.other);
    if (/[a-z]/i.test(p.experience || p.summary || "") && !/[؀-ۿ]/.test(p.experience || "")) s.lang = "en";
    return s;
  }
  let S;
  try { S = JSON.parse(store.get(KEY) || "null"); } catch { S = null; }
  const firstVisit = !S;
  if (!S) {
    let p = null;
    try { p = JSON.parse(store.get("masar.profile") || "null"); } catch { /* none */ }
    S = p && Object.values(p).some((x) => x) ? fromProfile(p) : blank();
  }
  S = { ...blank(), ...S, personal: { ...blank().personal, ...(S.personal || {}) } };
  // the answers follow the account: they live in masar.me (synced) as well
  const readMe = () => { try { return JSON.parse(store.get("masar.me") || "{}") || {}; } catch { return {}; } };
  const writeMe = (patch) => store.set("masar.me", JSON.stringify({ ...readMe(), ...patch }));
  if (!S.style && readMe().style) S.style = readMe().style;
  const starting = new URLSearchParams(location.search).get("start") === "1";

  // ---------- history, saving ----------
  const past = [], future = [];
  let lastSnap = JSON.stringify(S), snapTimer = 0, saveTimer = 0, touched = false;
  function snapshot() {
    const now = JSON.stringify(S);
    if (now === lastSnap) return;
    past.push(lastSnap);
    if (past.length > 80) past.shift();
    future.length = 0;
    lastSnap = now;
    paintUndo();
  }
  function commit(opts = {}) {
    touched = true;
    renderPaper();
    if (opts.editor) renderEditor();
    if (opts.design) renderDesign();
    clearTimeout(snapTimer);
    snapTimer = setTimeout(snapshot, opts.now ? 0 : 450);
    setSaved(false);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }
  function save() {
    store.set(KEY, JSON.stringify(S));
    if (touched) toProfile();
    setSaved(true);
  }
  function travel(from, to) {
    if (!from.length) return;
    clearTimeout(snapTimer);
    snapshot();
    to.push(JSON.stringify(S));
    S = JSON.parse(from.pop());
    lastSnap = JSON.stringify(S);
    touched = true;
    renderAll();
    save();
    paintUndo();
  }
  // the CV's facts in the CV page's field format, without contact details
  function facts() {
    const e = S.education[0] || {};
    const para = (head, b) => [head, ...b].filter(Boolean).join("\n");
    return {
      university: e.school || "", degree: e.degree || "", major: e.major || "", graduation: e.dates || "", gpa: e.gpa || "",
      skills: S.skills.join(", "),
      experience: S.experience.map((x) => para([[x.title, x.org, x.location].filter(Boolean).join(" - "), x.dates].filter(Boolean).join(", "), x.bullets)).join("\n\n"),
      projects: S.projects.map((x) => para([[x.name, x.tools].filter(Boolean).join(" - "), x.dates].filter(Boolean).join(", "), x.bullets)).join("\n\n"),
      certificates: S.certificates.join("\n"),
      languages: S.languages.join("، "),
      other: [S.personal.headline && (S.lang === "ar" ? `المسمى الذي أستهدفه: ${S.personal.headline}` : `Target role: ${S.personal.headline}`), ...S.additional].filter(Boolean).join("\n"),
    };
  }
  // the CV page's profile, in its own field format, so "tailor to a posting" works from here
  function toProfile() {
    let old = {};
    try { old = JSON.parse(store.get("masar.profile") || "{}") || {}; } catch { /* start fresh */ }
    const P = S.personal;
    const prof = {
      ...old, name: P.name, email: P.email, phone: P.phone, city: P.city, link: P.link, ...facts(),
      worklinks: [old.worklinks, ...S.projects.map((x) => x.link)].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join("\n"),
    };
    store.set("masar.profile", JSON.stringify(prof));
  }

  // ---------- reading how the student talks ----------
  const API = document.querySelector('meta[name="masar-api"]')?.content;
  const NO_CONTACT = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:https?:\/\/|www\.)\S+|(?:\+|\b00|\b0)\d[\d\s-]{7,14}\d/g;
  // without the worker: traits from the words they use, tone from how long their sentences run
  function readLocally(text) {
    const t = text.toLowerCase();
    const CUES = {
      analytical: /رقم|ارقام|أرقام|بيانات|داتا|تحليل|حلل|نسب|data|number|analy|excel|sql/,
      creative: /فكر|افكار|أفكار|صمم|تصميم|ابتكر|ابداع|إبداع|design|idea|creat/,
      leader: /فريق|قدت|قيادة|مسؤول|اشرفت|أشرفت|team|led|lead/,
      organised: /نظم|تنظيم|خطة|خطه|موعد|مواعيد|ترتيب|plan|organi|schedul/,
      communicator: /تكلم|كلمت|عرض|تواصل|اقنع|أقنع|ناس|عملاء|present|talk|client|customer/,
      learner: /تعلم|اتعلم|دورة|دوره|كورس|جديد|learn|course|new/,
    };
    const traits = Object.entries(CUES).map(([k, rx]) => [k, (t.match(new RegExp(rx, "g")) || []).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    const sentences = text.split(/[.!؟?\n]+/).map((x) => x.trim()).filter(Boolean);
    const avg = sentences.reduce((n, x) => n + x.split(/\s+/).length, 0) / Math.max(1, sentences.length);
    const tone = /!|😀|😂|🔥|يا سلام|حماس|exciting|love/i.test(text) ? "energetic" : avg <= 9 ? "direct" : avg >= 20 ? "calm" : "warm";
    const line = { energetic: L("تكتب بحماس وطاقة", "You write with energy"), direct: L("تكتب بجمل قصيرة ومباشرة", "You write in short, direct sentences"),
      calm: L("تكتب بهدوء وتفصيل", "You write calmly and in detail"), warm: L("تكتب بأسلوب ودود وواضح", "You write in a warm, clear way") }[tone];
    return { tone, traits, voice: line, verbs_ar: [], verbs_en: [], words: [], summary: "", local: true };
  }
  async function readVoice(sample, withSummary, form, lang) {
    const clean = sample.replace(NO_CONTACT, " ").trim();
    try {
      const r = await fetch(`${API}/voice`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample: clean, lang: lang || S.lang, form: form || S.style?.form, ...(withSummary ? { profile: facts() } : {}) }) });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } catch {
      return readLocally(clean);
    }
  }
  const TONE_NAMES = { formal: L("رسمي", "Formal"), warm: L("ودود", "Warm"), direct: L("مباشر", "Direct"), energetic: L("متحمّس", "Energetic"), calm: L("هادئ", "Calm") };
  const PROMPTS = [
    [L("احكيلنا عن شي عملته وكنت فخور فيه. بأي طريقة بتحب، باللهجة عادي.", "Tell us about something you did and were proud of. Any way you like."),
      L("مثلاً: بالجامعة سوّيت مشروع مع ربعي…", "e.g. At uni my friends and I built…")],
    [L("لو صاحبك سألك: شو بتحب تشتغل وليش؟ شو بتقلّه؟", "If a friend asked what work you'd love and why, what would you say?"),
      L("بحب الشغل اللي فيه…", "I like work where…")],
    [L("احكيلنا عن موقف صعب صار معك وكيف تصرّفت.", "Tell us about a hard moment and how you handled it."),
      L("مرة بالتدريب صار…", "Once during my internship…")],
  ];

  // ---------- the paper ----------
  const paper = $("paper");
  const cap = (s) => (s && /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s || "");
  const has = {
    summary: () => !!S.summary.trim(),
    experience: () => S.experience.some((x) => x.title || x.org || x.bullets.length),
    education: () => S.education.some((x) => x.school || x.degree || x.major),
    projects: () => S.projects.some((x) => x.name || x.bullets.length),
    skills: () => S.skills.length > 0,
    certificates: () => S.certificates.length > 0,
    languages: () => S.languages.length > 0,
    additional: () => S.additional.length > 0,
  };
  const PH = {
    summary: L("سطران عنك: ماذا تستهدف وماذا تقدّم. اضغط هنا لنكتبها معاً.", "Two lines about you: what you aim for and what you bring. Click to write it together."),
    experience: L("تدريبك، عملك، تطوّعك. اضغط لتضيف أول خبرة.", "Internships, jobs, volunteering. Click to add your first one."),
    education: L("جامعتك وتخصصك وسنة تخرّجك.", "Your university, major and graduation year."),
    projects: L("مشروع تخرّج أو مشروع شخصي: ماذا بنيت وما نتيجته.", "A capstone or personal project: what you built and what came of it."),
    skills: L("ست مهارات على الأقل، الأدوات قبل الصفات.", "At least six skills, tools before traits."),
    certificates: L("دورات وشهادات، كل واحدة في سطر.", "Courses and certificates, one a line."),
    languages: L("العربية (الأم)، الإنجليزية (متقدم)", "Arabic (native), English (advanced)"),
    additional: L("الإقامة، متى تستطيع البدء، رخصة القيادة.", "Work status, start date, driving licence."),
  };
  let lastLook = "";
  function renderPaper() {
    const hd = HEAD[S.lang];
    const look = `${S.template}|${S.accent}|${S.font}|${S.density}|${S.lang}`;
    const relook = lastLook && look !== lastLook;
    lastLook = look;
    paper.lang = S.lang;
    paper.dir = S.lang === "ar" ? "rtl" : "ltr";
    paper.className = `paper studio-paper tpl-${S.template} dens-${S.density} font-${S.font}`;
    paper.style.setProperty("--accent", S.accent);
    const P = S.personal;
    const kids = [h("h1", { "data-sec": "personal" }, P.name || (S.lang === "ar" ? "اسمك" : "Your Name"))];
    if (P.headline) kids.push(h("p", { class: "cv-headline", "data-sec": "personal" }, P.headline));
    const contact = [P.city, P.phone, P.email, P.link].filter(Boolean).join("  |  ");
    kids.push(contact ? h("p", { class: "cv-contact", "data-sec": "personal" }, contact)
      : h("p", { class: "cv-contact ph", "data-sec": "personal" }, S.lang === "ar" ? "المدينة  |  الجوال  |  البريد  |  LinkedIn" : "City  |  Phone  |  Email  |  LinkedIn"));
    const item = (sec, i, title, meta, bullets) => h("div", { class: "cv-item", "data-sec": sec, "data-i": i },
      h("p", { class: "cv-row" }, h("strong", null, title), meta ? h("span", null, meta) : null),
      bullets.length ? h("ul", null, bullets.map((b) => h("li", null, cap(b)))) : null);
    for (const sec of S.order) {
      if (S.hidden.includes(sec)) continue;
      const head = h("h2", { "data-sec": sec }, hd[sec]);
      if (!has[sec]()) { kids.push(head, h("p", { class: "ph", "data-sec": sec }, PH[sec])); continue; }
      kids.push(head);
      if (sec === "summary") kids.push(h("p", { "data-sec": sec }, S.summary.trim()));
      if (sec === "experience") S.experience.forEach((x, i) => (x.title || x.org || x.bullets.length) && kids.push(
        item(sec, i, [x.title, x.org, x.location].filter(Boolean).map(cap).join(hd.sep), x.dates, x.bullets)));
      if (sec === "education") S.education.forEach((x, i) => (x.school || x.degree || x.major) && kids.push(
        item(sec, i, [x.degree && x.major && x.degree.toLowerCase().includes(x.major.toLowerCase()) ? x.degree
          : [x.degree, x.major].filter(Boolean).join(hd.sep), x.school].filter(Boolean).join(hd.sep), x.dates,
        x.gpa ? [`${hd.gpa}: ${x.gpa}`] : [])));
      if (sec === "projects") S.projects.forEach((x, i) => (x.name || x.bullets.length) && kids.push(
        item(sec, i, [x.name, x.tools].filter(Boolean).join(hd.sep), x.dates, [...x.bullets, ...(x.link ? [`${hd.link}: ${x.link}`] : [])])));
      if (sec === "skills") kids.push(h("p", { class: "cv-skill", "data-sec": sec }, S.skills.join(hd.sep)));
      if (sec === "certificates") kids.push(h("ul", { "data-sec": sec }, S.certificates.map((c) => h("li", null, c))));
      if (sec === "languages") kids.push(h("p", { "data-sec": sec }, S.languages.join(hd.sep)));
      if (sec === "additional") kids.push(h("ul", { "data-sec": sec }, S.additional.map((c) => h("li", null, cap(c)))));
    }
    const before = new Set([...paper.querySelectorAll("li")].map((n) => n.textContent));
    paper.replaceChildren(...kids);
    paper.querySelectorAll(`[data-sec="${current.sec}"]`).forEach((n) => n.classList.add("is-current"));
    // a new look re-inks the sheet top to bottom; a point just added glows once
    if (relook) [...paper.children].forEach((n, i) => play(n, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 380, delay: Math.min(i, 24) * 18 }));
    else if (before.size) paper.querySelectorAll("li").forEach((n) => { if (!before.has(n.textContent) && n.textContent.length > 12) n.classList.add("st-new"); });
    fit();
    score();
  }

  // the preview is the real A4 page (794 px wide) scaled to the pane; a dashed
  // line shows where the first page ends
  const A4W = 794, A4H = 1123;
  let zoom = 0;
  function fit() {
    const pane = $("st-preview"), sizer = $("st-sizer");
    const auto = Math.min(1, (pane.clientWidth - 24) / A4W);
    const scale = Math.max(0.3, zoom || auto);
    paper.style.transform = `scale(${scale})`;
    const tall = paper.offsetHeight;
    sizer.style.width = `${A4W * scale}px`;
    sizer.style.height = `${tall * scale}px`;
    const brk = $("st-break");
    brk.hidden = tall <= A4H + 2;
    brk.style.top = `${A4H * scale}px`;
    const pages = Math.ceil((tall - 2) / A4H);
    const p = $("st-pages");
    p.textContent = pages <= 1 ? L("صفحة واحدة. ممتاز لطالب أو حديث تخرّج.", "One page. Right for a student or new graduate.")
      : L(`${pages === 2 ? "صفحتان" : `${pages} صفحات`}: جرّب القالب المضغوط أو اختصر النقاط.`, `${pages} pages: try the compact template or trim points.`);
    p.classList.toggle("warn", pages > 1);
    $("st-zoom-val").textContent = `${Math.round(scale * 100)}٪`;
  }
  new ResizeObserver(() => fit()).observe($("st-preview"));

  // a click on the preview opens that part in the editor
  paper.addEventListener("click", (e) => {
    const n = e.target.closest("[data-sec]");
    if (!n) return;
    select(n.dataset.sec, n.dataset.i != null ? Number(n.dataset.i) : 0);
    if (matchMedia("(max-width: 1023px)").matches) tab("edit");
  });

  // ---------- strength: the ATS check's content rules on the CV as text ----------
  function plain() {
    const hd = HEAD[S.lang], P = S.personal, out = [P.name, P.headline, [P.city, P.phone, P.email, P.link].filter(Boolean).join(" | ")];
    for (const sec of S.order) {
      if (S.hidden.includes(sec) || !has[sec]()) continue;
      out.push(hd[sec]);
      if (sec === "summary") out.push(S.summary);
      const list = { experience: S.experience.map((x) => [[x.title, x.org].filter(Boolean).join(", ") + (x.dates ? ` | ${x.dates}` : ""), x.bullets]),
        projects: S.projects.map((x) => [[x.name, x.tools].filter(Boolean).join(", ") + (x.dates ? ` | ${x.dates}` : ""), x.bullets]),
        education: S.education.map((x) => [[x.degree, x.major, x.school].filter(Boolean).join(", ") + (x.dates ? ` | ${x.dates}` : ""), []]) }[sec];
      if (list) list.forEach(([row, b]) => out.push(row, ...b.map((x) => `• ${x}`)));
      if (sec === "skills") out.push(S.skills.join(", "));
      if (["certificates", "languages", "additional"].includes(sec)) out.push(...S[sec]);
    }
    return out.filter(Boolean).join("\n");
  }
  let fixes = [];
  function score() {
    if (!window.MasarATS) return;
    const c = MasarATS.content(plain());
    const P = S.personal;
    fixes = c.checks.filter((x) => !x.ok).map((x) => [x.weight, x.id, x.info]);
    if (!P.email || !P.phone) fixes.push([10, "contact"]);
    if (!has.education()) fixes.push([5, "education"]);
    fixes.sort((a, b) => b[0] - a[0]);
    const value = Math.max(0, c.score - (!P.email || !P.phone ? 10 : 0) - (has.education() ? 0 : 5));
    const ring = $("st-score");
    ring.style.setProperty("--v", value);
    ring.dataset.level = value >= 85 ? "top" : value >= 70 ? "good" : value >= 50 ? "mid" : "low";
    const num = $("st-score-n"), from = Number(num.textContent) || 0;
    if (calm || from === value) num.textContent = value;
    else {
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 600), e = 1 - (1 - k) ** 3;
        num.textContent = Math.round(from + (value - from) * e);
        ring.style.setProperty("--v", from + (value - from) * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    ring.setAttribute("aria-label", L(`قوة سيرتك ${value} من 100. اعرض ما يرفعها`, `CV strength ${value} of 100. Show what raises it`));
    if (!$("st-fixes").hidden) paintFixes();
  }
  const FIX = {
    results: (i) => (i[1] ? [L(`أضف رقماً لنتائجك: ${i[0]} من ${i[1]} نقطة فيها رقم`, `Add numbers to results: ${i[0]} of ${i[1]} points have one`), "experience"]
      : [L("أضف نقاطاً تحت خبراتك أو مشاريعك", "Add points under your experience or projects"), "experience"]),
    verbs: (i) => [L(`ابدأ كل نقطة بفعل (طوّرت، حلّلت): ${i[0]} من ${i[1]}`, `Start each point with a verb (Built, Analyzed): ${i[0]} of ${i[1]}`), "experience"],
    weak: (i) => [L(`احذف عبارات المهام: ${i.join("، ")}`, `Drop duty phrases: ${i.join(", ")}`), "experience"],
    long: () => [L("قصّر النقاط الأطول من 35 كلمة", "Shorten points over 35 words"), "experience"],
    pronouns: () => [L("احذف I وmy من النقاط", "Drop I and my from points"), "experience"],
    summary: () => [L("أضف نبذة من سطرين", "Add a two-line summary"), "summary"],
    skill_count: (i) => [L(`أضف ست مهارات على الأقل (عندك ${i})`, `List at least six skills (you have ${i})`), "skills"],
    linkedin: () => [L("أضف رابط LinkedIn", "Add your LinkedIn link"), "personal"],
    contact: () => [L("أضف بريدك وجوالك", "Add your email and phone"), "personal"],
    education: () => [L("أضف تعليمك", "Add your education"), "education"],
  };
  function paintFixes() {
    const box = $("st-fixes");
    const list = fixes.slice(0, 6).map(([w, id, info]) => {
      const [text, sec] = FIX[id](info || []);
      return h("li", null, h("button", { type: "button", onclick: () => { box.hidden = true; select(sec, 0); tab("edit"); } },
        h("span", null, text), h("b", null, `+${w}`)));
    });
    box.replaceChildren(h("p", { class: "st-fixes-head" }, fixes.length ? L("ما يرفع سيرتك، الأهم أولاً:", "What raises your CV, biggest first:")
      : L("سيرتك قوية. جهّزها لإعلان بعينه لترفع التطابق.", "Your CV is strong. Tailor it to a posting to raise the match.")),
      h("ul", null, list), h("p", { class: "st-fixes-note" }, L("القواعد نفسها في فحص ATS: أرقام، أفعال، نبذة، ست مهارات.", "The same rules as the ATS check: numbers, verbs, a summary, six skills.")));
  }

  // ---------- the top bar ----------
  function paintUndo() {
    $("st-undo").disabled = !past.length;
    $("st-redo").disabled = !future.length;
  }
  let savedTimer = 0;
  function setSaved(done) {
    const s = $("st-saved");
    clearTimeout(savedTimer);
    s.textContent = done ? L("محفوظ في متصفحك", "Saved in your browser") : L("يحفظ…", "Saving…");
    s.classList.toggle("is-saving", !done);
  }
  function exportPaper() {
    const clone = paper.cloneNode(true);
    clone.querySelectorAll(".ph").forEach((n) => {
      const prev = n.previousElementSibling;
      if (prev && prev.tagName === "H2") prev.remove();
      n.remove();
    });
    return clone;
  }
  function download(blob, name) {
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  const fileName = () => `${S.personal.name || "CV"} - CV`;
  function buildBar() {
    const bar = $("st-bar");
    const btn = (id, label, ico, on, cls = "") => h("button", { type: "button", id, class: `st-tool ${cls}`, title: label, "aria-label": label, onclick: on },
      ico ? icon(ico) : null, h("span", null, label));
    bar.replaceChildren(
      h("div", { class: "st-bar-start" },
        h("strong", { class: "st-title" }, L("استوديو السيرة", "CV studio")),
        h("span", { class: "st-saved", id: "st-saved", role: "status" }, L("محفوظ في متصفحك", "Saved in your browser")),
        btn("st-undo", L("تراجع", "Undo"), "M18 14L8 24l10 10M8 24h22a8 8 0 0 1 0 16h-8", () => travel(past, future), "icon-only"),
        btn("st-redo", L("إعادة", "Redo"), "M30 14l10 10-10 10M40 24H18a8 8 0 0 0 0 16h8", () => travel(future, past), "icon-only")),
      h("div", { class: "st-bar-end" },
        h("button", { type: "button", class: "st-score", id: "st-score", "aria-expanded": "false", "aria-controls": "st-fixes", onclick: (e) => {
          const box = $("st-fixes");
          box.hidden = !box.hidden;
          e.currentTarget.setAttribute("aria-expanded", String(!box.hidden));
          if (!box.hidden) paintFixes();
        } }, h("span", { class: "st-score-n", id: "st-score-n" }, "0"), h("span", { class: "st-score-l" }, L("القوة", "Strength"))),
        btn("st-style", L("اعرف أسلوبي", "Find my style"), "M24 6l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z", () => openQuiz(false), "st-tool-accent"),
        btn("st-lang", S.lang === "ar" ? "English CV" : "سيرة بالعربي", "M24 42a18 18 0 1 0 0-36 18 18 0 0 0 0 36zM6 24h36M24 6c6 6 6 30 0 36", () => {
          S.lang = S.lang === "ar" ? "en" : "ar";
          $("st-lang").querySelector("span").textContent = S.lang === "ar" ? "English CV" : "سيرة بالعربي";
          commit({ now: true, editor: true });
          toast(S.lang === "en" ? L("العناوين صارت بالإنجليزي. اكتب المحتوى بالإنجليزي، أو جهّزها لوظيفة بالإنجليزي.", "Headings are in English now. Write the content in English too, or tailor it to an English posting.")
            : L("العناوين صارت بالعربي.", "Headings are in Arabic now."));
        }),
        btn("st-word", "Word", "M14 6h14l10 10v26H14zM28 6v10h10M19 24l3 12 3-9 3 9 3-12", () => download(MasarDocx.fromPaper(exportPaper()), `${fileName()}.docx`)),
        btn("st-pdf", "PDF", "M14 6h14l10 10v26H14zM28 6v10h10M24 22v14M18 30l6 6 6-6", printPDF),
        h("a", { class: "btn btn-primary st-tailor", href: "cv.html", onclick: () => { clearTimeout(saveTimer); touched = true; save(); } },
          L("جهّزها لوظيفة", "Tailor to a job"))),
      h("div", { class: "st-fixes", id: "st-fixes", hidden: true }));
    paintUndo();
  }
  function printPDF() {
    const title = document.title;
    document.title = fileName();
    window.addEventListener("afterprint", () => { document.title = title; }, { once: true });
    window.print();
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.closest("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); travel(past, future); }
    if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); travel(future, past); }
  });

  // ---------- design pane ----------
  function renderDesign() {
    const pane = $("st-design");
    const group = (title, ...kids) => h("section", { class: "st-group" }, h("h2", null, title), ...kids);
    const seg = (name, value, opts, on) => h("div", { class: "st-seg", role: "radiogroup", "aria-label": name },
      opts.map(([v, label]) => h("button", { type: "button", role: "radio", "aria-checked": String(v === value), onclick: () => on(v) }, label)));
    const thumbs = h("div", { class: "st-tpls" }, TEMPLATES.map(([id, name, note]) => h("button", {
      type: "button", class: "st-tpl", "aria-pressed": String(S.template === id), title: note,
      onclick: () => { S.template = id; commit({ now: true, design: true }); },
    }, h("span", { class: `tpl-thumb tpl-${id}`, style: `--accent:${S.accent}`, "aria-hidden": "true" },
      h("i", { class: "n" }), h("i", { class: "c" }), h("i", { class: "hd" }), h("i", null), h("i", null), h("i", { class: "s" }), h("i", { class: "hd" }), h("i", null), h("i", { class: "s" })),
    h("span", { class: "st-tpl-name" }, name), S.template === id ? icon("M12 25l8 8 16-18") : null)));
    const swatches = h("div", { class: "st-swatches", role: "radiogroup", "aria-label": L("اللون", "Colour") },
      ACCENTS.map((c) => h("button", { type: "button", role: "radio", class: "st-swatch", style: `--c:${c}`, "aria-checked": String(S.accent.toLowerCase() === c.toLowerCase()),
        "aria-label": c, onclick: () => { S.accent = c; commit({ now: true, design: true }); } })),
      h("label", { class: "st-swatch st-custom", title: L("لون من اختيارك", "Your own colour") },
        h("input", { type: "color", value: S.accent, "aria-label": L("لون من اختيارك", "Your own colour"),
          oninput: (e) => { S.accent = e.target.value; commit(); }, onchange: () => renderDesign() })));
    const list = h("ol", { class: "st-secs" }, h("li", null, secButton("personal", false)),
      S.order.map((sec, i) => h("li", { draggable: "true", "data-sec": sec,
        ondragstart: (e) => { e.dataTransfer.setData("text/plain", sec); e.currentTarget.classList.add("dragging"); },
        ondragend: (e) => e.currentTarget.classList.remove("dragging"),
        ondragover: (e) => e.preventDefault(),
        ondrop: (e) => {
          e.preventDefault();
          const from = e.dataTransfer.getData("text/plain");
          if (!from || from === sec) return;
          S.order.splice(S.order.indexOf(from), 1);
          S.order.splice(S.order.indexOf(sec) + (S.order.indexOf(from) < i ? 1 : 0), 0, from);
          commit({ now: true, design: true });
        } },
      h("span", { class: "st-grip", "aria-hidden": "true" }, "⋮⋮"), secButton(sec, true),
      h("span", { class: "st-sec-tools" },
        h("button", { type: "button", class: "st-mini", "aria-label": L(`${NAMES[sec]} لأعلى`, `Move ${NAMES[sec]} up`), disabled: i === 0,
          onclick: () => { S.order.splice(i - 1, 0, S.order.splice(i, 1)[0]); commit({ now: true, design: true }); } }, icon("M14 28l10-10 10 10")),
        h("button", { type: "button", class: "st-mini", "aria-label": L(`${NAMES[sec]} لأسفل`, `Move ${NAMES[sec]} down`), disabled: i === S.order.length - 1,
          onclick: () => { S.order.splice(i + 1, 0, S.order.splice(i, 1)[0]); commit({ now: true, design: true }); } }, icon("M14 20l10 10 10-10")),
        h("button", { type: "button", class: "st-mini", "aria-pressed": String(S.hidden.includes(sec)),
          "aria-label": S.hidden.includes(sec) ? L(`أظهر ${NAMES[sec]}`, `Show ${NAMES[sec]}`) : L(`أخفِ ${NAMES[sec]}`, `Hide ${NAMES[sec]}`),
          onclick: () => { S.hidden = S.hidden.includes(sec) ? S.hidden.filter((x) => x !== sec) : [...S.hidden, sec]; commit({ now: true, design: true }); } },
        icon(S.hidden.includes(sec) ? "M6 24s7-12 18-12 18 12 18 12-7 12-18 12S6 24 6 24zM8 8l32 32" : "M6 24s7-12 18-12 18 12 18 12-7 12-18 12S6 24 6 24zM24 29a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"))))));
    pane.replaceChildren(
      S.style ? h("button", { type: "button", class: "st-mystyle", onclick: () => openQuiz(false) },
        h("span", null, L("أسلوبك", "Your style")), h("strong", null, styleLine(S.style))) : null,
      group(L("القالب", "Template"), thumbs),
      group(L("اللون", "Colour"), swatches),
      group(L("الخط", "Type"), seg(L("الخط", "Type"), S.font, [["sans", L("حديث", "Sans")], ["serif", L("رسمي", "Serif")]], (v) => { S.font = v; commit({ now: true, design: true }); })),
      group(L("المسافات", "Spacing"), seg(L("المسافات", "Spacing"), S.density, [["tight", L("مضغوطة", "Tight")], ["normal", L("عادية", "Normal")], ["airy", L("مريحة", "Airy")]], (v) => { S.density = v; commit({ now: true, design: true }); })),
      group(L("الأقسام", "Sections"), h("p", { class: "st-hint" }, L("اسحب لترتّب، والعين تخفي القسم.", "Drag to reorder; the eye hides a section.")), list));
  }
  function secButton(sec, inList) {
    const filled = sec === "personal" ? !!S.personal.name : has[sec]();
    return h("button", { type: "button", class: "st-sec", "aria-current": current.sec === sec ? "true" : null,
      onclick: () => { select(sec, 0); tab("edit"); } },
    icon(ICONS[sec]), h("span", null, NAMES[sec]),
    h("i", { class: `st-dot${filled ? " on" : ""}`, title: filled ? L("فيه محتوى", "Has content") : L("فارغ", "Empty") }),
    inList && S.hidden.includes(sec) ? h("em", null, L("مخفي", "hidden")) : null);
  }

  // ---------- editor pane ----------
  const current = { sec: "personal", i: 0 };
  function select(sec, i = 0) {
    current.sec = sec;
    current.i = i;
    renderEditor();
    renderDesign();
    paper.querySelectorAll(".is-current").forEach((n) => n.classList.remove("is-current"));
    paper.querySelectorAll(`[data-sec="${sec}"]`).forEach((n) => n.classList.add("is-current"));
    const target = paper.querySelector(`[data-sec="${sec}"]${sec === "personal" ? "" : `[data-i="${i}"]`}`) || paper.querySelector(`h2[data-sec="${sec}"]`);
    if (target && !matchMedia("(max-width: 1023px)").matches) target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  const field = (label, value, on, opts = {}) => h("label", { class: `st-field${opts.wide ? " wide" : ""}` }, h("span", null, label),
    opts.rows ? h("textarea", { rows: opts.rows, dir: opts.dir || "auto", placeholder: opts.ph || null, value, oninput: (e) => { on(e.target.value); opts.after?.(e.target.value); commit(); } })
      : h("input", { type: opts.type || "text", dir: opts.dir || "auto", placeholder: opts.ph || null, autocomplete: opts.ac || "off", value, oninput: (e) => { on(e.target.value); commit(); } }));
  const lineList = (key, label, ph) => field(label, S[key].join("\n"), (v) => { S[key] = lines(v); }, { rows: 5, ph, wide: true });

  function renderEditor() {
    const pane = $("st-edit");
    const sec = current.sec;
    const head = h("div", { class: "st-edit-head" }, icon(ICONS[sec]), h("h2", null, NAMES[sec]));
    const body = h("div", { class: "st-edit-body" });
    const P = S.personal;
    if (sec === "personal") {
      body.append(h("div", { class: "st-fields" },
        field(L("الاسم الكامل", "Full name"), P.name, (v) => { P.name = v; }, { ac: "name" }),
        field(L("المسمى الذي تستهدفه", "Target title"), P.headline, (v) => { P.headline = v; }, { ph: S.lang === "ar" ? "محلل بيانات" : "Data Analyst" }),
        field(L("البريد", "Email"), P.email, (v) => { P.email = v; }, { type: "email", dir: "ltr", ac: "email" }),
        field(L("الجوال", "Phone"), P.phone, (v) => { P.phone = v; }, { type: "tel", dir: "ltr", ac: "tel", ph: "+966 5x xxx xxxx" }),
        field(L("المدينة", "City"), P.city, (v) => { P.city = v; }, { ac: "address-level2" }),
        field("LinkedIn", P.link, (v) => { P.link = v; }, { dir: "ltr", ph: "linkedin.com/in/…" })),
      h("p", { class: "st-hint" }, L("بيانات التواصل تبقى في متصفحك، وتظهر في متن الصفحة لا في الترويسة، لأن أنظمة الفرز لا تقرأ الترويسة.",
        "Contact details stay in your browser and sit in the page body, not the header, which screening systems skip.")));
    } else if (sec === "summary") {
      const words = S.summary.trim().split(/\s+/).filter(Boolean).length;
      const meter = h("p", { class: `st-hint st-count${words > 80 ? " warn" : ""}` });
      const paintCount = (t) => {
        const n = t.trim().split(/\s+/).filter(Boolean).length;
        meter.textContent = L(`${n} كلمة. الأفضل بين 30 و70.`, `${n} words. Best between 30 and 70.`);
        meter.classList.toggle("warn", n > 80);
      };
      paintCount(S.summary);
      body.append(field(L("نبذتك", "Your summary"), S.summary, (v) => { S.summary = v; }, { rows: 6, wide: true, after: paintCount }), meter,
        summaryWizard());
    } else if (["experience", "projects", "education"].includes(sec)) {
      body.append(itemsEditor(sec));
    } else if (sec === "skills") {
      body.append(skillsEditor());
    } else if (sec === "certificates") {
      body.append(lineList("certificates", L("كل شهادة أو دورة في سطر، مع الجهة والسنة", "One a line, with the issuer and year"), "Google Data Analytics, Coursera, 2025"));
    } else if (sec === "languages") {
      body.append(lineList("languages", L("كل لغة في سطر، ومستواك بين قوسين", "One a line, your level in brackets"), S.lang === "ar" ? "العربية (الأم)\nالإنجليزية (متقدم)" : "Arabic (native)\nEnglish (fluent)"));
    } else if (sec === "additional") {
      body.append(lineList("additional", L("كل معلومة في سطر", "One a line"), S.lang === "ar" ? "إقامة قابلة للنقل\nمتاح للبدء فوراً" : "Transferable iqama\nAvailable immediately"),
        h("p", { class: "st-hint" }, L("ما يسأل عنه صاحب العمل في الخليج: الإقامة، متى تبدأ، الانتقال لمدينة أخرى، رخصة القيادة.",
          "What Gulf employers ask: work status, start date, relocation, driving licence.")));
    }
    if (sec !== "personal") {
      const hidden = S.hidden.includes(sec);
      head.append(h("button", { type: "button", class: "st-mini st-hide", "aria-pressed": String(hidden),
        onclick: () => { S.hidden = hidden ? S.hidden.filter((x) => x !== sec) : [...S.hidden, sec]; commit({ now: true, editor: true, design: true }); } },
      hidden ? L("مخفي، أظهره", "Hidden, show it") : L("أخفِ القسم", "Hide section")));
    }
    // next / previous section, so the editor walks the whole CV like a form
    const all = ["personal", ...S.order];
    const at = all.indexOf(sec);
    const nav = h("div", { class: "st-edit-nav" },
      at > 0 ? h("button", { type: "button", class: "btn btn-quiet btn-small", onclick: () => select(all[at - 1]) }, L(`السابق: ${NAMES[all[at - 1]]}`, `Back: ${NAMES[all[at - 1]]}`)) : h("span"),
      at < all.length - 1 ? h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => { select(all[at + 1]); $("st-edit").scrollTop = 0; } }, L(`التالي: ${NAMES[all[at + 1]]}`, `Next: ${NAMES[all[at + 1]]}`))
        : h("a", { class: "btn btn-primary btn-small", href: "cv.html", onclick: () => { touched = true; save(); } }, L("جهّزها لوظيفة", "Tailor to a job")));
    pane.replaceChildren(head, body, nav);
    if (lastSec !== sec) play(body, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
    lastSec = sec;
  }
  let lastSec = "";

  // experience / projects / education: cards, one open at a time
  const BLANK_ITEM = {
    experience: () => ({ title: "", org: "", location: "", dates: "", bullets: [] }),
    projects: () => ({ name: "", tools: "", dates: "", link: "", bullets: [] }),
    education: () => ({ school: "", degree: "", major: "", dates: "", gpa: "" }),
  };
  function itemsEditor(sec) {
    const items = S[sec];
    const box = h("div", { class: "st-items" });
    const titleOf = (x) => (sec === "experience" ? [x.title, x.org].filter(Boolean).join(" - ")
      : sec === "projects" ? x.name : [x.degree, x.major, x.school].filter(Boolean).join(" - ")) || L("بدون عنوان", "Untitled");
    items.forEach((x, i) => {
      const open = current.i === i;
      const card = h("div", { class: `st-item${open ? " open" : ""}` });
      card.append(h("div", { class: "st-item-head" },
        h("button", { type: "button", class: "st-item-title", "aria-expanded": String(open), onclick: () => { current.i = open ? -1 : i; renderEditor(); } },
          h("span", null, titleOf(x)), x.dates ? h("small", null, x.dates) : null),
        h("button", { type: "button", class: "st-mini", "aria-label": L("لأعلى", "Move up"), disabled: i === 0,
          onclick: () => { items.splice(i - 1, 0, items.splice(i, 1)[0]); current.i = i - 1; commit({ now: true, editor: true }); } }, icon("M14 28l10-10 10 10")),
        h("button", { type: "button", class: "st-mini", "aria-label": L("احذف", "Delete"),
          onclick: () => { items.splice(i, 1); current.i = -1; commit({ now: true, editor: true, design: true }); toast(L("حُذف. تراجع بـ Ctrl+Z", "Deleted. Undo with Ctrl+Z")); } },
        icon("M12 14h24M20 14V9h8v5M15 14l2 26h14l2-26"))));
      if (open) {
        const f = h("div", { class: "st-fields" });
        if (sec === "experience") f.append(
          field(L("المسمى", "Title"), x.title, (v) => { x.title = v; }, { ph: S.lang === "ar" ? "متدرب تحليل بيانات" : "Data Analyst Intern" }),
          field(L("الجهة", "Organization"), x.org, (v) => { x.org = v; }),
          field(L("المدينة", "City"), x.location, (v) => { x.location = v; }),
          field(L("المدة", "Dates"), x.dates, (v) => { x.dates = v; }, { ph: S.lang === "ar" ? "يونيو 2025 - أغسطس 2025" : "Jun 2025 - Aug 2025" }));
        if (sec === "projects") f.append(
          field(L("اسم المشروع", "Project name"), x.name, (v) => { x.name = v; }),
          field(L("الأدوات", "Tools"), x.tools, (v) => { x.tools = v; }, { ph: "Python, SQL" }),
          field(L("المدة", "Dates"), x.dates, (v) => { x.dates = v; }),
          field(L("رابط (GitHub أو عرض)", "Link (GitHub or demo)"), x.link, (v) => { x.link = v; }, { dir: "ltr" }));
        if (sec === "education") f.append(
          field(L("الجامعة", "University"), x.school, (v) => { x.school = v; }),
          field(L("الدرجة", "Degree"), x.degree, (v) => { x.degree = v; }, { ph: S.lang === "ar" ? "بكالوريوس" : "B.Sc." }),
          field(L("التخصص", "Major"), x.major, (v) => { x.major = v; }),
          field(L("سنوات الدراسة", "Years"), x.dates, (v) => { x.dates = v; }, { dir: "ltr", ph: "2022 - 2026" }),
          field(L("المعدل (اختياري)", "GPA (optional)"), x.gpa, (v) => { x.gpa = v; }, { dir: "ltr", ph: "4.2 / 5" }));
        card.append(f);
        if (sec !== "education") card.append(bulletsEditor(x));
        else card.append(h("p", { class: "st-hint" }, L("نصيحة المسؤولين: اكتب المعدل إذا كان 3.75 من 5 أو 3 من 4 أو أعلى، وإلا اتركه.",
          "Recruiters' advice: show a GPA of 3.75/5 or 3/4 and above; otherwise leave it off.")));
      }
      box.append(card);
    });
    box.append(h("button", { type: "button", class: "btn btn-quiet st-add", onclick: () => {
      items.push(BLANK_ITEM[sec]());
      current.i = items.length - 1;
      commit({ now: true, editor: true, design: true });
      $("st-edit").querySelector(".st-item.open input")?.focus();
    } }, icon("M24 10v28M10 24h28"), {
      experience: L("أضف خبرة", "Add experience"), projects: L("أضف مشروعاً", "Add a project"), education: L("أضف تعليماً", "Add education") }[sec]));
    return box;
  }

  // points: a line each, checked live against the ATS content rules, plus a
  // three-question flow that writes one
  function bulletsEditor(x) {
    const wrap = h("div", { class: "st-bullets" });
    const coach = h("ul", { class: "st-coach", "aria-live": "polite" });
    const paint = () => {
      coach.replaceChildren(...x.bullets.map((b) => {
        const num = MasarATS.hasResult(b), verb = MasarATS.leadsWithVerb(b);
        MasarATS.WEAK.lastIndex = 0;
        const weak = MasarATS.WEAK.test(b);
        const long = b.split(/\s+/).length > 35;
        const ok = num && verb && !weak && !long;
        return h("li", { class: ok ? "ok" : "" }, h("span", { class: "st-coach-text", dir: "auto" }, b),
          h("span", { class: "st-tags" },
            h("i", { class: verb ? "y" : "n" }, verb ? L("فعل ✓", "Verb ✓") : L("ابدأ بفعل", "Start with a verb")),
            h("i", { class: num ? "y" : "n" }, num ? L("رقم ✓", "Number ✓") : L("أضف رقماً", "Add a number")),
            weak ? h("i", { class: "n" }, L("عبارة مهام", "Duty phrase")) : null,
            long ? h("i", { class: "n" }, L("طويلة", "Too long")) : null));
      }));
    };
    const ta = field(L("ما أنجزته، كل نقطة في سطر", "What you achieved, one point a line"), x.bullets.join("\n"), (v) => { x.bullets = lines(v); },
      { rows: 5, wide: true, after: paint, ph: S.lang === "ar" ? "حلّلت بيانات 3,000 عميل بـ SQL، فرفعت دقة التقرير 20٪" : "Analyzed 3,000 customer records in SQL, raising report accuracy by 20%" });
    paint();
    wrap.append(ta, coach, bulletWizard(x, ta.querySelector("textarea"), paint));
    return wrap;
  }

  function bulletWizard(x, textarea, paint) {
    const traits = (S.style?.traits?.length ? S.style.traits : ["analytical", "learner"]);
    const own = (S.style?.voice?.[S.lang === "ar" ? "verbs_ar" : "verbs_en"]) || [];
    const verbs = [...new Set([...own, ...traits.flatMap((t) => VERBS[t]).map(([a, e]) => (S.lang === "ar" ? a : e))])].slice(0, 8);
    const st = { verb: verbs[0], what: "", tool: "", result: "" };
    const out = h("p", { class: "st-wiz-out", dir: "auto" });
    const compose = () => {
      if (!st.what.trim()) return "";
      const ar = S.lang === "ar";
      return `${st.verb} ${st.what.trim()}${st.tool.trim() ? (ar ? ` باستخدام ${st.tool.trim()}` : ` using ${st.tool.trim()}`) : ""}${st.result.trim() ? `${ar ? "، " : ", "}${st.result.trim()}` : ""}`;
    };
    const paintOut = () => {
      const t = compose();
      out.textContent = t || L("اكتب ماذا عملت لترى النقطة هنا.", "Say what you did to see the point here.");
      add.disabled = !t;
    };
    const chips = h("div", { class: "st-chips", role: "radiogroup", "aria-label": L("الفعل", "Verb") });
    const paintChips = () => chips.replaceChildren(...verbs.map((v) => h("button", { type: "button", role: "radio", class: "st-chip", "aria-checked": String(st.verb === v),
      onclick: () => { st.verb = v; paintChips(); paintOut(); } }, v)));
    paintChips();
    const q = (n, text, input) => h("div", { class: "st-q" }, h("span", { class: "st-q-n" }, n), h("div", null, h("p", null, text), input));
    const inp = (key, ph) => h("input", { type: "text", dir: "auto", placeholder: ph, oninput: (e) => { st[key] = e.target.value; paintOut(); } });
    const add = h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => {
      const t = compose();
      if (!t) return;
      x.bullets.push(t);
      textarea.value = x.bullets.join("\n");
      paint();
      commit({ now: true });
      details.querySelectorAll("input").forEach((i) => { i.value = ""; });
      Object.assign(st, { what: "", tool: "", result: "" });
      paintOut();
      toast(L("أُضيفت النقطة", "Point added"));
    } }, L("أضف النقطة", "Add the point"));
    const ar = S.lang === "ar";
    const details = h("details", { class: "st-wiz" },
      h("summary", null, icon("M24 6l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z"), L("اكتب نقطة قوية بثلاثة أسئلة", "Write a strong point in three questions")),
      q("١", L("ماذا عملت؟ اختر فعلاً ثم اكتب على ماذا", "What did you do? Pick a verb, then say on what"), h("div", null, chips, inp("what", ar ? "بيانات المبيعات الشهرية لـ 12 فرعاً" : "monthly sales data for 12 branches"))),
      q("٢", L("بأي أداة أو طريقة؟ (اختياري)", "With which tool or method? (optional)"), inp("tool", ar ? "Excel وPower BI" : "Excel and Power BI")),
      q("٣", L("ماذا تغيّر بعدها؟ النتيجة برقم إن أمكن", "What changed after? The result, with a number if you can"),
        inp("result", ar ? "فاختصرت إعداد التقرير من يومين إلى ساعتين" : "cutting report time from two days to two hours")),
      h("div", { class: "st-wiz-foot" }, out, add));
    paintOut();
    return details;
  }

  function skillsEditor() {
    const wrap = h("div", { class: "st-skills" });
    const chips = h("div", { class: "st-chips st-mine" });
    const sugg = h("div", { class: "st-chips" });
    const paint = () => {
      chips.replaceChildren(...S.skills.map((s, i) => h("span", { class: "st-chip on" }, s,
        h("button", { type: "button", "aria-label": L(`احذف ${s}`, `Remove ${s}`), onclick: () => { S.skills.splice(i, 1); commit({ now: true, design: true }); paint(); } }, "×"))));
      const field = S.style?.field || "other";
      const have = new Set(S.skills.map((s) => s.toLowerCase()));
      sugg.replaceChildren(...[...SKILLS_BY_FIELD[field], ...(field === "other" ? [] : SKILLS_BY_FIELD.other)].filter((s) => !have.has(s.toLowerCase())).slice(0, 12)
        .map((s) => h("button", { type: "button", class: "st-chip", onclick: () => { S.skills.push(s); commit({ now: true, design: true }); paint(); } }, `+ ${s}`)));
      count.textContent = L(`${S.skills.length} مهارة. الهدف ست على الأقل، الأدوات أولاً.`, `${S.skills.length} skills. Aim for six or more, tools first.`);
      count.classList.toggle("warn", S.skills.length < 6);
    };
    const count = h("p", { class: "st-hint st-count" });
    const input = h("input", { type: "text", dir: "auto", placeholder: L("اكتب مهارة واضغط Enter", "Type a skill and press Enter"), "aria-label": L("أضف مهارة", "Add a skill"),
      onkeydown: (e) => {
        if (e.key !== "Enter" && e.key !== ",") return;
        e.preventDefault();
        const v = e.target.value.replace(/[,،]/g, "").trim();
        if (v && !S.skills.some((s) => s.toLowerCase() === v.toLowerCase())) { S.skills.push(v); commit({ now: true, design: true }); }
        e.target.value = "";
        paint();
      } });
    paint();
    wrap.append(h("label", { class: "st-field wide" }, h("span", null, L("مهاراتك", "Your skills")), input), chips, count,
      h("p", { class: "st-sub" }, S.style?.field ? L("مقترحة لمجالك:", "Suggested for your field:") : L("مقترحة (اعرف أسلوبك لتخصيصها):", "Suggested (find your style to tailor them):")), sugg);
    return wrap;
  }

  // the summary in five answers, written the way recruiters ask: who you are,
  // what you aim for, what you are good at, one proof, what you are like
  function summaryWizard() {
    const sty = S.style || {};
    const st = { stage: sty.stage || "student", target: S.personal.headline, skills: S.skills.slice(0, 3), ach: "", traits: (sty.traits || []).slice(0, 2), form: sty.form || "m" };
    const ar = () => S.lang === "ar";
    const out = h("p", { class: "st-wiz-out", dir: "auto" });
    const write = () => {
      const e = S.education[0] || {};
      const major = (e.major || "").trim(), school = (e.school || "").trim(), f = st.form === "f";
      const list = (a) => (a.length < 2 ? a.join("") : ar() ? `${a.slice(0, -1).join("، ")} و${a.at(-1)}` : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
      if (ar()) {
        const who = {
          student: `${f ? "طالبة" : "طالب"} ${major || "جامعي"}${major && f ? "" : ""}${school ? ` في ${school}` : ""}`,
          fresh: `${f ? "خريجة" : "خريج"} ${major ? `${major} ` : ""}حديث${f ? "ة" : ""}${school ? ` من ${school}` : ""}`,
          junior: `${f ? "متخصصة" : "متخصص"}${major ? ` في ${major}` : ""} بخبرة من سنة إلى ثلاث سنوات`,
          senior: `${f ? "متخصصة" : "متخصص"}${major ? ` في ${major}` : ""} بخبرة تزيد على ثلاث سنوات`,
        }[st.stage];
        const s = [`${who}${st.target ? `، ${f ? "تستهدف" : "يستهدف"} دور ${st.target}` : ""}.`];
        if (st.skills.length) s.push(`${f ? "تجيد" : "يجيد"} ${list(st.skills)}.`);
        if (st.ach.trim()) s.push(`من ${f ? "إنجازاتها" : "إنجازاته"}: ${st.ach.trim().replace(/[.。]$/, "")}.`);
        if (st.traits.length) s.push(`${f ? "تتميّز" : "يتميّز"} ${st.traits.map((t) => `ب${TRAITS[t][1]}`).join("، و")}.`);
        return s.join(" ");
      }
      const M = major ? major.replace(/^[a-z]/, (c) => c.toUpperCase()) : "";
      const who = {
        student: `${M ? `${M} student` : "University student"}${school ? ` at ${school}` : ""}`,
        fresh: `Recent ${M ? `${M} ` : ""}graduate${school ? ` of ${school}` : ""}`,
        junior: `${M ? `${M} professional` : "Professional"} with 1-3 years of experience`,
        senior: `${M ? `${M} professional` : "Professional"} with over 3 years of experience`,
      }[st.stage];
      const s = [`${who}${st.target ? `, targeting a ${st.target} role` : ""}.`];
      if (st.skills.length) s.push(`Skilled in ${list(st.skills)}.`);
      if (st.ach.trim()) s.push(`${st.ach.trim().replace(/^[a-z]/, (c) => c.toUpperCase()).replace(/\.$/, "")}.`);
      st.traits.forEach((t) => s.push(TRAITS[t][2]));
      return s.join(" ");
    };
    let voiced = "";
    const paint = () => { voiced = ""; out.textContent = write(); };
    const pick = (opts, key, max) => {
      const box = h("div", { class: "st-chips" });
      const draw = () => box.replaceChildren(...opts.map(([v, label]) => {
        const on = max ? st[key].includes(v) : st[key] === v;
        return h("button", { type: "button", class: "st-chip", "aria-pressed": String(on), onclick: () => {
          if (!max) st[key] = v;
          else st[key] = on ? st[key].filter((x) => x !== v) : [...st[key], v].slice(-max);
          draw(); paint();
        } }, label);
      }));
      draw();
      return box;
    };
    const q = (n, text, input) => h("div", { class: "st-q" }, h("span", { class: "st-q-n" }, n), h("div", null, h("p", null, text), input));
    const STAGES = [["student", L("طالب", "Student")], ["fresh", L("حديث تخرّج", "New graduate")], ["junior", L("خبرة 1-3", "1-3 years")], ["senior", L("خبرة +3", "3+ years")]];
    const skillOpts = (S.skills.length ? S.skills : SKILLS_BY_FIELD[sty.field || "other"]).slice(0, 10).map((s) => [s, s]);
    const details = h("details", { class: "st-wiz", open: !S.summary.trim() || null },
      h("summary", null, icon("M24 6l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z"), L("اكتب نبذتي بالأسئلة", "Write my summary from questions")),
      q("١", L("وين وصلت؟", "Where are you now?"), pick(STAGES, "stage")),
      q("٢", L("الدور الذي تستهدفه", "The role you aim for"), h("input", { type: "text", dir: "auto", value: st.target, placeholder: ar() ? "محلل بيانات" : "Data Analyst",
        oninput: (e) => { st.target = e.target.value; paint(); } })),
      q("٣", L("أقوى ثلاث مهارات عندك", "Your three strongest skills"), pick(skillOpts, "skills", 3)),
      q("٤", L("إنجاز واحد تفتخر به، برقم إن أمكن (اختياري)", "One thing you're proud of, with a number if you can (optional)"),
        h("input", { type: "text", dir: "auto", placeholder: ar() ? "لوحة مبيعات اختصرت التقرير الأسبوعي من يومين إلى ساعتين" : "Built a sales dashboard that cut the weekly report from two days to two hours",
          oninput: (e) => { st.ach = e.target.value; paint(); } })),
      q("٥", L("ماذا يميّزك؟ اختر اثنين", "What sets you apart? Pick two"), pick(Object.entries(TRAITS).map(([k, v]) => [k, v[0]]), "traits", 2)),
      ar() ? q("٦", L("صيغة الكتابة", "Wording"), pick([["m", "مذكّر"], ["f", "مؤنّث"]], "form")) : null,
      S.voiceSample ? h("div", { class: "st-wiz-foot st-wiz-voice" },
        h("p", { class: "st-hint" }, L("أو خلّينا نكتبها بأسلوبك أنت، من الكلام اللي كتبته لنا.", "Or let us write it in your own voice, from what you wrote us.")),
        h("button", { type: "button", class: "btn btn-quiet btn-small", onclick: async (e) => {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = L("نكتبها بأسلوبك…", "Writing in your voice…");
          const v = await readVoice(S.voiceSample, true, st.form);
          b.disabled = false;
          b.textContent = L("اكتبها بأسلوبي", "Write it in my voice");
          if (v.summary) { out.textContent = v.summary; voiced = v.summary; }
          else toast(v.local ? L("ما قدرنا نوصل للخادم الآن. جرّب بعد شوي.", "Couldn't reach the server. Try again shortly.")
            : L("نحتاج معلومات أكثر في سيرتك لنكتبها بأسلوبك.", "We need more in your CV to write it in your voice."));
        } }, L("اكتبها بأسلوبي", "Write it in my voice"))) : null,
      h("div", { class: "st-wiz-foot" }, out, h("button", { type: "button", class: "btn btn-primary btn-small", onclick: () => {
        S.summary = voiced || write();
        if (st.target && !S.personal.headline) S.personal.headline = st.target;
        S.style = { ...(S.style || {}), stage: st.stage, traits: st.traits, form: st.form };
        writeMe({ style: S.style, styleAsked: true });
        commit({ now: true, editor: true, design: true });
        toast(L("كتبنا نبذتك. عدّل فيها ما شئت.", "Summary written. Edit it as you like."));
      } }, L("استخدم هذه النبذة", "Use this summary"))));
    paint();
    return details;
  }

  // ---------- the style quiz ----------
  const QUIZ = [
    { id: "stage", q: L("وين وصلت؟", "Where are you now?"), opts: [
      ["student", L("طالب", "Student"), L("أدرس، أو في التدريب التعاوني", "Studying, or in co-op")],
      ["fresh", L("حديث تخرّج", "New graduate"), L("تخرّجت خلال آخر سنتين", "Graduated in the last two years")],
      ["junior", L("خبرة 1-3 سنوات", "1-3 years in"), L("اشتغلت بعد التخرّج", "Working since graduating")],
      ["senior", L("أكثر من 3 سنوات", "3+ years"), L("خبرة أطول", "A longer track record")]] },
    { id: "field", q: L("أي مجال؟", "Which field?"), opts: [
      ["data", L("البيانات", "Data"), "SQL, Power BI"], ["tech", L("التقنية والبرمجة", "Tech and software"), "JavaScript, Python"],
      ["finance", L("المالية والمحاسبة", "Finance and accounting"), "Excel, SAP"], ["engineering", L("الهندسة", "Engineering"), "AutoCAD, Primavera"],
      ["marketing", L("التسويق", "Marketing"), "SEO, Meta Ads"], ["hr", L("الموارد البشرية", "HR"), L("التوظيف، الرواتب", "Recruiting, payroll")],
      ["other", L("مجال آخر", "Something else"), ""]] },
    { id: "target", q: L("وين تقدّم غالباً؟", "Where do you mostly apply?"), opts: [
      ["gov", L("جهات حكومية وشركات كبرى", "Government and large firms"), L("أرامكو، سابك، الوزارات", "Aramco, SABIC, ministries")],
      ["corp", L("شركات خاصة", "Private companies"), L("بنوك، اتصالات، تجزئة", "Banks, telecom, retail")],
      ["startup", L("شركات ناشئة", "Startups"), L("تقنية وتطبيقات", "Tech and apps")],
      ["global", L("شركات عالمية أو عن بُعد", "Global or remote"), L("التقديم بالإنجليزي", "Applying in English")]] },
    { id: "traits", multi: 2, q: L("ماذا يصفك أكثر؟ اختر اثنين", "What describes you best? Pick two"), opts: Object.entries(TRAITS).map(([k, v]) => [k, v[0], ""]) },
    { id: "lang", q: L("بأي لغة سيرتك؟", "Which language for your CV?"), opts: [
      ["ar", "العربية", L("للجهات المحلية", "For local employers")], ["en", "English", L("الأغلب في الخليج", "Most common in the Gulf")]] },
    { id: "length", q: L("كم تريدها؟", "How long?"), opts: [
      ["one", L("صفحة واحدة مركّزة", "One focused page"), L("ينصح بها لطالب أو حديث تخرّج", "Advised for students and new grads")],
      ["full", L("مفصّلة", "Detailed"), L("عندي خبرات ومشاريع كثيرة", "I have a lot to show")]] },
    { id: "form", when: (a) => a.lang === "ar", q: L("صيغة الكتابة بالعربي", "Arabic wording"), opts: [["m", "مذكّر", ""], ["f", "مؤنّث", ""]] },
    { id: "voice", free: true, q: L("اختياري: احكيلنا بكلامك", "Optional: tell us in your own words"), opts: [] },
  ];
  function recommend(a) {
    const traits = a.traits || [];
    const template = a.target === "gov" ? "classic" : a.target === "global" ? "minimal"
      : a.target === "startup" ? "modern" : traits.includes("creative") ? "elegant" : "pro";
    const tpl = TEMPLATES.find((t) => t[0] === template);
    const early = a.stage === "student" || a.stage === "fresh";
    const why = [
      [L(`القالب: ${tpl[1]}`, `Template: ${tpl[1]}`), {
        classic: L("الجهات الحكومية والشركات الكبرى تفضّل الشكل الرسمي الهادئ.", "Government and large firms prefer a calm, formal look."),
        minimal: L("الشركات العالمية تحب الصفحة النظيفة والمساحة البيضاء.", "Global firms like a clean page with white space."),
        modern: L("الشركات الناشئة ترحّب بلمسة لون واضحة.", "Startups welcome a clear touch of colour."),
        pro: L("شريط بلونك يعطي الشركات الخاصة انطباعاً مرتّباً.", "A band of colour reads organised to private companies."),
        elegant: L("أسلوبك الإبداعي يظهر في عناوين أنيقة دون أن يربك أنظمة الفرز.", "Your creative side shows in elegant headings without confusing screening systems."),
      }[template]],
      [L("الترتيب", "Order"), early ? L("التعليم والمشاريع أولاً، لأنها أقوى ما عندك الآن.", "Education and projects first: your strongest proof right now.")
        : L("الخبرات أولاً، لأنها أول ما يبحث عنه المسؤول.", "Experience first: it is what recruiters look for first.")],
      [L("الطول", "Length"), a.length === "one" ? L("صفحة واحدة بمسافات مضغوطة.", "One page, tight spacing.") : L("مسافات عادية، وصفحتان مقبولتان مع الخبرة.", "Normal spacing; two pages are fine with experience.")],
      [L("الكلمات", "Words"), a.voice?.verbs_ar?.length ? L(`من كلامك: ${a.voice.verbs_ar.slice(0, 4).join("، ")}${a.voice.words?.length ? `، وكلماتك: ${a.voice.words.slice(0, 3).join("، ")}` : ""}.`,
        `From how you talk: ${a.voice.verbs_en.slice(0, 4).join(", ")}${a.voice.words?.length ? `; your words: ${a.voice.words.slice(0, 3).join(", ")}` : ""}.`) : traits.length ? L(`أفعال تناسبك: ${traits.flatMap((t) => VERBS[t].slice(0, 2).map((v) => v[0])).join("، ")}.`, `Verbs that fit you: ${traits.flatMap((t) => VERBS[t].slice(0, 2).map((v) => v[1])).join(", ")}.`)
        : L("أفعال عامة قوية في كل نقطة.", "Strong general verbs in each point.")],
    ];
    return {
      template, why,
      accent: FIELD_ACCENT[a.field || "other"],
      font: a.target === "gov" || template === "elegant" ? "serif" : "sans",
      density: a.length === "one" ? "tight" : "normal",
      order: early ? ORDER_STUDENT : ORDER_WORK,
      lang: a.lang || S.lang,
    };
  }
  function styleLine(st) {
    const stage = QUIZ[0].opts.find((o) => o[0] === st.stage)?.[1];
    const field = QUIZ[1].opts.find((o) => o[0] === st.field)?.[1];
    const traits = (st.traits || []).map((t) => TRAITS[t][0]).join(L(" و", " & "));
    return [stage, field, traits].filter(Boolean).join(L("، ", ", "));
  }
  const dlg = $("st-quiz");
  let answers = {}, step = 0;
  function openQuiz(welcome) {
    answers = { ...(S.style || {}) };
    step = welcome ? -1 : 0;
    paintQuiz();
    if (!dlg.open) dlg.showModal();
  }
  const steps = () => QUIZ.filter((q) => !q.when || q.when(answers));
  let dir = 1, demo = 0;
  const go = (to) => { dir = to >= step ? 1 : -1; step = to; paintQuiz(); };
  function enter() {
    const box = dlg.querySelector(".st-quiz-in");
    const x = (document.dir === "rtl" ? -1 : 1) * dir * 28;
    play(box.querySelector("h2"), [{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: "none" }], { duration: 360 });
    box.querySelectorAll(".st-opt, .st-result dl > *, .st-result-grid .tpl-thumb i").forEach((n, i) =>
      play(n, [{ opacity: 0, transform: "translateY(10px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 340, delay: 60 + i * 45 }));
  }
  function paintQuiz() {
    clearInterval(demo);
    const list = steps();
    const close = h("button", { type: "button", class: "st-x", "aria-label": L("إغلاق", "Close"), onclick: () => dlg.close() }, "×");
    if (step === -1) {
      dlg.replaceChildren(close, h("div", { class: "st-quiz-in st-welcome" },
        h("div", { class: "st-show", "aria-hidden": "true" },
          ["classic", "modern", "pro"].map((t, i) => h("span", { class: `tpl-thumb st-show-${i} tpl-${t}`, style: `--accent:${ACCENTS[i * 3]}` },
            h("i", { class: "n" }), h("i", { class: "c" }), h("i", { class: "hd" }), h("i", null), h("i", null), h("i", { class: "s" }), h("i", { class: "hd" }), h("i", null), h("i", { class: "s" }))),
          h("span", { class: "st-quiz-mark" }, icon("M24 6l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z"))),
        h("h2", null, starting ? L("أهلاً بك في مسار", "Welcome to Masar") : L("نصمّم سيرتك على أسلوبك", "A CV designed around you")),
        h("p", null, starting ? L("قبل ما نبدأ: ست أسئلة سريعة نتعرّف فيها عليك، ونجهّز لك سيرة بالقالب واللون والترتيب والكلمات المناسبة لك وللجهة التي تقدّم لها.",
          "Before we start: six quick questions to get to know you, and we set up a CV with the template, colour, order and words that fit you and where you apply.")
          : L("ست أسئلة سريعة، ونختار لك القالب واللون وترتيب الأقسام والكلمات المناسبة لك وللجهة التي تقدّم لها.",
            "Six quick questions, and we pick the template, colour, section order and words that fit you and where you apply.")),
        h("div", { class: "st-quiz-acts" },
          h("button", { type: "button", class: "btn btn-primary", onclick: () => go(0) }, L("ابدأ الأسئلة", "Start the questions")),
          h("button", { type: "button", class: "btn btn-quiet", onclick: () => { writeMe({ styleAsked: true }); dlg.close(); } }, starting ? L("لاحقاً", "Later") : L("أصمّمها بنفسي", "I'll design it myself")))));
      dlg.querySelector(".btn-primary").focus();
      // the middle sheet keeps redesigning itself: every template, every colour
      if (!calm) {
        const mid = dlg.querySelector(".st-show-1"), tpls = TEMPLATES.map((t) => t[0]);
        let k = 0;
        demo = setInterval(() => {
          if (!dlg.open) { clearInterval(demo); return; }
          k += 1;
          mid.className = `tpl-thumb st-show-1 tpl-${tpls[k % tpls.length]}`;
          mid.style.setProperty("--accent", ACCENTS[k % ACCENTS.length]);
          mid.querySelectorAll("i").forEach((n, i) => play(n, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 420, delay: i * 40 }));
        }, 1500);
      }
      return;
    }
    if (step >= list.length) return paintResult();
    const q = list[step];
    if (q.free) return paintVoice(list, q);
    const chosen = q.multi ? (answers[q.id] || []) : answers[q.id];
    const next = h("button", { type: "button", class: "btn btn-primary", disabled: q.multi ? !chosen.length : !chosen, onclick: () => go(step + 1) },
      step === list.length - 1 ? L("اعرض أسلوبي", "Show my style") : L("التالي", "Next"));
    const opts = h("div", { class: `st-opts${q.opts.length > 4 ? " many" : ""}` }, q.opts.map(([v, label, note]) => {
      const on = q.multi ? chosen.includes(v) : chosen === v;
      return h("button", { type: "button", class: "st-opt", "aria-pressed": String(on), onclick: () => {
        if (q.multi) {
          const cur = answers[q.id] || [];
          answers[q.id] = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].slice(-q.multi);
          dir = 0;
          paintQuiz();
        } else {
          answers[q.id] = v;
          dir = 0;
          paintQuiz();
          setTimeout(() => { if (dlg.open && steps()[step] === q) go(step + 1); }, 260);
        }
      } }, h("strong", null, label), note ? h("span", null, note) : null);
    }));
    dlg.replaceChildren(close, h("div", { class: "st-quiz-in" },
      h("div", { class: "st-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(list.length), "aria-valuenow": String(step + 1) },
        h("i", { style: `width:${((step + 1) / list.length) * 100}%` })),
      h("p", { class: "st-step" }, L(`سؤال ${step + 1} من ${list.length}`, `Question ${step + 1} of ${list.length}`)),
      h("h2", null, q.q), opts,
      h("div", { class: "st-quiz-acts" },
        step > 0 ? h("button", { type: "button", class: "btn btn-quiet", onclick: () => go(step - 1) }, L("السابق", "Back")) : h("span"),
        next)));
    (dlg.querySelector(".st-opt[aria-pressed=true]") || dlg.querySelector(".st-opt")).focus();
    if (dir) enter();
    else play(dlg.querySelector(".st-opt[aria-pressed=true]"), [{ transform: "scale(0.95)" }, { transform: "scale(1)" }], { duration: 220 });
  }
  // the free-writing step: type or speak a few lines; mistakes and dialect are welcome
  let prompt = 0;
  function paintVoice(list, q) {
    const [ask, hint] = PROMPTS[prompt % PROMPTS.length];
    const ta = h("textarea", { rows: 6, dir: "auto", class: "st-voice-in", placeholder: hint, value: S.voiceSample || "",
      "aria-label": ask, oninput: () => paintCount() });
    const count = h("p", { class: "st-hint" });
    const paintCount = () => {
      const n = ta.value.trim().split(/\s+/).filter(Boolean).length;
      count.textContent = n < 12 ? L(`${n} كلمة. اكتب 12 كلمة على الأقل، وكل ما زاد كان أدق.`, `${n} words. Write at least 12; more reads better.`)
        : L(`${n} كلمة. ممتاز.`, `${n} words. Great.`);
      read.disabled = n < 12;
    };
    const status = h("p", { class: "st-hint", role: "status" });
    const read = h("button", { type: "button", class: "btn btn-primary", onclick: async () => {
      read.disabled = true;
      status.textContent = L("نقرأ أسلوبك…", "Reading your style…");
      S.voiceSample = ta.value.trim();
      const v = await readVoice(S.voiceSample, true, answers.form, answers.lang);
      answers.voice = { tone: v.tone, traits: v.traits, voice: v.voice, verbs_ar: v.verbs_ar, verbs_en: v.verbs_en, words: v.words, summary: v.summary || "" };
      if (!(answers.traits || []).length && v.traits?.length) answers.traits = v.traits;
      go(step + 1);
    } }, icon("M24 6l4 12h12l-10 8 4 12-10-8-10 8 4-12-10-8h12z"), L("اقرأ أسلوبي", "Read my style"));
    // speaking instead of typing, where the browser can turn speech into text
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    const mic = Rec ? h("button", { type: "button", class: "btn btn-quiet st-mic", "aria-pressed": "false", onclick: () => {
      if (rec) { rec.stop(); return; }
      rec = new Rec();
      rec.lang = (answers.lang || S.lang) === "en" ? "en-US" : "ar-SA";
      rec.interimResults = false;
      rec.continuous = true;
      const base = ta.value;
      let said = "";
      rec.onresult = (e) => {
        said = [...e.results].map((r) => r[0].transcript).join(" ");
        ta.value = `${base}${base && said ? " " : ""}${said}`;
        paintCount();
      };
      rec.onend = () => { rec = null; mic.setAttribute("aria-pressed", "false"); mic.lastChild.textContent = L("احكِ بصوتك", "Speak instead"); };
      rec.onerror = () => { status.textContent = L("ما قدرنا نسمعك. اسمح للمتصفح باستخدام الميكروفون، أو اكتب.", "We couldn't hear you. Allow the microphone, or type."); };
      rec.start();
      mic.setAttribute("aria-pressed", "true");
      mic.lastChild.textContent = L("نسمعك… اضغط للإيقاف", "Listening… press to stop");
    } }, icon("M24 30a6 6 0 0 0 6-6V12a6 6 0 0 0-12 0v12a6 6 0 0 0 6 6zM14 22a10 10 0 0 0 20 0M24 32v8"), h("span", null, L("احكِ بصوتك", "Speak instead"))) : null;
    dlg.replaceChildren(h("button", { type: "button", class: "st-x", "aria-label": L("إغلاق", "Close"), onclick: () => dlg.close() }, "×"),
      h("div", { class: "st-quiz-in st-voice" },
        h("div", { class: "st-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(list.length), "aria-valuenow": String(step + 1) },
          h("i", { style: `width:${((step + 1) / list.length) * 100}%` })),
        h("p", { class: "st-step" }, L(`سؤال ${step + 1} من ${list.length}، اختياري`, `Question ${step + 1} of ${list.length}, optional`)),
        h("h2", null, q.q),
        h("p", { class: "st-voice-ask" }, ask, " ",
          h("button", { type: "button", class: "st-link", onclick: () => { prompt += 1; S.voiceSample = ta.value; paintQuiz(); } }, L("سؤال غيره", "Another question"))),
        ta, count,
        h("p", { class: "st-voice-note" }, L("اكتب على راحتك، الأخطاء الإملائية واللهجة ما بتفرق. نقرأ أسلوبك لنكتب سيرتك بكلامك، والسيرة نفسها تطلع بإملاء سليم.",
          "Write freely: spelling and dialect don't matter. We read your style to write your CV in your words, with correct spelling.")),
        status,
        h("div", { class: "st-quiz-acts" },
          h("button", { type: "button", class: "btn btn-quiet", onclick: () => go(step - 1) }, L("السابق", "Back")),
          h("span", { class: "st-voice-acts" }, mic,
            h("button", { type: "button", class: "btn btn-quiet", onclick: () => go(step + 1) }, L("تخطَّ", "Skip")), read))));
    paintCount();
    if (dir) enter();
    ta.focus();
  }

  function paintResult() {
    const rec = recommend(answers);
    dlg.replaceChildren(h("button", { type: "button", class: "st-x", "aria-label": L("إغلاق", "Close"), onclick: () => dlg.close() }, "×"),
      h("div", { class: "st-quiz-in st-result" },
        h("p", { class: "st-step" }, L("أسلوبك", "Your style")),
        h("h2", null, styleLine(answers)),
        answers.voice?.voice ? h("p", { class: "st-voice-out" }, h("strong", null, L("أسلوبك بالكلام: ", "How you talk: ")), answers.voice.voice,
          answers.voice.tone ? h("span", { class: "st-chip on" }, TONE_NAMES[answers.voice.tone]) : null) : null,
        h("div", { class: "st-result-grid" },
          h("span", { class: `tpl-thumb big tpl-${rec.template}`, style: `--accent:${rec.accent}`, "aria-hidden": "true" },
            h("i", { class: "n" }), h("i", { class: "c" }), h("i", { class: "hd" }), h("i", null), h("i", null), h("i", { class: "s" }), h("i", { class: "hd" }), h("i", null), h("i", { class: "s" })),
          h("dl", null, rec.why.map(([k, v]) => [h("dt", null, k), h("dd", null, v)]))),
        h("div", { class: "st-quiz-acts" },
          h("button", { type: "button", class: "btn btn-quiet", onclick: () => go(0) }, L("غيّر إجاباتي", "Change my answers")),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => {
            Object.assign(S, { template: rec.template, accent: rec.accent, font: rec.font, density: rec.density, lang: rec.lang,
              order: [...rec.order], style: { ...answers } });
            writeMe({ style: { ...answers }, styleAsked: true });
            if (answers.voice?.summary && !S.summary.trim()) S.summary = answers.voice.summary;
            dlg.close();
            buildBar();
            commit({ now: true, design: true });
            select(S.personal.name ? (S.summary.trim() ? "experience" : "summary") : "personal");
            store.set(KEY, JSON.stringify(S));
            toast(L("طبّقنا أسلوبك. الأسئلة داخل كل قسم تكمل الباقي.", "Your style is on. The questions in each section do the rest."));
          } }, L("طبّق أسلوبي", "Apply my style")))));
    dlg.querySelector(".btn-primary").focus();
    dir = 1;
    enter();
  }

  // ---------- phone tabs, zoom, toast ----------
  function tab(name) {
    document.querySelector(".studio").dataset.tab = name;
    document.querySelectorAll(".st-tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    if (name === "preview") requestAnimationFrame(fit);
    const pane = { design: "st-design", edit: "st-edit", preview: "st-preview" }[name];
    if (matchMedia("(max-width: 1023px)").matches) play($(pane), [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 260 });
  }
  function buildTabs() {
    $("st-tabs").replaceChildren(...[["design", L("التصميم", "Design")], ["edit", L("المحتوى", "Content")], ["preview", L("المعاينة", "Preview")]]
      .map(([id, label]) => h("button", { type: "button", role: "tab", "data-tab": id, "aria-selected": "false", onclick: () => tab(id) }, label)));
    tab("edit");
  }
  $("st-zoom-out").onclick = () => { zoom = Math.max(0.3, (zoom || Number(paper.style.transform.match(/[\d.]+/)?.[0] || 1)) - 0.1); fit(); };
  $("st-zoom-in").onclick = () => { zoom = Math.min(1.5, (zoom || Number(paper.style.transform.match(/[\d.]+/)?.[0] || 1)) + 0.1); fit(); };
  $("st-zoom-fit").onclick = () => { zoom = 0; fit(); };
  let toastTimer = 0;
  function toast(text) {
    const t = $("st-toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function renderAll() {
    buildBar();
    renderDesign();
    renderEditor();
    renderPaper();
  }
  $("st-zoom-out").setAttribute("aria-label", L("تصغير", "Zoom out"));
  $("st-zoom-in").setAttribute("aria-label", L("تكبير", "Zoom in"));
  $("st-zoom-fit").title = L("ملء العرض", "Fit to width");
  $("st-break").firstChild.textContent = L("نهاية الصفحة الأولى", "End of page one");
  buildTabs();
  renderAll();
  // a first visit with nothing to show starts with the style questions
  if (firstVisit) store.set(KEY, JSON.stringify(S));
  if (starting || (firstVisit && !S.personal.name && !S.style)) openQuiz(true);
  if (starting) history.replaceState(null, "", location.pathname);
})();
