"""Remote OK public API.

API terms (returned as the first element of the feed): free to use, requires
mentioning Remote OK as a source with a link back on any public page.
"""
from .base import get_json


def fetch() -> list[dict]:
    data = get_json("https://remoteok.com/api")
    jobs = []
    for j in data:
        if not isinstance(j, dict) or "position" not in j:
            continue  # first element is the legal notice
        jobs.append({
            "source": "remoteok",
            "title": j.get("position", ""),
            "company": j.get("company", ""),
            "location": j.get("location", "") or "Remote",
            "url": j.get("url", ""),
            "salary": _salary(j),
            "posted_at": (j.get("date") or "")[:10],
            "description": " ".join(j.get("tags", [])) + " " + (j.get("description") or ""),
        })
    return jobs


def _salary(j: dict) -> str:
    lo, hi = j.get("salary_min"), j.get("salary_max")
    if lo and hi:
        return f"${lo:,} - ${hi:,}"
    return ""
