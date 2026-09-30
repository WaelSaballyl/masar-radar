-- Exclusive postings submitted by employers. Nothing is public until an admin
-- approves it (status 'approved'); expired ones drop off the public list.
-- Apply: npx wrangler d1 execute masar-board --remote --file schema.sql
CREATE TABLE IF NOT EXISTS postings (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  created_at    TEXT NOT NULL,
  reviewed_at   TEXT,
  expires_at    TEXT NOT NULL,
  company       TEXT NOT NULL,
  website       TEXT,
  contact_email TEXT NOT NULL,                      -- never public
  title         TEXT NOT NULL,
  city          TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'SA',
  workplace     TEXT NOT NULL,                      -- onsite | hybrid | remote
  employment    TEXT NOT NULL,                      -- full_time | part_time | internship | coop | contract
  level         TEXT NOT NULL,                      -- Intern | Junior | Mid | Senior | Lead | Manager
  description   TEXT NOT NULL,
  required      TEXT NOT NULL DEFAULT '',           -- comma-separated skills
  preferred     TEXT NOT NULL DEFAULT '',
  salary        TEXT,
  apply_url     TEXT
);
CREATE INDEX IF NOT EXISTS postings_status ON postings (status, expires_at);

-- screening by rules (src/board.js screen): green | yellow | red, and why
ALTER TABLE postings ADD COLUMN risk TEXT;
ALTER TABLE postings ADD COLUMN reasons TEXT;

-- applying through Masar: the employer's private link opens its applicants
-- (only a SHA-256 of the link's token is stored); one application per email
ALTER TABLE postings ADD COLUMN manage_hash TEXT;
CREATE TABLE IF NOT EXISTS applications (
  id          TEXT PRIMARY KEY,
  posting_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new',          -- new | shortlisted | rejected (set by the employer)
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  link        TEXT,
  matched     INTEGER NOT NULL DEFAULT 0,           -- required skills the student has
  required    INTEGER NOT NULL DEFAULT 0,
  paper       TEXT NOT NULL,                        -- the rendered CV as blocks (cvkit.js toBlocks)
  UNIQUE (posting_id, email)
);
CREATE INDEX IF NOT EXISTS applications_posting ON applications (posting_id, created_at);

-- the student's receipt (only its SHA-256) to follow an application, and when
-- the employer first opened the CV
ALTER TABLE applications ADD COLUMN receipt_hash TEXT;
ALTER TABLE applications ADD COLUMN viewed_at TEXT;

-- 1 when the contact email is on the company site's own domain (shown as a badge)
ALTER TABLE postings ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;

-- the student asked the employer, once, a week after applying, to look at the application
ALTER TABLE applications ADD COLUMN nudged_at TEXT;

-- "really interested" (src/board.js boost): first in the employer's list, 3 per email in 30 days
ALTER TABLE applications ADD COLUMN boosted_at TEXT;

-- Student accounts (src/auth.js): Google sign-in, no passwords. Only a hash of
-- each session token is kept. user_data holds the browser's synced keys as one
-- JSON object; rev rises by one per write so two devices cannot overwrite each other.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at TEXT NOT NULL,
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  rev INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- Support conversations (src/support.js): the visitor holds the ticket token,
-- only its hash is kept; user_id is set when a signed-in student opened it.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_status ON support_tickets (status, updated_at);
CREATE TABLE IF NOT EXISTS support_messages (
  ticket_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_thread ON support_messages (ticket_id, created_at);

-- Visitor counts (src/stats.js): per day and page, and per referring site.
-- No cookies, no IP, nothing that identifies a person.
CREATE TABLE IF NOT EXISTS hits (
  day TEXT NOT NULL,
  page TEXT NOT NULL,
  views INTEGER NOT NULL,
  visitors INTEGER NOT NULL,
  phone INTEGER NOT NULL,
  PRIMARY KEY (day, page)
);
CREATE TABLE IF NOT EXISTS refs (
  day TEXT NOT NULL,
  host TEXT NOT NULL,
  views INTEGER NOT NULL,
  PRIMARY KEY (day, host)
);

-- the field of an exclusive posting (data, tech, finance, engineering, marketing, hr)
ALTER TABLE postings ADD COLUMN field TEXT NOT NULL DEFAULT 'data';

-- Opt-in student cards (src/talent.js): no name, email, phone or link, only
-- what the student studies and can do. invites: an employer's live posting
-- asking a card's student to apply.
CREATE TABLE IF NOT EXISTS talent (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  card TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
  posting_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (posting_id, card_id)
);
CREATE INDEX IF NOT EXISTS invites_user ON invites (user_id);

-- Skill tests (src/skilltests.js): a pass marks the skill verified for the student's
-- account and talent card; one attempt per skill a day.
CREATE TABLE IF NOT EXISTS verified_skills (
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  score INTEGER NOT NULL,
  passed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, skill)
);
CREATE TABLE IF NOT EXISTS test_attempts (
  user_id TEXT NOT NULL,
  skill TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS test_attempts_user ON test_attempts (user_id, skill, at);
