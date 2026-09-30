// The student's applications, from the receipts this browser kept. Each one
// is a short route: sent -> the company opened the CV -> shortlisted.
(() => {
  "use strict";
  const { el, ago, date } = Masar;
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content;
  const $ = (id) => document.getElementById(id);
  const today = new Date().toISOString().slice(0, 10);

  function card(a) {
    const li = el("li", "my-app");
    const title = el("h2", "posting-title");
    const link = el("a", null, a.title);
    link.href = `job.html?ex=${encodeURIComponent(a.posting_id)}`;
    link.dir = "auto";
    title.append(link);
    li.append(title, el("p", "posting-who", `${a.company}، ${a.city}`));

    const steps = [
      ["وصل طلبك", ago(a.created_at.slice(0, 10), "ar"), true],
      ["فتحت الشركة سيرتك", a.viewed_at ? ago(a.viewed_at.slice(0, 10), "ar") : "", !!a.viewed_at],
      ["في القائمة المختصرة", "", a.status === "shortlisted"],
    ];
    const route = el("ol", "app-route");
    steps.forEach(([label, when, done]) => {
      const step = el("li", done ? "done" : null);
      step.append(el("span", "dot"), el("span", "step-label", label));
      if (when) step.append(el("span", "muted", when));
      route.append(step);
    });
    li.append(route);

    let note = "";
    if (a.status === "shortlisted") note = "اختارتك الشركة للمرحلة التالية. تابع إيميلك وجوالك.";
    else if (a.status === "rejected") note = "لم تختَرك الشركة هذه المرة. جرّب إعلانات أقرب لمهاراتك، وحسّن ما ينقصك منها.";
    else if (a.expires_at < today) note = `أُغلق الإعلان في ${date(a.expires_at, "ar")}، وقد تتأخر ردود الشركة بعده.`;
    else if (!a.viewed_at) note = "لم تفتح الشركة سيرتك بعد.";
    if (note) li.append(el("p", `app-note${a.status === "rejected" ? " muted" : ""}`, note));
    if (a.required) li.append(el("p", "muted", `قدّمت وعندك ${a.matched} من ${a.required} مهارات مطلوبة.`));
    // where the student stands: shown from three applicants up, rounded to tens
    if (a.applicants >= 3) {
      const top = Math.max(10, Math.ceil(((a.ahead + 1) / a.applicants) * 10) * 10);
      li.append(el("p", "rank", top < 100 ? `أنت ضمن أقرب ${top}٪ من ${a.applicants} متقدمين لمتطلبات الإعلان.`
        : `تقدّم ${a.applicants} على هذا الإعلان، وعند أغلبهم مهارات مطلوبة أكثر منك.`));
    }
    // "really interested": first in the employer's list, a few a month (premium, free in the trial)
    if (a.boosted_at) li.append(el("p", "app-boosted", "★ أظهرت اهتمامك: طلبك في أول قائمة الشركة."));
    else if (a.status !== "rejected" && receiptOf[a.hash] && boostsLeft > 0) {
      const b = el("button", "btn btn-quiet btn-small", `★ مهتم فعلاً: قدّم طلبي أولاً (باقي ${boostsLeft})`);
      b.type = "button";
      b.onclick = async () => {
        b.disabled = true;
        const r = await fetch(`${API}/board/boost`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receipt: receiptOf[a.hash] }) }).then((x) => x.json().then((d) => ({ ok: x.ok, d }))).catch(() => null);
        if (r && r.ok) { boostsLeft = r.d.boosts_left; b.replaceWith(el("p", "app-boosted", "★ أظهرت اهتمامك: طلبك في أول قائمة الشركة.")); }
        else b.replaceWith(el("p", "muted", r && r.d.error === "boosts" ? "استخدمت نقاط الاهتمام لهذا الشهر." : "تعذّر ذلك الآن."));
      };
      li.append(b);
    }
    // a week without an answer: one reminder to the employer
    const week = Date.now() - new Date(a.created_at).getTime() >= 7 * 86_400_000;
    if (a.nudged_at) li.append(el("p", "muted", "ذكّرت الشركة بطلبك."));
    else if (week && !["shortlisted", "rejected"].includes(a.status) && receiptOf[a.hash]) {
      const b = el("button", "btn btn-quiet btn-small", "ذكّر الشركة بطلبك");
      b.type = "button";
      b.onclick = async () => {
        b.disabled = true;
        const r = await fetch(`${API}/board/nudge`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ receipt: receiptOf[a.hash] }) }).catch(() => null);
        b.replaceWith(el("p", "muted", r && r.ok ? "ذكّرنا الشركة بطلبك. يظهر لها ذلك في صفحة المتقدمين." : "تعذّر التذكير الآن."));
      };
      const why = el("p", "muted", "مرّ أسبوع بلا رد. تستطيع تذكير الشركة مرة واحدة.");
      li.append(why, b);
    }
    return li;
  }

  const receipts = MasarCV.receipts();
  // the worker answers with each receipt's hash; this maps it back
  const receiptOf = {};
  let boostsLeft = 0;
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!receipts.length) {
    $("meta").textContent = "";
    const a = el("a", null, "الإعلانات الحصرية");
    a.href = "jobs.html";
    $("meta").append("لم تقدّم على أي إعلان من مسار بعد. التقديم متاح على ", a, ".");
    return;
  }
  fetch(`${API}/board/mine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipts }) })
    .then((r) => r.json())
    .then(async ({ applications, boosts_left: left }) => {
      boostsLeft = left || 0;
      for (const r of receipts) receiptOf[hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(r)))] = r;
      const picked = applications.filter((a) => a.status === "shortlisted").length;
      $("meta").textContent = Masar.count(applications.length, "application", "ar")
        + (!picked ? "." : applications.length === 1 ? "، وهو في القائمة المختصرة."
          : `، ${picked === 1 ? "واحد منها" : `${picked} منها`} في القائمة المختصرة.`);
      $("list").replaceChildren(...applications.map(card));
    })
    .catch(() => { $("meta").textContent = "تعذّر تحميل طلباتك. تحقق من الإنترنت وحدّث الصفحة."; });
})();
