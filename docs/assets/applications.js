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
    return li;
  }

  const receipts = MasarCV.receipts();
  if (!receipts.length) {
    $("meta").textContent = "";
    const a = el("a", null, "الإعلانات الحصرية");
    a.href = "jobs.html";
    $("meta").append("لم تقدّم على أي إعلان من مسار بعد. التقديم متاح على ", a, ".");
    return;
  }
  fetch(`${API}/board/mine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ receipts }) })
    .then((r) => r.json())
    .then(({ applications }) => {
      const picked = applications.filter((a) => a.status === "shortlisted").length;
      $("meta").textContent = Masar.count(applications.length, "application", "ar")
        + (!picked ? "." : applications.length === 1 ? "، وهو في القائمة المختصرة."
          : `، ${picked === 1 ? "واحد منها" : `${picked} منها`} في القائمة المختصرة.`);
      $("list").replaceChildren(...applications.map(card));
    })
    .catch(() => { $("meta").textContent = "تعذّر تحميل طلباتك. تحقق من الإنترنت وحدّث الصفحة."; });
})();
