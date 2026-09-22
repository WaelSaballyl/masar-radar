# 📡 رادار مسار — Masar Radar

**مرصد سوق وظائف البيانات** — خط أنابيب بيانات (Data Pipeline) يجمع إعلانات وظائف البيانات يومياً من مصادر مفتوحة، يستخرج منها المهارات المطلوبة، ويبني داشبورد حي لاتجاهات السوق: أكثر المهارات طلباً، توزيع الأدوار، والفرص الجديدة.

An automated data pipeline that collects data-job postings daily from open APIs, extracts in-demand skills, and publishes a live market-trends dashboard.

## Architecture

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
├──────────────┤  │   └───────────────────────┘   │ build_dashboard.py     │
│  JSearch *   │──┘                               │  → docs/dashboard.html │
└──────────────┘                                  └────────────────────────┘
  * needs RAPIDAPI_KEY          GitHub Actions (daily cron) orchestrates the run
```

- **Zero dependencies** — Python standard library only (`urllib`, `sqlite3`, `re`, `json`).
  The optional AI layer calls the Gemini REST API over `urllib` too, so this holds
  with it switched on.
- **Idempotent** — jobs are deduped by a stable hash; re-runs never duplicate, and
  `reclassify` / `ai` make no change on a second pass.
- **Git-friendly storage** — the SQLite file is a build artifact, not a tracked file.
  It is exported to line-delimited JSON, which git deltas; a binary database would
  cost a full copy on every daily run.
- **Respectful collection** — only official/public APIs are used. Bayt.com was evaluated and excluded because its `robots.txt` disallows job-page crawling; LinkedIn is excluded per its ToS.

## Run locally

```bash
python -m radar.store restore    # rebuild data/radar.db from data/*.jsonl
python -m radar.collect          # fetch + store new jobs
python -m radar.ai --apply       # optional: read postings with an LLM
python -m radar.store export     # write the database back to data/*.jsonl
python -m radar.build_dashboard  # regenerate docs/dashboard.html
```

Maintenance:

```bash
python -m radar.reclassify       # re-apply current rules to stored rows (dry run)
python -m radar.ai --check       # verify the Gemini key and model name
```

### AI extraction (optional)

Regex extraction finds a skill only when it is spelled the way the pattern
expects, cannot tell a requirement from a nice-to-have, and reads an Arabic
posting as noise. `radar/ai.py` sends each posting to Gemini once - ever - and
stores the skills it actually asks for, plus the role and seniority.

Set `GEMINI_API_KEY` ([free key](https://aistudio.google.com/apikey)) locally, or
add it as a repository secret of the same name. Without it the layer is skipped
and the regex results stand.

## Automation

`.github/workflows/radar.yml` runs the pipeline daily at 06:17 KSA and commits the
updated database and dashboard. Enable GitHub Pages on `/docs` to get a public
live dashboard URL.

To add Saudi/Gulf coverage via JSearch (Google Jobs aggregator):
get a free key at [RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch)
and add it as a repository secret named `RAPIDAPI_KEY`.

## Roadmap (منصة مسار)

- [x] 🧭 **المتتبع** — تتبع طلبات التوظيف (تطبيق مستقل)
- [x] 📡 **الرادار** — جمع الوظائف + تحليلات السوق (هذا المستودع)
- [ ] 🎯 **المرشّح** — مطابقة الوظائف مع ملفك بالذكاء الاصطناعي
- [ ] 📄 **صانع السيرة** — سيرة ATS-safe مفصّلة لكل وظيفة
- [ ] ✉️ **المساعد** — رسائل تغطية + قائمة «جاهز للتقديم»

## Data sources & attribution

Job data courtesy of the public APIs of [Remotive](https://remotive.com) and
[Remote OK](https://remoteok.com). Please keep the attribution links when
publishing the dashboard.
