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
    deal();
  });
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
      deck.append(el("p", "swipe-empty", "خلصت الإعلانات الحصرية الجديدة. نضيف إعلانات كل ما نشرتها الشركات، وتلاقي كل الإعلانات الثانية في صفحة الإعلانات."));
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
        await post("/board/apply", { posting_id: p.id, consent: true, name: profile.name, email: profile.email,
          phone: profile.phone, link: profile.link, matched: matched.length, required: required.length, paper: toBlocks($("scratch")) });
        station.className = "station arrived sent";
        log(p, required.length ? `أرسلنا سيرتك. عندك ${matched.length} من ${required.length} مهارات مطلوبة.` : "أرسلنا سيرتك.");
      } catch (e) {
        station.className = `station arrived ${e.code === "applied" ? "sent" : "failed"}`;
        if (e.code !== "applied") store.set("masar.applied", JSON.stringify(list("masar.applied").filter((x) => x !== p.id)));
        log(p, WHY[e.code] || "تعذّر الإرسال. سيعود الإعلان في المرة القادمة.", e.code !== "applied");
      }
    });
  }

  // ---------- start ----------

  fetch(`${API}/board/postings`).then((r) => r.json()).then(({ postings }) => {
    const seen = new Set([...list("masar.applied"), ...list("masar.skipped")]);
    queue = postings.filter((p) => !seen.has(p.id));
    // the path so far: one station per posting already applied to
    list("masar.applied").slice(-24).forEach(() => $("route").append(el("li", "station arrived sent")));
    if (setup()) deal();
  }).catch(() => { $("deck").append(el("p", "swipe-empty", "تعذّر تحميل الإعلانات. تحقق من الإنترنت وحدّث الصفحة.")); });
})();
