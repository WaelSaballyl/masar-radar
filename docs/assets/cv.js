// Masar CV builder. The profile lives in this browser (localStorage); the
// worker sees it without the contact fields, and only when asked to read or
// tailor. Everything taken from the worker or a file goes in via textContent.
(() => {
  "use strict";
  const { el, store } = Masar;
  const $ = (id) => document.getElementById(id);
  const API = document.querySelector('meta[name="masar-api"]').content.replace(/\/$/, "");
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const MAMMOTH = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.12.3/mammoth.browser.min.js";
  const GULF = ["SA", "AE", "QA", "KW", "BH", "OM"];
  const ENTRY = ["Intern", "Junior"];
  const KEY = "masar.profile";

  const ERR = {
    offline: "الخدمة غير مفعّلة بعد. نعمل على تشغيلها.",
    rate: "وصلت للحد المسموح في هذه الساعة. جرّب بعد قليل.",
    busy: "الخدمة مشغولة الآن. جرّب بعد دقيقة.",
    too_short: "المعلومات قليلة. أضف مهاراتك وخبراتك أو مشاريعك أولاً.",
    size: "النص طويل جداً. اختصره وجرّب مرة ثانية.",
    type: "نقرأ ملفات PDF وWord (docx) والنص فقط.",
    empty: "لم نجد نصاً في الملف. إذا كانت سيرتك صورة، الصق نصها بدلاً منها.",
    no_job: "اختر إعلاناً أو الصق وصف وظيفة في الخطوة الثانية.",
    other: "تعذّر إكمال الطلب. جرّب مرة ثانية.",
  };
  const fail = (code) => Object.assign(new Error(code), { code });
  const say = (id, text, bad) => { const p = $(id); p.textContent = text; p.classList.toggle("bad", !!bad); };

  Masar.initTheme();

  // ---------- profile ----------

  const form = $("profile");
  const FIELDS = ["name", "email", "phone", "city", "link", "university", "degree", "major",
                  "graduation", "gpa", "skills", "experience", "projects", "certificates", "languages"];
  const CONTACT = ["name", "email", "phone", "city", "link"];

  const readProfile = () => Object.fromEntries(FIELDS.map((f) => [f, form.elements[f].value.trim()]));
  const save = () => store.set(KEY, JSON.stringify(readProfile()));

  function fill(p, onlyEmpty) {
    FIELDS.forEach((f) => {
      let v = p[f];
      if (Array.isArray(v)) v = v.join(f === "certificates" ? "\n" : ", ");
      if (typeof v !== "string" || !v.trim()) return;
      if (onlyEmpty && form.elements[f].value.trim()) return;
      form.elements[f].value = v.trim();
    });
    save();
  }

  try { fill(JSON.parse(store.get(KEY) || "{}")); } catch { /* ignore a damaged copy */ }
  form.addEventListener("input", save);
  $("clear").addEventListener("click", () => {
    if (!confirm("نمسح كل معلوماتك من هذا المتصفح؟")) return;
    form.reset();
    store.set(KEY, "{}");
  });

  // Contact details are found here, kept here, and cut out of anything sent.
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github)\.com\/\S+/gi;
  const PHONE = /(?:\+|00)?\d[\d\s()\-]{7,}\d/g;
  const isPhone = (s) => s.replace(/\D/g, "").length >= 9; // a year range has 8 digits

  function stripContact(text, p) {
    let t = text.replace(EMAIL, " ").replace(LINK, " ").replace(PHONE, (m) => (isPhone(m) ? " " : m));
    if (p.name) t = t.split(p.name).join(" ");
    return t;
  }

  function contactFrom(text) {
    const phone = (text.match(PHONE) || []).find(isPhone);
    const first = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
    const name = first.split(/\s+/).length <= 5 && !/[\d@:|]/.test(first) ? first : "";
    return { name, email: (text.match(EMAIL) || [])[0], phone: phone && phone.trim(),
             link: (text.match(LINK) || [])[0] };
  }

  const withoutContact = (p) => Object.fromEntries(
    FIELDS.filter((f) => !CONTACT.includes(f)).map((f) => [f, stripContact(p[f], p)]));

  // ---------- reading an existing CV ----------

  const loaded = {};
  const load = (src) => (loaded[src] ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => no(fail("other"));
    document.head.append(s);
  }));

  async function fileText(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext === "txt") return file.text();
    if (ext === "pdf") {
      await load(PDFJS);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      // isEvalSupported:false closes the font-compilation hole in pdf.js 3.x
      const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
      const pages = [];
      for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
        const { items } = await (await doc.getPage(i)).getTextContent();
        pages.push(items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join(""));
      }
      return pages.join("\n");
    }
    if (ext === "docx") {
      await load(MAMMOTH);
      return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
    }
    throw fail("type");
  }

  async function api(path, body) {
    if (!API) throw fail("offline");
    let r;
    try {
      r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" },
                                   body: JSON.stringify(body) });
    } catch { throw fail("other"); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(data.error in ERR ? data.error : "other");
    return data;
  }

  $("read-cv").addEventListener("click", async () => {
    const button = $("read-cv");
    button.disabled = true;
    try {
      const file = $("cv-file").files[0];
      say("import-status", "نقرأ سيرتك…");
      const text = (file ? await fileText(file) : $("cv-text").value).trim();
      if (!text) throw fail(file ? "empty" : "too_short");
      fill(contactFrom(text), true);
      const { profile } = await api("/parse", { text: stripContact(text, readProfile()) });
      fill(profile);
      say("import-status", "عبّأنا الحقول من سيرتك. راجعها وصحّح ما يلزم قبل المتابعة.");
    } catch (e) {
      say("import-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });
  $("cv-file").addEventListener("change", (e) => {
    e.target.nextElementSibling.textContent = e.target.files[0]?.name || "اختر ملف PDF أو Word";
  });

  // ---------- choosing the posting ----------

  let postings = [];
  const source = () => document.querySelector('input[name="source"]:checked').value;

  function renderPicker() {
    const q = $("job-search").value.trim().toLowerCase();
    const groups = [["السعودية والخليج", true], ["خارج الخليج وعن بُعد", false]].map(([label, gulf]) => {
      const g = el("optgroup");
      g.label = label;
      postings.filter((p) => p.gulf === gulf && (!q || `${p.title} ${p.company}`.toLowerCase().includes(q)))
        .forEach((p) => { const o = el("option", null, `${p.title}، ${p.company}`); o.value = p.i; g.append(o); });
      return g;
    });
    $("job-pick").replaceChildren(...groups.filter((g) => g.children.length));
    showNeeds();
  }

  const picked = () => postings.find((p) => String(p.i) === $("job-pick").value);

  function showNeeds() {
    const p = picked();
    const req = p ? p.skills.filter((s) => s[1]).map((s) => s[0]) : [];
    $("job-needs").textContent = !p ? "" : req.length ? `يطلب: ${req.join("، ")}` : "لم نستخرج مهارات مطلوبة من هذا الإعلان.";
  }

  fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    postings = d.postings.map((p, i) => ({ ...p, i, gulf: p.countries.some((c) => GULF.includes(c)) }))
      .sort((a, b) => (ENTRY.includes(b.level) - ENTRY.includes(a.level)));
    renderPicker();
  }).catch(() => { $("job-needs").textContent = "تعذّر تحميل الإعلانات. الصق وصف الوظيفة بدلاً منها."; });

  $("job-search").addEventListener("input", renderPicker);
  $("job-pick").addEventListener("change", showNeeds);
  document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener("change", () => {
    $("listed-box").hidden = source() !== "listed";
    $("pasted-box").hidden = source() !== "pasted";
  }));

  function currentJob() {
    if (source() === "pasted") {
      const d = $("job-text").value.trim();
      return d.length > 80 ? { description: d } : null;
    }
    const p = picked();
    return p && { title: p.title, company: p.company,
                  required: p.skills.filter((s) => s[1]).map((s) => s[0]),
                  preferred: p.skills.filter((s) => !s[1]).map((s) => s[0]) };
  }

  // ---------- the tailored CV ----------

  const HEAD = {
    en: { summary: "Summary", education: "Education", skills: "Skills", experience: "Experience",
          projects: "Projects", certificates: "Certificates", languages: "Languages", gpa: "GPA", sep: ", " },
    ar: { summary: "نبذة", education: "التعليم", skills: "المهارات", experience: "الخبرات",
          projects: "المشاريع", certificates: "الشهادات", languages: "اللغات", gpa: "المعدل", sep: "، " },
  };

  function renderCV(cv, p, lang) {
    const h = HEAD[lang];
    const paper = $("cv-paper");
    paper.lang = lang;
    paper.dir = lang === "ar" ? "rtl" : "ltr";
    paper.replaceChildren(el("h1", null, p.name || (lang === "ar" ? "اسمك" : "Your Name")));
    const contact = [p.email, p.phone, p.city, p.link].filter(Boolean).join("  |  ");
    if (contact) paper.append(el("p", "cv-contact", contact));

    const section = (title, nodes) => {
      if (!nodes || !nodes.length) return;
      paper.append(el("h2", null, title), ...nodes);
    };
    const item = (title, meta, bullets) => {
      const div = el("div", "cv-item");
      const row = el("p", "cv-row");
      row.append(el("strong", null, title));
      if (meta) row.append(el("span", null, meta));
      div.append(row);
      if (bullets.length) {
        const ul = el("ul");
        bullets.forEach((b) => ul.append(el("li", null, b)));
        div.append(ul);
      }
      return div;
    };

    const education = cv.education.length ? cv.education
      : [{ degree: p.degree, major: p.major, school: p.university, dates: p.graduation, gpa: p.gpa }];
    section(h.summary, cv.summary && [el("p", null, cv.summary)]);
    section(h.education, education.filter((x) => x.school || x.degree).map((x) =>
      item([[x.degree, x.major].filter(Boolean).join(h.sep), x.school].filter(Boolean).join(lang === "ar" ? "، " : ", "),
           x.dates, x.gpa ? [`${h.gpa}: ${x.gpa}`] : [])));
    section(h.skills, cv.skills.length && [el("p", null, cv.skills.join(h.sep))]);
    section(h.experience, cv.experience.filter((x) => x.title || x.bullets.length)
      .map((x) => item([x.title, x.org].filter(Boolean).join(h.sep), x.dates, x.bullets)));
    section(h.projects, cv.projects.filter((x) => x.name || x.bullets.length)
      .map((x) => item(x.name, x.tools, x.bullets)));
    const list = el("ul");
    cv.certificates.forEach((c) => list.append(el("li", null, c)));
    section(h.certificates, cv.certificates.length && [list]);
    section(h.languages, cv.languages.length && [el("p", null, cv.languages.join(h.sep))]);
  }

  function renderCoverage({ required, matched, missing, preferred_missing: prefMissing }) {
    const box = $("coverage");
    box.replaceChildren();
    if (!required.length) {
      box.append(el("p", null, "لم نجد في الإعلان قائمة مهارات مطلوبة، فرتّبنا سيرتك حسب وصفه."));
      return;
    }
    const meter = el("div", "meter");
    meter.style.setProperty("--share", matched.length / required.length);
    meter.setAttribute("aria-hidden", "true");
    box.append(el("p", "coverage-head", `المهارات المطلوبة في الإعلان: ${required.length}. عندك منها ${matched.length}.`), meter);
    if (missing.length) {
      box.append(el("p", null, `ينقصك: ${missing.join("، ")}. لم نضفها إلى سيرتك. إذا كنت تعرفها فعلاً، أضفها إلى مهاراتك في الخطوة الأولى وجهّز السيرة من جديد.`));
    }
    if (prefMissing.length) box.append(el("p", "muted", `ومن المهارات المفضّلة: ${prefMissing.join("، ")}.`));
  }

  function renderRemoved(removed) {
    const box = $("removed");
    box.hidden = !removed.length;
    if (!removed.length) return;
    box.querySelector("summary").textContent = "حذفنا من صياغة النموذج ما لم يرد في معلوماتك";
    box.querySelector("ul").replaceChildren(...removed.map((r) => {
      const [kind, value] = r.why.split(":");
      const reason = kind === "number" ? `رقم غير موجود في معلوماتك (${value})` : `مهارة ليست في معلوماتك (${value})`;
      const li = el("li");
      li.append(el("span", "removed-text", r.text), el("span", "muted", reason));
      return li;
    }));
  }

  $("make").addEventListener("click", async () => {
    const button = $("make");
    const job = currentJob();
    if (!job) { say("make-status", ERR.no_job, true); return; }
    const p = readProfile();
    const lang = document.querySelector('input[name="lang"]:checked').value;
    button.disabled = true;
    say("make-status", "نجهّز سيرتك. قد يستغرق ذلك نصف دقيقة.");
    try {
      // every skill name the market knows, so the worker can spot one the
      // model slipped into a sentence without the student having it
      const vocabulary = [...new Set(postings.flatMap((x) => x.skills.map((s) => s[0])))];
      const out = await api("/tailor", { profile: withoutContact(p), job, lang, vocabulary });
      renderCoverage(out.coverage);
      renderRemoved(out.removed);
      renderCV(out.cv, p, lang);
      $("result").hidden = false;
      say("make-status", "");
      $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (e) {
      say("make-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });

  $("print").addEventListener("click", () => window.print());
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("cv-paper").innerText);
      $("copy").textContent = "نُسخ النص";
    } catch { $("copy").textContent = "تعذّر النسخ"; }
    setTimeout(() => { $("copy").textContent = "انسخ النص"; }, 2000);
  });
})();
