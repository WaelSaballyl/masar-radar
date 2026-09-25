"""Write docs/data/summary.json for the static site.

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
        """SELECT id, title, company, location, url, seniority, posted_at, source
             FROM jobs WHERE last_seen >= ?""",
        (cutoff,),
    ).fetchall()
    ids = [r[0] for r in active]
    entry = [r for r in active if r[5] in ENTRY_LEVELS]

    if len(entry) >= MIN_ENTRY_POSTINGS:
        route_basis, route_ids = "entry", [r[0] for r in entry]
    else:
        route_basis, route_ids = "all", ids

    entry_sorted = sorted(entry, key=lambda r: (r[6] or "", r[1]), reverse=True)
    companies = Counter(r[2] for r in active if r[2])

    summary = {
        "updated_at": latest,
        "active_postings": len(active),
        "total_postings": con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
        "companies": len(companies),
        "sources": sorted({r[7] for r in active}),
        "entry_postings": len(entry),
        "route": {
            "basis": route_basis,  # "entry" or "all" - the page labels it
            "postings": len(route_ids),
            "stops": _skill_shares(con, route_ids, ROUTE_STOPS),
        },
        "top_skills": _skill_shares(con, ids, 10),
        "entry_jobs": [
            {"title": t, "company": c, "location": loc, "url": u,
             "level": lvl, "posted_at": p}
            for _, t, c, loc, u, lvl, p, _ in entry_sorted[:12]
        ],
        "company_names": [name for name, _ in companies.most_common(40)],
    }
    con.close()
    return summary


def main() -> None:
    summary = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    route = summary.get("route", {})
    print(f"[done] site summary -> {OUT} ({summary.get('active_postings', 0)} active, "
          f"route from {route.get('postings', 0)} {route.get('basis', '')} postings)")


if __name__ == "__main__":
    main()
