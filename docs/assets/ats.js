// The ATS check page. The file is read here, in the browser, the way a
// screening system reads it: its text layer only (PDF through pdf.js with no
// clean-up of the characters, Word from the document XML itself), plus what
// the layout does to that text (columns, tables, text boxes, the header).
// atskit.js scores it; nothing is sent anywhere.
(() => {
  "use strict";
  const { el } = Masar;
  const { readFile, readPdf, readDocx } = MasarRead;
  const $ = (id) => document.getElementById(id);
  const GULF = ["SA", "AE", "QA", "KW", "BH", "OM"];

  Masar.initTheme();

  const fail = (code) => Object.assign(new Error(code), { code });
  const ERR = {
    type: "نقرأ ملفات PDF وWord (docx) فقط. ملف Word القديم (doc) احفظه docx من Word أولاً.",
    no_file: "اختر ملف سيرتك أولاً.",
    job_short: "وصف الوظيفة قصير. الصق نص الإعلان كاملاً مع المتطلبات.",
    locked: "الملف محمي بكلمة مرور. احفظ نسخة بدون حماية وجرّب.",
    other: "تعذّر قراءة الملف. تأكد أنه PDF أو docx سليم وجرّب مرة ثانية.",
  };
  const say = (text, bad) => { const p = $("run-status"); p.textContent = text; p.classList.toggle("bad", !!bad); };

  // ---------- the posting ----------
  let postings = [], patterns = {};
  const source = () => document.querySelector('input[name="source"]:checked').value;
  function renderPicker() {
    const q = $("job-search").value.trim().toLowerCase();
    const groups = [["السعودية والخليج", true], ["خارج الخليج وعن بُعد", false]].map(([label, gulf]) => {
      const g = el("optgroup");
      g.label = label;
      postings.filter((p) => p.gulf === gulf && (!q || `${p.title} ${p.company}`.toLowerCase().includes(q))).slice(0, 200)
        .forEach((p) => { const o = el("option", null, `${p.title}، ${p.company}`); o.value = p.i; g.append(o); });
      return g;
    });
    const pick = $("job-pick"), before = pick.value;
    pick.replaceChildren(...groups.filter((g) => g.children.length));
    pick.value = before;
    if (pick.selectedIndex < 0 && pick.options.length) pick.selectedIndex = 0;
  }
  fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    postings = d.postings.map((p, i) => ({ ...p, i, gulf: p.countries.some((c) => GULF.includes(c)) }));
    renderPicker();
    const wanted = postings.find((p) => p.id === new URLSearchParams(location.search).get("job"));
    if (wanted) {
      document.querySelector('input[name="source"][value="listed"]').click();
      $("job-pick").value = String(wanted.i);
    }
  }).catch(() => {});
  fetch("data/skills.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => { patterns = d; }).catch(() => {});
  $("job-search").addEventListener("input", renderPicker);
  document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener("change", () => {
    $("listed-box").hidden = source() !== "listed";
    $("pasted-box").hidden = source() !== "pasted";
  }));
  function currentJob() {
    if (source() === "pasted") {
      const d = $("job-text").value.trim();
      if (d.length < 80) throw fail("job_short");
      return { description: d };
    }
    if (source() !== "listed") return null;
    const p = postings.find((x) => String(x.i) === $("job-pick").value);
    return p && { title: p.title, required: p.skills.filter((s) => s[1]).map((s) => s[0]),
                  preferred: p.skills.filter((s) => !s[1]).map((s) => s[0]) };
  }

  // ---------- the report ----------
  const SECTION_NAMES = { summary: "النبذة", experience: "الخبرات", education: "التعليم", skills: "المهارات",
    projects: "المشاريع", certifications: "الشهادات", languages: "اللغات", volunteering: "التطوع",
    awards: "الإنجازات", additional: "معلومات إضافية" };
  // [what is wrong, how to fix it] and what a passed check says
  const BAD = {
    no_text: ["ما في نص يُقرأ في الملف", "سيرتك صورة أو ملف ممسوح ضوئياً، فيشوفها النظام صفحة فاضية ويرفضها. اكتبها من جديد في Word أو في صانع السيرة واحفظها PDF."],
    garbled: ["حروف وصلت رموزاً", "الخط المستخدم لا يحمل جدول حروفه داخل الملف، فوصلت بعض الحروف رموزاً لا تُقرأ. غيّر الخط إلى خط شائع مثل Calibri أو Arial واحفظ الملف من جديد."],
    ligatures: ["حرفان ملتصقان يكسران الكلمة", "الخط يدمج fi وff وfl في حرف واحد، فيقرأ النظام هذه الكلمات بحرف غريب ولا يطابقها مع البحث: "],
    arabic_pdf: ["نص عربي داخل PDF", "أنظمة الفرز تقرأ العربي في ملفات PDF مقلوباً أو مقطّعاً (جرّبنا: «خلال» تصير «خالل»). قدّم نسخة إنجليزية، أو أرسل العربية بصيغة Word."],
    columns: ["السيرة على عمودين", "النظام يقرأ السطر من طرف الصفحة إلى الطرف الآخر، فيخلط العمودين في جمل لا معنى لها. اجعل السيرة عموداً واحداً."],
    tables: ["جداول في الملف", "أنظمة كثيرة تقرأ الجدول خلية خلية بترتيب غير متوقع أو تتجاهله. حوّله إلى أسطر عادية. عدد الجداول: "],
    textboxes: ["مربعات نص", "أنظمة كثيرة تتجاهل ما داخل مربع النص. انقل محتواه إلى نص عادي في الصفحة. عدد المربعات: "],
    header_contact: ["بيانات التواصل في ترويسة الصفحة", "إيميلك مكتوب في الترويسة (Header)، وأنظمة كثيرة لا تقرؤها، فتصلها سيرة بلا إيميل. انقله إلى أول الصفحة."],
    email: ["ما لقينا إيميل", "اكتب إيميلك نصاً في أول الصفحة، لا صورة ولا أيقونة وحدها."],
    phone: ["ما لقينا رقم جوال", "اكتب رقمك كاملاً مع مفتاح الدولة، مثل ‎+966 5X XXX XXXX‎."],
    name: ["ما عرفنا اسمك", "اجعل أول سطر في السيرة اسمك وحده، بلا لقب ولا كلمة CV."],
    experience: ["ما لقينا قسم خبرات أو مشاريع", "سمّ القسم باسم يعرفه النظام: Experience أو Projects (أو الخبرات، المشاريع)."],
    education: ["ما لقينا قسم التعليم", "سمّ القسم Education (أو التعليم)."],
    skills: ["ما لقينا قسم المهارات", "سمّ القسم Skills (أو المهارات)، واكتب المهارات كلمات لا أشرطة ولا نجوم."],
    dates: ["ما لقينا تواريخ", "اكتب مدة كل خبرة بصيغة يفهمها النظام، مثل Jun 2025 - Aug 2025."],
    length: ["النص قليل", "سيرة الطالب عادة بين 300 و600 كلمة. عدد الكلمات التي قرأها النظام: "],
    pages: ["أطول من صفحتين", "للطالب وحديث التخرج صفحة واحدة، وصفحتان كحد أقصى. عدد الصفحات: "],
    results: ["نقاط بلا أرقام", "مسؤول التوظيف يبحث عن نتيجة، لا عن مهمة. اكتب رقماً حقيقياً في نصف نقاطك على الأقل: كم تقرير، كم ساعة وفّرت، كم نسبة تحسّن. نقاط فيها رقم: "],
    verbs: ["نقاط لا تبدأ بفعل", "ابدأ كل نقطة بفعل إنجاز مثل Built أو Analyzed أو Automated (أو طوّرت، حلّلت)، لا بوصف أو اسم. نقاط تبدأ بفعل: "],
    weak: ["عبارات مهام لا إنجازات", "هذه العبارات تقول إن الشيء كان من واجبك، لا ماذا حققت فيه. بدّلها بفعل ونتيجة: "],
    long: ["نقاط طويلة", "النقطة الجيدة سطر أو سطران (أقل من 35 كلمة). قسّم الطويلة أو اختصرها. عددها: "],
    pronouns: ["ضمير المتكلم في النقاط", "لا تكتب I أو my في نقاط الخبرة؛ ابدأ بالفعل مباشرة. عدد النقاط: "],
    summary: ["ما في نبذة", "سطران أو ثلاثة في أول السيرة تحت عنوان Summary: من أنت، وماذا تستهدف، وأقوى مهاراتك."],
    skill_count: ["مهارات قليلة", "اكتب ست مهارات على الأقل مما تعرفه فعلاً، مفصولة بفواصل، بنفس أسمائها في الإعلانات. عدد المهارات: "],
    linkedin: ["ما في رابط LinkedIn", "أضف رابط حسابك (linkedin.com/in/...) مع بيانات التواصل."],
  };
  const OK = {
    garbled: "كل الحروف تُقرأ", arabic_pdf: "النص يُقرأ بترتيبه الصحيح", columns: "عمود واحد",
    tables: "بلا جداول", textboxes: "بلا مربعات نص", email: "الإيميل موجود", phone: "رقم الجوال موجود",
    name: "الاسم في أول سطر", experience: "قسم الخبرات أو المشاريع", education: "قسم التعليم",
    skills: "قسم المهارات", dates: "التواريخ مقروءة", length: "طول مناسب", pages: "عدد الصفحات مناسب",
    results: "نقاطك فيها أرقام", verbs: "النقاط تبدأ بأفعال", weak: "بلا عبارات مهام", long: "النقاط قصيرة وواضحة",
    pronouns: "بلا ضمير المتكلم", summary: "النبذة موجودة", skill_count: "قائمة مهارات كافية", linkedin: "رابط LinkedIn موجود",
    images: "في الملف صور أو أيقونات، والنظام يتجاهلها. لا بأس ما دام كل شيء مهم مكتوباً نصاً.",
  };

  const LEVEL = { good: "ممتازة", fair: "جيدة", work: "تحتاج شغل", poor: "ضعيفة" };

  function renderChecks(checks) {
    const bad = checks.filter((c) => !c.ok).sort((a, b) => b.weight - a.weight);
    const good = checks.filter((c) => c.ok);
    const items = bad.map((c) => {
      const li = el("li", "bad");
      const [title, fix] = BAD[c.id];
      const detail = ["results", "verbs"].includes(c.id) ? `${fix}${c.info[0]} من ${c.info[1]}.`
        : Array.isArray(c.info) ? fix + c.info.join("، ") : typeof c.info === "number" && /: $/.test(fix) ? fix + c.info : fix;
      const head = el("p", "ats-check-title");
      head.append(el("strong", null, title), el("span", "ats-points", `−${c.weight}`));
      const p = el("p", null, detail);
      p.dir = "auto";
      li.append(head, p);
      return li;
    });
    if (!bad.length) items.push(el("li", "ok-all", "ما لقينا شيئاً ينقص سيرتك في القراءة أو المحتوى."));
    const oks = el("li", "ok-list");
    oks.append(...good.map((c) => el("span", c.note ? "note" : "ok", OK[c.id])));
    $("checks").replaceChildren(...items, oks);
  }

  function renderFields(f) {
    const rows = [
      ["الاسم", f.name], ["الإيميل", f.email], ["الجوال", f.phone], ["الروابط", f.links.join("  ")],
      ["الأقسام", f.sections.map((s) => SECTION_NAMES[s]).join("، ")], ["التواريخ", String(f.dates)],
      ["الكلمات", String(f.words)], ...(f.pages ? [["الصفحات", String(f.pages)]] : []),
    ];
    $("fields").replaceChildren(...rows.flatMap(([k, v]) => {
      const optional = k === "الروابط";
      const dd = el("dd", v || optional ? null : "missing", v || (optional ? "لا يوجد" : "لم يُقرأ"));
      dd.dir = "auto";
      return [el("dt", null, k), dd];
    }));
  }

  function renderMatch(m) {
    const has = m && m.score !== null;
    $("match-box").hidden = !has;
    $("kw-block").hidden = !has;
    if (!has) return;
    $("match-score").textContent = `${m.score}٪`;
    const need = m.required.length;
    $("match-sub").textContent = need ? `مطلوب ${need}، لقينا منها ${m.matched.length}` : "";
    const notes = [];
    if (m.title) notes.push(m.titleHit ? `المسمى «${m.core}» موجود في سيرتك.` : `المسمى «${m.core}» غير موجود في سيرتك، والنظام يبحث به. إذا كان يصف ما تعمله، اكتبه في العنوان تحت اسمك.`);
    if (!need && !m.preferred.length) notes.push("ما لقينا في الإعلان مهارات من قائمتنا، فالتطابق هنا بالمسمى فقط.");
    if (m.missing.length) notes.push("الناقص: أضفه لسيرتك إذا كنت تعرفه فعلاً، بنفس الكلمة المكتوبة في الإعلان.");
    // one sentence a node, so each is translated on its own in English
    $("kw-note").replaceChildren(...notes.map((t) => el("span", null, `${t} `)));
    const chip = (n, cls) => { const li = el("li", `chip ${cls}`, n); li.dir = "ltr"; return li; };
    $("kw-found").replaceChildren(...m.matched.map((n) => chip(n, "kw-ok")), ...m.preferredMatched.map((n) => chip(n, "kw-ok kw-pref")));
    $("kw-missing").replaceChildren(...m.missing.map((n) => chip(n, "kw-no")), ...m.preferredMissing.map((n) => chip(n, "kw-no kw-pref")));
  }

  $("ats-file").addEventListener("change", (e) => {
    e.target.nextElementSibling.textContent = e.target.files[0]?.name || "اختر ملف PDF أو Word";
  });


  $("run").addEventListener("click", async () => {
    const button = $("run");
    button.disabled = true;
    try {
      const file = $("ats-file").files[0];
      if (!file) throw fail("no_file");
      const job = currentJob();
      say("نقرأ ملفك…");
      const doc = await readFile(file);
      const result = MasarATS.analyze(doc);
      const said = MasarATS.content(doc.text);
      const m = job ? MasarATS.match(doc.text, job, patterns) : null;
      const hasMatch = m && m.score !== null;
      $("read-score").textContent = String(result.score);
      $("read-sub").textContent = "من 100";
      $("content-score").textContent = String(said.score);
      $("content-sub").textContent = said.points ? `من 100. نقاط الخبرة التي قرأناها: ${said.points}` : "من 100، ما لقينا نقاط خبرة";
      const total = MasarATS.overall(result.score, said.score, hasMatch ? m.score : null);
      const level = result.score === 0 ? "poor" : MasarATS.level(total);
      $("total-score").textContent = `${total}٪`;
      $("total-level").textContent = LEVEL[level];
      $("total-sub").textContent = hasMatch ? "٣٠٪ قراءة الملف، ٣٠٪ المحتوى، ٤٠٪ التطابق مع الإعلان"
        : "نصفها قراءة الملف ونصفها المحتوى. اختر إعلاناً لتعرف تطابقك معه.";
      $("report").dataset.level = level;
      renderChecks(result.score === 0 ? result.checks : [...result.checks, ...said.checks]);
      renderFields(result.fields);
      renderMatch(m);
      $("raw").textContent = doc.text.trim() || "(لا شيء)";
      $("report").hidden = false;
      say("");
      $("report").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (e) {
      say(ERR[e.code] || ERR.other, true);
    } finally {
      button.disabled = false;
    }
  });

  window.MasarATSPage = { readPdf, readDocx };
})();
