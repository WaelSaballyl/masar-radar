"""Re-apply the current filter and role rules to jobs already in the database.

Run:  python -m radar.reclassify           # report only, changes nothing
      python -m radar.reclassify --apply   # drop non-data jobs, fix stale roles

Needed whenever the patterns in skills.py change. Rows stored under looser rules
keep their old role forever otherwise - tightening the filter does not reach back
and evict the compliance and drilling postings an earlier version let through.

Three passes run together: mojibake repair on text stored before the encoding
fix, eviction and re-labelling against the current rules, and skill re-extraction
for rows that kept a description. Rows stored before descriptions were saved
cannot be re-extracted; they refresh the next time the posting is collected.
"""
import sys

from . import db, skills
from .sources.remoteok import repair


def review(con) -> tuple[list, list, list, list]:
    """Return (rows to drop, stale roles, garbled text, stale skills)."""
    drop, rerole, garbled, reskill = [], [], [], []
    rows = con.execute(
        "SELECT id, title, company, location, role, description FROM jobs"
    ).fetchall()
    for job_id, title, company, location, role, description in rows:
        fixed = (repair(title), repair(company or ""), repair(location or ""))
        if fixed != (title, company or "", location or ""):
            garbled.append((job_id, location, fixed[2]))

        clean_title = fixed[0]
        if not skills.is_data_job(clean_title):
            drop.append((job_id, clean_title, role))
            continue

        current = skills.classify_role(clean_title)
        if current != role:
            rerole.append((job_id, clean_title, role, current))

        if description:
            found = set(skills.extract_skills(clean_title + " " + description))
            stored = {r[0] for r in con.execute(
                "SELECT skill FROM job_skills WHERE job_id = ?", (job_id,))}
            if found != stored:
                reskill.append((job_id, clean_title, stored, found))
    return drop, rerole, garbled, reskill


def main(apply: bool) -> None:
    con = db.connect()
    total = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    drop, rerole, garbled, reskill = review(con)

    print(f"{total} jobs in database")
    print(f"\n{len(drop)} no longer pass the data filter:")
    for _, title, role in drop:
        print(f"  - {title}  [was {role}]")
    print(f"\n{len(rerole)} have a stale role:")
    for _, title, old, new in rerole:
        print(f"  ~ {title}  [{old} -> {new}]")
    print(f"\n{len(garbled)} have garbled text:")
    for _, old, new in garbled:
        print(f"  ! {old[:32]:34} -> {new}")
    print(f"\n{len(reskill)} have stale skills:")
    for _, title, stored, found in reskill:
        added = ", ".join(sorted(found - stored)) or "none"
        print(f"  + {title[:32]:34} +[{added}]")

    if not apply:
        print("\nreport only - re-run with --apply to write these changes")
        con.close()
        return

    for job_id, *_ in garbled:
        title, company, location, description = con.execute(
            "SELECT title, company, location, description FROM jobs WHERE id = ?",
            (job_id,)).fetchone()
        con.execute(
            """UPDATE jobs SET title = ?, company = ?, location = ?, description = ?
                 WHERE id = ?""",
            (repair(title), repair(company or ""), repair(location or ""),
             repair(description or "") or None, job_id))

    con.executemany("DELETE FROM job_skills WHERE job_id = ?", [(j[0],) for j in drop])
    con.executemany("DELETE FROM jobs WHERE id = ?", [(j[0],) for j in drop])
    con.executemany("UPDATE jobs SET role = ? WHERE id = ?",
                    [(new, jid) for jid, _, _, new in rerole])
    for job_id, _, _, found in reskill:
        con.execute("DELETE FROM job_skills WHERE job_id = ?", (job_id,))
        con.executemany(
            "INSERT OR IGNORE INTO job_skills (job_id, skill) VALUES (?, ?)",
            [(job_id, skill) for skill in sorted(found)])

    con.commit()
    remaining = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    con.close()
    print(f"\napplied - {len(drop)} dropped, {len(rerole)} reclassified, "
          f"{len(garbled)} repaired, {len(reskill)} re-skilled, {remaining} remain")


if __name__ == "__main__":
    main(apply="--apply" in sys.argv)
