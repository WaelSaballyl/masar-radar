"""Arbeitnow public job board API.

Free to use, no key: https://www.arbeitnow.com/api/job-board-api

Returns roughly 250 postings per page across every field, so the yield of data
roles is low - but its listings are European, which no other source in the radar
covers. Kept for breadth of market, not volume.
"""
from datetime import datetime, timezone

from .base import get_json


def fetch() -> list[dict]:
    data = get_json("https://www.arbeitnow.com/api/job-board-api")
    jobs = []
    for j in data.get("data", []):
        jobs.append({
            "source": "arbeitnow",
            "title": j.get("title", ""),
            "company": j.get("company_name", ""),
            "location": j.get("location", "") or ("Remote" if j.get("remote") else ""),
            "url": j.get("url", ""),
            "salary": "",  # not exposed by this API
            "posted_at": _posted(j.get("created_at")),
            "description": " ".join(j.get("tags") or []) + " " + (j.get("description") or ""),
        })
    return jobs


def _posted(created_at) -> str:
    """created_at is a unix timestamp, unlike every other source's ISO string."""
    try:
        return datetime.fromtimestamp(int(created_at), timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError):
        return ""
