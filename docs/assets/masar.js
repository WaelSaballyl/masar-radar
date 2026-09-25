// Masar landing page: language, theme, and the numbers from data/summary.json.
// Everything taken from the data is written with textContent, never innerHTML.
(() => {
  "use strict";

  const I18N = {
    ar: {
      brand: "مسار",
      nav_label: "الأقسام",
      nav_coop: "فرص التدريب",
      nav_jobs: "الإعلانات",
      all_jobs: "كل الإعلانات",
      nav_how: "كيف نبني المؤشر",
      nav_market: "مؤشر السوق",
      nav_cv: "سيرتك",
      theme_label: "تبديل المظهر",
      hero_title: "اعرف ما تطلبه الشركات من المتدرّب قبل أن تقدّم",
      hero_lede: "نقرأ إعلانات وظائف البيانات كل يوم ونستخرج المهارات التي تطلبها فعلاً. هذا مسار المهارات الأكثر طلباً في إعلانات التدريب والمبتدئين الآن.",
      cta_coop: "تصفّح فرص التدريب",
      cta_market: "افتح مؤشر السوق",
      line_name: "مسار المتدرّب",
      loading: "جارٍ تحميل البيانات…",
      load_failed: "تعذّر تحميل البيانات. حدّث الصفحة بعد قليل.",
      caption_gulf_entry: "نسبة إعلانات التدريب والمبتدئين في السعودية والخليج التي تطلب كل مهارة، من {n}.",
      caption_entry: "نسبة إعلانات التدريب والمبتدئين التي تطلب كل مهارة، من {n}.",
      caption_all: "نسبة الإعلانات النشطة التي تطلب كل مهارة، من {n}.",
      // no adjective on the count: its gender and case would have to follow
      // the number ("إعلاناً نشطاً" for 11-99, "إعلانات نشطة" for 3-10)
      hero_meta: "إعلانات مفتوحة الآن: {active_n}، من {companies}. آخر تحديث {date}.",
      coop_title: "فرص تدريب ووظائف للمبتدئين",
      coop_lede: "المصادر الحالية عالمية، ومعظم فرصها عن بُعد أو في أوروبا. نعمل على إضافة مصادر سعودية.",
      coop_lede_gulf: "فرص تدريب ووظائف للمبتدئين في السعودية والخليج، الأحدث أولاً. تتحدّث كل يوم.",
      companies_title_gulf: "شركات تنشر إعلانات بيانات في السعودية والخليج الآن",
      coop_empty: "لا توجد فرص تدريب نشطة في آخر تحديث. ابدأ بالمهارات في مسار المتدرّب أعلاه، وارجع غداً.",
      level_intern: "تدريب",
      level_junior: "مبتدئ",
      open_posting: "افتح الإعلان",
      how_title: "كيف نبني المؤشر",
      how_lede: "كل رقم في هذه الصفحة محسوب من إعلانات حقيقية، ويتحدّث تلقائياً كل يوم.",
      s1_t: "نجمع", s1_p: "نسحب الإعلانات الجديدة كل يوم من أربع منصات توظيف مفتوحة.",
      s2_t: "نفلتر", s2_p: "نستبعد ما لا علاقة له بالبيانات، مثل إعلانات الامتثال والمبيعات.",
      s3_t: "نقرأ", s3_p: "يقرأ نموذج ذكاء اصطناعي كل إعلان ويفرّق بين المهارة المطلوبة والمفضّلة.",
      s4_t: "ننشر", s4_p: "يتحدّث المؤشر وهذه الصفحة تلقائياً بعد كل تشغيل.",
      companies_title: "شركات تنشر إعلانات بيانات الآن",
      next_title: "قادم في مسار",
      building: "قيد البناء",
      try_now: "جرّبها الآن",
      n1_t: "سيرة ذاتية معدّلة لكل فرصة",
      n1_p: "ترفع سيرتك أو تجيب عن أسئلة قصيرة، ونعدّلها حسب متطلبات الإعلان دون إضافة ما ليس عندك.",
      n2_t: "مطابقة الفرص مع مهاراتك",
      n2_p: "نقارن مهاراتك بالمطلوب في كل إعلان، ونوضّح ما ينقصك قبل أن تقدّم.",
      n3_t: "التقديم بضغطة",
      n3_p: "نجهّز السيرة ورسالة التغطية ونفتح صفحة التقديم، وأنت من يرسل.",
      footer_data: "البيانات من الواجهات العامة لـ",
      and: "و",
      footer_code: "مسار مشروع مفتوح المصدر:",
      footer_repo: "الشيفرة على GitHub",
      list_sep: "، ",
    },
    en: {
      brand: "Masar",
      nav_label: "Sections",
      nav_coop: "Internships",
      nav_jobs: "Postings",
      all_jobs: "All postings",
      nav_how: "How it works",
      nav_market: "Market index",
      nav_cv: "Your CV",
      theme_label: "Switch theme",
      hero_title: "Know what companies ask of an intern before you apply",
      hero_lede: "We read data job postings every day and pull out the skills they actually require. This is the route of the most requested skills in internship and junior postings right now.",
      cta_coop: "Browse internships",
      cta_market: "Open the market index",
      line_name: "Intern line",
      loading: "Loading data…",
      load_failed: "The data could not be loaded. Refresh the page in a moment.",
      caption_gulf_entry: "Share of internship and junior postings in Saudi Arabia and the Gulf that require each skill, out of {n}.",
      caption_entry: "Share of internship and junior postings that require each skill, out of {n}.",
      caption_all: "Share of active postings that require each skill, out of {n}.",
      hero_meta: "Open postings: {active_n}, from {companies}. Updated {date}.",
      coop_title: "Internships and junior roles",
      coop_lede: "Current sources are international, and most openings are remote or in Europe. Saudi sources are being added.",
      coop_lede_gulf: "Internships and junior roles in Saudi Arabia and the Gulf, newest first. Updated daily.",
      companies_title_gulf: "Companies posting data roles in Saudi Arabia and the Gulf now",
      coop_empty: "No internships were open in the latest update. Start with the skills on the intern line above, and check back tomorrow.",
      level_intern: "Internship",
      level_junior: "Junior",
      open_posting: "Open posting",
      how_title: "How the index is built",
      how_lede: "Every number on this page comes from real postings and refreshes on its own each day.",
      s1_t: "Collect", s1_p: "New postings are pulled daily from four open job platforms.",
      s2_t: "Filter", s2_p: "Anything unrelated to data, such as compliance or sales roles, is dropped.",
      s3_t: "Read", s3_p: "An AI model reads each posting and separates required skills from nice-to-haves.",
      s4_t: "Publish", s4_p: "The index and this page update automatically after every run.",
      companies_title: "Companies posting data roles now",
      next_title: "Coming to Masar",
      building: "In progress",
      try_now: "Try it now",
      n1_t: "A CV tailored to each opening",
      n1_p: "Upload your CV or answer a few questions, and it is adjusted to the posting without adding anything you don't have.",
      n2_t: "Match openings to your skills",
      n2_p: "Your skills are compared with each posting, so you see what is missing before you apply.",
      n3_t: "One-click apply",
      n3_p: "Your CV and cover letter are prepared and the application page opens. You press send.",
      footer_data: "Data from the public APIs of",
      and: "and",
      footer_code: "Masar is open source:",
      footer_repo: "code on GitHub",
      list_sep: ", ",
    },
  };

  // Formatting and language plumbing live in core.js, shared with the market index.
  const { el, safeUrl } = Masar;
  const L = Masar.i18n(I18N, {
    ar: "مسار — دليلك للتدريب التعاوني في البيانات",
    en: "Masar — your guide to data internships",
  });
  const t = (key, vars) => L.t(key, vars);
  const count = (n, noun) => Masar.count(n, noun, L.lang);
  const pct = (share) => Masar.pct(share, L.lang);
  const date = (iso) => Masar.date(iso, L.lang);

  let data = null;
  let failed = false;

  // ---------- rendering ----------

  function renderStatic() {
    L.apply();
    // once Gulf postings exist the list and company names show only them
    if (data && data.jobs_basis === "gulf") document.getElementById("coop-lede").textContent = t("coop_lede_gulf");
    if (data && data.companies_basis === "gulf") document.getElementById("companies-title").textContent = t("companies_title_gulf");
  }

  function renderRoute() {
    const route = document.getElementById("route");
    const caption = document.getElementById("line-caption");
    route.replaceChildren();
    if (failed) { route.append(el("li", "route-note", t("load_failed"))); caption.textContent = ""; return; }
    if (!data) { route.append(el("li", "route-note", t("loading"))); return; }

    const r = data.route;
    caption.textContent = t(`caption_${r.basis}`, { n: count(r.postings, "posting") });
    r.stops.forEach((s, i) => {
      const li = el("li", "stop");
      li.style.setProperty("--i", i);
      li.append(el("span", "dot"), el("span", "stop-name", s.name), el("span", "stop-share", pct(s.share)));
      li.querySelector(".dot").setAttribute("aria-hidden", "true");
      route.append(li);
    });
  }

  function renderMeta() {
    const meta = document.getElementById("hero-meta");
    if (!data) { meta.textContent = ""; return; }
    meta.textContent = t("hero_meta", {
      active_n: data.active_postings,
      companies: count(data.companies, "company"),
      date: date(data.updated_at),
    });
  }

  function renderJobs() {
    const list = document.getElementById("jobs");
    list.replaceChildren();
    if (!data) return;
    if (!data.entry_jobs.length) { list.append(el("li", "empty", t("coop_empty"))); return; }
    data.entry_jobs.forEach((j) => {
      const li = el("li", "job");
      const who = el("div");
      who.append(el("span", "job-title", j.title), el("span", "job-company", j.company));
      const level = j.level === "Intern" ? "intern" : "junior";
      li.append(who, el("span", "job-where", j.location || "—"),
                el("span", `level level-${level}`, t(`level_${level}`)));
      const href = safeUrl(j.url);
      if (href) {
        const a = el("a", null, t("open_posting"));
        a.href = href; a.rel = "noopener"; a.target = "_blank";
        li.append(a);
      } else {
        li.append(el("span"));
      }
      list.append(li);
    });
  }

  function renderCompanies() {
    const p = document.getElementById("companies");
    p.textContent = data ? data.company_names.join(t("list_sep")) : "";
  }

  function render() { renderStatic(); renderMeta(); renderRoute(); renderJobs(); renderCompanies(); }

  // ---------- controls ----------

  document.getElementById("lang-toggle").addEventListener("click", () => { L.toggle(); render(); });
  Masar.initTheme();

  render();
  fetch("data/summary.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((d) => { data = d; render(); })
    .catch(() => { failed = true; render(); });
})();
