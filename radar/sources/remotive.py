"""Remotive public API — remote jobs, many open worldwide.

API terms: free to use, requires linking back to remotive.com on any public page.
Docs: https://github.com/remotive-com/remote-jobs-api
"""
from urllib.parse import quote

from .base import get_json

SEARCHES = ["data analyst", "data engineer", "business intelligence", "data scientist"]


def fetch() -> list[dict]:
    jobs = []
    for term in SEARCHES:
        data = get_json(f"https://remotive.com/api/remote-jobs?search={quote(term)}")
        for j in data.get("jobs", []):
            jobs.append({
                "source": "remotive",
                "title": j.get("title", ""),
                "company": j.get("company_name", ""),
                "location": j.get("candidate_required_location", "Remote"),
                "url": j.get("url", ""),
                "salary": j.get("salary", "") or "",
                "posted_at": (j.get("publication_date") or "")[:10],
                "description": j.get("description", ""),
            })
    return jobs
