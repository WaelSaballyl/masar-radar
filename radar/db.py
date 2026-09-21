"""SQLite storage for collected job postings."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "radar.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    id           TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    title        TEXT NOT NULL,
    company      TEXT,
    location     TEXT,
    role         TEXT,
    url          TEXT,
    salary       TEXT,
    posted_at    TEXT,
    collected_at TEXT NOT NULL,
    last_seen    TEXT,
    description  TEXT
);

CREATE TABLE IF NOT EXISTS job_skills (
    job_id TEXT NOT NULL REFERENCES jobs(id),
    skill  TEXT NOT NULL,
    PRIMARY KEY (job_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_jobs_collected ON jobs(collected_at);
CREATE INDEX IF NOT EXISTS idx_skills_skill   ON job_skills(skill);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    _migrate(con)
    return con


def _migrate(con: sqlite3.Connection) -> None:
    """Bring a database created by an earlier version up to the current schema."""
    cols = {row[1] for row in con.execute("PRAGMA table_info(jobs)")}
    if "last_seen" not in cols:
        con.execute("ALTER TABLE jobs ADD COLUMN last_seen TEXT")
        con.execute("UPDATE jobs SET last_seen = collected_at WHERE last_seen IS NULL")
    if "description" not in cols:
        con.execute("ALTER TABLE jobs ADD COLUMN description TEXT")
    # created here, not in SCHEMA: the column must exist before the index can.
    con.execute("CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs(last_seen)")
    con.commit()


def insert_job(con: sqlite3.Connection, job: dict, skills: list[str]) -> bool:
    """Insert a job if new, otherwise refresh last_seen.

    Returns True only when the row was actually added, so callers can count new
    postings. Touching last_seen on a repeat sighting is what lets the dashboard
    tell a live opening from one that closed months ago.
    """
    cur = con.execute(
        """INSERT OR IGNORE INTO jobs
           (id, source, title, company, location, role, url, salary, posted_at,
            collected_at, last_seen, description)
           VALUES (:id, :source, :title, :company, :location, :role, :url, :salary,
                   :posted_at, :collected_at, :last_seen, :description)""",
        job,
    )
    if cur.rowcount == 0:
        # Seen again: refresh the timestamp and keep whichever description is
        # longer. That backfills rows stored before descriptions were saved,
        # upgrades ones stored under a shorter trim limit, and guarantees a
        # truncated re-fetch can never shorten a fuller copy already held.
        con.execute(
            """UPDATE jobs
                  SET last_seen = :last_seen,
                      description = CASE
                          WHEN LENGTH(:description) > LENGTH(COALESCE(description, ''))
                          THEN :description ELSE description END
                WHERE id = :id""",
            {"last_seen": job["last_seen"], "description": job["description"],
             "id": job["id"]},
        )
        return False
    con.executemany(
        "INSERT OR IGNORE INTO job_skills (job_id, skill) VALUES (?, ?)",
        [(job["id"], s) for s in skills],
    )
    return True
