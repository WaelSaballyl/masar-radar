"""LLM extraction layer: reads a posting the way a person would.

Run:  python -m radar.ai --check    # verify the key and the model name
      python -m radar.ai            # report what would be sent, call nothing
      python -m radar.ai --apply    # extract and store
      python -m radar.ai --limit 20 # cap the number of postings per run

Regex extraction only finds skills that are spelled the way the pattern expects.
It cannot tell "we use Power BI daily" from "Power BI experience is a plus", it
misses every phrasing nobody thought to add, and it reads an Arabic posting as
noise. A model reads the posting instead, so this layer exists to answer three
things the patterns get wrong or cannot reach: which skills the job actually
requires, what the role really is, and how senior it is.

Cost control is the whole design. Every posting is sent at most once, ever:
ai_extracted_at is stamped on success and the posting is never queued again. A
run with nothing new to do makes no request at all.

Without GEMINI_API_KEY (or GOOGLE_API_KEY) this layer does nothing and the regex
results stand. The radar is fully functional without it.

Uses urllib, so the zero-dependency constraint in the README still holds.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

from . import db, skills

MODEL = os.environ.get("RADAR_GEMINI_MODEL", "gemini-flash-latest")
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Sent per request. Small enough to stay well inside the free tier's rate limit,
# large enough that a day of new postings costs a handful of calls.
BATCH = 5
PAUSE = 4.0  # seconds between requests; the free tier allows ~15 per minute
DESCRIPTION_CHARS = 6000  # enough for the requirements section of any posting

ROLES = ["Data Analyst", "Data Engineer", "Data Scientist", "ML Engineer",
         "Analytics Engineer", "BI Developer", "Business Analyst", "Other (Data)"]
SENIORITY = ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager", "Unknown"]

PROMPT = """You are reading job postings for a data-jobs market tracker.

For each posting, report only what the posting itself supports. Do not infer a \
skill because the role usually needs it - if the text does not mention it, leave \
it out. A skill listed as "nice to have" still counts as required=false.

skills: the technologies, tools and named methods the posting asks for. Use the \
canonical name from this list where one fits, and the posting's own wording \
otherwise. Canonical names: {canonical}

role: one of {roles}
seniority: one of {seniority}
years_experience: the minimum years stated, or null if the posting does not say.

Postings are sometimes in Arabic. Read them and reply in English regardless.

Return one object per posting, in the same order, keyed by the given id."""

SCHEMA = {
    "type": "object",
    "properties": {
        "postings": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "role": {"type": "string", "enum": ROLES},
                    "seniority": {"type": "string", "enum": SENIORITY},
                    "years_experience": {"type": "integer", "nullable": True},
                    "skills": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "required": {"type": "boolean"},
                            },
                            "required": ["name", "required"],
                        },
                    },
                },
                "required": ["id", "role", "seniority", "skills"],
            },
        }
    },
    "required": ["postings"],
}


def enabled() -> bool:
    return bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))


def _key() -> str:
    return os.environ.get("GEMINI_API_KEY") or os.environ["GOOGLE_API_KEY"]


def call(batch: list[dict], timeout: int = 90) -> list[dict]:
    """Send one batch and return the parsed postings array."""
    postings = "\n\n".join(
        f"--- id: {j['id']}\ntitle: {j['title']}\ncompany: {j['company']}\n"
        f"location: {j['location']}\ndescription: {(j['description'] or '')[:DESCRIPTION_CHARS]}"
        for j in batch
    )
    instruction = PROMPT.format(
        canonical=", ".join(sorted(skills.SKILL_PATTERNS)),
        roles=", ".join(ROLES),
        seniority=", ".join(SENIORITY),
    )
    body = {
        "contents": [{"parts": [{"text": instruction + "\n\n" + postings}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": SCHEMA,
        },
    }
    req = urllib.request.Request(
        ENDPOINT.format(model=MODEL),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": _key()},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.load(resp)
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)["postings"]


def check() -> int:
    """List the models this key can reach, and say whether MODEL is one of them.

    Model names move: an alias that worked when this was written can be retired.
    Without this, a stale name surfaces as an opaque 404 in the middle of a run.
    """
    if not enabled():
        print("[skip] ai: GEMINI_API_KEY not set")
        print("       get a free key at https://aistudio.google.com/apikey")
        return 1
    url = "https://generativelanguage.googleapis.com/v1beta/models"
    req = urllib.request.Request(url, headers={"x-goog-api-key": _key()})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        print(f"[error] ai: key rejected ({e.code}) - {e.reason}")
        return 1

    usable = sorted(
        m["name"].removeprefix("models/") for m in payload.get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    )
    print(f"[ok] ai: key works, {len(usable)} models support generateContent")
    if MODEL in usable:
        print(f"[ok] ai: configured model {MODEL!r} is available")
        return 0
    print(f"[error] ai: configured model {MODEL!r} is NOT available")
    print("        set RADAR_GEMINI_MODEL to one of:")
    for name in [m for m in usable if "flash" in m][:8]:
        print(f"          {name}")
    return 1


def pending(con, limit: int | None = None) -> list[dict]:
    """Postings with a description that have never been through the model."""
    sql = """SELECT id, title, company, location, description
               FROM jobs
              WHERE ai_extracted_at IS NULL
                AND description IS NOT NULL AND description != ''
              ORDER BY collected_at DESC, id"""
    if limit:
        sql += f" LIMIT {int(limit)}"
    cols = ("id", "title", "company", "location", "description")
    return [dict(zip(cols, row)) for row in con.execute(sql)]


def store(con, result: dict, now: str) -> None:
    """Replace this posting's skills with the model's, and stamp it as done."""
    job_id = result["id"]
    con.execute("DELETE FROM job_skills WHERE job_id = ?", (job_id,))
    con.executemany(
        "INSERT OR IGNORE INTO job_skills (job_id, skill, required, source) "
        "VALUES (?, ?, ?, 'ai')",
        [(job_id, s["name"].strip(), 1 if s.get("required") else 0)
         for s in result.get("skills", []) if s.get("name", "").strip()],
    )
    con.execute(
        """UPDATE jobs SET role = ?, seniority = ?, years_experience = ?,
                           ai_extracted_at = ?
             WHERE id = ?""",
        (result["role"], result.get("seniority"), result.get("years_experience"),
         now, job_id),
    )


def run(apply: bool, limit: int | None = None) -> dict:
    con = db.connect()
    queue = pending(con, limit)
    stats = {"pending": len(queue), "batches": 0, "extracted": 0, "failed": 0}

    if not enabled():
        print("[skip] ai: GEMINI_API_KEY not set - regex extraction stands")
        con.close()
        return stats
    if not queue:
        print("[ok] ai: nothing pending, no requests made")
        con.close()
        return stats
    if not apply:
        print(f"[dry] ai: {len(queue)} postings pending, "
              f"{(len(queue) + BATCH - 1) // BATCH} requests via {MODEL}")
        for j in queue[:5]:
            print(f"      - {j['title'][:60]}")
        con.close()
        return stats

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for start in range(0, len(queue), BATCH):
        batch = queue[start:start + BATCH]
        try:
            results = call(batch)
        except (urllib.error.URLError, KeyError, ValueError, TimeoutError) as e:
            # A failed batch is left unstamped, so the next run retries it.
            print(f"[error] ai batch {stats['batches'] + 1}: {type(e).__name__}: {e}")
            stats["failed"] += len(batch)
            continue
        finally:
            stats["batches"] += 1

        known = {j["id"] for j in batch}
        for result in results:
            if result.get("id") in known:
                store(con, result, now)
                stats["extracted"] += 1
        con.commit()
        print(f"[ok] ai batch {stats['batches']}: {len(results)} postings")
        if start + BATCH < len(queue):
            time.sleep(PAUSE)

    con.close()
    print(f"[done] ai: {stats['extracted']} extracted, {stats['failed']} failed, "
          f"{stats['batches']} requests")
    return stats


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    run(apply="--apply" in sys.argv, limit=limit)
