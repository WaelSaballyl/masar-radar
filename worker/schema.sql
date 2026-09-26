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
