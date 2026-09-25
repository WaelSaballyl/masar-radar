"""Check the AI extraction against the regex rules and the posting text.

Run:  python -m radar.evaluate [--samples N]

No API calls. For every posting the model has read, it compares the model's
skills with what the regex rules find in the same text, and reports:

- agreement: skills both found
- model only: a skill the model gave that the regex did not find. If the
  skill's name is nowhere in the text either, it is listed as "not in text",
  the closest thing to a hallucination this check can see.
- regex only: a skill the regex found that the model left out (a model miss,
  or a regex false positive).

Then it prints short excerpts around the disagreements, so a person can judge
a sample by eye instead of reading whole postings.
"""
import argparse
import re
from collections import Counter

from . import db, skills


def excerpt(text: str, needle: str, width: int = 70) -> str:
    m = re.search(re.escape(needle), text, re.IGNORECASE)
    if not m:
        return ""
    start = max(0, m.start() - width)
    return "…" + " ".join(text[start:m.end() + width].split()) + "…"


def run(samples: int) -> None:
    con = db.connect()
    rows = con.execute(
        "SELECT id, title, COALESCE(description, '') FROM jobs WHERE ai_extracted_at IS NOT NULL"
    ).fetchall()
    tags: dict[str, set] = {}
    required: Counter = Counter()
    for job_id, skill, req in con.execute("SELECT job_id, skill, required FROM job_skills WHERE source = 'ai'"):
        tags.setdefault(job_id, set()).add(skill)
        required[req] += 1
    con.close()

    both = model_only = regex_only = 0
    not_in_text: Counter = Counter()
    missed: Counter = Counter()
    extra: Counter = Counter()
    cases = []
    empty = 0
    for job_id, title, text in rows:
        ai = tags.get(job_id, set())
        rx = set(skills.extract_skills(f"{title} {text}"))
        if not ai:
            empty += 1
        both += len(ai & rx)
        for s in ai - rx:
            model_only += 1
            extra[s] += 1
            if s.lower() not in f"{title} {text}".lower():
                not_in_text[s] += 1
        for s in rx - ai:
            regex_only += 1
            missed[s] += 1
            cases.append((s, title, excerpt(text, s)))

    total_ai = both + model_only
    print(f"postings read by the model: {len(rows)}  (no skills at all: {empty})")
    print(f"model skills: {total_ai}  required {required[1]}, preferred {required[0]}")
    print(f"agreement with regex: {both}  ({both / max(total_ai, 1):.0%} of the model's skills)")
    print(f"model only: {model_only}  of which the name is not in the text: {sum(not_in_text.values())}")
    print(f"regex only (model left out): {regex_only}")
    print("most common model-only:", extra.most_common(8))
    print("  ...not in text:", not_in_text.most_common(8))
    print("most common regex-only:", missed.most_common(8))
    print(f"\n--- {samples} regex-only excerpts, judge each by eye ---")
    seen = set()
    for s, title, snip in cases:
        if s in seen or not snip:
            continue
        seen.add(s)
        print(f"[{s}] {title[:60]}\n    {snip}")
        if len(seen) >= samples:
            break


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=int, default=12)
    run(parser.parse_args().samples)


if __name__ == "__main__":
    main()
