// Employer page: paste a whole ad and the form fills itself, then the posting
// goes to the worker, which stores it as pending. A company signed in on
// employer.html posts with its confirmed work email and sees the posting on
// its dashboard; without an account, a private link to the applicants is shown once.
(() => {
  "use strict";
  const { el, store } = Masar;
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content;
  const $ = (id) => document.getElementById(id);
  const form = $("post");
  const status = $("status");
  const session = store.get("masar.employerSession") || "";
  const company = (() => { try { return JSON.parse(store.get("masar.employer") || "null"); } catch { return null; } })();
  const WHY = {
    "field:company": "اكتب اسم الشركة.", "field:title": "اكتب المسمى الوظيفي.", "field:city": "اكتب المدينة.",
    "field:contact_email": "اكتب إيميل تواصل صحيحاً.",
    "field:work_email": "استخدم إيميل العمل الخاص بالشركة، لا Gmail أو Hotmail. هكذا نتحقق أن الإعلان حقيقي.",
    "field:description": "وصف الوظيفة قصير. اكتب المهام والمتطلبات في 150 حرفاً على الأقل.",
    "field:required": "أضف مهارة مطلوبة واحدة على الأقل.",
    rate: "أرسلت طلبات كثيرة في وقت قصير. جرّب بعد ساعة.",
  };
  // numbers from the postings we track, never invented ones
  fetch("data/summary.json", { cache: "no-cache" }).then((r) => r.json()).then((s) => {
    const top = (s.top_skills || []).slice(0, 3).map((x) => x.skill || x[0] || x.name).filter(Boolean);
    const fact = (n, label) => { const d = el("div", "fact"); d.append(el("strong", null, n), el("span", null, label)); return d; };
    $("facts").append(
      fact(String(s.gulf_postings || 0), "إعلان مفتوح في الخليج نتابعه الآن"),
      fact(String(s.entry_postings || 0), "إعلان تدريب ومبتدئين"),
      fact(top.join("، ") || "SQL", "أكثر المهارات طلباً"),
    );
  }).catch(() => {});
  const say = (t, bad) => { status.textContent = t; status.classList.toggle("bad", !!bad); };

  // ---------- who is posting ----------
  const box = $("emp-account");
  if (session && company) {
    box.append(el("p", null, `تنشر بحساب شركتك: ${company.email}. يظهر الإعلان ومتقدموه في `));
    const a = el("a", null, "لوحة الشركة");
    a.href = "employer.html";
    box.firstChild.append(a, ".");
    if (company.company) form.elements.company.value = company.company;
    if (company.website) form.elements.website.value = company.website;
    form.elements.contact_email.value = company.email;
    form.elements.contact_email.readOnly = true;
  } else {
    const p = el("p", null, "عندك حساب Google لعمل شركتك؟ ");
    const a = el("a", null, "ادخل بحساب الشركة");
    a.href = "employer.html";
    p.append(a, " لتتابع كل إعلاناتك ومتقدميها من لوحة واحدة. أو انشر بدون حساب، ونعطيك رابطاً خاصاً للمتقدمين.");
    box.append(p);
  }

  // ---------- paste the ad, fill the form ----------
  // Rules first (instant, in this browser), then the worker's reading of the
  // ad fills what rules cannot (company, title, city) and corrects the choices.
  let patterns = null;
  const skillsJson = () => (patterns ||= fetch("data/skills.json").then((r) => r.json()).catch(() => ({})));
  const CITIES = {
    SA: /الرياض|riyadh|جدة|jeddah|jiddah|الدمام|dammam|الخبر|khobar|الظهران|dhahran|مكة المكرمة|مكة|mecca|makkah|المدينة المنورة|medina|madinah|الجبيل|jubail|نيوم|neom|تبوك|tabuk|أبها|abha|القصيم|qassim/i,
    AE: /دبي|dubai|أبوظبي|ابوظبي|abu dhabi|الشارقة|sharjah/i, QA: /الدوحة|doha|قطر|qatar/i, KW: /الكويت|kuwait/i,
    BH: /المنامة|manama|البحرين|bahrain/i, OM: /مسقط|muscat|عمان|oman/i,
  };
  function byRules(text) {
    const out = {};
    const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (email) out.contact_email = email[0];
    // a site written on its own, not the domain of the email
    const site = [...text.matchAll(/(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+(?:com|sa|ae|net|org|io|co|qa|kw|bh|om)(?:\.[a-z]{2})?)\b/gi)]
      .find((m) => !/[\w.+-]@[\w.-]*$/.test(text.slice(0, m.index)));
    if (site) out.website = site[1].toLowerCase();
    for (const [c, rx] of Object.entries(CITIES)) {
      const hit = text.match(rx);
      if (hit) { out.country = c; out.city = hit[0]; break; }
    }
    // the title: the first short line that names a role
    const ROLE = /analyst|engineer|developer|intern|trainee|specialist|accountant|coordinator|manager|scientist|designer|officer|co-?op|محلل|مهندس|مطور|محاسب|أخصائي|اخصائي|منسق|متدرب|مدير|مصمم/i;
    const line = text.split("\n").map((l) => l.trim()).find((l) => l.length >= 4 && l.length <= 90 && ROLE.test(l) && !/@/.test(l) && !/^(?:شركة|مؤسسة|مجموعة)\s/.test(l));
    if (line) out.title = line.replace(/^(?:المسمى(?: الوظيفي)?|الوظيفة|job title|position|role)\s*[:：-]\s*/i, "");
    const co = text.match(/(?:شركة|مؤسسة|مجموعة)\s+([^\n،,.:]{2,40}?)\s+(?:تعلن|تبحث|ترغب|توفر)|^([A-Z][\w&.' -]{1,40}?)\s+(?:is|are)\s+(?:hiring|looking)/m);
    if (co) out.company = (co[1] || co[2]).trim();
    if (/تعاوني|co-?op/i.test(text)) out.employment = "coop";
    else if (/intern(ship)?\b|تدريب صيفي|متدرب/i.test(text)) out.employment = "internship";
    else if (/part[- ]time|دوام جزئي/i.test(text)) out.employment = "part_time";
    else if (/contract|عقد مؤقت/i.test(text)) out.employment = "contract";
    else if (/full[- ]time|دوام كامل/i.test(text)) out.employment = "full_time";
    if (/remote|عن بعد|عن بُعد/i.test(text)) out.workplace = "remote";
    else if (/hybrid|هجين/i.test(text)) out.workplace = "hybrid";
    if (out.employment === "coop" || out.employment === "internship") out.level = "Intern";
    else if (/junior|entry|fresh grad|حديث التخرج|مبتدئ/i.test(text)) out.level = "Junior";
    else if (/senior|خبرة عالية/i.test(text)) out.level = "Senior";
    const fields = [["data", /data|بيانات|analytics|تحليل/i], ["finance", /account|financ|محاسب|مالي/i], ["marketing", /marketing|تسويق|social media/i],
      ["hr", /\bhr\b|human resources|موارد بشرية|recruit/i], ["engineering", /engineer(?!ing\s+(?:data|software))|مهندس|هندسة/i], ["tech", /software|developer|برمج|مطور|IT\b/i]];
    const f = fields.find(([, rx]) => rx.test(text.split("\n").slice(0, 3).join(" "))) || fields.find(([, rx]) => rx.test(text));
    if (f) out.field = f[0];
    out.description = text;
    return out;
  }

  function fill(values) {
    let n = 0;
    for (const [k, v] of Object.entries(values)) {
      const f = form.elements[k];
      if (!f || v === "" || v == null || f.readOnly) continue;
      if (f.tagName === "SELECT" && ![...f.options].some((o) => o.value === v)) continue;
      f.value = v;
      f.classList.add("autofilled");
      n += 1;
    }
    return n;
  }

  // "#Employee_Relations_Specialist" is a title written as a hashtag
  const cleanTitle = (t) => String(t || "").replace(/^[#\s•*-]+/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  // one ad often lists several jobs under their own headings (#Title, or a short line then points):
  // each becomes its own posting, with the ad's opening and its "to apply" part
  function splitJobs(text) {
    const lines = text.split("\n");
    const heads = lines.map((l, i) => (/^\s*#\s*\S/.test(l) && cleanTitle(l).split(" ").length <= 8 ? i : -1)).filter((i) => i >= 0);
    if (heads.length < 2) return [];
    const applyAt = lines.findIndex((l, i) => i > heads[heads.length - 1] && /^\s*(?:to apply|how to apply|apply|للتقديم|طريقة التقديم)\b/i.test(l));
    const tail = applyAt >= 0 ? lines.slice(applyAt).join("\n") : "";
    const intro = lines.slice(0, heads[0]).join("\n").trim();
    return heads.map((h, n) => {
      const stop = n + 1 < heads.length ? heads[n + 1] : applyAt >= 0 ? applyAt : lines.length;
      return { title: cleanTitle(lines[h]), text: [intro, lines.slice(h, stop).join("\n").trim(), tail].filter(Boolean).join("\n\n") };
    });
  }
  // the level follows the years asked when the ad states them: "2–3 years" is mid, not senior
  function levelFromYears(text) {
    const m = text.match(/(\d{1,2})\s*(?:\+|[-–—]\s*\d{1,2})?\s*(?:years?|yrs?|سنوات|سنة|سنين)/i);
    if (!m) return "";
    const y = Number(m[1]);
    return y <= 1 ? "Junior" : y <= 5 ? "Mid" : "Senior";
  }

  async function autofill(text) {
    const st = $("af-status");
    st.classList.remove("bad");
    st.textContent = "نقرأ إعلانك…";
    $("af-run").disabled = true;
    form.querySelectorAll(".autofilled").forEach((f) => f.classList.remove("autofilled"));
    const rules = byRules(text);
    if (rules.title) rules.title = cleanTitle(rules.title);
    // skills by the radar's own rules: before "nice to have" they are required
    const m = MasarATS.match("", { description: text }, await skillsJson());
    rules.required = m.required.join(", ");
    rules.preferred = m.preferred.join(", ");
    fill(rules);
    let model = {};
    try {
      const r = await fetch(`${API}/draft`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (r.ok) model = (await r.json()).draft || {};
    } catch { /* the rules alone still filled the form */ }
    delete model.description;
    if (model.title) model.title = cleanTitle(model.title);
    if (model.company && model.company.length < 3) delete model.company;
    fill(model);
    const years = levelFromYears(text);
    if (years && form.elements.employment.value !== "coop" && form.elements.employment.value !== "internship") fill({ level: years });
    // Masar takes work email only: a personal address in the ad is shown, not filled
    const notes = [];
    const mail = form.elements.contact_email;
    if (!mail.readOnly && /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|proton|protonmail|gmx|yandex|mail)\.[a-z.]+$/i.test(mail.value)) {
      notes.push(`الإيميل في الإعلان شخصي (${mail.value})، ومسار يقبل إيميل عمل الشركة فقط حتى يعرف الطلاب أن الإعلان حقيقي. اكتب إيميل الشركة.`);
      mail.value = "";
      mail.classList.remove("autofilled");
    }
    const filled = form.querySelectorAll(".autofilled").length;
    const empty = ["company", "title", "city", "contact_email"].filter((k) => !form.elements[k].value.trim());
    const NAMES = { company: "اسم الشركة", title: "المسمى", city: "المدينة", contact_email: "إيميل العمل" };
    st.textContent = `الخانات التي عبّيناها من إعلانك: ${filled}، وهي معلّمة بإطار ملوّن. راجعها قبل الإرسال.`
      + (empty.length ? ` اكتب بنفسك: ${empty.map((k) => NAMES[k]).join("، ")}.` : "") + (notes.length ? ` ${notes.join(" ")}` : "");
    $("af-run").disabled = false;
    (empty.length ? form.elements[empty[0]] : form.elements.title).focus();
  }

  $("af-run").addEventListener("click", () => {
    const text = $("af-text").value.trim();
    const st = $("af-status");
    $("af-jobs")?.remove();
    if (text.length < 80) { st.textContent = "الصق نص الإعلان كاملاً، مع المهام والمتطلبات."; st.classList.add("bad"); return; }
    const jobs = splitJobs(text);
    if (jobs.length < 2) { autofill(text); return; }
    // several jobs: the employer picks one; each is published as its own posting
    const box = el("div", "af-jobs");
    box.id = "af-jobs";
    box.append(el("p", null, `في الإعلان ${jobs.length === 2 ? "وظيفتان" : `${jobs.length} وظائف`}. كل وظيفة تُنشر إعلاناً لحالها، حتى يتقدّم لها الطالب بسيرة معدّلة عليها. اختر واحدة نعبّي خاناتها، وبعد ما ترسلها ارجع واختر التالية:`));
    jobs.forEach((j) => {
      const b = el("button", "btn btn-quiet btn-small", j.title);
      b.type = "button";
      b.dir = "auto";
      b.onclick = () => { box.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); autofill(j.text); };
      box.append(b);
    });
    st.textContent = "";
    st.before(box);
    box.querySelector("button").click();
  });
  form.addEventListener("input", (e) => e.target.classList.remove("autofilled"));

  // ---------- send ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    say("نرسل إعلانك…");
    try {
      const r = await fetch(`${API}/board/postings`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        say(WHY[d.error] || "تعذّر إرسال الإعلان. جرّب مرة ثانية.", true);
        // the field the message names is where the cursor goes
        const name = String(d.error || "").replace(/^field:/, "");
        form.elements[name === "work_email" ? "contact_email" : name]?.focus?.();
        return;
      }
      const keep = session ? { company: form.elements.company.value, website: form.elements.website.value, contact_email: form.elements.contact_email.value } : null;
      form.reset();
      if (keep) Object.entries(keep).forEach(([k, v]) => { form.elements[k].value = v; });
      $("af-text").value = "";
      if (session) {
        say("وصلنا إعلانك، وسنراجعه وننشره خلال يوم عمل. تتابعه ومتقدميه من لوحة الشركة.");
        const a = el("a", "btn btn-primary btn-small", "افتح لوحة الشركة");
        a.href = "employer.html";
        status.after(a);
        return;
      }
      say("وصلنا إعلانك، وسنراجعه وننشره خلال يوم عمل. سنتواصل معك على إيميل العمل إن احتجنا توضيحاً.");
      // the private link to the applicants: shown once, the token lives only in it
      const link = new URL(`applicants.html#${d.id}.${d.manage}`, location.href).href;
      const linkBox = el("div", "manage-link");
      const a = el("a", null, link);
      a.href = link; a.dir = "ltr";
      const copy = el("button", "btn btn-primary btn-small", "انسخ الرابط");
      copy.type = "button";
      copy.onclick = () => navigator.clipboard.writeText(link).then(() => { copy.textContent = "نُسخ"; }, () => {});
      linkBox.append(el("strong", null, "احفظ هذا الرابط الآن: منه تشاهد المتقدمين لإعلانك وسيرهم. لا نعرضه مرة ثانية، ولا تشاركه مع أحد."), a, copy);
      status.after(linkBox);
    } catch {
      say("تعذّر الاتصال. تحقق من الإنترنت وجرّب مرة ثانية.", true);
    } finally {
      button.disabled = false;
    }
  });
})();
