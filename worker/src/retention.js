// Retention, run daily by the Cron Trigger in wrangler.toml (scheduled() in
// index.js). Saudi PDPL: personal data is kept only while it serves its
// purpose. An application (name, email, phone, links, the CV) serves the
// hiring for one posting, so it goes RETAIN_DAYS after that posting expired,
// with the invitations that tied a student to it. Sessions past their expiry
// can never sign anyone in again, so they go too.

export const RETAIN_DAYS = 180;
const DAY = 86_400_000;

export async function retention(env, now = new Date()) {
  // postings.expires_at is a date ("2026-10-11"); sessions hold full timestamps
  const cutoff = new Date(now.getTime() - RETAIN_DAYS * DAY).toISOString().slice(0, 10);
  const iso = now.toISOString();
  const gone = `SELECT id FROM postings WHERE expires_at < ?`;
  const [applications, invites, sessions, employerSessions] = await env.DB.batch([
    // an application whose posting no longer exists has no purpose left either
    env.DB.prepare(`DELETE FROM applications WHERE posting_id IN (${gone}) OR posting_id NOT IN (SELECT id FROM postings)`).bind(cutoff),
    env.DB.prepare(`DELETE FROM invites WHERE posting_id IN (${gone})`).bind(cutoff),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso),
    env.DB.prepare("DELETE FROM employer_sessions WHERE expires_at < ?").bind(iso),
  ]);
  const n = (r) => r?.meta?.changes ?? 0;
  return { applications: n(applications), invites: n(invites), sessions: n(sessions), employer_sessions: n(employerSessions) };
}
