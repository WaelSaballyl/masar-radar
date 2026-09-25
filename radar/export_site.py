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

from . import db

OUT = Path(__file__).resolve().parent.parent / "docs" / "data" / "summary.json"
JOBS_OUT = OUT.parent / "jobs.json"

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

    if len(gulf_entry) >= MIN_GULF_ROUTE:
        route_basis, route_ids = "gulf_entry", [r[0] for r in gulf_entry]
    elif len(entry) >= MIN_ENTRY_POSTINGS:
        route_basis, route_ids = "entry", [r[0] for r in entry]
    else:
        route_basis, route_ids = "all", ids

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
        "route": {
            "basis": route_basis,  # "gulf_entry", "entry" or "all" - the page labels it
            "postings": len(route_ids),
            "stops": _skill_shares(con, route_ids, ROUTE_STOPS),
        },
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
    for (jid, title, company, location, url, posted, level, role,
         countries, regions, mode) in con.execute(
        """SELECT id, title, company, location, url, posted_at, seniority, role,
                  countries, regions, work_mode
             FROM jobs WHERE last_seen >= ? ORDER BY posted_at DESC, id""",
        (cutoff,),
    ):
        postings.append({
            "title": title, "company": company, "location": location, "url": url,
            "posted_at": posted, "level": level, "role": role,
            "countries": split(countries), "regions": split(regions),
            "mode": mode or "unknown", "skills": skills.get(jid, []),
        })
    con.close()
    return {"updated_at": latest, "postings": postings}


def main() -> None:
    summary = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    jobs = build_jobs()
    JOBS_OUT.write_text(json.dumps(jobs, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
    print(f"[done] market index data -> {JOBS_OUT} ({len(jobs['postings'])} postings)")
    route = summary.get("route", {})
    print(f"[done] site summary -> {OUT} ({summary.get('active_postings', 0)} active, "
          f"route from {route.get('postings', 0)} {route.get('basis', '')} postings)")


if __name__ == "__main__":
    main()
