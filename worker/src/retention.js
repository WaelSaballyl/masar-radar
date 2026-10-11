// Retention, run daily by the Cron Trigger in wrangler.toml (scheduled() in
// index.js). Saudi PDPL: personal data is kept only while it serves its
// purpose.
// - An application (name, email, phone, links, the CV) serves the hiring for
//   one posting, so it goes RETAIN_DAYS after that posting expired, with the
//   invitations that tied a student to it. The posting itself stays (company
//   pages count it), but its HR contact email and private link go too.
// - A support conversation closed and untouched for SUPPORT_DAYS goes, with
//   its messages.
// - A talent card whose student has not signed in for CARD_DAYS comes down;
//   they show it again from their account page.
// - Sessions past their expiry can never sign anyone in again.

export const RETAIN_DAYS = 180;
export const SUPPORT_DAYS = 365;
export const CARD_DAYS = 365;
const DAY = 86_400_000;

export async function retention(env, now = new Date()) {
  const ago = (days) => new Date(now.getTime() - days * DAY).toISOString();
  // postings.expires_at is a date ("2026-10-11"); the rest hold full timestamps
  const cutoff = ago(RETAIN_DAYS).slice(0, 10);
  const iso = now.toISOString();
  const gone = `SELECT id FROM postings WHERE expires_at < ?`;
  const oldTickets = "SELECT id FROM support_tickets WHERE status = 'closed' AND updated_at < ?";
  const [applications, invites, postings, messages, tickets, cards, sessions, employerSessions] = await env.DB.batch([
    // an application whose posting no longer exists has no purpose left either
    env.DB.prepare(`DELETE FROM applications WHERE posting_id IN (${gone}) OR posting_id NOT IN (SELECT id FROM postings)`).bind(cutoff),
    env.DB.prepare(`DELETE FROM invites WHERE posting_id IN (${gone})`).bind(cutoff),
    // the HR person's work email and the private applicants link have nothing left to serve
    env.DB.prepare("UPDATE postings SET contact_email = '', manage_hash = NULL WHERE expires_at < ? AND (contact_email != '' OR manage_hash IS NOT NULL)").bind(cutoff),
    env.DB.prepare(`DELETE FROM support_messages WHERE ticket_id IN (${oldTickets})`).bind(ago(SUPPORT_DAYS)),
    env.DB.prepare(`DELETE FROM support_tickets WHERE id IN (${oldTickets})`).bind(ago(SUPPORT_DAYS)),
    env.DB.prepare("DELETE FROM talent WHERE user_id IN (SELECT id FROM users WHERE coalesce(last_login, created_at) < ?)").bind(ago(CARD_DAYS)),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(iso),
    env.DB.prepare("DELETE FROM employer_sessions WHERE expires_at < ?").bind(iso),
  ]);
  const n = (r) => r?.meta?.changes ?? 0;
  return { applications: n(applications), invites: n(invites), postings: n(postings), support_messages: n(messages),
           support_tickets: n(tickets), talent: n(cards), sessions: n(sessions), employer_sessions: n(employerSessions) };
}
