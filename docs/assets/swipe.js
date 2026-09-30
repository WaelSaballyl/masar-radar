// Swipe to apply on exclusive postings. Right: the worker tailors the saved
// profile to the posting (contact fields stripped, as on the CV page), the CV
// is rendered here, and it goes to the employer with the contact details the
// student agreed to send. Left: skipped, not shown again. A posting far from
// the student's skills is not sent: a blind application costs them standing.
(() => {
  "use strict";
  const { el, store } = Masar;
  const { withoutContact, renderCV, toBlocks } = MasarCV;
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content.replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const list = (key) => { try { return JSON.parse(store.get(key) || "[]"); } catch { return []; } };
  const push = (key, id) => store.set(key, JSON.stringify([...list(key), id]));
  const TYPES = { full_time: "دوام كامل", part_time: "دوام جزئي", internship: "تدريب", coop: "تدريب تعاوني", contract: "عقد" };
  const MODES = { onsite: "حضوري", hybrid: "هجين", remote: "عن بُعد" };

  let profile = {};
  try { profile = JSON.parse(store.get("masar.profile") || "{}"); } catch { /* a damaged copy */ }
  let queue = [];

  // ---------- setup: a profile to tailor from, and consent once ----------

  const ready = () => profile.name && profile.email && (profile.skills || profile.experience || profile.projects);
  function setup() {
    if (!ready()) {
      $("setup").hidden = false;
      $("setup-need").textContent = "";
      const a = el("a", null, "أكمل معلوماتك في صفحة سيرتك");
      a.href = "cv.html";
      $("setup-need").append(a, " (الاسم والإيميل ومهاراتك أو خبراتك) ثم ارجع هنا.");
      $("consent").disabled = $("start").disabled = true;
      return false;
    }
    if (store.get("masar.swipe.consent") === "1") return true;
    $("setup").hidden = false;
    $("setup-need").textContent = `سنقدّم باسم ${profile.name} وإيميل ${profile.email}.`;
    return false;
  }
  $("start").addEventListener("click", () => {
    if (!$("consent").checked) { $("consent").focus(); return; }
    store.set("masar.swipe.consent", "1");
    store.set("masar.swipe.lang", $("cv-lang").value);
    $("setup").hidden = true;
    $("setup").classList.remove("sheet");
    if (!PHONE) deal();
    else if (pending) { const go = pending; pending = null; go(); }
  });
  $("later").addEventListener("click", () => { $("setup").hidden = true; $("setup").classList.remove("sheet"); pending = null; });
  $("cv-lang").value = store.get("masar.swipe.lang") || "en";

  // ---------- the deck ----------

  function card(p) {
    const c = el("article", "swipe-card");
    c.tabIndex = -1;
    const top = el("div", "posting-top");
    top.append(el("span", "badge-exclusive", "حصري على مسار"));
    if (TYPES[p.employment]) top.append(el("span", "tag", TYPES[p.employment]));
    if (MODES[p.workplace]) top.append(el("span", "tag", MODES[p.workplace]));
    const title = el("h2", "swipe-title", p.title);
    title.dir = "auto";
    const who = el("p", "posting-who", `${p.company}، ${p.city}`);
    const skills = el("p", "posting-skills");
    p.required.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8).forEach((s) => skills.append(el("span", "skill", s)));
    const desc = el("p", "swipe-desc", p.description.slice(0, 320) + (p.description.length > 320 ? "…" : ""));
    desc.dir = "auto";
    c.append(el("span", "stamp stamp-go", "قدّم"), el("span", "stamp stamp-skip", "تخطَّ"), top, title, who, skills, desc);
    if (p.salary) c.append(el("p", "posting-pref", p.salary));
    return c;
  }

  function deal() {
    const deck = $("deck");
    deck.replaceChildren();
    const next = queue.slice(0, 3);
    $("buttons").hidden = !next.length;
    if (!next.length) {
      const empty = el("p", "swipe-empty", "خلصت الإعلانات الحصرية الجديدة. نضيف إعلانات كل ما نشرتها الشركات، وتلاقي كل الإعلانات الثانية في صفحة الإعلانات. ");
      if (!DEMO) {
        const a = el("a", null, "جرّب السحب على إعلانات وهمية");
        a.href = "swipe.html?demo=1";
        empty.append(a, ".");
      }
      deck.append(empty);
      return;
    }
    // the top card is last in the DOM, so it paints above the others
    next.slice().reverse().forEach((p, i, all) => {
      const c = card(p);
      c.style.setProperty("--depth", all.length - 1 - i);
      deck.append(c);
    });
    const top = deck.lastElementChild;
    top.classList.add("top");
    drag(top);
  }

  // pointer drag: the card leans with the pull, a stamp fades in, and past a
  // third of its width (or a quick flick) it decides
  function drag(c) {
    let x0 = 0, dx = 0, t0 = 0, held = false;
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      held = true; x0 = e.clientX; t0 = performance.now(); dx = 0;
      c.setPointerCapture(e.pointerId);
      c.classList.add("held");
    });
    c.addEventListener("pointermove", (e) => {
      if (!held) return;
      dx = e.clientX - x0;
      c.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      c.style.setProperty("--go", Math.max(0, Math.min(1, dx / 120)));
      c.style.setProperty("--skip", Math.max(0, Math.min(1, -dx / 120)));
    });
    const release = () => {
      if (!held) return;
      held = false;
      c.classList.remove("held");
      const fast = Math.abs(dx) / (performance.now() - t0) > 0.6 && Math.abs(dx) > 40;
      if (Math.abs(dx) > c.offsetWidth / 3 || fast) decide(dx > 0);
      else { c.style.transform = ""; c.style.setProperty("--go", 0); c.style.setProperty("--skip", 0); }
    };
    c.addEventListener("pointerup", release);
    c.addEventListener("pointercancel", release);
  }

  // Right: the card shrinks into the next station on the route line above the
  // deck, which is the student's path of applications. Left: it drops away.
  // a tab that is not drawing never finishes an animation: give up waiting after a second
  const settle = (a) => Promise.race([a.finished, new Promise((ok) => setTimeout(ok, 1000))]);
  async function decide(yes) {
    const c = $("deck").querySelector(".swipe-card.top");
    if (!c || c.classList.contains("leaving")) return;
    const p = queue.shift();
    c.classList.add("leaving");
    let station;
    if (yes) {
      station = el("li", "station pending");
      station.title = `${p.title}، ${p.company}`;
      $("route").append(station);
      const from = c.getBoundingClientRect(), to = station.getBoundingClientRect();
      const moveX = to.left + to.width / 2 - (from.left + from.width / 2);
      const moveY = to.top + to.height / 2 - (from.top + from.height / 2);
      // the application starts now; the animation is only its picture
      push("masar.applied", p.id);
      send(p, station);
      await settle(c.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [
        { transform: c.style.transform || "none", borderRadius: "16px", opacity: 1 },
        { transform: `translate(${moveX * 0.5}px, ${moveY * 0.5 - 40}px) rotate(0deg) scale(0.45)`, borderRadius: "40px", opacity: 1, offset: 0.55 },
        { transform: `translate(${moveX}px, ${moveY}px) scale(0.02)`, borderRadius: "50%", opacity: 0.2 },
      ], { duration: still ? 150 : 650, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards" }));
      station.classList.add("arrived");
    } else {
      push("masar.skipped", p.id);
      await settle(c.animate(still ? [{ opacity: 1 }, { opacity: 0 }] : [
        { transform: c.style.transform || "none", opacity: 1 },
        { transform: "translate(-120%, 60px) rotate(-24deg)", opacity: 0 },
      ], { duration: still ? 150 : 380, easing: "ease-in", fill: "forwards" }));
    }
    deal();
  }

  $("go").addEventListener("click", () => decide(true));
  $("skip").addEventListener("click", () => decide(false));
  document.addEventListener("keydown", (e) => {
    if ($("buttons").hidden || e.target.closest("input, select, textarea")) return;
    if (e.key === "ArrowRight") decide(true);
    if (e.key === "ArrowLeft") decide(false);
  });

  // ---------- applying, one at a time, in the background ----------

  const log = (p, text, bad) => {
    const li = el("li", bad ? "bad" : null);
    li.append(el("strong", null, `${p.title}، ${p.company}: `), text);
    $("log").prepend(li);
    return li;
  };
  const post = async (path, body) => {
    const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error), { code: data.error });
    return data;
  };
  const WHY = { rate: "وصلت للحد المسموح في هذه الساعة، جرّب بعد قليل.", busy: "الخدمة مشغولة، جرّب بعد دقيقة.",
    applied: "قدّمت عليه من قبل.", closed: "الإعلان أُغلق." };

  let chain = Promise.resolve();
  function send(p, station) {
    if (DEMO) return demoSend(p, station);
    chain = chain.then(async () => {
      const lang = store.get("masar.swipe.lang") || "en";
      const job = { description: `${p.title} - ${p.company}, ${p.city}\n\n${p.description}\n\nRequired: ${p.required}`
        + (p.preferred ? `\nPreferred: ${p.preferred}` : "") };
      try {
        const out = await post("/tailor", { profile: withoutContact(profile), job, lang });
        const { required, matched } = out.coverage;
        if (required.length >= 4 && matched.length / required.length <= 0.25) {
          station.className = "station arrived held-back";
          const li = log(p, "بعيد عن مهاراتك، فلم نرسله باسمك. ", true);
          const a = el("a", null, "جهّز سيرتك له يدوياً");
          a.href = `cv.html?ex=${encodeURIComponent(p.id)}`;
          li.append(a);
          store.set("masar.applied", JSON.stringify(list("masar.applied").filter((x) => x !== p.id)));
          return;
        }
        renderCV($("scratch"), out.cv, profile, lang);
        const { receipt } = await post("/board/apply", { posting_id: p.id, consent: true, name: profile.name, email: profile.email,
          phone: profile.phone, link: profile.link, matched: matched.length, required: required.length, paper: toBlocks($("scratch")) });
        MasarCV.keepReceipt(receipt);
        station.className = "station arrived sent";
        log(p, required.length ? `أرسلنا سيرتك. عندك ${matched.length} من ${required.length} مهارات مطلوبة.` : "أرسلنا سيرتك.");
      } catch (e) {
        station.className = `station arrived ${e.code === "applied" ? "sent" : "failed"}`;
        if (e.code !== "applied") store.set("masar.applied", JSON.stringify(list("masar.applied").filter((x) => x !== p.id)));
        log(p, WHY[e.code] || "تعذّر الإرسال. سيعود الإعلان في المرة القادمة.", e.code !== "applied");
      }
    });
  }

  // ---------- phones: a vertical feed, one posting a screen ----------
  // Up for the next posting, right (or the ✓ on the rail) to apply. Exclusive
  // postings come first and are applied to from here; the Gulf postings we
  // collect follow, best fit first, and open at their source.

  const PHONE = matchMedia("(max-width: 720px)").matches;
  let pending = null; // an apply waiting for the profile or the consent
  const { fit, yearsText, KINDS } = Masar;
  const SAVED = "masar.saved";

  function applyFrom(p, reel) {
    if (!DEMO && !(ready() && store.get("masar.swipe.consent") === "1")) {
      setup();
      $("setup").classList.add("sheet");
      pending = () => applyFrom(p, reel);
      return;
    }
    if (reel.classList.contains("applied")) return;
    reel.classList.add("applied");
    // sending a CV cannot be taken back, so it waits five seconds for "undo"
    document.querySelector(".undo-toast")?.commit();
    const toast = el("div", "undo-toast");
    toast.setAttribute("role", "status");
    const undo = el("button", "btn btn-quiet btn-small", "تراجع");
    undo.type = "button";
    toast.append(el("span", null, `نرسل سيرتك إلى ${p.company} خلال 5 ثوانٍ`), undo);
    document.body.append(toast);
    const timer = setTimeout(() => toast.commit(), 5000);
    undo.onclick = () => { clearTimeout(timer); toast.remove(); reel.classList.remove("applied"); };
    toast.commit = () => {
      clearTimeout(timer);
      toast.remove();
      const station = el("li", "station pending arrived");
      station.title = `${p.title}، ${p.company}`;
      $("route").append(station);
      push("masar.applied", p.id);
      send(p, station);
    };
    setTimeout(() => reel.nextElementSibling?.scrollIntoView({ behavior: still ? "auto" : "smooth" }), 900);
  }

  function railButton(label, icon, cls) {
    const b = el("button", `rail-btn ${cls || ""}`);
    b.type = "button";
    b.append(el("span", "rail-icon", icon), el("span", "rail-label", label));
    return b;
  }

  function reel(p, first) {
    const r = el("section", `reel${p.exclusive ? " exclusive" : ""}${p.kind && p.kind !== "job" ? " training" : ""}`);
    const body = el("div", "reel-body");
    const tags = el("div", "posting-top");
    if (p.exclusive) tags.append(el("span", "badge-exclusive", "حصري على مسار"));
    if (p.verified) tags.append(Masar.verifiedBadge());
    if (KINDS[p.kind] && p.kind !== "job") tags.append(el("span", "tag tag-training", KINDS[p.kind]));
    if (p.years != null) tags.append(el("span", "tag", yearsText(p.years)));
    if (MODES[p.mode]) tags.append(el("span", "tag", MODES[p.mode]));
    const h = el("h2", "reel-title", p.title);
    h.dir = "auto";
    body.append(tags, h);
    // the top of the screen: who is hiring, where, and how close the student is
    const head = el("div", "reel-head");
    const mono = Masar.logo(p, "reel-logo");
    const who = el("div", "reel-org");
    const name = el("strong", null, p.company);
    name.dir = "auto";
    who.append(name, el("span", null, [p.location, p.posted_at || p.created_at ? Masar.ago((p.posted_at || p.created_at).slice(0, 10), "ar") : ""]
      .filter(Boolean).join("، ")));
    head.append(mono, who);
    const f = fit(p);
    if (f) {
      const ring = el("div", `reel-fit${f.have / f.of >= 0.6 ? " good" : ""}`);
      ring.style.setProperty("--share", f.have / f.of);
      ring.append(el("strong", null, `${f.have}/${f.of}`), el("span", null, "من مهاراتك"));
      head.append(ring);
    }
    const chips = el("p", "posting-skills");
    p.skills.filter((s) => s[1]).slice(0, 5).forEach(([s]) => chips.append(el("span", `skill${Masar.mine() && Masar.has(s) ? " have" : ""}`, s)));
    if (chips.children.length) body.append(chips);
    if (p.description) {
      const d = el("p", "reel-desc", p.description.slice(0, 200) + (p.description.length > 200 ? "…" : ""));
      d.dir = "auto";
      body.append(d);
    }
    if (first) body.append(el("p", "reel-hint", p.exclusive ? "اضغط ✓ لتقدّم، واسحب لفوق للإعلان التالي" : "اسحب لفوق للإعلان التالي"));

    const rail = el("div", "rail");
    if (p.exclusive) {
      const go = railButton("قدّم", "✓", "go");
      go.onclick = () => applyFrom(p, r);
      rail.append(go);
    } else {
      const href = Masar.safeUrl(p.url);
      if (href) {
        const open = el("a", "rail-btn go");
        open.href = href; open.target = "_blank"; open.rel = "noopener";
        open.append(el("span", "rail-icon", "↗"), el("span", "rail-label", "افتح"));
        rail.append(open);
      }
      const cv = el("a", "rail-btn");
      cv.href = `cv.html?job=${encodeURIComponent(p.id)}`;
      cv.append(el("span", "rail-icon", "✎"), el("span", "rail-label", "سيرتي"));
      rail.append(cv);
    }
    const save = railButton("احفظ", "☆");
    const paint = () => {
      const on = list(SAVED).includes(p.id);
      save.querySelector(".rail-icon").textContent = on ? "★" : "☆";
      save.classList.toggle("on", on);
    };
    save.onclick = () => {
      const all = list(SAVED);
      store.set(SAVED, JSON.stringify(all.includes(p.id) ? all.filter((x) => x !== p.id) : [...all, p.id]));
      paint();
    };
    paint();
    const share = railButton("شارك", "⤴");
    share.onclick = async () => {
      const url = new URL(`job.html?${p.exclusive ? "ex" : "id"}=${encodeURIComponent(p.id)}`, location.href).href;
      try {
        if (navigator.share) await navigator.share({ title: `${p.title}، ${p.company}`, url });
        else await navigator.clipboard.writeText(url);
      } catch { /* the share sheet was closed */ }
    };
    rail.append(save, share);
    const stamp = el("span", "reel-stamp", "قدّمت");
    stamp.setAttribute("aria-hidden", "true");
    // the middle of the screen, as on the reference banners: one big word for what this is
    const WORD = { coop: "CO-OP", internship: "INTERNSHIP", student: "STUDENT JOB", graduate: "GRADUATE" };
    const word = el("p", "reel-word", WORD[p.kind] || (p.role || "Data job").toUpperCase());
    word.setAttribute("aria-hidden", "true");
    r.append(head, word, body, rail, stamp);
    return r;
  }

  const asExclusive = (p) => ({ ...p, exclusive: true, location: p.city, logo: Masar.siteIcon(p.website), mode: p.workplace, countries: [p.country],
    kind: p.employment === "coop" || p.employment === "internship" ? p.employment : "job", years: null,
    skills: [...p.required.split(",").map((s) => [s.trim(), 1]), ...(p.preferred || "").split(",").map((s) => [s.trim(), 0])].filter((s) => s[0]) });

  function feed(exclusive, gulf) {
    document.body.classList.add("feed-mode");
    const box = $("feed");
    box.hidden = false;
    const score = (p) => { const f = fit(p); return f ? f.have / f.of : -1; };
    const others = gulf.map((p) => ({ ...p, kind: p.employment || "job" }))
      .sort((a, b) => score(b) - score(a) || (b.posted_at || "").localeCompare(a.posted_at || "")).slice(0, 60);
    const items = [...exclusive.map(asExclusive), ...others];
    items.forEach((p, i) => box.append(reel(p, i === 0)));
    const end = el("section", "reel reel-end");
    const more = el("a", "btn btn-primary", "كل الإعلانات");
    more.href = "jobs.html";
    end.append(el("p", null, items.length ? "وصلت لآخر الإعلانات. نضيف الجديد كل يوم." : "لا توجد إعلانات الآن."), more);
    box.append(end);
  }

  // ---------- start ----------

  // swipe.html?demo=1: made-up postings, nothing sent, nothing saved - to try the deck
  const DEMO = new URLSearchParams(location.search).has("demo");
  function demoSend(p, station) {
    setTimeout(() => {
      station.className = `station arrived ${p.far ? "held-back" : "sent"}`;
      log(p, p.far ? "بعيد عن مهاراتك، فلم نرسله باسمك (تجربة)." : "أرسلنا سيرتك (تجربة: لم يُرسل شيء فعلاً).", p.far);
    }, 1500);
  }
  const gulf = PHONE ? fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json())
    .then((d) => d.postings.filter((p) => Masar.place(p) === "gulf")).catch(() => []) : Promise.resolve([]);

  if (DEMO) {
    const d = (id, title, company, city, employment, workplace, required, description, far) =>
      ({ id, title, company, city, employment, workplace, required, description, salary: "", far });
    queue = [
      d("demo1", "Data Analyst Co-op", "شركة تجريبية للتجزئة", "الرياض", "coop", "hybrid", "SQL, Excel, Power BI",
        "إعلان تجريبي. تنظّف بيانات المبيعات بـ SQL وتبني لوحات Power BI لمدراء الفروع، وتعرض النتائج أسبوعياً على الفريق."),
      d("demo2", "BI Intern", "شركة تجريبية للخدمات اللوجستية", "جدة", "internship", "onsite", "Power BI, DAX, Excel",
        "إعلان تجريبي. تدريب صيفي لبناء تقارير الشحنات اليومية ومؤشرات الأداء للإدارة."),
      d("demo3", "Junior Data Scientist", "شركة تجريبية للتقنية المالية", "الخبر", "full_time", "remote", "Python, Spark, Airflow, AWS, Kubernetes",
        "إعلان تجريبي. بناء نماذج لتوقع الاحتيال ونشرها على بيئة سحابية. هذا الإعلان بعيد عن ملف طالب مبتدئ عمداً، لترى كيف نحجبه.", true),
      d("demo4", "Reporting Analyst Co-op", "جهة تجريبية حكومية", "الدمام", "coop", "onsite", "Excel, SQL",
        "إعلان تجريبي. إعداد التقارير الشهرية وأتمتة جداول Excel ومراجعة جودة البيانات."),
    ];
    const note = el("p", "swipe-demo", "وضع التجربة: إعلانات وهمية، ولا يُرسل أي شيء. ");
    const out = el("a", null, "اخرج من التجربة");
    out.href = "swipe.html";
    note.append(out);
    $("route").before(note);
    $("try-demo").hidden = true;
    document.body.classList.add("demo");
    if (PHONE) gulf.then((g) => feed(queue, g)); else deal();
  } else {
    Promise.all([fetch(`${API}/board/postings`).then((r) => r.json()).then((d) => d.postings), gulf]).then(([postings, g]) => {
      const seen = new Set([...list("masar.applied"), ...list("masar.skipped")]);
      queue = postings.filter((p) => !seen.has(p.id));
      // the path so far: one station per posting already applied to
      list("masar.applied").slice(-24).forEach(() => $("route").append(el("li", "station arrived sent")));
      if (PHONE) feed(queue, g);
      else if (setup()) deal();
    }).catch(() => { $("deck").append(el("p", "swipe-empty", "تعذّر تحميل الإعلانات. تحقق من الإنترنت وحدّث الصفحة.")); });
  }
})();
