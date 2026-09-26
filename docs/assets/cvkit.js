// The CV paper and the privacy rules, shared by the CV builder, the swipe
// deck and the employer's applicants page. Contact details are found and kept
// in the browser; stripContact / withoutContact cut them from anything sent.
// toBlocks / fromBlocks carry a rendered paper to an employer as plain data
// (tag, class, text) that is rebuilt with textContent, never as HTML.
(() => {
  "use strict";
  const { el } = Masar;

  const FIELDS = ["name", "email", "phone", "city", "link", "university", "degree", "major",
                  "graduation", "gpa", "skills", "experience", "projects", "certificates", "languages", "other", "worklinks"];
  const CONTACT = ["name", "email", "phone", "city", "link", "worklinks"];

  // Contact details are found here, kept here, and cut out of anything sent.
  const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  // with or without https: "coursera.org/verify/X" is a link too
  const LINK = /\b(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+(?:com|org|net|io|dev|app|me|co|sa|ai|edu)\/\S+/gi;
  // A phone starts with +, 00 or 0 ("+966 54 ...", "0551234567"). Dates never
  // count: "2026 (2021-2026)" has twelve digits but is only years.
  const PHONE = /(?:\+|\b00|\b0)\d[\d\s\-]{7,14}\d/g;
  const isPhone = (s) => {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15 && !/^(?:(?:19|20)\d\d\D*)+$/.test(s.trim());
  };

  function stripContact(text, p) {
    let t = text.replace(EMAIL, " ").replace(LINK, " ").replace(PHONE, (m) => (isPhone(m) ? " " : m));
    if (p.name) t = t.split(p.name).join(" ");
    return t;
  }

  // Puts each work link under the project whose name shares the most words
  // with the link's last part ("madinah-inspection-dashboard" -> "... Inspection
  // ... Dashboard"); a link that matches nothing goes to additional information.
  function placeLinks(cv, worklinks) {
    const words = (s) => s.toLowerCase().split(/[^a-z0-9؀-ۿ]+/).filter((w) => w.length > 2);
    const byProject = new Map(), byCert = new Map();
    const unplaced = [];
    worklinks.split("\n").map((l) => l.trim()).filter(Boolean).forEach((link) => {
      const slug = words(link.split(/[/?#]/).filter(Boolean).pop() || "");
      let best = -1, score = 0;
      cv.projects.forEach((p, i) => {
        const hits = words(`${p.name} ${p.tools}`).filter((w) => slug.includes(w)).length;
        if (hits > score) { best = i; score = hits; }
      });
      if (best >= 0) { byProject.set(best, [...(byProject.get(best) || []), link]); return; }
      // a certificate link is recognised by its site: coursera.org/verify/X
      // goes to "Google Data Analytics ... | Google / Coursera"
      const all = words(link);
      const cert = cv.certificates.findIndex((c) => words(c).some((w) => all.includes(w)));
      if (cert >= 0 && !byCert.has(cert)) byCert.set(cert, link);
      else unplaced.push(link);
    });
    return { byProject, byCert, unplaced };
  }

  // pdf.js hands "two", "-", "day" over as separate pieces; profiles read
  // before this fix still carry "two - day", so it runs on every send too
  const joinHyphens = (s) => s.replace(/(\p{L}) ?- (?=\p{L})|(\p{L}) -(?=\p{L})/gu, "$1$2-");

  const withoutContact = (p) => Object.fromEntries(
    FIELDS.filter((f) => !CONTACT.includes(f)).map((f) => [f, joinHyphens(stripContact(p[f], p))]));

  const HEAD = {
    en: { summary: "Summary", education: "Education", skills: "Skills", experience: "Experience",
          projects: "Projects", certificates: "Certificates", languages: "Languages", gpa: "GPA",
          additional: "Additional information", link: "Link", verify: "Verify", sep: ", " },
    ar: { summary: "نبذة", education: "التعليم", skills: "المهارات", experience: "الخبرات",
          projects: "المشاريع", certificates: "الشهادات", languages: "اللغات", gpa: "المعدل",
          additional: "معلومات إضافية", link: "الرابط", verify: "للتحقق", sep: "، " },
  };

  function renderCV(paper, cv, p, lang) {
    const h = HEAD[lang];
    paper.lang = lang;
    paper.dir = lang === "ar" ? "rtl" : "ltr";
    // "faisal omar alzahrani" -> "Faisal Omar Alzahrani"; a name typed with
    // capitals ("McDonald", "AL-Otaibi") is left as the student wrote it
    const name = p.name && p.name === p.name.toLowerCase()
      ? p.name.replace(/(^|[\s-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase()) : p.name;
    paper.replaceChildren(el("h1", null, name || (lang === "ar" ? "اسمك" : "Your Name")));
    if (cv.headline) paper.append(el("p", "cv-headline", cv.headline));
    const contact = [p.city, p.phone, p.email, p.link].filter(Boolean).join("  |  ");
    if (contact) paper.append(el("p", "cv-contact", contact));

    const section = (title, nodes) => {
      if (!nodes || !nodes.length) return;
      paper.append(el("h2", null, title), ...nodes);
    };
    // "remote", "summer 2022", "was employee of the month": each part starts
    // with a capital, however the student or the model typed it
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const item = (title, meta, bullets) => {
      const div = el("div", "cv-item");
      const row = el("p", "cv-row");
      row.append(el("strong", null, title.split(h.sep).map(cap).join(h.sep)));
      if (meta) row.append(el("span", null, cap(meta)));
      div.append(row);
      if (bullets.length) {
        const ul = el("ul");
        bullets.forEach((b) => ul.append(el("li", null, cap(b))));
        div.append(ul);
      }
      return div;
    };

    const education = cv.education.length ? cv.education
      : [{ degree: p.degree, major: p.major, school: p.university, dates: p.graduation, gpa: p.gpa }];
    section(h.summary, cv.summary && [el("p", null, cv.summary)]);
    // a date the audit removed falls back to what the student typed
    section(h.education, education.filter((x) => x.school || x.degree).map((x) =>
      // "B.Sc. Software Engineering" already names the major
      item([(x.major && x.degree.toLowerCase().includes(x.major.toLowerCase()) ? x.degree
              : [x.degree, x.major].filter(Boolean).join(h.sep)), x.school].filter(Boolean).join(h.sep),
           x.dates || p.graduation, x.gpa ? [`${h.gpa}: ${x.gpa}`] : [])));
    section(h.experience, cv.experience.filter((x) => x.title || x.bullets.length)
      .map((x) => item([x.title, x.org, x.location].filter(Boolean).join(h.sep), x.dates, x.bullets)));
    const { byProject, byCert, unplaced } = placeLinks(cv, p.worklinks || "");
    section(h.projects, cv.projects.map((x, i) => [x, i]).filter(([x]) => x.name || x.bullets.length)
      .map(([x, i]) => item([x.name, x.tools].filter(Boolean).join(h.sep), x.dates,
        [...x.bullets, ...(byProject.get(i) || []).map((l) => `${h.link}: ${l}`)])));
    // groups ("Excel: pivot tables, lookups") one a line; loose skills share
    // a single line after them instead of one line each
    const groups = cv.skills.filter((s) => s.includes(":")).map((s) => {
      const [label, ...rest] = s.split(":");
      const line = el("p", "cv-skill");
      line.append(el("strong", null, `${label}:`), ` ${rest.join(":").trim()}`);
      return line;
    });
    const loose = cv.skills.filter((s) => !s.includes(":"));
    if (loose.length) groups.push(el("p", "cv-skill", loose.join(h.sep)));
    section(h.skills, groups.length && groups);
    const list = el("ul");
    cv.certificates.forEach((c, i) => list.append(el("li", null,
      byCert.has(i) ? `${c}  |  ${h.verify}: ${byCert.get(i)}` : c)));
    section(h.certificates, cv.certificates.length && [list]);
    section(h.languages, cv.languages.length && [el("p", null, cv.languages.join(h.sep))]);
    const extra = el("ul");
    // what the summary already says ("transferable iqama") is not said twice
    const said = new Set(cv.summary.toLowerCase().match(/[a-z0-9؀-ۿ]{3,}/g) || []);
    const repeats = (a) => (a.toLowerCase().match(/[a-z0-9؀-ۿ]{3,}/g) || []).every((w) => said.has(w));
    [...(cv.additional || []).filter((a) => !repeats(a)), ...unplaced].forEach((a) => extra.append(el("li", null, cap(a))));
    section(h.additional, extra.children.length && [extra]);
  }

  const TAGS = new Set(["H1", "H2", "P", "DIV", "UL", "LI", "STRONG", "SPAN"]);
  const toBlocks = (node) => [...node.childNodes].map((n) => (n.nodeType === 3 ? n.textContent
    : TAGS.has(n.tagName) ? [n.tagName.toLowerCase(), n.className, toBlocks(n)] : "")).filter((b) => b !== "");
  function fromBlocks(parent, blocks, depth = 0) {
    if (!Array.isArray(blocks) || depth > 6) return parent;
    for (const b of blocks) {
      if (typeof b === "string") parent.append(b);
      else if (Array.isArray(b) && TAGS.has(String(b[0]).toUpperCase())) {
        parent.append(fromBlocks(el(b[0], String(b[1] || "").replace(/[^\w -]/g, "") || null), b[2], depth + 1));
      }
    }
    return parent;
  }

  window.MasarCV = { FIELDS, CONTACT, EMAIL, LINK, PHONE, isPhone, stripContact, joinHyphens, withoutContact,
                     placeLinks, renderCV, toBlocks, fromBlocks };
})();
