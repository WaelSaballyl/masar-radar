"""Jobicy public API - remote jobs, filterable by industry.

Free to use, no key. Terms ask for attribution with a link back on any public
page: https://jobicy.com/jobs-rss-feed

Highest-yield source in the radar: the industry filter actually works, so three
requests return more data postings than every other free feed combined.
"""
from .base import get_json

# Jobicy's own taxonomy. "data-science" carries the analyst and engineer
# postings too; the other two are swept because data roles are routinely filed
# under business or engineering rather than their own industry.
INDUSTRIES = ["data-science", "business", "dev"]
COUNT = 50  # maximum the API returns per request


def fetch() -> list[dict]:
    jobs = []
    for industry in INDUSTRIES:
        data = get_json(
            f"https://jobicy.com/api/v2/remote-jobs?count={COUNT}&industry={industry}"
        )
        for j in data.get("jobs", []):
            jobs.append({
                "source": "jobicy",
                "title": j.get("jobTitle", ""),
                "company": j.get("companyName", ""),
                "location": j.get("jobGeo", "") or "Remote",
                "url": j.get("url", ""),
                "salary": _salary(j),
                "posted_at": (j.get("pubDate") or "")[:10],
                "description": j.get("jobDescription", "") or j.get("jobExcerpt", ""),
            })
    return jobs


def _salary(j: dict) -> str:
    lo, hi = j.get("annualSalaryMin"), j.get("annualSalaryMax")
    currency = j.get("salaryCurrency") or "USD"
    if not lo or not hi:
        return ""
    try:
        return f"{int(lo):,} - {int(hi):,} {currency}"
    except (TypeError, ValueError):
        return ""
