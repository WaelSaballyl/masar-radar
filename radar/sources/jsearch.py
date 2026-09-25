"""JSearch (RapidAPI) — aggregates Google Jobs, covers Saudi Arabia and the Gulf.

Disabled until the RAPIDAPI_KEY environment variable is set.
Free tier: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
"""
import os
from urllib.parse import quote

from .base import get_json

SEARCHES = [
    "data analyst in Saudi Arabia",
    "data engineer in Saudi Arabia",
    "business intelligence in Saudi Arabia",
    "data internship in Saudi Arabia",
]  # one request each per daily run: 4 x 30 = ~120 of the free plan's 200 a month


def enabled() -> bool:
    return bool(os.environ.get("RAPIDAPI_KEY"))


def fetch() -> list[dict]:
    # a pasted secret can carry a trailing newline or spaces, which RapidAPI rejects
    key = os.environ["RAPIDAPI_KEY"].strip()
    headers = {"X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"}
    jobs = []
    for term in SEARCHES:
        data = get_json(
            f"https://jsearch.p.rapidapi.com/search?query={quote(term)}&num_pages=1",
            headers=headers,
        )
        for j in data.get("data", []):
            city = j.get("job_city") or ""
            country = j.get("job_country") or ""
            jobs.append({
                "source": "jsearch",
                "title": j.get("job_title", ""),
                "company": j.get("employer_name", ""),
                "location": ", ".join(p for p in (city, country) if p),
                "url": j.get("job_apply_link", ""),
                "salary": "",
                "posted_at": (j.get("job_posted_at_datetime_utc") or "")[:10],
                "description": j.get("job_description", ""),
            })
    return jobs
