// The ATS check page. The file is read here, in the browser, the way a
// screening system reads it: its text layer only (PDF through pdf.js with no
// clean-up of the characters, Word from the document XML itself), plus what
// the layout does to that text (columns, tables, text boxes, the header).
// atskit.js scores it; nothing is sent anywhere.
(() => {
  "use strict";
  const { el } = Masar;
  const $ = (id) => document.getElementById(id);
  const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDF_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
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

  let loading = null;
  const loadPdfJs = () => (loading ||= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = PDFJS; s.onload = ok; s.onerror = () => no(fail("other"));
    document.head.append(s);
  }));

  // ---------- PDF ----------
  async function readPdf(buf) {
    await loadPdfJs();
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    let doc;
    try {
      doc = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    } catch (e) { throw fail(e && e.name === "PasswordException" ? "locked" : "other"); }
    const pages = [];
    let images = 0, columns = false;
    const IMG = new Set([pdfjsLib.OPS.paintImageXObject, pdfjsLib.OPS.paintInlineImageXObject, pdfjsLib.OPS.paintImageMaskXObject]);
    for (let i = 1; i <= Math.min(doc.numPages, 6); i++) {
      const page = await doc.getPage(i);
      // disableNormalization: a parser gets "ﬁ" and Arabic presentation forms
      // as they are in the file; pdf.js would otherwise tidy them up for us
      const { items } = await page.getTextContent({ disableNormalization: true });
      let text = "", prev = null;
      const rows = [];
      for (const it of items) {
        if (prev && !text.endsWith("\n")) {
          const size = Math.hypot(prev.transform[0], prev.transform[1]) || 10;
          const gap = Math.abs(it.transform[4] - (prev.transform[4] + prev.width));
          const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < size * 0.5;
          if (!sameLine || gap > size * 0.15) text += " ";
        }
        text += it.str + (it.hasEOL ? "\n" : "");
        prev = it;
        if (!it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find((r) => Math.abs(r.y - y) < 2);
        if (!row) rows.push(row = { y, spans: [] });
        row.spans.push([x, x + it.width]);
      }
      pages.push(text.replace(/ {2,}/g, " "));
      const width = page.getViewport({ scale: 1 }).width;
      if (MasarATS.twoColumns(rows.map((r) => mergeSpans(r.spans)), width)) columns = true;
      const ops = await page.getOperatorList();
      images += ops.fnArray.filter((f) => IMG.has(f)).length;
    }
    return { kind: "pdf", text: pages.join("\n"), pages: doc.numPages, images, columns };
  }

  // pieces of one word or one phrase sit next to each other; only a real gap separates spans
  function mergeSpans(spans) {
    const s = spans.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of s) {
      const last = out[out.length - 1];
      if (last && a - last[1] < 12) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  // ---------- Word (docx is a zip of XML files) ----------
  async function unzip(buf) {
    const v = new DataView(buf), bytes = new Uint8Array(buf);
    let end = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw fail("other");
    const files = {};
    let p = v.getUint32(end + 16, true);
    const utf8 = new TextDecoder();
    for (let n = v.getUint16(end + 10, true); n > 0; n--) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true);
      const local = v.getUint32(p + 42, true);
      const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      files[name] = { method, data: bytes.subarray(start, start + size) };
      p += 46 + nameLen + extra + note;
    }
    return async (name) => {
      const f = files[name];
      if (!f) return "";
      if (f.method === 0) return utf8.decode(f.data);
      const stream = new Blob([f.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Response(stream).text();
    };
  }

  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  // plain text of a Word part: the runs' text, tabs and line breaks, one paragraph a line
  function wordText(xml) {
    let out = "";
    for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:tab\s[^>]*\/>|<w:br\/>|<w:br\s[^>]*\/>|<\/w:p>/g)) {
      if (m[1] !== undefined) out += m[1];
      else out += m[0].startsWith("<w:tab") ? "\t" : "\n";
    }
    return out.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d));
  }

  async function readDocx(buf) {
    const read = await unzip(buf);
    const body = await read("word/document.xml");
    if (!body) throw fail("other");
    const rels = await read("word/_rels/document.xml.rels");
    const parts = [...rels.matchAll(/Target="([^"]*(?:header|footer)\d*\.xml)"/g)].map((m) => `word/${m[1].replace(/^\/?word\//, "")}`);
    const margins = (await Promise.all(parts.map(read))).map(wordText).join("\n");
    const text = wordText(body);
    const inMargins = (rx) => rx.test(margins) && !rx.test(text);
    return {
      kind: "docx", text,
      tables: (body.match(/<w:tbl>/g) || []).length,
      textboxes: (body.match(/<w:txbxContent>/g) || []).length,
      columns: /<w:cols\b[^>]*w:num="([2-9])"/.test(body),
      images: (body.match(/<pic:pic\b|<v:imagedata\b/g) || []).length,
      headerContact: inMargins(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || inMargins(/(?:\+|\b00|\b0)\d[\d\s\-()]{7,16}\d/),
    };
  }

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

  async function readFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    const buf = await file.arrayBuffer();
    if (ext === "pdf") return readPdf(buf);
    if (ext === "docx") return readDocx(buf);
    throw fail("type");
  }

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
