"""What kind of opportunity a posting is, and how many years it asks for.

Both are read with fixed rules from the title and the stored description, so
the jobs page can filter on them. The model's seniority ("Intern") is not
proof of an internship: a "Working Student" or a junior job gets called that
too. A posting counts as training only when its title says so, or its text
names the programme outright.
"""
from __future__ import annotations

import re

COOP = re.compile(r"\bco-?op\b|cooperative (?:training|program|education)|تدريب تعاوني|التدريب التعاوني|تعاوني", re.I)
INTERN = re.compile(
    r"\bintern(?:ship)?s?\b|\btrainee\b|^\s*stage\b|\bstage (?:\d{4}|de fin|-)|\bstagiaire\b|\bpraktikum\b|\bpraktikant|\bapprentice"
    r"|\bsummer (?:analyst|associate|program)|متدرب|تدريبي|برنامج تدريب|تدريب صيفي|فرصة تدريب|^\s*تدريب", re.I)
STUDENT = re.compile(r"working student|werkstudent|student assistant|studentische|part-time student", re.I)
GRADUATE = re.compile(r"graduate (?:program|programme|scheme|development)|\bGDP\b|خريجين|حديثي التخرج", re.I)
# a description counts only when it names the programme, not when it says
# "our interns" or "we also offer internships" somewhere in the benefits
BODY_COOP = re.compile(r"(?:this|the) (?:is a |)co-?op (?:position|role|program)|برنامج التدريب التعاوني|فرصة تدريب تعاوني", re.I)
BODY_INTERN = re.compile(r"(?:this|the) (?:is an? |)(?:paid |unpaid |summer |)internship (?:position|role|program|opportunity)"
                         r"|internship duration|duration of the internship|فرصة تدريب|برنامج تدريب", re.I)


def employment(title: str, description: str = "") -> str:
    """coop | internship | student | graduate | job"""
    t = title or ""
    if COOP.search(t):
        return "coop"
    if STUDENT.search(t):
        return "student"
    if INTERN.search(t):
        return "internship"
    if GRADUATE.search(t):
        return "graduate"
    d = (description or "")[:3000]
    if BODY_COOP.search(d):
        return "coop"
    if BODY_INTERN.search(d):
        return "internship"
    return "job"


_NUM = r"(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)"
_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
YEARS = [
    # "3-5 years", "3+ years of experience", "at least 2 years", "minimum of 4 yrs"
    re.compile(rf"(?:at least|minimum(?: of)?|min\.?|over|more than)?\s*{_NUM}\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{{1,2}}\s*\+?\s*)?"
               r"(?:years?|yrs?)(?:['’]s?)?\s+(?:of\s+)?(?:[\w/&,-]+\s+){0,5}?(?:experience|expérience|work|in\b)", re.I),
    re.compile(r"experience\s*(?:of|:)?\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.I),
    re.compile(r"(\d{1,2})\s*(?:\+\s*)?(?:jahre|jahren)\s+(?:\w+\s+){0,3}?(?:berufserfahrung|erfahrung)", re.I),
    re.compile(r"(\d{1,2})\s*(?:\+\s*)?ans\s+d['’]exp", re.I),
    re.compile(r"خبرة\s*(?:لا تقل عن|من|عملية)?\s*(\d{1,2})\s*(?:سنوات|سنة|أعوام|عام)", re.I),
    re.compile(r"(\d{1,2})\s*(?:سنوات|سنة|أعوام)\s*(?:من\s*)?(?:ال)?خبرة", re.I),
]
NO_EXPERIENCE = re.compile(r"no (?:prior |previous |work )?experience (?:is )?(?:required|needed)|entry[- ]level|لا يشترط (?:وجود )?خبرة|بدون خبرة", re.I)


def years(title: str, description: str = "") -> int | None:
    """The years of experience the posting asks for; 0 when it says none are
    needed; None when it does not say. The first mention wins: the headline
    requirement ("3+ years in data engineering") comes before the per-tool
    ones ("1 year with Airflow"), and a range counts from its low end."""
    text = f"{title}\n{description or ''}"
    found = []
    for rx in YEARS:
        for m in rx.finditer(text):
            n = m.group(1).lower()
            n = _WORDS.get(n) if n in _WORDS else int(n)
            if n is not None and 0 <= n <= 15:
                found.append((m.start(), n))
    if found:
        return min(found)[1]
    if NO_EXPERIENCE.search(text):
        return 0
    return None
