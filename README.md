# 📡 رادار مسار — Masar Radar

**مرصد سوق وظائف البيانات** — خط أنابيب بيانات (Data Pipeline) يجمع إعلانات وظائف البيانات يومياً من مصادر مفتوحة، يستخرج منها المهارات المطلوبة، ويبني داشبورد حي لاتجاهات السوق: أكثر المهارات طلباً، توزيع الأدوار، والفرص الجديدة.

An automated data pipeline that collects data-job postings daily from open APIs, extracts in-demand skills, and publishes a live market-trends dashboard.

## Architecture

```
sources (open APIs)          pipeline                     output
┌─────────────┐
│  Remotive    │──┐   ┌──────────────────────┐   ┌──────────────────────┐
├─────────────┤  ├──▶│ collect.py            │──▶│ SQLite (data/radar.db)│
│  Remote OK   │──┘   │ filter → normalize    │   └──────────┬───────────┘
├─────────────┤       │ dedupe → skill extract│              │
│  JSearch*    │──────▶└──────────────────────┘              ▼
└─────────────┘                                  ┌──────────────────────┐
  * needs RAPIDAPI_KEY                           │ build_dashboard.py    │
                                                 │ → docs/dashboard.html │
GitHub Actions (daily cron) orchestrates the run └──────────────────────┘
```

- **Zero dependencies** — Python standard library only (`urllib`, `sqlite3`, `re`, `json`).
- **Idempotent** — jobs are deduped by a stable hash; re-runs never duplicate.
- **Respectful collection** — only official/public APIs are used. Bayt.com was evaluated and excluded because its `robots.txt` disallows job-page crawling; LinkedIn is excluded per its ToS.

## Run locally

```bash
python -m radar.collect          # fetch + store new jobs
python -m radar.build_dashboard  # regenerate docs/dashboard.html
```

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
