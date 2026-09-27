// The co-op guide's numbers, from the same postings the site lists: the
// skills training and entry postings in the Gulf ask for, and where they are.
// If the Gulf has too few, the count widens to all entry postings and says so.
(() => {
  "use strict";
  const { el, count, place, countryName, GULF } = Masar;
  Masar.initTheme();
  const $ = (id) => document.getElementById(id);
  const ENTRY = ["Intern", "Junior"];
  const TRAINING = ["coop", "internship", "student"];

  fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    const entry = d.postings.filter((p) => ENTRY.includes(p.level) || TRAINING.includes(p.employment));
    const gulf = entry.filter((p) => place(p) === "gulf");
    const basis = gulf.length >= 15 ? gulf : entry;
    $("stamp").textContent = d.updated_at ? `آخر تحديث: ${Masar.date(d.updated_at.slice(0, 10), "ar")}.` : "";
    $("skills-lede").textContent = basis === gulf
      ? `من ${count(basis.length, "posting")} للتدريب والمبتدئين مفتوحة الآن في الخليج: نسبة الإعلانات التي تطلب كل مهارة.`
      : `إعلانات التدريب في الخليج قليلة هذا الأسبوع، فحسبنا النسب من ${count(basis.length, "posting")} للتدريب والمبتدئين في كل الأماكن.`;

    const tally = new Map();
    basis.forEach((p) => p.skills.filter((s) => s[1]).forEach(([s]) => tally.set(s, (tally.get(s) || 0) + 1)));
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    $("skills").replaceChildren(...top.map(([skill, n]) => {
      const li = el("li");
      const a = el("a", null, skill);
      a.href = `jobs.html?q=${encodeURIComponent(skill)}&level=entry`;
      const bar = el("span", "guide-bar");
      bar.style.setProperty("--share", n / basis.length);
      li.append(a, bar, el("span", "guide-n", `${Math.round((100 * n) / basis.length)}٪`));
      return li;
    }));

    const where = new Map();
    entry.filter((p) => place(p) === "gulf").forEach((p) => p.countries.filter((c) => GULF.includes(c))
      .forEach((c) => where.set(c, (where.get(c) || 0) + 1)));
    const remote = entry.filter((p) => place(p) === "anywhere").length;
    const rows = [...where.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => {
      const li = el("li");
      const a = el("a", null, countryName(c, "ar"));
      a.href = `jobs.html?where=${c}&level=entry`;
      li.append(a, `: ${count(n, "posting")}`);
      return li;
    });
    if (remote) {
      const li = el("li");
      const a = el("a", null, "عن بُعد من أي مكان");
      a.href = "jobs.html?where=remote&level=entry";
      li.append(a, `: ${count(remote, "posting")}`);
      rows.push(li);
    }
    $("places").replaceChildren(...rows);
  }).catch(() => { $("skills-lede").textContent = "تعذّر تحميل الأرقام الآن. حدّث الصفحة بعد قليل."; });
})();
