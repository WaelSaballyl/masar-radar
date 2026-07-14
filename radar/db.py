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
    collected_at TEXT NOT NULL
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
    return con


def insert_job(con: sqlite3.Connection, job: dict, skills: list[str]) -> bool:
    """Insert a job if new. Returns True when the row was actually added."""
    cur = con.execute(
        """INSERT OR IGNORE INTO jobs
           (id, source, title, company, location, role, url, salary, posted_at, collected_at)
           VALUES (:id, :source, :title, :company, :location, :role, :url, :salary, :posted_at, :collected_at)""",
        job,
    )
    if cur.rowcount == 0:
        return False
    con.executemany(
        "INSERT OR IGNORE INTO job_skills (job_id, skill) VALUES (?, ?)",
        [(job["id"], s) for s in skills],
    )
    return True
