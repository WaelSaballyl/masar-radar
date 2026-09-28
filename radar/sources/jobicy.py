"""Jobicy public API - remote jobs, filterable by industry.

Free to use, no key. Terms ask for attribution with a link back on any public
page: https://jobicy.com/jobs-rss-feed

Highest-yield source in the radar: the industry filter actually works, so three
requests return more data postings than every other free feed combined.
"""
from .base import get_json

# Jobicy's own taxonomy (list: /api/v2/remote-jobs?get=industries). "data-science"
# carries the analyst and engineer postings too; "business" and "dev" are swept
# because data roles are routinely filed there. The rest feed the other fields;
# the title filter still decides what is kept.
INDUSTRIES = ["data-science", "business", "dev", "accounting-finance", "marketing", "hr",
              "cybersecurity", "admin", "qa-testing", "engineering"]
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
                "logo": j.get("companyLogo") or "",
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
