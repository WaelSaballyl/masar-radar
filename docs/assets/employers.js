// Employer form: sends the posting to the worker, which stores it as pending.
(() => {
  "use strict";
  Masar.initTheme();
  const API = document.querySelector('meta[name="masar-api"]').content;
  const form = document.getElementById("post");
  const status = document.getElementById("status");
  const WHY = {
    "field:company": "اكتب اسم الشركة.", "field:title": "اكتب المسمى الوظيفي.", "field:city": "اكتب المدينة.",
    "field:contact_email": "اكتب إيميل تواصل صحيحاً.",
    "field:work_email": "استخدم إيميل العمل الخاص بالشركة، لا Gmail أو Hotmail. هكذا نتحقق أن الإعلان حقيقي.",
    "field:description": "وصف الوظيفة قصير. اكتب المهام والمتطلبات في 150 حرفاً على الأقل.",
    "field:required": "أضف مهارة مطلوبة واحدة على الأقل.",
    rate: "أرسلت طلبات كثيرة في وقت قصير. جرّب بعد ساعة.",
  };
  const say = (t, bad) => { status.textContent = t; status.classList.toggle("bad", !!bad); };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    say("نرسل إعلانك…");
    try {
      const r = await fetch(`${API}/board/postings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(WHY[d.error] || "تعذّر إرسال الإعلان. جرّب مرة ثانية.", true); return; }
      form.reset();
      say("وصلنا إعلانك، وسنراجعه وننشره خلال يوم عمل. سنتواصل معك على إيميل العمل إن احتجنا توضيحاً.");
    } catch {
      say("تعذّر الاتصال. تحقق من الإنترنت وجرّب مرة ثانية.", true);
    } finally {
      button.disabled = false;
    }
  });
})();
