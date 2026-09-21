"""Git-friendly persistence for the radar database.

Run:  python -m radar.store export    # database -> data/*.jsonl
      python -m radar.store restore   # data/*.jsonl -> database

The daily workflow used to commit data/radar.db. SQLite files are binary, so git
stores a whole new copy on every run rather than a delta - a year of daily runs
would leave 365 full copies of a growing file in the repository.

Line-delimited JSON fixes this: git deltas text, so a run that adds twenty
postings adds roughly twenty lines to the pack. The database becomes a local
build artifact, rebuilt from these files at the start of each run.

Two files, because they change at different rates:

  jobs.jsonl          one line per posting, sorted by id. Most fields never
                      change; last_seen and role do.
  descriptions.jsonl  the posting text, sorted by id. Write-once - a line here
                      is never touched again, so this file is pure append and
                      costs almost nothing to keep in history.
"""
import json
import sys
from pathlib import Path

from . import db

DATA = Path(db.DB_PATH).parent
JOBS = DATA / "jobs.jsonl"
DESCRIPTIONS = DATA / "descriptions.jsonl"

# description is stored separately; skills travel with the job line
FIELDS = ["id", "source", "title", "company", "location", "role", "url",
          "salary", "posted_at", "collected_at", "last_seen"]


def _write_lines(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows),
        encoding="utf-8",
    )


def export() -> tuple[int, int]:
    con = db.connect()
    skills_by_job: dict[str, list[str]] = {}
    for job_id, skill in con.execute(
        "SELECT job_id, skill FROM job_skills ORDER BY job_id, skill"
    ):
        skills_by_job.setdefault(job_id, []).append(skill)

    jobs, descriptions = [], []
    cols = ", ".join(FIELDS)
    for row in con.execute(f"SELECT {cols}, description FROM jobs ORDER BY id"):
        record = dict(zip(FIELDS, row))
        record["skills"] = skills_by_job.get(record["id"], [])
        jobs.append(record)
        if row[-1]:
            descriptions.append({"id": record["id"], "description": row[-1]})
    con.close()

    _write_lines(JOBS, jobs)
    _write_lines(DESCRIPTIONS, descriptions)
    return len(jobs), len(descriptions)


def restore() -> int:
    """Rebuild the database from the committed files. Existing rows are replaced."""
    if not JOBS.exists():
        return 0

    texts = {}
    if DESCRIPTIONS.exists():
        for line in DESCRIPTIONS.read_text(encoding="utf-8").splitlines():
            if line.strip():
                record = json.loads(line)
                texts[record["id"]] = record["description"]

    con = db.connect()
    count = 0
    for line in JOBS.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        skills = record.pop("skills", [])
        record["description"] = texts.get(record["id"])
        placeholders = ", ".join(f":{f}" for f in FIELDS)
        con.execute(
            f"INSERT OR REPLACE INTO jobs ({', '.join(FIELDS)}, description) "
            f"VALUES ({placeholders}, :description)",
            record,
        )
        con.execute("DELETE FROM job_skills WHERE job_id = ?", (record["id"],))
        con.executemany(
            "INSERT OR IGNORE INTO job_skills (job_id, skill) VALUES (?, ?)",
            [(record["id"], s) for s in skills],
        )
        count += 1
    con.commit()
    con.close()
    return count


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "export"
    if action == "export":
        n_jobs, n_desc = export()
        print(f"[done] exported {n_jobs} jobs, {n_desc} descriptions -> {DATA}")
    elif action == "restore":
        print(f"[done] restored {restore()} jobs from {JOBS.name}")
    else:
        sys.exit("usage: python -m radar.store [export|restore]")
