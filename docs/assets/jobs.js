// Every active posting from data/jobs.json, grouped by where it can be done
// from (the Gulf first) and newest first inside each group. Text from the data
// goes in through textContent only.
(() => {
  "use strict";
  const { el, safeUrl, count, ago, place, countryName, GULF } = Masar;
  const $ = (id) => document.getElementById(id);
  const PAGE = 40;

  const GROUPS = [
    ["gulf", "السعودية والخليج"],
    ["anywhere", "عن بُعد من أي مكان"],
    ["region", "الشرق الأوسط، دون تحديد دولة"],
    ["other", "خارج الخليج"],
  ];
  const LEVELS = { Intern: "تدريب", Junior: "مبتدئ", Mid: "متوسط", Senior: "خبرة عالية", Lead: "قيادي", Manager: "مدير" };
  const MODES = { remote: "عن بُعد", hybrid: "هجين", onsite: "من المقر" };
  const ROLES = {
    "Data Analyst": "محلل بيانات", "Data Engineer": "مهندس بيانات", "Data Scientist": "عالم بيانات",
    "ML Engineer": "مهندس تعلّم آلة", "BI Developer": "مطوّر ذكاء أعمال", "Business Analyst": "محلل أعمال",
    "Analytics Engineer": "مهندس تحليلات",
  };
  const ENTRY = ["Intern", "Junior"];
  const MID_UP = ["Mid", "Senior", "Lead", "Manager"];

  let postings = [];
  let shown = PAGE;
  Masar.initTheme();

  // "الرياض، السعودية" for the Gulf; country names elsewhere, never Israel
  function whereText(p, group) {
    if (group === "anywhere") return "عن بُعد من أي مكان";
    if (group === "region") return "الشرق الأوسط";
    const codes = p.countries.filter((c) => (group === "gulf" ? GULF.includes(c) : c !== "IL"));
    const names = codes.slice(0, 3).map((c) => countryName(c, "ar"));
    const city = (p.location || "").split(",")[0].trim();
    if (group === "gulf" && city && !/^[A-Z]{2}$/.test(city) && !names.includes(city)) names.unshift(city);
    return names.join("، ") || "خارج الخليج";
  }

  function card(p, group) {
    const li = el("li", "posting");
    const top = el("div", "posting-top");
    if (LEVELS[p.level]) top.append(el("span", `level level-${ENTRY.includes(p.level) ? p.level.toLowerCase() : "other"}`, LEVELS[p.level]));
    if (MODES[p.mode]) top.append(el("span", "tag", MODES[p.mode]));
    top.append(el("span", "posting-age", ago(p.posted_at, "ar")));

    const title = el("h3", "posting-title", p.title);
    title.dir = "auto";
    const who = el("p", "posting-who");
    const company = el("span", "posting-company", p.company);
    company.dir = "auto";
    who.append(company, el("span", "posting-where", whereText(p, group)));

    li.append(top, title, who);

    const required = p.skills.filter((s) => s[1]).map((s) => s[0]);
    const preferred = p.skills.filter((s) => !s[1]).map((s) => s[0]);
    if (required.length) {
      const chips = el("p", "posting-skills");
      chips.append(el("span", "posting-label", "يطلب:"));
      required.slice(0, 8).forEach((s) => chips.append(el("span", "skill", s)));
      li.append(chips);
    }
    if (preferred.length) li.append(el("p", "posting-pref", `ويُفضّل: ${preferred.slice(0, 6).join("، ")}`));

    const actions = el("div", "posting-actions");
    const href = safeUrl(p.url);
    if (href) {
      const open = el("a", "btn btn-primary btn-small", "افتح الإعلان");
      open.href = href; open.target = "_blank"; open.rel = "noopener";
      actions.append(open);
    }
    const cv = el("a", "btn btn-quiet btn-small", "جهّز سيرتي لهذا الإعلان");
    cv.href = `cv.html?job=${encodeURIComponent(p.id)}`;
    actions.append(cv);
    li.append(actions);
    return li;
  }

  function matches(p) {
    const where = $("where").value, level = $("level").value, role = $("role").value;
    const q = $("q").value.trim().toLowerCase();
    if (where === "gulf" && p.group !== "gulf") return false;
    if (where === "near" && p.group === "other") return false;
    if (level === "entry" && !ENTRY.includes(p.level)) return false;
    if (level === "mid" && !MID_UP.includes(p.level)) return false;
    if (role && p.role !== role) return false;
    return !q || `${p.title} ${p.company} ${p.skills.map((s) => s[0]).join(" ")}`.toLowerCase().includes(q);
  }

  function render() {
    const rows = postings.filter(matches);
    const companies = new Set(rows.map((p) => p.company)).size;
    $("meta").textContent = rows.length
      ? `${count(rows.length, "posting")} من ${count(companies, "company")}.`
      : "لا توجد إعلانات تطابق هذا الاختيار. وسّع المكان أو المستوى.";

    const box = $("groups");
    box.replaceChildren();
    let left = shown;
    for (const [key, label] of GROUPS) {
      const inGroup = rows.filter((p) => p.group === key);
      if (!inGroup.length || left <= 0) continue;
      const section = el("section", "posting-group");
      const head = el("h2", null, label);
      head.append(el("span", "group-count", count(inGroup.length, "posting")));
      const list = el("ul", "postings");
      inGroup.slice(0, left).forEach((p) => list.append(card(p, key)));
      left -= inGroup.length;
      section.append(head, list);
      box.append(section);
    }
    const more = $("more");
    more.hidden = shown >= rows.length;
    more.textContent = `اعرض المزيد (بقي ${rows.length - shown})`;
  }

  fetch("data/jobs.json", { cache: "no-cache" }).then((r) => r.json()).then((d) => {
    postings = d.postings
      .map((p) => ({ ...p, group: place(p) === "unknown" ? "other" : place(p) }))
      .sort((a, b) => (b.posted_at || "").localeCompare(a.posted_at || ""));
    const roles = [...new Set(postings.map((p) => p.role).filter((r) => ROLES[r]))];
    roles.forEach((r) => { const o = el("option", null, ROLES[r]); o.value = r; $("role").append(o); });
    render();
  }).catch(() => { $("meta").textContent = "تعذّر تحميل الإعلانات. حدّث الصفحة بعد قليل."; });

  $("filters").addEventListener("input", () => { shown = PAGE; render(); });
  $("more").addEventListener("click", () => { shown += PAGE; render(); });
})();
