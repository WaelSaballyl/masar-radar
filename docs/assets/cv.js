// Masar CV builder. The profile lives in this browser (localStorage); the
// worker sees it without the contact fields, and only when asked to read or
// tailor. Everything taken from the worker or a file goes in via textContent.
// The one exception: applying to an exclusive posting sends the name, email,
// phone and the finished CV to that employer, after the student ticks consent.
(() => {
  "use strict";
  const { el, store } = Masar;
  const { FIELDS, CONTACT, EMAIL, LINK, PHONE, isPhone, stripContact, joinHyphens, withoutContact, renderCV } = MasarCV;
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
    no_job: "اختر إعلاناً من القائمة أو الصق وصف وظيفة في الخطوة الثانية.",
    job_short: "وصف الوظيفة قصير. الصق نص الإعلان كاملاً مع المتطلبات.",
    other: "تعذّر إكمال الطلب. جرّب مرة ثانية.",
    applied: "قدّمت على هذا الإعلان من قبل بهذا الإيميل.",
    closed: "هذا الإعلان أُغلق أو انتهت مدته.",
    "field:email": "إيميلك في الخطوة الأولى غير صحيح. صحّحه وجهّز السيرة من جديد.",
    "field:name": "أضف اسمك في الخطوة الأولى، ثم جهّز السيرة من جديد.",
  };
  const fail = (code) => Object.assign(new Error(code), { code });
  const say = (id, text, bad) => { const p = $(id); p.textContent = text; p.classList.toggle("bad", !!bad); };

  Masar.initTheme();

  // ---------- profile ----------

  const form = $("profile");

  const readProfile = () => Object.fromEntries(FIELDS.map((f) => [f, form.elements[f].value.trim()]));
  const save = () => store.set(KEY, JSON.stringify(readProfile()));

  function fill(p, onlyEmpty) {
    FIELDS.forEach((f) => {
      let v = p[f];
      if (Array.isArray(v)) v = v.join(f === "certificates" || f === "skills" ? "\n" : ", ");
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


  function contactFrom(text) {
    const phone = (text.match(PHONE) || []).find(isPhone);
    const first = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
    const name = first.split(/\s+/).length <= 5 && !/[\d@:|]/.test(first) ? first : "";
    // an account (linkedin.com/in/x, github.com/x) belongs in the contact line;
    // anything deeper (a repository, a report) belongs under its project
    // the same link can come twice (shown, and hidden behind text with https);
    // a shortened one ("coursera.org/.../certificate") is not a link at all
    const links = [...new Set((text.match(LINK) || [])
      .filter((l) => !/\.\.\.|…/.test(l))
      .map((l) => l.replace(/[.,;)]+$/, "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "")))];
    const isAccount = (l) => /^(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/in|github\.com)\/[^/\s]+\/?$/i.test(l);
    return { name, email: (text.match(EMAIL) || [])[0], phone: phone && phone.trim(),
             link: links.filter(isAccount).join("  |  "), worklinks: links.filter((l) => !isAccount(l)).join("\n") };
  }



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
      const pages = [], hidden = [];
      for (let i = 1; i <= Math.min(doc.numPages, 5); i++) {
        const page = await doc.getPage(i);
        const { items } = await page.getTextContent();
        // pdf.js splits words at kerning ("pro", "cess"): a space goes in only
        // where the next piece starts clearly after the previous one ends
        let text = "", prev = null;
        for (const it of items) {
          if (prev && !text.endsWith("\n")) {
            const size = Math.hypot(prev.transform[0], prev.transform[1]) || 10;
            const gap = Math.abs(it.transform[4] - (prev.transform[4] + prev.width));
            const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < size * 0.5;
            if (!sameLine || gap > size * 0.15) text += " ";
          }
          text += it.str + (it.hasEOL ? "\n" : "");
          prev = it;
        }
        pages.push(joinHyphens(text.replace(/ {2,}/g, " ")));
        // a link behind text ("Verify" -> the full certificate URL) is not in the text
        (await page.getAnnotations()).forEach((a) => { if (a.url) hidden.push(a.url); });
      }
      return pages.join("\n") + (hidden.length ? `\n${[...new Set(hidden)].join("\n")}` : "");
    }
    if (ext === "docx") {
      await load(MAMMOTH);
      const data = { arrayBuffer: await file.arrayBuffer() };
      const text = (await mammoth.extractRawText(data)).value;
      const html = (await mammoth.convertToHtml(data)).value;
      const hrefs = [...html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      return text + (hrefs.length ? `\n${[...new Set(hrefs)].join("\n")}` : "");
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
    // making a CV mid-read would send a half-filled profile
    button.disabled = $("make").disabled = true;
    say("make-status", "");
    try {
      const file = $("cv-file").files[0];
      say("import-status", "نقرأ سيرتك…");
      const text = (file ? await fileText(file) : $("cv-text").value).trim();
      if (!text) throw fail(file ? "empty" : "too_short");
      // a fresh read replaces the links, email and phone; a typed name stays
      const found = contactFrom(text);
      fill({ ...found, name: "" });
      fill({ name: found.name }, true);
      const { profile } = await api("/parse", { text: stripContact(text, readProfile()) });
      fill(profile);
      say("import-status", "عبّأنا الحقول من سيرتك. راجعها وصحّح ما يلزم قبل المتابعة.");
    } catch (e) {
      say("import-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = $("make").disabled = false;
    }
  });
  $("cv-file").addEventListener("change", (e) => {
    e.target.nextElementSibling.textContent = e.target.files[0]?.name || "اختر ملف PDF أو Word";
    // picked from the start card: read it straight away
    if (e.target.files[0] && fromStart) { fromStart = false; $("read-cv").click(); }
  });

  // ---------- the first visit: two ways in, like the big CV sites ----------
  // Someone with no profile yet chooses: upload a CV, or fill it in from scratch.
  // A returning student (or one sent here for a posting) goes straight to the form.
  let fromStart = false;
  const hasProfile = () => FIELDS.some((f) => form.elements[f] && form.elements[f].value.trim());
  const params = new URLSearchParams(location.search);
  function begin(upload) {
    $("cv-start").hidden = true;
    for (const id of ["step1", "s2", "s3"]) { const sec = $(id)?.closest("section"); if (sec) sec.hidden = false; }
    if (upload) { fromStart = true; $("cv-file").click(); } else form.elements.name.focus();
  }
  if (!hasProfile() && !params.has("job") && !params.has("ex")) {
    $("cv-start").hidden = false;
    for (const id of ["step1", "s2", "s3"]) { const sec = $(id)?.closest("section"); if (sec) sec.hidden = true; }
    $("start-upload").onclick = () => begin(true);
    $("start-scratch").onclick = () => begin(false);
  }

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
    const pick = $("job-pick");
    const before = pick.value;
    pick.replaceChildren(...groups.filter((g) => g.children.length));
    // a list with nothing selected looks selected; keep the choice, else take the first
    pick.value = before;
    if (pick.selectedIndex < 0 && pick.options.length) pick.selectedIndex = 0;
    showNeeds();
  }

  const picked = () => postings.find((p) => String(p.i) === $("job-pick").value);

  function showNeeds() {
    const p = picked();
    const req = p ? p.skills.filter((s) => s[1]).map((s) => s[0]) : [];
    const needs = req.length ? `يطلب: ${req.join("، ")}.` : "لم نستخرج مهارات مطلوبة من هذا الإعلان.";
    $("job-needs").textContent = p ? `اخترت: ${p.title}، ${p.company}. ${needs}`
      : postings.length ? "لا توجد إعلانات تطابق البحث." : "";
  }

  fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    postings = d.postings.map((p, i) => ({ ...p, i, gulf: p.countries.some((c) => GULF.includes(c)) }))
      .sort((a, b) => (ENTRY.includes(b.level) - ENTRY.includes(a.level)));
    renderPicker();
    // arriving from "prepare my CV for this posting" on the postings page
    // an exclusive posting is not in jobs.json: its text goes in as a pasted description
    const ex = new URLSearchParams(location.search).get("ex");
    if (ex && API) {
      fetch(`${API}/board/postings`).then((r) => r.json()).then(({ postings: list }) => {
        const p = list.find((x) => x.id === ex);
        if (!p) return;
        exclusive = p;
        document.querySelector('input[name="source"][value="pasted"]').click();
        $("job-text").value = `${p.title} - ${p.company}, ${p.city}\n\n${p.description}\n\nRequired: ${p.required}`
          + (p.preferred ? `\nPreferred: ${p.preferred}` : "");
        $("s2").scrollIntoView();
      }).catch(() => {});
    }
    const wanted = postings.find((p) => p.id === new URLSearchParams(location.search).get("job"));
    if (wanted) {
      $("job-pick").value = String(wanted.i);
      showNeeds();
      $("s2").scrollIntoView();
    }
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


  function renderCoverage({ required, matched, missing, preferred_missing: prefMissing }, job) {
    const box = $("coverage");
    box.replaceChildren(el("p", "coverage-for",
      job.description ? "هذه السيرة للوصف الذي ألصقته." : `هذه السيرة لإعلان: ${job.title}، ${job.company}.`));
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
    if (required.length >= 4 && matched.length / required.length <= 0.25) {
      box.append(el("p", "far", "هذا الإعلان بعيد عن خبرتك الحالية، والسيرة لا تستطيع سدّ هذه الفجوة بصدق. قد يكون وقتك أنفع في إعلانات أقرب لمهاراتك."));
    }
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
    if (!job) {
      const short = source() === "pasted" && $("job-text").value.trim();
      say("make-status", short ? ERR.job_short : ERR.no_job, true);
      return;
    }
    const p = readProfile();
    const lang = document.querySelector('input[name="lang"]:checked').value;
    button.disabled = true;
    say("make-status", "نجهّز سيرتك. قد يستغرق ذلك نصف دقيقة.");
    try {
      // every skill name the market knows, so the worker can spot one the
      // model slipped into a sentence without the student having it
      const vocabulary = [...new Set(postings.flatMap((x) => x.skills.map((s) => s[0])))];
      const out = await api("/tailor", { profile: withoutContact(p), job, lang, vocabulary });
      renderCoverage(out.coverage, job);
      renderRemoved(out.removed);
      renderCV($("cv-paper"), out.cv, p, lang);
      renderTips(out.cv, p, job, lang);
      coverage = out.coverage;
      showApply();
      lastJob = job;
      $("prep").hidden = false;
      $("prep-list").replaceChildren();
      say("prep-status", "");
      keepVersion(job, lang);
      $("result").hidden = false;
      // after showing it: the text of a hidden paper has no line breaks
      checkATS(job, lang);
      say("make-status", "");
      $("result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (e) {
      say("make-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });

  // ---------- before you send: recruiters' advice checked against this CV ----------
  // Each tip names something the student can fix in their own facts; none of
  // it is invented into the CV.
  function renderTips(cv, p, job, lang) {
    const tips = [];
    const bare = cv.experience.flatMap((x) => x.bullets).filter((b) => !/\d/.test(b)).length;
    if (bare) tips.push(`${bare === 1 ? "نقطة واحدة" : `${bare} نقاط`} في خبراتك بلا رقم. إذا عندك رقم حقيقي (كم تقرير، كم فرع، كم ساعة وفّرت) أضفه في الخطوة الأولى؛ إنجاز واحد برقم أقوى من عشر مهام.`);
    if (/جيد|متوسط|ممتاز|good|intermediate|fluent|basic/i.test(p.languages) && !/ielts|toefl|step|ايلتس|آيلتس|توفل|ستيب/i.test(p.languages)) {
      tips.push("بدل تقييم لغتك بنفسك، اذكر اختباراً معتمداً ودرجته (IELTS أو TOEFL أو STEP) إذا عندك. لم نكتب في السيرة مستوى قدّرته أنت.");
    }
    if (p.gpa && !MasarCV.showGpa(p.gpa)) tips.push("لم نعرض معدلك لأنه أقل من ثلاثة أرباع المقياس، ونصيحة مختصي التوظيف ألا يُذكر حينها.");
    if (!/linkedin\.com/i.test(p.link || "")) tips.push("أضف رابط حسابك في LinkedIn في الخطوة الأولى؛ صار واجهتك المهنية ويرفع فرص ترشيحك.");
    if (lang === "ar") tips.push("أنظمة فرز السير (ATS) تقرأ العربي داخل ملف PDF مقلوباً أو مقطّعاً. أرسل النسخة العربية بصيغة Word، وجهّز نسخة إنجليزية لأي تقديم عبر موقع.");
    const role = job.title || ($("job-text").value.split("\n")[0] || "").split(/ [-–] /)[0].trim();
    const box = $("tips-list");
    box.replaceChildren(...tips.map((t) => el("li", null, t)));
    if (role && p.name) {
      // HR searches the inbox by job title: the subject should carry it
      const subject = `${role} - ${p.name}`;
      const li = el("li");
      const code = el("code", null, subject);
      code.dir = "auto";
      const copy = el("button", "icon-btn", "انسخ");
      copy.type = "button";
      copy.onclick = () => navigator.clipboard.writeText(subject).then(() => { copy.textContent = "نُسخ"; }, () => {});
      li.append("إذا قدّمت بالإيميل، اجعل العنوان المسمى الوظيفي واسمك، لأن الموارد البشرية تبحث بالمسمى: ", code, " ", copy);
      box.append(li);
    }
    $("tips").hidden = !box.children.length;
  }

  // ---------- the ATS check of this CV (atskit.js, the rules of ats.html) ----------
  // The paper's text is what the saved file carries: the PDF prints real text
  // (no ligatures, one column, contact in the page) and the Word file is built
  // from the same paper, so a clean result here holds for both.
  let patterns = null;
  const FIX = {
    arabic_pdf: "احفظ النسخة العربية بزر «احفظها Word»، لأن أنظمة الفرز تقرأ العربي داخل PDF مقلوباً.",
    email: "أضف إيميلك في الخطوة الأولى.", phone: "أضف رقم جوالك في الخطوة الأولى.", name: "أضف اسمك في الخطوة الأولى.",
    experience: "أضف خبرة أو مشروعاً في الخطوة الأولى.", education: "أضف جامعتك وتخصصك في الخطوة الأولى.",
    skills: "أضف مهاراتك في الخطوة الأولى.", dates: "اكتب مدة كل خبرة في الخطوة الأولى، مثل Jun 2025 - Aug 2025.",
    length: "السيرة قصيرة على أنظمة الفرز. إذا عندك مشروع أو تدريب أو عمل تطوعي لم تذكره، أضفه في الخطوة الأولى.",
    results: "أغلب نقاط خبرتك بلا أرقام، وهذا أكثر ما ينزّل المحتوى. إذا عندك رقم حقيقي (كم تقرير، كم ساعة وفّرت، كم نسبة) أضفه لخبراتك في الخطوة الأولى. لا نخترع أرقاماً.",
    summary: "السيرة بلا نبذة. اكتب المسمى الذي تستهدفه في المعلومات الإضافية وجهّزها من جديد.",
    skill_count: "مهاراتك أقل من ست. أضف ما تعرفه فعلاً في الخطوة الأولى.",
    linkedin: "أضف رابط LinkedIn في الخطوة الأولى.",
    weak: "بعض النقاط تصف مهمة (Responsible for) لا إنجازاً. اكتب في خبراتك ماذا حققت فيها وجهّز السيرة من جديد.",
  };
  async function checkATS(job, lang) {
    const text = $("cv-paper").innerText;
    const result = MasarATS.analyze({ text, kind: lang === "ar" ? "masar-ar" : "masar" });
    let m = null;
    if (job) {
      try { patterns ||= await fetch("data/skills.json").then((r) => r.json()); } catch { patterns = {}; }
      m = MasarATS.match(text, job, patterns);
    }
    const hasMatch = m && m.score !== null;
    const said = MasarATS.content(text);
    $("ats-line").textContent = `نتيجة ATS لهذه السيرة: ${MasarATS.overall(result.score, said.score, hasMatch ? m.score : null)}٪ `
      + `(قراءة الأنظمة ${result.score} من 100، والمحتوى ${said.score} من 100`
      + (hasMatch ? `، والتطابق مع الإعلان ${m.score}٪).` : ").");
    const notes = [...result.checks, ...said.checks].filter((c) => !c.ok && FIX[c.id]).map((c) => FIX[c.id]);
    if (m && m.title && !m.titleHit) notes.push(`المسمى «${m.core}» غير مكتوب في سيرتك، والنظام يبحث به. إذا كان يصف ما تعمله فعلاً، اكتبه في «المسمى الذي تستهدفه» في المعلومات الإضافية وجهّز السيرة من جديد.`);
    const li = el("li");
    const a = el("a", null, "افحص الملف نفسه بعد حفظه");
    a.href = "ats.html";
    li.append(a, " في صفحة فحص ATS.");
    $("ats-notes").replaceChildren(...notes.map((t) => el("li", null, t)), li);
    $("ats-inline").hidden = false;
  }

  $("word").addEventListener("click", () => {
    const paper = $("cv-paper");
    const a = el("a");
    a.href = URL.createObjectURL(MasarDocx.fromPaper(paper));
    a.download = `${paper.querySelector("h1")?.textContent || "CV"} - CV.docx`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  // ---------- interview prep ----------

  let lastJob = null;
  $("prep-make").addEventListener("click", async () => {
    const button = $("prep-make");
    if (!lastJob) return;
    button.disabled = true;
    say("prep-status", "نجهّز الأسئلة. قد يستغرق ذلك نصف دقيقة.");
    try {
      const lang = document.querySelector('input[name="lang"]:checked').value;
      const { questions } = await api("/interview", { profile: withoutContact(readProfile()), job: lastJob, lang });
      $("prep-list").replaceChildren(...questions.map((x) => {
        const li = el("li");
        const q = el("strong", null, x.q);
        q.dir = "auto";
        const why = el("p", "muted", x.why);
        const tip = el("p", "prep-tip", x.tip);
        why.dir = tip.dir = "auto";
        li.append(q, why, tip);
        return li;
      }));
      say("prep-status", "");
    } catch (e) {
      say("prep-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });

  // ---------- LinkedIn headline and About, from the profile alone ----------
  $("li-make").addEventListener("click", async () => {
    const button = $("li-make");
    button.disabled = true;
    say("li-status", "نكتب ملفك. قد يستغرق ذلك نصف دقيقة.");
    try {
      const lang = document.querySelector('input[name="lang"]:checked')?.value || "en";
      const out = await api("/linkedin", { profile: withoutContact(readProfile()), lang });
      $("li-headline").textContent = out.headline;
      $("li-about").textContent = out.about;
      $("li-skills").textContent = out.skills.join(", ");
      $("li-tips").replaceChildren(...out.tips.map((t) => el("li", null, t)));
      $("li-out").hidden = false;
      say("li-status", "");
    } catch (e) {
      say("li-status", ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });
  document.querySelectorAll(".li-copy").forEach((b) => {
    b.onclick = async () => {
      try { await navigator.clipboard.writeText($(b.dataset.copy).textContent); b.textContent = "نُسخ"; }
      catch { b.textContent = "انسخه يدوياً"; }
      setTimeout(() => { b.textContent = "انسخ"; }, 1500);
    };
  });

  // ---------- earlier CVs, kept in this browser ----------

  const VERSIONS = "masar.cvs";
  const versions = () => { try { return JSON.parse(store.get(VERSIONS) || "[]"); } catch { return []; } };
  function keepVersion(job, lang) {
    const label = job.title ? `${job.title}، ${job.company}` : ($("job-text").value.split("\n")[0] || "وصف ملصوق").slice(0, 90);
    const entry = { at: new Date().toISOString(), label, lang, paper: MasarCV.toBlocks($("cv-paper")) };
    // the same posting keeps only its newest CV; at most 15 in all
    const rest = versions().filter((v) => v.label !== label);
    try { store.set(VERSIONS, JSON.stringify([entry, ...rest].slice(0, 15))); } catch { /* storage full */ }
    showVersions();
  }
  function showVersions() {
    const all = versions();
    $("versions").hidden = !all.length;
    $("version-list").replaceChildren(...all.map((v, i) => {
      const li = el("li");
      const name = el("span", "version-name", v.label);
      name.dir = "auto";
      const open = el("button", "icon-btn", "افتح");
      const drop = el("button", "icon-btn", "احذف");
      open.type = drop.type = "button";
      open.onclick = () => {
        const paper = $("cv-paper");
        paper.replaceChildren();
        MasarCV.fromBlocks(paper, v.paper);
        paper.lang = v.lang;
        paper.dir = v.lang === "ar" ? "rtl" : "ltr";
        $("coverage").replaceChildren(el("p", "coverage-for", `سيرة محفوظة لإعلان: ${v.label}.`));
        $("removed").hidden = true;
        $("tips").hidden = true;
        $("apply").hidden = true;
        $("prep").hidden = true;
        $("result").hidden = false;
        checkATS(null, v.lang);
        $("result").scrollIntoView({ behavior: "smooth" });
      };
      drop.onclick = () => { store.set(VERSIONS, JSON.stringify(versions().filter((_, j) => j !== i))); showVersions(); };
      li.append(name, el("span", "muted", Masar.ago(v.at.slice(0, 10), "ar")), open, drop);
      return li;
    }));
  }
  showVersions();

  // ---------- applying to an exclusive posting ----------

  let exclusive = null, coverage = null;
  const APPLIED = "masar.applied";
  const applied = () => { try { return JSON.parse(store.get(APPLIED) || "[]"); } catch { return []; } };

  // only for the CV made for that posting: its pasted text still opens with the title
  function showApply() {
    const box = $("apply");
    box.hidden = !(exclusive && source() === "pasted" && $("job-text").value.startsWith(exclusive.title));
    if (box.hidden) return;
    const p = readProfile();
    $("apply-what").textContent = `نرسل إلى ${exclusive.company} السيرة الظاهرة أدناه كما هي، مع اسمك وإيميلك`
      + `${p.phone ? " وجوالك" : ""}${p.link ? " وروابط حساباتك" : ""}. لا نرسل شيئاً غيرها من معلوماتك.`;
    $("consent-text").textContent = `أوافق على إرسال سيرتي وبيانات التواصل هذه إلى ${exclusive.company} للتقديم على هذا الإعلان.`;
    const done = applied().includes(exclusive.id);
    $("apply-send").disabled = done;
    say("apply-status", done ? "قدّمت على هذا الإعلان من قبل." : "");
  }

  $("apply-send").addEventListener("click", async () => {
    const p = readProfile(), button = $("apply-send");
    if (!$("consent").checked) { say("apply-status", "علّم على الموافقة أولاً.", true); return; }
    if (!p.name || !p.email) { say("apply-status", ERR["field:name"], true); return; }
    button.disabled = true;
    say("apply-status", "نرسل طلبك…");
    try {
      const { receipt } = await api("/board/apply", { posting_id: exclusive.id, consent: true, name: p.name, email: p.email, phone: p.phone,
        link: p.link, matched: coverage?.matched.length || 0, required: coverage?.required.length || 0,
        paper: MasarCV.toBlocks($("cv-paper")) });
      store.set(APPLIED, JSON.stringify([...applied(), exclusive.id]));
      MasarCV.keepReceipt(receipt);
      say("apply-status", `وصل طلبك إلى ${exclusive.company}. تابع حالته في صفحة طلباتي، وإن اختارتك الشركة ستتواصل معك على إيميلك.`);
    } catch (e) {
      if (e.code === "applied") store.set(APPLIED, JSON.stringify([...applied(), exclusive.id]));
      else button.disabled = false;
      say("apply-status", ERR[e.code] || ERR.other, true);
    }
  });

  // the saved PDF takes the page title as its file name
  // A short CV leaves the bottom third of the page empty and a long one spills
  // onto a second page. Before printing, the paper is laid out at A4 print
  // size and --fit scales type and spacing (0.9 to 1.25) until it fills the
  // page without passing it.
  const A4 = (297 * 96) / 25.4;
  function fitToPage() {
    const paper = $("cv-paper");
    paper.classList.add("print-size");
    let fit = 1.25;
    for (; fit > 0.9; fit -= 0.025) {
      paper.style.setProperty("--fit", fit.toFixed(3));
      if (paper.getBoundingClientRect().height <= A4 * 0.97) break;
    }
  }
  function unfit() {
    const paper = $("cv-paper");
    paper.classList.remove("print-size");
    paper.style.removeProperty("--fit");
  }
  window.addEventListener("beforeprint", fitToPage);
  window.addEventListener("afterprint", unfit);

  // the saved PDF takes the page title as its file name
  $("print").addEventListener("click", () => {
    const title = document.title;
    const name = $("cv-paper").querySelector("h1")?.textContent || "CV";
    document.title = `${name} - CV`;
    window.addEventListener("afterprint", () => { document.title = title; }, { once: true });
    fitToPage();
    window.print();
  });
  $("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("cv-paper").innerText);
      $("copy").textContent = "نُسخ النص";
    } catch { $("copy").textContent = "تعذّر النسخ"; }
    setTimeout(() => { $("copy").textContent = "انسخ النص"; }, 2000);
  });
})();
