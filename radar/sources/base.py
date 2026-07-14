"""Shared HTTP helper for all source adapters."""
import json
import urllib.request

USER_AGENT = "MasarRadar/0.1 (job-market research; contact: github.com/masar-radar)"


def get_json(url: str, headers: dict | None = None, timeout: int = 45):
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)
