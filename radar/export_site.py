"""Write docs/data/summary.json and docs/data/jobs.json for the static site.

Run:  python -m radar.export_site

The landing page is static HTML that reads this file, so the design is edited
by hand while the numbers refresh with every daily run. Everything here is
computed from active postings only: a posting counts as active when the latest
run, or one of the few before it, still saw it (last_seen).
"""
import json
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from . import db, landing, traits
from .skills import FIELDS, field_of, js_patterns

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "summary.json"
JOBS_OUT = OUT.parent / "jobs.json"
# the skill rules for the ATS check, which matches a CV in the browser
SKILLS_OUT = OUT.parent / "skills.json"

# A posting missing from this many days of runs is treated as closed. Runs are
# daily; three days absorbs a source having a bad day without keeping postings
# that were taken down.
ACTIVE_DAYS = 3

# The route on the landing page is built from entry-level postings, because the
# audience is students looking for co-op placements. Below this many postings
# the percentages stop meaning much, so it falls back to every active posting
# and says so.
ENTRY_LEVELS = ("Intern", "Junior")
MIN_ENTRY_POSTINGS = 8
ROUTE_STOPS = 7

# Masar serves Saudi Arabia first, then the Gulf. The landing page uses Gulf
# postings whenever there are enough of them, and says which basis it used.
GULF = {"SA", "AE", "QA", "KW", "BH", "OM"}
# One employer can post four variants of the same internship; below this the
# Gulf route mostly describes that employer, so the route stays global.
MIN_GULF_ROUTE = 20


def _company(name: str) -> str:
    """'Tabby | تابي' and 'تابي' are one employer; keep the Arabic half."""
    return name.rsplit("|", 1)[-1].strip() if name else name


def _skill_shares(con, job_ids: list[str], limit: int) -> list[dict]:
    """Share of the given postings that require each skill, most common first."""
    if not job_ids:
        return []
    marks = ",".join("?" * len(job_ids))
    rows = con.execute(
        f"""SELECT skill, COUNT(DISTINCT job_id) FROM job_skills
             WHERE required = 1 AND job_id IN ({marks})
             GROUP BY skill ORDER BY 2 DESC, skill LIMIT ?""",
        (*job_ids, limit),
    ).fetchall()
    return [{"name": s, "postings": n, "share": round(n / len(job_ids), 3)}
            for s, n in rows]


def build() -> dict:
    con = db.connect()
    latest = con.execute("SELECT MAX(last_seen) FROM jobs").fetchone()[0]
    if not latest:
        con.close()
        return {}
    cutoff = (datetime.fromisoformat(latest) - timedelta(days=ACTIVE_DAYS)).isoformat()

    active = con.execute(
        """SELECT id, title, company, location, url, seniority, posted_at, source, countries
             FROM jobs WHERE last_seen >= ?""",
        (cutoff,),
    ).fetchall()
    ids = [r[0] for r in active]
    in_gulf = lambda r: bool(GULF & set((r[8] or "").split(",")))
    gulf = [r for r in active if in_gulf(r)]
    entry = [r for r in active if r[5] in ENTRY_LEVELS]
    gulf_entry = [r for r in entry if in_gulf(r)]

    def route(rows: list) -> dict:
        """The skills line for these postings: Gulf training and junior ones when
        there are enough, then all training and junior ones, then everything."""
        ent = [r for r in rows if r[5] in ENTRY_LEVELS]
        gent = [r for r in ent if in_gulf(r)]
        if len(gent) >= MIN_GULF_ROUTE:
            basis, rids = "gulf_entry", [r[0] for r in gent]
        elif len(ent) >= MIN_ENTRY_POSTINGS:
            basis, rids = "entry", [r[0] for r in ent]
        else:
            basis, rids = "all", [r[0] for r in rows]
        return {"basis": basis, "postings": len(rids), "stops": _skill_shares(con, rids, ROUTE_STOPS)}

    # each field gets its own line: SQL tops data, IFRS tops accounting
    field = {r[0]: field_of(r[1]) or "data" for r in active}
    fields = Counter(field.values())

    # the internship list and the company names show the Gulf alone once it
    # has any; before JSearch there were none, and an empty page helps nobody
    listed = gulf_entry or entry
    entry_sorted, seen = [], set()
    for r in sorted(listed, key=lambda r: (r[6] or "", r[1]), reverse=True):
        # the same posting reaches JSearch from several job boards
        key = (r[1].strip().lower(), _company(r[2]))
        if key not in seen:
            seen.add(key)
            entry_sorted.append(r)
    companies = Counter(_company(r[2]) for r in (gulf or active) if r[2])

    summary = {
        "updated_at": latest,
        "active_postings": len(active),
        "total_postings": con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "companies": len(companies),
        "sources": sorted({r[7] for r in active}),
        "entry_postings": len(entry),
        "gulf_postings": len(gulf),
        "jobs_basis": "gulf" if gulf_entry else "all",
        "companies_basis": "gulf" if gulf else "all",
        # basis is "gulf_entry", "entry" or "all" - the page labels it
        "route": route([r for r in active if field[r[0]] == "data"]),
        "routes": {f: route([r for r in active if field[r[0]] == f])
                   for f in FIELDS if fields[f] >= MIN_ENTRY_POSTINGS},
        "fields": {f: fields[f] for f in FIELDS if fields[f]},
        "top_skills": _skill_shares(con, ids, 10),
        "entry_jobs": [
            {"title": t, "company": _company(c), "location": loc, "url": u,
             "level": lvl, "posted_at": p}
            for _, t, c, loc, u, lvl, p, _, _ in entry_sorted[:12]
        ],
        "company_names": [name for name, _ in companies.most_common(40)],
    }
    con.close()
    return summary


def build_jobs() -> dict:
    """Active postings with what the market index filters and counts on.

    The index recomputes every chart in the browser as filters change, so it
    needs postings rather than totals. Descriptions stay out: they are the bulk
    of the data and the page never shows them.
    """
    con = db.connect()
    latest = con.execute("SELECT MAX(last_seen) FROM jobs").fetchone()[0]
    if not latest:
        con.close()
        return {"updated_at": None, "postings": []}
    cutoff = (datetime.fromisoformat(latest) - timedelta(days=ACTIVE_DAYS)).isoformat()

    skills: dict[str, list] = {}
    for job_id, skill, required in con.execute(
        "SELECT job_id, skill, required FROM job_skills ORDER BY job_id, required DESC, skill"
    ):
        skills.setdefault(job_id, []).append([skill, required])

    split = lambda v: [x for x in (v or "").split(",") if x]
    postings = []
    for (jid, title, company, location, url, posted, collected, level, role,
         countries, regions, mode, description, logo) in con.execute(
        """SELECT id, title, company, location, url, posted_at, collected_at, seniority, role,
                  countries, regions, work_mode, description, logo
             FROM jobs WHERE last_seen >= ? ORDER BY posted_at DESC, id""",
        (cutoff,),
    ):
        postings.append({
            # id lets a page link straight to one posting (the CV builder's ?job=)
            "id": jid, "title": title, "company": company, "location": location, "url": url,
            "field": field_of(title) or "data",
            # some sources give no date; the day we first saw it is the honest stand-in
            "posted_at": posted or (collected or "")[:10], "level": level, "role": role,
            "countries": split(countries), "regions": split(regions),
            "mode": mode or "unknown", "skills": skills.get(jid, []),
            # training or a job, and the years asked for (radar/traits.py)
            "employment": traits.employment(title, description), "years": traits.years(title, description),
            "logo": logo if (logo or "").startswith("https://") else "",
        })
        # the model's "Intern" on a post that is not training (a research
        # assistant job) would put it under internships: it is entry level
        if postings[-1]["level"] == "Intern" and postings[-1]["employment"] == "job":
            postings[-1]["level"] = "Junior"
    con.close()
    return {"updated_at": latest, "postings": postings}


SITE = "https://waelsaballyl.github.io/masar-radar/"
SITEMAP_OUT = OUT.parent.parent / "sitemap.xml"


def build_sitemap(jobs: dict, pages: list[str] = ()) -> str:
    """The pages a search engine should know: the fixed pages, plus the
    postings list filtered the way people search ("SQL jobs", "Saudi Arabia",
    "internships"). Collected postings get no page of their own here: their
    text belongs to the site they came from."""
    from xml.sax.saxutils import escape
    from urllib.parse import quote

    postings = jobs["postings"]
    urls = ["", "guide.html", "jobs.html", "dashboard.html", "cv.html", "swipe.html", "employers.html", "privacy.html",
            "terms.html", "support.html", "ats.html", "companies.html", "tests.html", "premium.html",
            "jobs.html?type=training"]
    urls += [f"jobs.html?where={c}" for c in sorted(GULF) if any(c in p["countries"] for p in postings)]
    top = Counter(s for p in postings for s, required in p["skills"] if required)
    urls += [f"jobs.html?q={quote(s)}" for s, n in top.most_common(20) if n >= 3]
    companies = Counter(p["company"] for p in postings if p.get("company"))
    urls += [f"companies.html?c={quote(c)}" for c, n in companies.most_common(30) if n >= 3]
    urls += list(pages)
    day = (jobs["updated_at"] or "")[:10]
    rows = "".join(f"<url><loc>{escape(SITE + u)}</loc>{f'<lastmod>{day}</lastmod>' if day else ''}</url>\n" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{rows}</urlset>\n'


def main() -> None:
    summary = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    jobs = build_jobs()
    JOBS_OUT.write_text(json.dumps(jobs, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    print(f"[done] market index data -> {JOBS_OUT} ({len(jobs['postings'])} postings)")
    SKILLS_OUT.write_text(json.dumps(js_patterns(), ensure_ascii=False, indent=0), encoding="utf-8")
    pages = landing.write(jobs)
    print(f"[done] landing pages -> docs/l/ ({len(pages)})")
    SITEMAP_OUT.write_text(build_sitemap(jobs, pages), encoding="utf-8")
    route = summary.get("route", {})
    print(f"[done] site summary -> {OUT} ({summary.get('active_postings', 0)} active, "
          f"route from {route.get('postings', 0)} {route.get('basis', '')} postings)")


if __name__ == "__main__":
    main()
