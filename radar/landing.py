"""Static landing pages for search engines: one per field, per Gulf country and
per often-required skill, each listing its open postings as plain HTML.

Written by export_site into docs/l/ on every run (the folder is rebuilt, so a
skill that drops out loses its page). The pages carry the site's header and
footer through core.js and link each posting to job.html; the list itself is
in the HTML, so a crawler that runs no script still reads it. Collected
postings show title, company and place only - their text stays with the site
they came from.
"""
import re
from collections import Counter
from html import escape
from pathlib import Path

from .skills import FIELDS

DOCS = Path(__file__).resolve().parent.parent / "docs"
OUT = DOCS / "l"
GULF = ["SA", "AE", "QA", "KW", "BH", "OM"]
FIELD_AR = {"data": "البيانات", "tech": "البرمجة والتقنية", "finance": "المحاسبة والمالية",
            "engineering": "الهندسة", "marketing": "التسويق", "hr": "الموارد البشرية"}
COUNTRY_AR = {"SA": "السعودية", "AE": "الإمارات", "QA": "قطر", "KW": "الكويت", "BH": "البحرين", "OM": "عُمان"}
KIND_AR = {"coop": "تدريب تعاوني", "internship": "تدريب", "student": "دوام طلابي", "graduate": "برنامج خريجين"}
MIN_POSTINGS = 3
MAX_LISTED = 60
TOP_SKILLS = 24


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("+", "p").replace("#", "sharp")).strip("-") or "x"


def _version(asset: str) -> str:
    """The cache-busting number index.html uses today, so these pages never lag."""
    m = re.search(rf"{re.escape(asset)}\?v=(\d+)", (DOCS / "index.html").read_text(encoding="utf-8"))
    return m.group(1) if m else "1"


def _place(p: dict) -> str:
    gulf = [COUNTRY_AR[c] for c in p["countries"] if c in COUNTRY_AR]
    return "، ".join(gulf) or (p["location"] or "")


def _page(title: str, lede: str, postings: list[dict], related: list[tuple[str, str]], more: str, day: str) -> str:
    css, core = _version("masar.css"), _version("core.js")
    rows = []
    for p in postings[:MAX_LISTED]:
        kind = KIND_AR.get(p.get("employment") or "", "")
        rows.append(
            f'<li><a class="land-row" href="job.html?id={escape(p["id"])}">'
            f'<span class="land-title" dir="auto">{escape(p["title"])}</span>'
            f'<span class="land-co" dir="auto">{escape(p["company"] or "")}</span>'
            f'<span class="land-meta">{escape(_place(p))}{" | " + kind if kind else ""}</span></a></li>')
    chips = "".join(f'<a class="chip" href="l/{escape(href)}">{escape(label)}</a>' for href, label in related)
    desc = f"{lede} آخر تحديث {day}."
    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="../">
<title>{escape(title)} — مسار</title>
<meta name="description" content="{escape(desc)}">
<meta property="og:title" content="{escape(title)} — مسار">
<meta property="og:description" content="{escape(desc)}">
<meta property="og:image" content="https://waelsaballyl.github.io/masar-radar/assets/brand/og.png">
<link rel="icon" type="image/png" sizes="32x32" href="assets/brand/favicon-32.png?v=2">
<meta name="theme-color" content="#181A1B">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Noto+Kufi+Arabic:wght@700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/masar.css?v={css}">
</head>
<body>
<div class="wrap">
  <header class="topbar">
    <a class="wordmark" href="./" aria-label="مسار، الصفحة الرئيسية"><img class="logo-on-dark" src="assets/brand/wordmark-dark.png?v=2" alt="مسار" width="150" height="48"><img class="logo-on-light" src="assets/brand/wordmark-light.png" alt="" width="151" height="48"></a>
    <nav class="nav" aria-label="الأقسام"></nav>
    <div class="tools"><button class="tool" id="theme-toggle" type="button" aria-label="تبديل المظهر">◐</button></div>
  </header>
  <main class="landing">
    <div class="page-head">
      <h1>{escape(title)}</h1>
      <p class="section-lede">{escape(desc)}</p>
      <a class="btn btn-primary" href="{escape(more)}">افتحها في صفحة الإعلانات مع الفلاتر</a>
    </div>
    <ul class="land-list">{"".join(rows)}</ul>
    {f'<section class="land-related"><h2>صفحات قريبة</h2><div class="chips">{chips}</div></section>' if chips else ""}
  </main>
</div>
<script src="assets/core.js?v={core}"></script>
<script>Masar.initTheme();</script>
</body>
</html>
"""


def _count(n: int) -> str:
    """Arabic counted noun for postings, the same forms as core.js count()."""
    r = n % 100
    if n == 1:
        return "إعلان واحد"
    if n == 2:
        return "إعلانان"
    if 3 <= r <= 10:
        return f"{n} إعلانات"
    if 11 <= r <= 99:
        return f"{n} إعلاناً"
    return f"{n} إعلان"


def write(jobs: dict) -> list[str]:
    """Rebuild docs/l/ and return the pages' paths for the sitemap."""
    postings = jobs["postings"]
    day = (jobs.get("updated_at") or "")[:10]
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.html"):
        old.unlink()
    # newest first, Gulf before the rest: the order a student in Riyadh wants
    ordered = sorted(postings, key=lambda p: p.get("posted_at") or "", reverse=True)
    ordered = sorted(ordered, key=lambda p: not any(c in GULF for c in p["countries"]))

    pages: dict[str, tuple] = {}
    fields = Counter(p["field"] for p in postings)
    field_links = [(f"field-{f}.html", FIELD_AR[f]) for f in FIELDS if fields[f] >= MIN_POSTINGS]
    for f in FIELDS:
        rows = [p for p in ordered if p["field"] == f]
        if len(rows) < MIN_POSTINGS:
            continue
        pages[f"field-{f}.html"] = (f"وظائف وتدريب {FIELD_AR[f]}",
            f"{_count(len(rows))} مفتوحة الآن في {FIELD_AR[f]}، السعودية والخليج أولاً، مع المهارات المطلوبة في كل إعلان.",
            rows, [x for x in field_links if x[0] != f"field-{f}.html"], f"jobs.html?field={f}")
    for c in GULF:
        rows = [p for p in ordered if c in p["countries"]]
        if len(rows) < MIN_POSTINGS:
            continue
        pages[f"country-{c.lower()}.html"] = (f"وظائف وتدريب في {COUNTRY_AR[c]}",
            f"{_count(len(rows))} مفتوحة الآن في {COUNTRY_AR[c]}: تدريب تعاوني وتدريب ووظائف للمبتدئين وغيرها.",
            rows, field_links, f"jobs.html?where={c}")
    top = Counter(s for p in postings for s, required in p["skills"] if required)
    skill_links = []
    for skill, n in top.most_common(TOP_SKILLS):
        if n < MIN_POSTINGS:
            break
        name = f"skill-{slug(skill)}.html"
        if name in pages:
            continue
        rows = [p for p in ordered if any(s == skill and r for s, r in p["skills"])]
        pages[name] = (f"وظائف تطلب {skill}",
            f"{_count(len(rows))} مفتوحة الآن تطلب {skill}. اعرف ما يطلبه كل إعلان معها، وجهّز سيرتك عليه.",
            rows, [], f"jobs.html?q={skill}")
        skill_links.append((name, skill))
    for name, (title, lede, rows, related, more) in pages.items():
        if name.startswith("skill-"):
            related = [x for x in skill_links if x[0] != name][:12] + field_links
        (OUT / name).write_text(_page(title, lede, rows, related, more, day), encoding="utf-8")
    return [f"l/{name}" for name in pages]
