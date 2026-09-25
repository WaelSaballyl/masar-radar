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
  if (skill.length <= 3) return new RegExp(`(^|[^A-Za-z0-9])${escape(skill)}([^A-Za-z0-9]|$)`).test(text);
  return squash(text).includes(squash(skill));
}

export const strings = (v, max = 40) => (Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, max);
export const str = (v, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const sentences = (s) => str(s, 1200).split(/(?<=[.!؟?])\s+/).filter(Boolean);

export function audit(cv, source, jobSkills) {
  const removed = [];
  const known = new Set(numbersIn(source));
  const lacking = jobSkills.filter((s) => !mentions(source, s));
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
  cv.skills = strings(cv.skills).filter((s) => {
    if (mentions(source, s)) return true;
    removed.push({ where: "skills", text: s, why: `skill:${s}` });
    return false;
  });
  cv.experience = (Array.isArray(cv.experience) ? cv.experience : []).slice(0, 8).map((x) => ({
    title: field("experience", str(x?.title, 120)), org: field("experience", str(x?.org, 120)),
    dates: field("experience", str(x?.dates, 60)), bullets: strings(x?.bullets, 6).filter(keep("experience")),
  }));
  cv.projects = (Array.isArray(cv.projects) ? cv.projects : []).slice(0, 8).map((x) => ({
    name: field("projects", str(x?.name, 120)), tools: field("projects", str(x?.tools, 200)),
    bullets: strings(x?.bullets, 6).filter(keep("projects")),
  }));
  cv.education = (Array.isArray(cv.education) ? cv.education : []).slice(0, 4).map((x) => ({
    degree: str(x?.degree, 120), major: str(x?.major, 120), school: str(x?.school, 160),
    dates: field("education", str(x?.dates, 60)), gpa: field("education", str(x?.gpa, 20)),
  }));
  cv.certificates = strings(cv.certificates, 12).filter(keep("certificates"));
  cv.languages = strings(cv.languages, 8);
  return removed;
}
