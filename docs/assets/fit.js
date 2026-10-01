// Home page: drop a CV and see how many open postings fit it. The file is read
// in the browser (cvread.js, loaded only when a file is picked), its skills are
// found with the radar's own rules (data/skills.json), and a posting fits when
// the CV has at least half of its required skills. Nothing is uploaded; the
// skills found join the profile so the postings page can sort by fit.
(() => {
  "use strict";
  const { el, store } = Masar;
  const input = document.getElementById("fit-file");
  const out = document.getElementById("fit-out");
  if (!input) return;
  const en = () => store.get("masar.lang") === "en";
  const T = {
    reading: ["نقرأ سيرتك…", "Reading your CV…"],
    none: ["ما لقينا في سيرتك مهارات نعرفها. جرّب ملف Word، أو جهّز سيرتك في صانع السيرة.", "We found no skills we know in your CV. Try a Word file, or build your CV in the CV builder."],
    fail: ["تعذّر قراءة الملف. جرّب PDF أو Word (docx) سليم.", "Couldn't read the file. Try a sound PDF or Word (docx) file."],
    found: ["مهاراتك اللي لقيناها:", "Skills we found:"],
    all: ["اعرضها كلها، الأقرب لك أولاً", "See them all, closest first"],
    cv: ["جهّز سيرة لأي منها", "Make a CV for any of them"],
    of: (m) => [`من ${m} إعلاناً مفتوحاً الآن تناسب مهاراتك`, `of ${m} open postings fit your skills`],
  };
  const t = (k, ...a) => (typeof T[k] === "function" ? T[k](...a) : T[k])[en() ? 1 : 0];
  const load = (src) => new Promise((ok, no) => {
    if (document.querySelector(`script[src="${src}"]`)) { ok(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = no;
    document.head.append(s);
  });

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    out.replaceChildren(el("p", "muted", t("reading")));
    try {
      if (!window.MasarATS) await load("assets/atskit.js?v=6");
      if (!window.MasarRead) await load("assets/cvread.js?v=1");
      const [doc, rules, data] = await Promise.all([
        MasarRead.readFile(file),
        fetch("data/skills.json").then((r) => r.json()),
        fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()),
      ]);
      const text = (doc.text || "").normalize("NFKC");
      const mine = Object.keys(rules).filter((n) => new RegExp(rules[n], "u").test(text));
      if (!mine.length) { out.replaceChildren(el("p", "status bad", t("none"))); return; }
      const have = new Set(mine);
      const scored = data.postings.map((p) => {
        const req = p.skills.filter((s) => s[1]).map((s) => s[0]);
        const n = req.filter((s) => have.has(s)).length;
        return { p, share: req.length ? n / req.length : 0, gulf: p.countries.some((c) => Masar.GULF.includes(c)) };
      }).filter((x) => x.share >= 0.5);
      scored.sort((a, b) => (b.gulf - a.gulf) || (b.share - a.share) || (b.p.posted_at || "").localeCompare(a.p.posted_at || ""));
      // the skills join the profile, so the postings page can rank by fit
      try {
        const prof = JSON.parse(store.get("masar.profile") || "{}") || {};
        const known = (prof.skills || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean);
        const merged = [...new Set([...known, ...mine])];
        if (merged.length !== known.length) store.set("masar.profile", JSON.stringify({ ...prof, skills: merged.join(", ") }));
      } catch { /* the result still shows */ }

      const big = el("p", "fit-num");
      big.append(el("strong", null, String(scored.length)), " ", t("of", data.postings.length));
      const chips = el("p", "posting-skills");
      mine.slice(0, 14).forEach((s) => chips.append(el("span", "skill have", s)));
      const list = el("ul", "fit-list");
      scored.slice(0, 5).forEach(({ p, share }) => {
        const li = el("li");
        const a = el("a", null, p.title);
        a.href = `job.html?id=${encodeURIComponent(p.id)}`;
        a.dir = "auto";
        const who = el("span", "muted", `${p.company}، ${Math.round(share * 100)}٪`);
        who.dir = "auto";
        li.append(a, who);
        list.append(li);
      });
      const acts = el("p", "fit-acts");
      const all = el("a", "btn btn-primary", t("all"));
      all.href = "jobs.html?sort=fit";
      const cv = el("a", "btn btn-quiet", t("cv"));
      cv.href = "cv.html";
      acts.append(all, cv);
      out.replaceChildren(big, el("p", "muted small", t("found")), chips, list, acts);
    } catch {
      out.replaceChildren(el("p", "status bad", t("fail")));
    } finally {
      input.value = "";
    }
  });
})();
