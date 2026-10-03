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
- `radar/landing.py` - static SEO pages in `docs/l/` (per field, Gulf country, top required skill; `<base href="../">`),
  rebuilt by export_site each run and listed in the sitemap
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
Opt-in talent cards (`src/talent.js`, D1 talent/invites): a signed-in student shows an anonymous
card (target, field, study, skills, city - `card()` strips any email/phone/link); an employer with an
approved posting searches them on applicants.html and invites (30 a day per posting); invites show on
the student's account page. The support assistant (`/support/ask`, `FACTS` in index.js) answers from
fixed facts - keep FACTS true when the site changes. `/linkedin` writes headline/About from the profile.
Visitor counts: `/hit` beacon from core.js (no cookie/IP), shown on admin.html.
English: index.html and dashboard.html translate themselves (their own `lang-toggle`); every other
page gets an EN/ع button from core.js, and in English `assets/en.js` (`exact` ar->en, `patterns`
with $1 captures translated again, Arabic-comma lists split) swaps interface text in place,
including text drawn later (MutationObserver). Data is never translated (the `SKIP` selector:
posting titles/companies/descriptions, CVs, chats). New Arabic UI text needs its English in
en.js, or it shows in Arabic; bump `en.js?v=` in core.js.

ATS check (`ats.html`, `assets/ats.js` + `assets/atskit.js`): reads a CV file in the browser the way a screening
system does - PDF text through pdf.js with `disableNormalization` (so "ﬁ" ligatures and Arabic presentation forms
show as a parser gets them), docx straight from its XML (own unzip; tables, text boxes, columns, contact in
header/footer parts) - and scores it by fixed rules with fixed weights (`analyze`), plus a posting match (`match`)
using `docs/data/skills.json`: `skills.js_pattern` rewrites each `SKILL_PATTERNS` rule for a JS RegExp (`u` flag, no
`i`: letters folded as [xX] outside `(?-i:...)`, Unicode \b and \w), written by export_site; worker/test.mjs runs the
JS rules. There is no single ATS: the page says the score is rules, not a prediction. Reading is pass/fail, so any tidy file
read 100 and the owner saw "always 100%"; `content(text)` adds a graded content score (share of experience points with a
result number, share led by an action verb EN/AR, duty phrases, long points, "I", summary, >=6 skills, LinkedIn).
`overall(read, content, match)`: without a posting half/half, with one 30/30/40; `level()` 85/70/50. Measured facts behind the rules:
an Arabic PDF (Chrome's print or Word's own export) extracts reversed/broken ("خلال" -> "خالل"), so Arabic CVs go out as
Word; `.paper:lang(en)` turns ligatures off or "Certifications" reaches a parser as "Certiﬁcations". The CV builder
shows the check under each CV (run after `#result` is visible - a hidden paper's innerText has no line breaks) and
saves Word via `assets/docx.js` (stored zip, one column, real Heading 1 / List Bullet styles, Latin runs split from
RTL runs so "+966 ..." is not reordered; checked opening in Word).

From Bayt's paid tools (2026-09-30, free here): job.html shows "your match" from `MasarATS.myCV()` (newest
`masar.cvs` via `blocksText`, else `profileText`); account.html shows CV health (top 3 fixes by points).
`companies.html` (+ `?c=`) groups jobs.json + exclusive by company. Alerts: `Masar.alerts` in core.js,
definitions in synced `masar.alerts` (in SYNC and SYNC_KEYS), seen ids in local-only `masar.alertSeen`;
`alerts.html`, a chip on jobs.html, follow on company pages; email alerts wait for Resend. Interview pages
`l/interview-<role>.html` from `radar/interview.py` (one question per skill name, test keeps them on
SKILL_PATTERNS names), written by landing.write. Premium (`premium.html`, free during the trial, no payment):
"really interested" = `POST /board/boost` (3 per email per 30 days, `applications.boosted_at`, sorted first on
applicants), skill tests = `src/skilltests.js` (answers stay on the worker, 6/8 passes, one try a day,
D1 `verified_skills`/`test_attempts`, shown on account + talent cards). worker/test.mjs runs D1 paths on an
in-memory node:sqlite built from schema.sql (`memoryD1`).

Header v6 (2026-10-01, the owner's ask after Bayt): a full-width solid blue bar (`--brand` #0B5C8E, white type;
`.topbar::before` spans the viewport) over the navy page - two colours. NAV in core.js has no "my applications": the
student's pages sit in the account menu (`accountButton` builds `.account-menu`), the phone tab bar's last tab is حسابي.
Employer side (`employerSide`: employers.html, employer.html, applicants.html) gets `EMPLOYER_NAV`, a deeper bar
(--brand-deep), a "للشركات" tag and the company account button; `.side-link` switches sides. Company accounts:
`worker/src/employer.js` (Google sign-in, free mail refused, D1 employers/employer_sessions, postings.owner_id; board
`owner()` and talent `employer()` accept the owning company's session as well as the manage token), dashboard
`employer.html`/`employer.js` (session in local-only `masar.employerSession`). Posting form autofill: rules in
employers.js (email, site, city/country, type, level, field, title, company; skills via `MasarATS.match`), then
worker `POST /draft` (Gemini; `cleanDraft` drops any value the ad does not contain). Since 2026-10-01 only a signed-in
company posts (`POST /board/postings` refuses without an employer session: `company_account`), and account.html opens on a
choice (job seeker -> student Google sign-in, `?as=student` skips it; company -> employer.html, `?next=post` returns to the form).
Postings sent earlier by link keep their private applicants links.

CV studio (`studio.html`, `assets/studio.js`, 2026-10-03, after ResumeScale): six one-column templates (classic, modern,
pro, elegant, minimal, compact; `.tpl-*` on `.studio-paper`), accent colour, serif/sans, three densities, sections hidden or
reordered (drag or arrows), a real 794 px A4 sheet scaled into the pane (dashed line where page one ends), click the sheet to
edit that part, undo/redo, strength = `MasarATS.content` on the CV as text (atskit now exports `hasResult`/`leadsWithVerb`/`WEAK`
for the per-point coach). The paper keeps renderCV's DOM (h1, p.cv-headline/contact, h2, .cv-item > .cv-row, ul, p.cv-skill) so
`MasarDocx.fromPaper` writes Word; `.ph` placeholders are cut before Word/print. State in local-only `masar.studio`; each save
also rewrites `masar.profile` (merged) so "tailor to a job" on cv.html works. Style quiz (stage, field, where they apply, two
traits, language, length, Arabic wording m/f) picks template/colour/order/density; answers in synced `masar.me.style`
(`styleAsked` once skipped). A student's sign-in on account.html with no answers yet goes to `studio.html?start=1`, so the
questions come right after signing up. Their optional last step ("tell us in your own words": type, or speak through the browser's SpeechRecognition) sends the lines, contact stripped, to worker `POST /voice` (Gemini: tone, two traits, verbs, words, and a summary in that voice from PROFILE/SAMPLE facts only; a number in neither is dropped); without the worker `readLocally` guesses traits/tone from keywords. The sample stays in local `masar.studio.voiceSample`; the reading goes into `masar.me.style.voice`. Question flows write the summary (third person, m/f) and each point (verb + what + tool +
result). Motion: Web Animations via `play()`, all off under prefers-reduced-motion. The root is `translate="no"`; the page
renders its own English with `L(ar, en)`.

CV file reading (pdf.js text layer, docx XML) lives in `assets/cvread.js` (`MasarRead.readFile`), shared by ats.js and
the home page's "how many openings fit you?" (`assets/fit.js`, after uptal.com/auto-apply: fits = at least half the
required skills, found skills merged into `masar.profile.skills`). The CV page opens on two cards (upload / from scratch)
for a visitor with no profile.

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
- Windows PowerShell 5.1: `Get-Content` without `-Encoding utf8` reads UTF-8 Arabic as cp1256 and
  `Set-Content` writes the mojibake back (support.html and employers.html were garbled this way once);
  `-replace` with a scriptblock is PS 6+ only and in 5.1 pasted the whole file into a script tag. Bump
  asset versions with a Python `re.sub` over docs/*.html + radar/landing.py (landing pages are generated
  from its template, so a version bumped only in docs/l is reverted by the next daily run).
- Mobile Lighthouse: each web font that lands re-lays out every Arabic text node (~300 ms a pass on a
  mid-range phone), so long lists (jobs.js, market.js) wait for `Masar.fontsReady()` (fonts or 1.5 s) and
  draw once; `#groups:empty` / `.charts:has(ol:empty)` / `#match-meta:empty` keep room so the footer does
  not shift. Google serves different font file URLs per browser, so `<link rel=preload>` of its woff2
  URLs double-downloads; the remaining fix is self-hosting the fonts (the owner's call).
- The scheduled workflow fires around 08:30 UTC, not the 03:17 in the cron line.
- A run can take an hour (AI re-reads after a PROMPT_VERSION bump). Its commit step rebases onto
  anything pushed meanwhile (`-X theirs`, its generated files win); before that fix, a push during
  a run lost the whole day's collection (2026-09-28).

## Status

Done: data fixes, four sources, jsonl storage, AI extraction (prompt v3),
landing page for co-op students (`docs/index.html`, `docs/assets/masar.css|js`).

Colours v5 (2026-09-30, replaces the v3 colours below; the owner found v3 tiring and asked me to choose):
one navy-ink family - dark: page `#0F1720`, bar `#0B1219`, surfaces `#16202B`/`#1C2835`, text `#E3EAF2`
(not pure white); light: page `#EEF2F6`, white surfaces, ink `#0E1A26` - and one sky-blue accent (`--mint`
`#7CC0EE` dark / `#0B5C8E` light; `--wine` `#1E5F8E` for exclusive/training). Panels are a step of the
same family (no bright grey islands): every panel scope reads `--p-text/--p-muted/--p-line/--p-surface/
--p-btn/--p-on-btn/--p-accent/--p-paper`, set per theme in `:root` - never hard-code panel colours again.
Burgundy is gone (tiles, hire band, blobs are blue). Fonts are self-hosted in `docs/assets/fonts/`
(`@font-face` at the top of masar.css; the Plex 400 and Kufi Arabic files are preloaded on every page).
v3 for the record:
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
