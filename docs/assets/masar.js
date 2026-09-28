// Masar landing page: language, the live postings rail, the company logos,
// the skills route and the numbers, from data/summary.json and jobs.json.
// Everything taken from the data is written with textContent, never innerHTML.
(() => {
  "use strict";

  const I18N = {
    ar: {
      nav_label: "الأقسام",
      nav_jobs: "الإعلانات",
      nav_swipe: "قدّم بالسحب",
      nav_cv: "سيرتك",
      nav_apps: "طلباتي",
      nav_market: "مؤشر السوق",
      nav_emp: "للشركات",
      theme_label: "تبديل المظهر",
      mega_1: "لنجد",
      mega_2: "فرصتك الأولى",
      hero_lede: "فرص تدريب تعاوني ووظائف للمبتدئين في السعودية والخليج، تُحدَّث كل يوم. نقول لك ما ينقصك لكل فرصة، ونفصّل سيرتك عليها، وتقدّم بسحبة.",
      search_q: "ابحث بالمسمى أو المهارة",
      search_where: "كل الأماكن",
      search_sa: "السعودية",
      search_gulf: "الخليج كله",
      search_near: "الخليج وعن بُعد",
      search_btn: "ابحث",
      search_try: "جرّب: ",
      quick_label: "بحث سريع",
      q_coop: "تدريب تعاوني", q_training: "كل التدريب", q_student: "دوام طلابي",
      q_noexp: "بدون خبرة", q_sa: "في السعودية", q_remote: "عن بُعد",
      hero_meta: "آخر تحديث {date}.",
      rail_title: "مفتوحة الآن",
      all_jobs: "كل الإعلانات",
      companies_title: "شركات تنشر إعلانات الآن",
      tools_title: "من أول بحث إلى أول رد",
      tools_lede: "أربع أدوات تشتغل مع بعض، كلها مجانية، وبياناتك تبقى في جهازك حتى تقرّر أن تقدّم.",
      demo_match: "المطابقة", demo_apply: "قدّم",
      t1_t: "سيرة لكل إعلان", t1_go: "ابنِ سيرتك",
      t1_p: "ارفع سيرتك مرة، ونفصّلها على كل إعلان بمهاراتك الحقيقية فقط، بالشكل اللي تقرأه أنظمة الفرز.",
      t2_t: "قدّم بسحبة", t2_go: "جرّب السحب",
      t2_p: "يمين تقدّم، يسار تتخطّى. نرسل سيرتك المفصّلة للشركة، ولك خمس ثوانٍ تتراجع فيها.",
      t3_t: "اعرف ما يطلبه السوق", t3_go: "افتح مؤشر السوق",
      t3_p: "المهارات الأكثر طلباً في الإعلانات الحقيقية، مطلوبة أو مفضّلة، لكل دولة ومستوى.",
      t4_t: "تابع طلباتك", t4_go: "طلباتي",
      t4_p: "متى فتحت الشركة سيرتك، وترتيبك بين المتقدمين، وتذكير واحد إذا تأخّر الرد.",
      d_sent: "أُرسل", d_seen: "شافته الشركة", d_short: "القائمة المختصرة",
      line_title: "المهارات اللي تفتح الباب",
      line_lede: "هذا مسار المتدرّب: المهارات الأكثر طلباً في إعلانات التدريب والمبتدئين الآن، محسوبة من إعلانات حقيقية. ابدأ من أول محطة.",
      line_name: "مسار المتدرّب", field_pick: "اختر المجال",
      cta_guide: "دليل التدريب التعاوني",
      cta_market: "افتح مؤشر السوق",
      loading: "جارٍ تحميل البيانات…",
      load_failed: "تعذّر تحميل البيانات. حدّث الصفحة بعد قليل.",
      caption_gulf_entry: "نسبة إعلانات التدريب والمبتدئين في السعودية والخليج التي تطلب كل مهارة، من {n}.",
      caption_entry: "نسبة إعلانات التدريب والمبتدئين التي تطلب كل مهارة، من {n}.",
      caption_all: "نسبة الإعلانات النشطة التي تطلب كل مهارة، من {n}.",
      numbers_label: "الأرقام اليوم",
      n_active: "إعلانات مفتوحة", n_gulf: "في السعودية والخليج", n_entry: "للتدريب والمبتدئين", n_companies: "شركات توظّف",
      how_title: "كيف نجهّز كل إعلان",
      how_lede: "كل رقم في الموقع محسوب من إعلانات حقيقية، ويتحدّث تلقائياً كل يوم.",
      s1_t: "نجمع", s1_p: "نسحب الإعلانات الجديدة كل يوم من منصات توظيف مفتوحة، ومن الشركات مباشرة.",
      s2_t: "نفحص", s2_p: "نحذف المكرر، ونتأكد أن التدريب تدريب فعلاً، ونرفض أي إعلان يطلب رسوماً.",
      s3_t: "نقرأ", s3_p: "يقرأ نموذج ذكاء اصطناعي كل إعلان ويفرّق بين المهارة المطلوبة والمفضّلة.",
      s4_t: "ننشر", s4_p: "تظهر الفرصة عندك مع ما ينقصك لها، جاهزة لسيرة مفصّلة وتقديم.",
      hire_title: "تبحث عن متدربين؟",
      hire_p: "انشر فرصتك مجاناً. نراجعها قبل النشر، وتوصلك سير المتقدمين مرتبة حسب قربهم من متطلباتك.",
      hire_btn: "انشر فرصة",
      f_students: "للطلاب", f_employers: "للشركات", f_about: "عن مسار", f_privacy: "الخصوصية",
      footer_data: "البيانات من الواجهات العامة لـ",
      and: "و",
      footer_repo: "الشيفرة على GitHub",
      exclusive: "حصري",
    },
    en: {
      nav_label: "Sections",
      nav_jobs: "Postings",
      nav_swipe: "Swipe to apply",
      nav_cv: "Your CV",
      nav_apps: "My applications",
      nav_market: "Market index",
      nav_emp: "Employers",
      theme_label: "Switch theme",
      mega_1: "Let's find",
      mega_2: "your first role",
      hero_lede: "Co-op, internships and entry-level roles in Saudi Arabia and the Gulf, updated daily. See what each one asks that you lack, tailor your CV to it, and apply with a swipe.",
      search_q: "Search by title or skill",
      search_where: "Anywhere",
      search_sa: "Saudi Arabia",
      search_gulf: "All the Gulf",
      search_near: "Gulf and remote",
      search_btn: "Search",
      search_try: "Try: ",
      quick_label: "Quick search",
      q_coop: "Co-op", q_training: "All training", q_student: "Part-time for students",
      q_noexp: "No experience", q_sa: "In Saudi Arabia", q_remote: "Remote",
      hero_meta: "Updated {date}.",
      rail_title: "Open now",
      all_jobs: "All postings",
      companies_title: "Companies posting now",
      tools_title: "From first search to first reply",
      tools_lede: "Four free tools that work together. Your data stays on your device until you choose to apply.",
      demo_match: "Match", demo_apply: "Apply",
      t1_t: "A CV for each posting", t1_go: "Build your CV",
      t1_p: "Upload your CV once. It is tailored to each posting with your real skills only, in the format screening systems read.",
      t2_t: "Apply with a swipe", t2_go: "Try swiping",
      t2_p: "Right to apply, left to skip. Your tailored CV goes to the company, with five seconds to undo.",
      t3_t: "Know what the market asks", t3_go: "Open the market index",
      t3_p: "The most requested skills in real postings, required or preferred, by country and level.",
      t4_t: "Track your applications", t4_go: "My applications",
      t4_p: "When the company opened your CV, where you rank among applicants, and one reminder if the reply is late.",
      d_sent: "Sent", d_seen: "Viewed", d_short: "Shortlist",
      line_title: "The skills that open the door",
      line_lede: "The intern line: the most requested skills in internship and junior postings right now, counted from real postings. Start at the first station.",
      line_name: "Intern line", field_pick: "Choose a field",
      cta_guide: "Co-op guide (Arabic)",
      cta_market: "Open the market index",
      loading: "Loading data…",
      load_failed: "The data could not be loaded. Refresh the page in a moment.",
      caption_gulf_entry: "Share of internship and junior postings in Saudi Arabia and the Gulf that require each skill, out of {n}.",
      caption_entry: "Share of internship and junior postings that require each skill, out of {n}.",
      caption_all: "Share of active postings that require each skill, out of {n}.",
      numbers_label: "Today's numbers",
      n_active: "Open postings", n_gulf: "In Saudi Arabia and the Gulf", n_entry: "Internship and junior", n_companies: "Companies hiring",
      how_title: "How each posting is prepared",
      how_lede: "Every number on the site comes from real postings and refreshes on its own each day.",
      s1_t: "Collect", s1_p: "New postings are pulled daily from open job platforms and straight from companies.",
      s2_t: "Check", s2_p: "Duplicates go, training is confirmed to be training, and any posting that asks for fees is refused.",
      s3_t: "Read", s3_p: "An AI model reads each posting and separates required skills from nice-to-haves.",
      s4_t: "Publish", s4_p: "The opening reaches you with what you lack for it, ready for a tailored CV and an application.",
      hire_title: "Looking for interns?",
      hire_p: "Post your opening for free. It is reviewed before it goes live, and applicants' CVs reach you ranked by how close they are to your requirements.",
      hire_btn: "Post an opening",
      f_students: "Students", f_employers: "Employers", f_about: "About Masar", f_privacy: "Privacy",
      footer_data: "Data from the public APIs of",
      and: "and",
      footer_repo: "code on GitHub",
      exclusive: "Exclusive",
    },
  };

  const { el, place } = Masar;
  const L = Masar.i18n(I18N, {
    ar: "مسار — فرصتك الأولى في التدريب والوظائف",
    en: "Masar — your first internship or job",
  });
  const t = (key, vars) => L.t(key, vars);
  const count = (n, noun) => Masar.count(n, noun, L.lang);
  const pct = (share) => Masar.pct(share, L.lang);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let data = null, postings = [];
  let lineField = "data";
  let failed = false;

  // ---------- the headline: each word rises into place, once ----------

  function splitMega() {
    document.querySelectorAll(".mega-line").forEach((line, li) => {
      const words = line.textContent.split(" ");
      line.replaceChildren(...words.flatMap((w, i) => {
        const s = el("span", "w", w);
        s.style.setProperty("--i", li * 2 + i);
        return i ? [" ", s] : [s];
      }));
    });
  }

  // ---------- the search box types its own examples until touched ----------

  const EXAMPLES = ["Data Analyst", "SQL", "Python", "Power BI", "Intern", "Machine Learning", "Excel"];
  let typing = null;
  function typeExamples() {
    const input = document.getElementById("ask-q");
    clearTimeout(typing);
    if (still) return;
    let n = 0, pos = 0, back = false;
    const tick = () => {
      if (document.activeElement === input || input.value) { input.placeholder = t("search_q"); return; }
      const word = EXAMPLES[n % EXAMPLES.length];
      pos += back ? -1 : 1;
      input.placeholder = t("search_try") + word.slice(0, pos);
      let wait = back ? 35 : 85;
      if (!back && pos === word.length) { back = true; wait = 1600; }
      else if (back && pos === 0) { back = false; n += 1; wait = 350; }
      typing = setTimeout(tick, wait);
    };
    typing = setTimeout(tick, 1400);
    input.addEventListener("blur", () => { if (!input.value) typeExamples(); }, { once: true });
  }

  // ---------- live postings: two rows moving in opposite directions ----------

  const KIND = { coop: "q_coop", internship: "q_training", student: "q_student" };
  function card(p) {
    const a = el("a", "rail-card");
    a.href = p.exclusive ? `job.html?ex=${encodeURIComponent(p.id)}` : `job.html?id=${encodeURIComponent(p.id)}`;
    const top = el("div", "rail-top");
    top.append(Masar.logo(p, "co-logo"));
    const tag = p.exclusive ? el("span", "rail-tag wine", t("exclusive"))
      : KIND[p.employment] ? el("span", "rail-tag wine", L.lang === "ar" ? Masar.KINDS[p.employment] : t(KIND[p.employment]))
        : el("span", "rail-tag", Masar.ago(p.posted_at, L.lang));
    top.append(tag);
    a.append(top, el("span", "rail-title", p.title), el("span", "rail-co", p.company),
      el("span", "rail-where", p.location || ""));
    return a;
  }
  function fill(box, items) {
    box.replaceChildren();
    if (!items.length) return;
    const track = el("div", "track");
    // the row is drawn twice so the loop never shows a seam; the copy is hidden
    // from screen readers and taken out of the tab order
    const copy = items.map(card);
    const twin = items.map(card);
    twin.forEach((c) => { c.tabIndex = -1; c.setAttribute("aria-hidden", "true"); });
    track.append(...copy, ...twin);
    track.style.setProperty("--n", items.length);
    box.append(track);
  }
  function renderRail() {
    if (!postings.length) return;
    // training and the Gulf first, then the newest
    const score = (p) => (p.exclusive ? 4 : 0) + (KIND[p.employment] ? 2 : 0) + (place(p) === "gulf" ? 1 : 0);
    const ranked = [...postings].sort((a, b) => score(b) - score(a) || (b.posted_at || "").localeCompare(a.posted_at || ""));
    const pick = ranked.slice(0, 24);
    fill(document.getElementById("rail-a"), pick.filter((_, i) => i % 2 === 0));
    fill(document.getElementById("rail-b"), pick.filter((_, i) => i % 2 === 1));
  }

  function renderLogos() {
    const seen = new Set();
    const firms = postings.filter((p) => /^https:\/\//.test(p.logo || "") && !seen.has(p.company) && seen.add(p.company)).slice(0, 20);
    const box = document.getElementById("logos");
    if (firms.length < 6) return;
    document.getElementById("logos-section").hidden = false;
    const item = (p) => { const s = el("span", "logo-item"); s.append(Masar.logo(p, "co-logo co-logo-lg"), el("span", null, p.company)); return s; };
    const track = el("div", "track");
    const twin = firms.map(item);
    twin.forEach((c) => c.setAttribute("aria-hidden", "true"));
    track.append(...firms.map(item), ...twin);
    track.style.setProperty("--n", firms.length);
    box.replaceChildren(track);
  }

  // ---------- the skills: route panel and the market tile's bars ----------

  function renderRoute() {
    const route = document.getElementById("route");
    const caption = document.getElementById("line-caption");
    route.replaceChildren();
    if (failed) { route.append(el("li", "route-note", t("load_failed"))); caption.textContent = ""; return; }
    if (!data) { route.append(el("li", "route-note", t("loading"))); return; }
    const routes = data.routes || { data: data.route };
    if (!routes[lineField]) lineField = Object.keys(routes)[0] || "data";
    const r = routes[lineField] || data.route;
    // one button per field that has enough postings for a line of its own
    const sw = document.getElementById("field-switch");
    const names = L.lang === "en" ? Masar.FIELDS_EN : Masar.FIELDS;
    sw.replaceChildren(...Object.keys(routes).map((f) => {
      const b = el("button", "field-btn", names[f] || f);
      b.type = "button";
      b.setAttribute("aria-pressed", String(f === lineField));
      b.onclick = () => { lineField = f; renderRoute(); };
      return b;
    }));
    sw.hidden = Object.keys(routes).length < 2;
    caption.textContent = t(`caption_${r.basis}`, { n: count(r.postings, "posting") });
    r.stops.forEach((s, i) => {
      const li = el("li", "stop");
      li.style.setProperty("--i", i);
      const dot = el("span", "dot");
      dot.setAttribute("aria-hidden", "true");
      li.append(dot, el("span", "stop-name", s.name), el("span", "stop-share", pct(s.share)));
      route.append(li);
    });
  }

  function renderBars() {
    const ol = document.getElementById("demo-bars");
    ol.replaceChildren();
    if (!data) return;
    const top = data.top_skills.slice(0, 5);
    const max = Math.max(...top.map((s) => s.share));
    top.forEach((s, i) => {
      const li = el("li");
      li.style.setProperty("--w", s.share / max);
      li.style.setProperty("--i", i);
      li.append(el("span", null, s.name), el("i"), el("b", null, pct(s.share)));
      ol.append(li);
    });
  }

  // ---------- numbers count up the first time they are seen ----------

  let counted = false;
  function renderNumbers() {
    const nums = document.querySelectorAll(".num");
    if (!data) return;
    const set = (n, v) => { n.textContent = String(v); };
    if (counted || still) { nums.forEach((n) => set(n, data[n.dataset.key] ?? 0)); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      counted = true;
      const start = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - start) / 1200), ease = 1 - (1 - k) ** 3;
        nums.forEach((n) => set(n, Math.round((data[n.dataset.key] ?? 0) * ease)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(document.querySelector(".numbers"));
  }

  function renderMeta() {
    document.getElementById("hero-meta").textContent = data ? t("hero_meta", { date: Masar.date(data.updated_at, L.lang) }) : "";
  }

  function render() {
    L.apply();
    Masar.nav(L.lang);
    Masar.accountButton(L.lang);
    splitMega();
    typeExamples();
    renderMeta(); renderRoute(); renderBars(); renderNumbers(); renderRail(); renderLogos();
  }

  document.getElementById("lang-toggle").addEventListener("click", () => { L.toggle(); render(); });
  Masar.initTheme();
  render();

  fetch("data/summary.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((d) => { data = d; renderMeta(); renderRoute(); renderBars(); renderNumbers(); })
    .catch(() => { failed = true; renderRoute(); });

  // exclusive postings come from the worker; the page works without them
  const API = document.querySelector('meta[name="masar-api"]').content;
  const exclusive = fetch(`${API}/board/postings`).then((r) => r.json()).then((d) => d.postings.map((p) => ({
    id: p.id, title: p.title, company: p.company, location: p.city, posted_at: (p.created_at || "").slice(0, 10),
    countries: [p.country], regions: [], mode: p.workplace, employment: p.employment, exclusive: true,
    logo: Masar.siteIcon(p.website),
  }))).catch(() => []);
  Promise.all([fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).catch(() => ({ postings: [] })), exclusive])
    .then(([d, ex]) => { postings = [...ex, ...d.postings]; renderRail(); renderLogos(); });
})();
