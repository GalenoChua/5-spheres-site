/* What a Frog Rock pledge is allowed to be.
 *
 * Pure on purpose, for the same reason as _parent_feedback.mjs: no blob store,
 * no Netlify runtime, nothing to mock. The writer imports validate() and the
 * test calls it directly, so the rules about what gets stored are checked
 * without a deploy and without a network.
 *
 * HOW THIS DIFFERS FROM THE FEEDBACK FORM, which matters because the two sit on
 * the same page and the page makes a promise about one of them.
 *
 * The feedback form stores nothing that could identify a parent, and the
 * section says so. A pledge cannot work that way: the whole point is that G can
 * come back to the person and say the next installment is being made. So a
 * pledge record DOES carry an email address, knowingly typed by somebody who
 * wants to hear back. The page has to say that in those words, and it does.
 *
 * WHAT A RECORD HOLDS, listed rather than merely absent, so a later edit that
 * adds a field has to argue with this comment first:
 *
 *   email, an optional first name, an optional one-line message, and the time
 *   it arrived. No IP address, no user agent, no referrer, no cookie, no device
 *   id, no session id, and nothing about a child.
 *
 * WHAT IS NOT HERE AT ALL: money. No amount, no quantity, no card, no payment
 * token, no processor. This build registers interest and counts it. G connects a
 * processor himself when he has decided what a pledge buys, so no card data ever
 * passes through anything built here.
 */
import { createHash } from 'node:crypto';

/* The blob store both endpoints use. Named here rather than in the writer so
   the reader and the counter do not have to import the writer to learn it. */
export const STORE = 'frogrock-pledges';

/* The target the counter counts toward.
 *
 * PENDING G. The brief says "once pre-payments reach 100" and leaves three
 * things open: whether 100 means 100 pre-orders or 100 of a currency, what one
 * costs, and which processor G will connect. Until he answers, GOAL is a count
 * of people who have put their hand up and UNIT is deliberately null, so the
 * page cannot accidentally print a unit nobody has chosen. The page says it is
 * pending in its own copy rather than implying a decision has been made. */
export const GOAL = 100;
export const UNIT = null;

export const MAX_BYTES = 8 * 1024;
export const MAX_NAME = 80;
export const MAX_MESSAGE = 300;

/* Deliberately loose. A strict pattern rejects addresses that work, and the
   cost of a typo here is one undeliverable row in a list G reads by eye, while
   the cost of a false rejection is a backer who gave up. One @, something either
   side, a dot in the domain, no whitespace. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Lowercased and trimmed, so the same person typing their address twice with a
   capital letter is one backer and not two. The counter is a count of these. */
export function normaliseEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/* The blob key, so a second pledge from one address overwrites the first rather
   than adding to the count.
 *
 * This is a hash for IDEMPOTENCY, not for privacy: the record beside it holds
 * the address in plain text, because G has to be able to write to these people.
 * An email address is low entropy and a hash of one is reversible by anybody
 * willing to try a word list, so nothing here should be described as anonymous. */
export function keyFor(email) {
  return createHash('sha256').update(normaliseEmail(email)).digest('hex');
}

function oneLine(value, max) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

/* Returns { record, key } or { error }. The error is a field name, never the
   value that failed, so nothing a caller sent comes back out in a message. */
export function validate(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'body' };
  }

  const email = normaliseEmail(body.email);
  if (!email || email.length > 254 || !EMAIL.test(email)) return { error: 'email' };

  return {
    key: keyFor(email),
    record: {
      version: 1,
      email,
      /* Both optional. Somebody who gives an address and stops has still
         pledged, and clipping is better than refusing the whole submission over
         the tail of a sentence. */
      name: oneLine(body.name, MAX_NAME),
      message: oneLine(body.message, MAX_MESSAGE),
      /* The server's clock, not the browser's. A client timestamp is a value a
         caller chooses, and the only thing it is needed for is ordering. */
      pledgedAt: new Date(now ?? Date.now()).toISOString()
    }
  };
}

/* What the public counter is allowed to say: a number and the target, and
   nothing about who. Clamped at the goal for the bar, but `count` is reported
   raw, because passing the target is news and hiding it would be a lie. */
export function progress(count) {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return {
    count: n,
    goal: GOAL,
    unit: UNIT,
    percent: Math.min(100, Math.round((n / GOAL) * 100)),
    reached: n >= GOAL
  };
}

/* CSV, for the spreadsheet G will actually open. Here rather than in the reader
   so the escaping is tested without a blob store: the message line is written by
   a stranger, and a leading =, +, - or @ is a formula to a spreadsheet, not a
   word. An email address beginning with a quote is the other half of that. */
export const CSV_HEAD = ['pledgedAt', 'email', 'name', 'message'];

export function csvCell(v) {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(records) {
  const lines = [CSV_HEAD.join(',')];
  for (const r of records) lines.push(CSV_HEAD.map((k) => csvCell(r[k])).join(','));
  return lines.join('\n') + '\n';
}
