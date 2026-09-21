"""Pipeline entry point: fetch -> filter -> normalize -> dedupe -> store.

Run:  python -m radar.collect
"""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from . import db, skills
from .sources import jsearch, remoteok, remotive


# Long enough for requirements and tech-stack sections, short enough that a
# database committed daily does not balloon the repository.
DESCRIPTION_LIMIT = 4000


def job_id(job: dict) -> str:
    key = job["url"] or f"{job['source']}|{job['company']}|{job['title']}"
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def dedupe(raw: list[dict]) -> list[dict]:
    """Collapse repeats inside one fetch.

    A source that runs several search terms can return the same posting once per
    term. Counting those separately inflated `fetched` four-fold in the run log,
    so the raw list is collapsed before anything is counted or stored.
    """
    unique: dict[str, dict] = {}
    for job in raw:
        unique.setdefault(job_id(job), job)
    return list(unique.values())


def run() -> dict:
    sources = [("remotive", remotive.fetch), ("remoteok", remoteok.fetch)]
    if jsearch.enabled():
        sources.append(("jsearch", jsearch.fetch))
    else:
        print("[skip] jsearch: RAPIDAPI_KEY not set")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    con = db.connect()
    stats = {"run_at": now, "fetched": 0, "unique": 0, "data_jobs": 0, "new": 0,
             "per_source": {}}

    for name, fetch in sources:
        try:
            raw = fetch()
        except Exception as e:
            print(f"[error] {name}: {e}")
            stats["per_source"][name] = {"error": str(e)}
            continue

        unique = dedupe(raw)
        new_count = 0
        data_count = 0
        for j in unique:
            if not skills.is_data_job(j["title"]):
                continue
            data_count += 1
            body = skills.strip_html(j.pop("description"))
            text = j["title"] + " " + body
            row = {
                **j,
                "id": job_id(j),
                "role": skills.classify_role(j["title"]),
                "collected_at": now,
                "last_seen": now,
                # kept so skills can be re-extracted when the patterns improve;
                # trimmed because the database is committed on every daily run.
                "description": body[:DESCRIPTION_LIMIT],
            }
            if db.insert_job(con, row, skills.extract_skills(text)):
                new_count += 1

        stats["fetched"] += len(raw)
        stats["unique"] += len(unique)
        stats["data_jobs"] += data_count
        stats["new"] += new_count
        stats["per_source"][name] = {
            "fetched": len(raw), "unique": len(unique),
            "data_jobs": data_count, "new": new_count,
        }
        print(f"[ok] {name}: fetched={len(raw)} unique={len(unique)} "
              f"data_jobs={data_count} new={new_count}")

    con.commit()
    total = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    con.close()
    stats["total_in_db"] = total

    log_path = Path(db.DB_PATH).parent / "last_run.json"
    log_path.write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[done] total jobs in db: {total} (+{stats['new']} new)")
    return stats


if __name__ == "__main__":
    run()
