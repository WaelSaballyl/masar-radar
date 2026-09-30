// Skill tests: the questions come from the worker without their answers and
// are scored there (worker/src/skilltests.js). Taking one needs an account,
// since a pass is kept as a verified skill and a try is limited to one a day.
(() => {
  "use strict";
  const { el, account } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  let mine = { verified: [], next: {} };
  let current = null;

  const when = (iso) => new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", hour: "numeric", minute: "2-digit" });

  function list(tests) {
    const done = new Map(mine.verified.map((v) => [v.skill, v]));
    $("test-list").replaceChildren(...tests.map((t) => {
      const li = el("li", "test-card");
      const name = el("h2", null, t.skill);
      name.dir = "ltr";
      li.append(name, el("p", "muted small", `${t.n} أسئلة، تنجح بـ ${Math.ceil(t.n * 0.75)} صحيحة`));
      const v = done.get(t.skill);
      if (v) li.append(el("p", "test-ok", `✓ موثّقة (${v.score}٪)`));
      const wait = mine.next[t.slug];
      if (wait && new Date(wait) > new Date()) {
        li.append(el("p", "muted small", `المحاولة التالية ${when(wait)}.`));
      } else {
        const b = el("button", "btn btn-quiet btn-small", v ? "أعد الاختبار" : "ابدأ الاختبار");
        b.type = "button";
        b.onclick = () => start(t);
        li.append(b);
      }
      return li;
    }));
  }

  async function start(t) {
    if (!account.token) {
      $("who").replaceChildren("سجّل دخولك أولاً لنحفظ نتيجتك: ", Object.assign(el("a", null, "الدخول بحساب قوقل"), { href: "account.html" }), ".");
      $("who").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const r = await fetch(`${account.api}/tests/${t.slug}`).then((x) => x.json()).catch(() => null);
    if (!r || !r.questions) { $("who").textContent = "تعذّر تحميل الاختبار. جرّب بعد قليل."; return; }
    current = r;
    $("run-title").textContent = `اختبار ${r.skill}`;
    $("run-title").dir = "auto";
    $("questions").replaceChildren(...r.questions.map((q) => {
      const li = el("li", "test-q");
      const fs = el("fieldset");
      const legend = el("legend", null, q.q);
      legend.dir = "auto";
      fs.append(legend);
      if (q.code) { const pre = el("pre", "test-code", q.code); pre.dir = "ltr"; fs.append(pre); }
      q.options.forEach((o) => {
        const label = el("label", "test-opt");
        const input = el("input");
        input.type = "radio"; input.name = `q${q.id}`; input.value = o;
        const span = el("span", null, o);
        span.dir = "auto";
        label.append(input, span);
        fs.append(label);
      });
      li.append(fs);
      return li;
    }));
    $("run").hidden = false;
    $("test-list").hidden = true;
    $("run-status").textContent = "";
    $("submit").disabled = false;
    $("run").scrollIntoView({ behavior: "smooth" });
  }

  $("cancel").onclick = () => { $("run").hidden = true; $("test-list").hidden = false; };

  $("run-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const answers = {};
    current.questions.forEach((q) => {
      const picked = e.target.querySelector(`input[name="q${q.id}"]:checked`);
      if (picked) answers[q.id] = picked.value;
    });
    const missing = current.questions.length - Object.keys(answers).length;
    if (missing && !confirm(`تركت ${missing === 1 ? "سؤالاً واحداً" : `${missing} أسئلة`} بلا إجابة، ويُحسب خطأ. تسلّم الآن؟`)) return;
    $("submit").disabled = true;
    let out;
    try { out = await account.call(`/tests/${current.slug}`, { answers }); }
    catch { $("run-status").textContent = "انتهت جلستك. سجّل دخولك من جديد."; return; }
    if (out.status === 429) { $("run-status").textContent = "استخدمت محاولة اليوم لهذه المهارة. جرّب بكرة."; return; }
    if (out.status !== 200) { $("run-status").textContent = "تعذّر التسليم. جرّب بعد قليل."; $("submit").disabled = false; return; }
    const wrong = new Set(out.wrong);
    current.questions.forEach((q) => {
      const fs = e.target.querySelector(`input[name="q${q.id}"]`).closest(".test-q");
      fs.classList.add(wrong.has(q.id) ? "is-wrong" : "is-right");
      fs.querySelector("fieldset").append(el("p", "small", wrong.has(q.id) ? "✗ خطأ" : "✓ صح"));
    });
    $("run-status").textContent = out.passed
      ? `نجحت: ${out.score} من ${out.of}. وثّقنا ${current.skill} في حسابك، وتظهر «موثّقة» على بطاقتك للشركات.`
      : `${out.score} من ${out.of}. تحتاج ${Math.ceil(out.of * 0.75)} لتنجح. الأسئلة المعلّمة بـ ✗ أخطأت فيها؛ راجع المهارة وجرّب بكرة.`;
    await loadMine();
  });

  async function loadMine() {
    if (!account.token) { $("who").textContent = "تقدر تشوف الاختبارات الآن، وتحتاج تسجيل الدخول لتبدأ."; return; }
    const r = await account.call("/tests/mine").catch(() => null);
    if (r && r.status === 200) mine = r;
    $("who").textContent = mine.verified.length ? `مهاراتك الموثّقة: ${mine.verified.map((v) => v.skill).join("، ")}.` : "";
    if (tests) list(tests);
  }

  let tests = null;
  fetch(`${account.api}/tests`).then((r) => r.json()).then(async (d) => {
    tests = d.tests;
    list(tests);
    await loadMine();
  }).catch(() => { $("who").textContent = "تعذّر تحميل الاختبارات. حدّث الصفحة بعد قليل."; });
})();
