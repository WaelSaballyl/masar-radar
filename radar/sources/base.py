"""Shared HTTP helper for all source adapters."""
import json
import urllib.error
import urllib.request

USER_AGENT = "MasarRadar/0.1 (job-market research; contact: github.com/masar-radar)"


def get_json(url: str, headers: dict | None = None, timeout: int = 45):
    req_headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        # "403: Forbidden" alone does not say whether the key, the plan or the
        # quota is at fault; the body does. It never echoes the request headers.
        detail = e.read(300).decode("utf-8", "replace").strip()
        raise RuntimeError(f"HTTP {e.code}: {detail or e.reason}") from None
