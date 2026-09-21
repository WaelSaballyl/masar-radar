"""Remotive public API — remote jobs, many open worldwide.

API terms: free to use, requires linking back to remotive.com on any public page.
Docs: https://github.com/remotive-com/remote-jobs-api
"""
from .base import get_json


def fetch() -> list[dict]:
    """Fetch the feed once.

    The API ignores ?search= and ?category= and caps the response at 20 postings
    regardless: four search terms returned the same twenty jobs four times over.
    One request now, and the yield is one or two data roles - kept for breadth,
    not volume.
    """
    jobs = []
    data = get_json("https://remotive.com/api/remote-jobs")
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
