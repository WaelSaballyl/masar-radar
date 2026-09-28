# masar-radar

Jobs radar for students (data first, plus five more fields since 2026-09-28), one component of the Masar job-seeker platform. Collects
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
- `radar/skills.py` - `SKILL_PATTERNS`, role rules, `DATA_FILTER`/`DATA_EXCLUDE` (title only), and
  `FIELD_RULES`/`field_of`: data first, then tech, finance, engineering, marketing, hr; a title no
  rule names is not collected. Other fields get one role each (`FIELD_ROLE`). The field is derived
  from the title at export (`jobs.json` `field`, summary `routes` per field), not stored.
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
  until approved on `docs/admin.html` with the `ADMIN_TOKEN` worker secret. `screen()` in board.js
  grades each by fixed rules (red: fees, ID copies, WhatsApp/Telegram - rejected silently; yellow:
  domain mismatch, non-data role, odd pay, phone in text, duplicate); set the `AUTO_APPROVE` var to
  "1" to publish green ones without review once the verdicts have proved right. jobs.html lists them
  first ("exclusive"); cv.html?ex=<id> loads one as a pasted description.
  Applying (exclusive only): cv.html shows "قدّم بهذه السيرة" after the CV is made; swipe.html
  (right = apply, left = skip) tailors the saved profile per posting and sends it, but holds
  back a posting at <=25% coverage. `POST /board/apply` stores name/email/phone/link + the
  paper as blocks (`cvkit.js` toBlocks/fromBlocks - never HTML) in D1 `applications`, one per
  email per posting. This is the only path where contact data leaves the browser, and only
  after the consent tick. Employers see applicants on `applicants.html#<id>.<token>`: the
  token is returned once on submit, only its SHA-256 is stored; `/board/admin/<id>/relink`
  issues a new one. Shared CV code (contact stripping, renderCV) lives in `assets/cvkit.js`.
  Privacy page: `docs/privacy.html` - keep it true when data handling changes.
  Each apply returns a receipt (hash stored) kept in `masar.receipts`; `applications.html` ("my
  applications") posts them to `/board/mine` for status, first-viewed time and shortlist.

Student accounts (optional): `account.html` signs in with Google Identity Services only - no
passwords, so no reset flow (email login comes after the domain + Resend). `src/auth.js` checks
Google's ID token itself (RS256 against Google's JWKS, aud = `GOOGLE_CLIENT_ID` in wrangler.toml vars - public; Google Cloud project "masar" (masar-509920) on
waelsaballyl@gmail.com, published to production, origins github.io + localhost:8765; the client secret is unused,
issuer, expiry, verified email; tests in test.mjs), stores users/sessions/user_data in D1 (session
token hashed, 60 days). `core.js` syncs the keys in `SYNC` (profile, cvs, receipts, saved, applied,
skipped): every `Masar.store.set` of one marks the browser dirty and pushes after 1.5 s; the worker
refuses a write not based on its latest `rev` (409 + its copy), the browser merges (lists joined,
local profile wins unless empty) and retries. Keep the worker's `SYNC_KEYS` and core's `SYNC` equal.
Only a first sign-in or a 409 merges; otherwise the local copy is sent as is, so clearing sticks.
Header shows "دخول" or the initial (`Masar.accountButton`).
The account page edits the profile in place: CV fields go to `masar.profile` (the builder's
FIELDS only - cv.js rewrites that key with its own fields), the rest (country, target role,
seeking, relocate) to `masar.me`. Support (`support.html`, `src/support.js`, D1
support_tickets/support_messages): a visitor opens a conversation (name, email, topic), keeps its
token in `masar.tickets` (synced), and the page polls every 10 s while a chat is open; the team
answers from admin.html with ADMIN_TOKEN. Email replies wait for the domain + Resend.

Postings page (`jobs.html`): filters for country, type (coop / internship / student / job),
years asked, level, role, sort by fit, saved only - all mirrored in the URL (skill chips link
to `jobs.html?q=Skill`). `radar/traits.py` decides type and years by fixed rules at export:
training only when the title says so or the text names the programme (the model's "Intern"
alone is not proof; a non-training "Intern" is exported as Junior). `job.html?id=|?ex=` is
one posting's page; only exclusive ones carry schema.org JobPosting. Fit and saved postings
come from the browser (`Masar.fit`, `masar.saved`). `docs/sitemap.xml` is written by
export_site (submit it in Google Search Console; a project site has no root robots.txt).
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
- `jobs.logo` holds the feed's company logo URL (NULL when none, never ""); a repeat sighting
  backfills it but never blanks it. `store.export` omits a null logo so old lines stay unchanged.
  The page shows only https logos (`Masar.logo`, falls back to the first letter); exclusive
  postings use the site's icon via Google's favicon service.
- After any schema change, verify an export -> restore round trip by fingerprint.

## Sources

Jobicy (highest yield), Remote OK, Arbeitnow (only European coverage), Remotive
(capped at 20 upstream, one request), JSearch (Saudi Arabia via
`/search-v2?country=sa`; `/search` was retired upstream; can take >45s). Excluded: Bayt (robots.txt), LinkedIn (ToS), Himalayas
(capped at 20, no data roles). Keep attribution links on public pages.

## Secrets

GitHub secrets: `GEMINI_API_KEY` and `RAPIDAPI_KEY` (both set; JSearch free plan, 200 requests/month hard limit, 6 per run since the fields widened = ~180 a month - each manual run costs 6, so about three spare a month). Never ask the
user to paste a key into chat; they run `gh secret set NAME -R WaelSaballyl/masar-radar`.

## Environment gotchas

- Bash-tool heredocs swallow backslashes: edit Python with the Edit tool, not
  string-replace patch scripts.
- Scratchpad paths can exceed 260 characters, which native Windows Python cannot open.
- The scheduled workflow fires around 08:30 UTC, not the 03:17 in the cron line.

## Status

Done: data fixes, four sources, jsonl storage, AI extraction (prompt v3),
landing page for co-op students (`docs/index.html`, `docs/assets/masar.css|js`).

Identity (v3, 2026-09-27, the owner's pick after buff2u.com): monochrome - charcoal page
(`#232628`, bar `#181A1B`, logo grey `#E0E0E0`, sampled from buff2u), light-grey gradient panels (`--panel`) with near-black type and
black pill buttons, one burgundy (`--wine` `#7B2D2D`) for exclusive/training. Panels re-declare
the tokens, so anything inside turns dark-on-light. Wordmark: the owner's MASAR RADAR artwork in `docs/assets/brand/` (source: Downloads/تصميم شعار Ruff/export), `#E0E0E0` on dark, `#2B2B2B` on light; favicon and og.png from the same set.
Do not bring back green or gold: the owner rejected them.
Home page v4 (2026-09-27, after joinhandshake.com): floating pill header, a full-screen
headline whose words rise in, a light search card that types its own examples, grey/burgundy
aurora behind it, two rows of live posting cards sliding past (jobs.json + exclusive), company
logos row, four tool tiles each with a small live demo (swipe tile is the burgundy one), skills
line, count-up numbers, burgundy employers band, column footer, and the name MASAR across the full width at the bottom of every page (Montserrat 800, the wordmark's letters, added by core.js). `core.js` now builds the top
menu for every page (`Masar.nav`, one list - edit `NAV` there, not the HTML), adds the phone
tab bar (not on swipe/admin/applicants/embed), and reveals `.reveal` sections on scroll.
`404.html` uses `<base href="/masar-radar/">` - change it with the domain. Token names are old (`--mint` =
action colour, `--sand` = burgundy text). Noto Kufi Arabic for headings, IBM Plex Sans Arabic
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
