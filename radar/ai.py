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


# Worth waiting out: 503 is the model reporting it is overloaded, 429 the free
# tier's per-minute limit. Both clear on their own, usually within a minute.
TRANSIENT = {429, 500, 503, 504}
RETRIES = 3          # attempts per model before falling back to the next one
BACKOFF = 8.0        # seconds, doubled per attempt unless the API names a delay
MAX_WAIT = 60.0      # never stall a CI run longer than this on one hint
# Stop after this many batches fail in a row. On a bad day at the API, pressing
# on only spends the daily quota on requests that will fail the same way.
MAX_CONSECUTIVE_FAILURES = 3


class BatchFailed(Exception):
    """Every model and retry was tried; the batch stays queued for next run."""


class KeyRejected(Exception):
    """401/403 - no point sending anything else this run."""


def _request_body(batch: list[dict]) -> dict:
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
    return {
        "contents": [{"parts": [{"text": instruction + "\n\n" + postings}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": SCHEMA,
        },
    }


def _post(model: str, body: dict, timeout: int) -> dict:
    req = urllib.request.Request(
        ENDPOINT.format(model=model),
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": _key()},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def _explain(e: urllib.error.HTTPError) -> tuple[str, float | None]:
    """(message, seconds to wait) from an error response.

    The status line alone says "Service Unavailable"; the body says why, and on
    a 429 it names how long to back off for.
    """
    wait = None
    try:
        wait = float(e.headers.get("Retry-After"))
    except (TypeError, ValueError):
        pass
    try:
        err = json.loads(e.read().decode("utf-8"))["error"]
        message = err.get("message", "")
        for detail in err.get("details", []):
            delay = detail.get("retryDelay", "")
            if wait is None and delay.endswith("s"):
                wait = float(delay[:-1])
    except Exception:
        message = e.reason or ""
    return message[:160], wait


def call(batch: list[dict], models: list[str], timeout: int = 90) -> tuple[list[dict], str]:
    """Send one batch. Retries transient errors, then falls back to the next model.

    Returns (postings, model that answered).
    """
    body = _request_body(batch)
    last = "no model attempted"
    for model in models:
        for attempt in range(RETRIES):
            try:
                payload = _post(model, body, timeout)
                text = payload["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)["postings"], model
            except urllib.error.HTTPError as e:
                message, hint = _explain(e)
                last = f"{model}: HTTP {e.code} {message}"
                if e.code in (401, 403):
                    raise KeyRejected(last) from e
                if e.code not in TRANSIENT:
                    break  # 400/404 will not change on retry; try the next model
                if attempt < RETRIES - 1:
                    time.sleep(min(hint or BACKOFF * 2 ** attempt, MAX_WAIT))
            except (urllib.error.URLError, TimeoutError) as e:
                last = f"{model}: {type(e).__name__} {e}"
                if attempt < RETRIES - 1:
                    time.sleep(BACKOFF * 2 ** attempt)
            except (KeyError, IndexError, ValueError) as e:
                # A reply we cannot read. Asking the same model again tends to
                # return the same shape, so move on.
                last = f"{model}: unreadable reply ({type(e).__name__})"
                break
    raise BatchFailed(last)


def available_models() -> list[str]:
    """Models this key can call generateContent on."""
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
        headers={"x-goog-api-key": _key()},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.load(resp)
    return sorted(
        m["name"].removeprefix("models/") for m in payload.get("models", [])
        if "generateContent" in m.get("supportedGenerationMethods", [])
    )


def models_to_try(available: list[str]) -> list[str]:
    """The configured model first, then other rolling flash aliases as fallback.

    Only "-latest" aliases are considered: a dated preview may be withdrawn with
    little notice, while the aliases are kept pointing at something current.
    A lighter model under less load beats no answer on a day the main one is
    saturated.
    """
    fallbacks = sorted(m for m in available
                       if "flash" in m and m.endswith("-latest") and m != MODEL)
    order = [m for m in [MODEL, *fallbacks] if m in available]
    return order[:3] or [MODEL]


def check() -> int:
    """Verify the key, and say whether MODEL and its fallbacks can be reached.

    Model names move: an alias that worked when this was written can be retired.
    Without this, a stale name surfaces as an opaque 404 in the middle of a run.
    """
    if not enabled():
        print("[skip] ai: GEMINI_API_KEY not set")
        print("       get a free key at https://aistudio.google.com/apikey")
        return 1
    try:
        usable = available_models()
    except urllib.error.HTTPError as e:
        message, _ = _explain(e)
        print(f"[error] ai: key rejected ({e.code}) - {message}")
        return 1

    print(f"[ok] ai: key works, {len(usable)} models support generateContent")
    print(f"[ok] ai: will try {', '.join(models_to_try(usable))}")
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
    stats = {"pending": len(queue), "batches": 0, "extracted": 0, "failed": 0,
             "deferred": 0}

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

    try:
        models = models_to_try(available_models())
    except urllib.error.URLError as e:
        print(f"[error] ai: cannot list models ({e}) - trying {MODEL} alone")
        models = [MODEL]
    print(f"[ok] ai: {len(queue)} pending, models {', '.join(models)}")

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    consecutive = 0
    for start in range(0, len(queue), BATCH):
        # Pause before every request after the first, success or not. It used to
        # sit after the success path only, so a failing batch skipped it and the
        # next request went out at once - which is how 503s turned into 429s.
        if start:
            time.sleep(PAUSE)
        batch = queue[start:start + BATCH]
        stats["batches"] += 1
        try:
            results, model = call(batch, models)
        except KeyRejected as e:
            print(f"[error] ai: {e} - stopping")
            stats["failed"] += len(batch)
            stats["deferred"] = len(queue) - start - len(batch)
            break
        except BatchFailed as e:
            # Left unstamped, so the next run picks it up again.
            print(f"[error] ai batch {stats['batches']}: {e}")
            stats["failed"] += len(batch)
            consecutive += 1
            if consecutive >= MAX_CONSECUTIVE_FAILURES:
                stats["deferred"] = len(queue) - start - len(batch)
                print(f"[stop] ai: {consecutive} batches failed in a row - "
                      f"{stats['deferred']} postings left for the next run")
                break
            continue

        consecutive = 0
        known = {j["id"] for j in batch}
        for result in results:
            if result.get("id") in known:
                store(con, result, now)
                stats["extracted"] += 1
        con.commit()
        print(f"[ok] ai batch {stats['batches']}: {len(results)} postings via {model}")

    con.close()
    print(f"[done] ai: {stats['extracted']} extracted, {stats['failed']} failed, "
          f"{stats['deferred']} deferred, {stats['batches']} batches")
    return stats


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    run(apply="--apply" in sys.argv, limit=limit)
