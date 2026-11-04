# Masar Radar | رادار مسار

مرصد يومي لسوق وظائف البيانات. يجمع الإعلانات من واجهات برمجية مفتوحة، ويستخرج المهارات المطلوبة في كل إعلان، ثم ينشر لوحة تتابع اتجاهات السوق: أكثر المهارات طلباً، وتوزيع الأدوار، والفرص الجديدة.

A daily pipeline that collects data-job postings from open APIs, pulls out the skills each one asks for, and publishes a live dashboard of market trends.

Live site: https://waelsaballyl.github.io/masar-radar/

## How it works

```
sources (open APIs)            pipeline                      output
┌──────────────┐
│  Jobicy      │──┐   ┌───────────────────────┐   ┌────────────────────────┐
├──────────────┤  │   │ collect.py            │   │ data/*.jsonl (tracked) │
│  Remote OK   │──┤   │  filter → normalize   │──▶│ data/radar.db (built)  │
├──────────────┤  ├──▶│  dedupe → extract     │   └───────────┬────────────┘
│  Arbeitnow   │──┤   ├───────────────────────┤               │
├──────────────┤  │   │ ai.py  (optional)     │               ▼
│  Remotive    │──┤   │  one LLM read per job │   ┌────────────────────────┐
├──────────────┤  │   └───────────────────────┘   │ export_site.py         │
│  JSearch *   │──┘                               │  → docs/data/*.json    │
└──────────────┘                                  └────────────────────────┘
  * needs RAPIDAPI_KEY          GitHub Actions (daily cron) orchestrates the run
```

The pipeline uses only the Python standard library (`urllib`, `sqlite3`, `re`, `json`). The optional AI step calls the Gemini REST API through `urllib` as well, so there is nothing to install either way.

Each posting gets a stable hash, so a re-run never stores the same job twice, and `reclassify` and `ai` change nothing on a second pass.

The SQLite database is rebuilt on every run and is not committed. What git tracks is a line-delimited JSON export, because git stores small deltas of text but would keep a full copy of a binary database every day.

Only official public APIs are used. I looked at Bayt.com and left it out because its `robots.txt` disallows crawling job pages. LinkedIn is out because of its terms of service.

## Run locally

```bash
python -m radar.store restore    # rebuild data/radar.db from data/*.jsonl
python -m radar.collect          # fetch + store new jobs
python -m radar.ai --apply       # optional: read postings with an LLM
python -m radar.store export     # write the database back to data/*.jsonl
python -m radar.export_site      # write docs/data/*.json for the static site
```

Maintenance:

```bash
python -m radar.reclassify       # re-apply current rules to stored rows (dry run)
python -m radar.ai --check       # verify the Gemini key and model name
```

### AI extraction (optional)

Regex finds a skill only when it is spelled the way the pattern expects. It can't tell a requirement from a nice-to-have, and an Arabic posting looks like noise to it. `radar/ai.py` sends each posting to Gemini once and stores the skills it actually asks for, plus the role and seniority.

Set `GEMINI_API_KEY` ([free key](https://aistudio.google.com/apikey)) locally, or add it as a repository secret with the same name. Without it the step is skipped and the regex results stay.

## Automation

`.github/workflows/radar.yml` runs the tests and then the pipeline once a day (usually around 11:30 KSA) and commits the updated data and dashboard. GitHub Pages serves the site from `/docs`.

Saudi and Gulf postings come from JSearch (a Google Jobs aggregator). It needs a free key from [RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch), stored as the repository secret `RAPIDAPI_KEY`.

## Part of Masar

The radar is one piece of Masar, a job-search platform I'm building for students in Saudi Arabia:

- [x] Tracker: follow up on job applications (separate app)
- [x] Radar: job collection and market analytics (this repo)
- [ ] Matcher: rank postings against your profile
- [ ] CV builder: an ATS-safe CV tailored to each posting
- [ ] Assistant: cover letters and a ready-to-apply list

## Data sources

Job data comes from the public APIs of [Remotive](https://remotive.com) and [Remote OK](https://remoteok.com). Please keep the attribution links if you publish the dashboard.
