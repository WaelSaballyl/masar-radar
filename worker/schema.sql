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
