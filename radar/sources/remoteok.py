"""Remote OK public API.

API terms (returned as the first element of the feed): free to use, requires
mentioning Remote OK as a source with a link back on any public page.

Encoding note: Remote OK serves non-ASCII text that was already decoded as
Latin-1 somewhere upstream, so Arabic city names arrive as "Ø§Ù„Ø±ÙŠØ§Ø¶"
instead of "الرياض". The feed itself is valid JSON, so this is not a parsing
bug on our side - the damaged text has to be repaired after decoding.
"""
import re

from .base import get_json

# UTF-8 read as Latin-1 leaves a lead byte in U+00C2-U+00F4 followed by a
# continuation byte in U+0080-U+00BF. Clean text practically never matches.
_MOJIBAKE = re.compile(r"[Â-ô][-¿]")


def repair(text: str) -> str:
    """Undo one round of UTF-8-decoded-as-Latin-1. Leaves clean text untouched."""
    if not text or not _MOJIBAKE.search(text):
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def fetch() -> list[dict]:
    data = get_json("https://remoteok.com/api")
    jobs = []
    for j in data:
        if not isinstance(j, dict) or "position" not in j:
            continue  # first element is the legal notice
        jobs.append({
            "source": "remoteok",
            "title": repair(j.get("position", "")),
            "company": repair(j.get("company", "")),
            "location": repair(j.get("location", "") or "Remote"),
            "url": j.get("url", ""),
            "salary": _salary(j),
            "posted_at": (j.get("date") or "")[:10],
            "description": repair(" ".join(j.get("tags", [])) + " " + (j.get("description") or "")),
        })
    return jobs


def _salary(j: dict) -> str:
    lo, hi = j.get("salary_min"), j.get("salary_max")
    if lo and hi:
        return f"${lo:,} - ${hi:,}"
    return ""
