// Checks a model's CV against the student's own words. Kept apart from the
// worker so it can be tested without a network or a key (node worker/test.mjs).

const toLatinDigits = (s) => String(s ?? "")
  .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
  .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
export const numbersIn = (s) => (toLatinDigits(s).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(",", ".")));
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9؀-ۿ+#]/g, "");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Does the text mention this skill? Short names (R, ML, SAS) must stand alone
// and match case, or "R" would be found in every word.
export function mentions(text, skill) {
  if (!skill) return false;
  // one letter (R, C) must match case, or "R" is found in "Riyadh"; "SQL" is
  // "sql" in a student's own spelling
  if (skill.length <= 3) {
    return new RegExp(`(^|[^A-Za-z0-9])${escape(skill)}([^A-Za-z0-9]|$)`, skill.length === 1 ? "" : "i").test(text);
  }
  return squash(text).includes(squash(skill));
}

// Does the source cover a skill phrase? Word by word, on stems, so "Data
// cleaning" is covered by "cleaned the data". With forgive, qualifiers such as
// "Advanced" are not required (coverage); without it they are (the audit,
// so a CV cannot say "advanced" when the student did not).
const QUALIFIERS = /\b(advanced|strong|basic|good|solid|excellent|proficiency|proficient|knowledge|experience|skills?|hands-on|certificate|certification|certified|course|of|in|with|and|the|for|to)\b/gi;
const stem = (w) => w.toLowerCase().replace(/(ing|ed|es|s)$/, "");
export function covers(source, skill, forgive = false) {
  if (mentions(source, skill)) return true;
  const words = (forgive ? skill.replace(QUALIFIERS, " ") : skill).split(/[\s/,()]+/).filter((w) => w.length > 1);
  if (!words.length) return false;
  const stems = new Set((String(source).match(/[A-Za-z0-9+#]+/g) || []).map(stem));
  return words.every((w) => (w.length <= 3 ? mentions(source, w) : stems.has(stem(w))));
}

export const strings = (v, max = 40) => (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, max);
export const str = (v, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sentences = (s) => str(s, 1200).split(/(?<=[.!؟?])\s+/).filter(Boolean);

export function audit(cv, source, jobSkills) {
  const removed = [];
  const known = new Set(numbersIn(source));
  const lacking = jobSkills.filter((s) => !covers(source, s));
  const problem = (text) => {
    const n = numbersIn(text).find((x) => !known.has(x));
    if (n !== undefined) return `number:${n}`;
    const s = lacking.find((k) => mentions(text, k));
    return s ? `skill:${s}` : null;
  };
  const keep = (where) => (text) => {
    const why = problem(text);
    if (why) removed.push({ where, text, why });
    return !why;
  };
  const field = (where, text) => (keep(where)(text) ? text : "");

  cv.summary = sentences(cv.summary).filter(keep("summary")).join(" ");
  // "Dashboards & BI: Power BI (DAX, data modeling)" - the group label is the
  // model's own words; every item after it must be the student's
  cv.skills = strings(cv.skills).map((entry) => {
    const colon = entry.indexOf(":");
    const label = colon > 0 ? entry.slice(0, colon).trim() : "";
    const items = (colon > 0 ? entry.slice(colon + 1) : entry).split(/[,،;؛()]/).map((x) => x.trim()).filter(Boolean);
    const lacking = items.filter((x) => !mentions(source, x));
    lacking.forEach((x) => removed.push({ where: "skills", text: x, why: `skill:${x}` }));
    if (!lacking.length) return entry;
    const kept = items.filter((x) => mentions(source, x)).join(", ");
    return kept && (label ? `${label}: ${kept}` : kept);
  }).filter(Boolean);
  cv.headline = field("headline", str(cv.headline, 160));
  cv.experience = (Array.isArray(cv.experience) ? cv.experience : []).slice(0, 8).map((x) => ({
    title: field("experience", str(x?.title, 120)), org: field("experience", str(x?.org, 120)),
    // a model that puts "Summer 2022" in location as well as in dates
    location: str(x?.location, 120) === str(x?.dates, 60) ? "" : field("experience", str(x?.location, 120)), dates: field("experience", str(x?.dates, 60)), bullets: strings(x?.bullets, 6).filter(keep("experience")),
  }));
  cv.projects = (Array.isArray(cv.projects) ? cv.projects : []).slice(0, 8).map((x) => ({
    name: field("projects", str(x?.name, 120)), tools: field("projects", str(x?.tools, 200)),
    dates: field("projects", str(x?.dates, 60)), bullets: strings(x?.bullets, 6).filter(keep("projects")),
  }));
  cv.education = (Array.isArray(cv.education) ? cv.education : []).slice(0, 4).map((x) => ({
    degree: str(x?.degree, 120), major: str(x?.major, 120), school: str(x?.school, 160),
    dates: field("education", str(x?.dates, 60)), gpa: field("education", str(x?.gpa, 20)),
  }));
  cv.certificates = strings(cv.certificates, 12).filter(keep("certificates"));
  cv.languages = strings(cv.languages, 8);
  cv.additional = strings(cv.additional, 10).filter(keep("additional"));
  return removed;
}

// The model sometimes drops the second sentence of a point, or a whole point
// ("They flagged slow-moving products..."). Put the student's own words back:
// each sentence of an experience or project entry that no bullet covers is
// appended to the bullet it came closest to, or added as its own bullet.
// Only sentences in the CV's language are restored.
const wordsOf = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9؀-ۿ]{4,}/g) || []);
function overlap(a, b) {
  const A = wordsOf(a), B = wordsOf(b);
  let n = 0;
  A.forEach((w) => { if (B.has(w)) n++; });
  return A.size ? n / A.size : 0;
}

// pool: every item of the CV, so a sentence already used elsewhere (another
// project on the next line) is not copied in again
export function restore(items, block, arabic, pool = items) {
  const entries = String(block || "").split(/\n\s*\n/)
    .map((e) => e.split("\n").map((l) => l.replace(/^[\s•\-*·]+/, "").trim()).filter(Boolean))
    .filter((e) => e.length > 1);
  const restored = [];
  for (const item of items) {
    const head = `${item.title || item.name || ""} ${item.org || ""}`;
    let entry = null, fit = 0;
    entries.forEach((e) => { const o = overlap(head, e[0]); if (o > fit) { entry = e; fit = o; } });
    if (!entry || fit < 0.5) continue;
    for (const point of entry.slice(1)) {
      for (const sentence of point.split(/(?<=[.!?؟])\s+/)) {
        if (sentence.length < 25 || /[؀-ۿ]/.test(sentence) !== arabic) continue;
        const covered = (x) => [x.title, x.name, ...x.bullets].some((b) => b && overlap(sentence, b) >= 0.6)
          || overlap(sentence, [x.title, x.name, x.org, x.tools, ...x.bullets].filter(Boolean).join(" ")) >= 0.75;
        if (pool.some(covered)) continue;
        let host = -1, best = 0;
        item.bullets.forEach((b, i) => { const o = overlap(point, b); if (o > best) { host = i; best = o; } });
        if (host >= 0 && best >= 0.4) item.bullets[host] = `${item.bullets[host].replace(/[.\s]*$/, ".")} ${sentence}`;
        else item.bullets.push(sentence);
        restored.push(sentence);
      }
    }
  }
  return restored;
}
