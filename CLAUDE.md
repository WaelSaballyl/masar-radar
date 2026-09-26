# masar-radar

Data-jobs market radar, one component of the Masar job-seeker platform. Collects
postings daily from open APIs, extracts skills, publishes a static Arabic
dashboard on GitHub Pages.

Working style: state the token cost before anything expensive (subagents,
graphify, full-corpus reads, long browser sessions) and take the cheap path by
default. Reply in the user's Arabic dialect.

## Commands

```
python -m radar.store restore          # data/*.jsonl -> data/radar.db  (run first)
python -m radar.collect                # fetch, filter, dedupe, store
python -m radar.ai --check | --apply   # optional Gemini pass (GEMINI_API_KEY)
python -m radar.store export           # data/radar.db -> data/*.jsonl  (tracked)
python -m radar.export_site            # -> docs/data/summary.json + jobs.json (read by the site)
python -m radar.reclassify [--apply]   # re-apply current regex rules to stored rows
python -m unittest discover -s tests   # pipeline tests (CI runs them before collecting)
node worker/test.mjs                   # CV worker tests
```

On Windows set `PYTHONIOENCODING=utf-8`, or printing Arabic crashes the cp1256 console.

## Layout

- `radar/sources/*.py` - one adapter per API, all returning the same dict shape
- `radar/skills.py` - `SKILL_PATTERNS`, role rules, `DATA_FILTER`/`DATA_EXCLUDE` (title only)
- `radar/ai.py` - Gemini extraction: batches of 5, retry, model fallback, `PROMPT_VERSION`
- `radar/db.py` - schema plus `_migrate` (additive `ALTER TABLE` only)
- `radar/store.py` - jsonl <-> sqlite
- `.github/workflows/radar.yml` - daily: restore, collect, ai, export, build, commit
- `worker/` - Cloudflare Worker for the CV builder (`docs/cv.html`): holds the Gemini
  key; `/parse` and `/tailor`. `src/audit.js` removes any skill or number the student's
  profile lacks. Tests: `node worker/test.mjs`; local stub: `node worker/dev.mjs` (:8787,
  set the `masar-api` meta in cv.html to it, then back to the deployed URL).
  Contact fields never leave the browser: cv.js strips them before any request.
  Deployed to waelsaballyl@gmail.com's Cloudflare account. Run every wrangler command
  with `XDG_CONFIG_HOME=C:/Users/risk_/.masar-wrangler`: the machine's default wrangler
  login belongs to the user's other project (Dagesh, account wael78041) - never touch it.
  Exclusive postings: `src/board.js` + D1 `masar-board` (`worker/schema.sql`). Employers submit
  on `docs/employers.html` (work email required, free-mail domains refused); nothing is public
  until approved on `docs/admin.html` with the `ADMIN_TOKEN` worker secret. jobs.html lists them
  first ("exclusive"); cv.html?ex=<id> loads one as a pasted description.
  cv.html loads `cv.js?v=N` / `masar.css?v=N`: bump N when either changes, or visitors keep a cached copy.

## Invariants - each of these was a real bug

- `data/radar.db` is a gitignored build artifact. Only `data/jobs.jsonl` and
  `data/descriptions.jsonl` are tracked; a committed binary db grew git by a full copy a day.
- Read jsonl with `split("\n")`, never `splitlines()`: descriptions contain U+2028.
- Extract skills from the same trimmed text that gets stored (`DESCRIPTION_LIMIT`),
  or `reclassify` re-reads less text and deletes correct skills.
- `reclassify` never touches rows with `ai_extracted_at`, and only rewrites `source='regex'` skills.
- Changing `ai.PROMPT` in a way that changes answers means bumping `PROMPT_VERSION`
  (re-queues every posting; free tier, ~4 min in CI).
- `ai.SKILL_SCOPE` must describe what the matching `SKILL_PATTERNS` regex covers.
- A repeat sighting refreshes `last_seen` and keeps the longer description.
- Remote OK text arrives Latin-1-mangled upstream; `remoteok.repair()` fixes it.
- Short uppercase skills (R, ML, SAS, ELT, SAP) are case-sensitive via `(?-i:...)`.
- After any schema change, verify an export -> restore round trip by fingerprint.

## Sources

Jobicy (highest yield), Remote OK, Arbeitnow (only European coverage), Remotive
(capped at 20 upstream, one request), JSearch (Saudi Arabia via
`/search-v2?country=sa`; `/search` was retired upstream; can take >45s). Excluded: Bayt (robots.txt), LinkedIn (ToS), Himalayas
(capped at 20, no data roles). Keep attribution links on public pages.

## Secrets

GitHub secrets: `GEMINI_API_KEY` and `RAPIDAPI_KEY` (both set; JSearch free plan, 200 requests/month hard limit, 4 per run - each manual run costs 4). Never ask the
user to paste a key into chat; they run `gh secret set NAME -R WaelSaballyl/masar-radar`.

## Environment gotchas

- Bash-tool heredocs swallow backslashes: edit Python with the Edit tool, not
  string-replace patch scripts.
- Scratchpad paths can exceed 260 characters, which native Windows Python cannot open.
- The scheduled workflow fires around 08:30 UTC, not the 03:17 in the cron line.

## Status

Done: data fixes, four sources, jsonl storage, AI extraction (prompt v3),
landing page for co-op students (`docs/index.html`, `docs/assets/masar.css|js`).

Identity: dark teal (`#0E2624`), mint route line (`#3DD6B5`), sand (`#E3B566`)
reserved for internships; Noto Kufi Arabic for headings, IBM Plex Sans Arabic
for text. The hero draws top skills as stations on a metro line ("masar" =
path). Arabic counted nouns go through `count()` in masar.js - never hand-write
"N إعلان". Local preview: `.claude/launch.json` serves docs/ on :8765.

Market index (`docs/dashboard.html` + `assets/market.js`) recomputes every chart
in the browser from jobs.json; filters persist in localStorage. Shared helpers
(language, theme, Arabic counts, country names) live in `assets/core.js`.
Chart colours `--req`/`--pref` were checked with the dataviz validator per
surface; re-run it if they change. Countries come from AI prompt v4+. `python -m radar.evaluate` compares the model with the regex (no API calls): prompt v4 agreed 92%, ~99% precise, ~89% recall.
Scope is Saudi Arabia first, then the Gulf (`GULF` in market.js): only those
six are selectable, everything else is shown as "outside the Gulf". Other Arab
countries (Jordan etc.) come later, by the user's decision.

Next: the dashboard's co-op section and country filter need JSearch data to be
useful for Saudi users (required vs preferred, seniority, `last_seen`,
country filter, co-op section), CV builder (needs a backend to hold the key -
Cloudflare Workers favoured), then review, tests and a manual AI accuracy sample.

Repo https://github.com/WaelSaballyl/masar-radar ·
site https://waelsaballyl.github.io/masar-radar/
