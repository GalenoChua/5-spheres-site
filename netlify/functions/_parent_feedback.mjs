/* What a Tools for Parents feedback submission is allowed to be.
 *
 * Pure on purpose: no blob store, no Netlify runtime, nothing to mock. The
 * writer imports validate() and the test calls it directly, so the rules about
 * what gets stored are checked without a deploy and without a network.
 *
 * WHAT IS NOT IN A RECORD, and why it is listed rather than merely absent.
 * The section tells a parent on the page that nothing about them is collected.
 * A feedback form is the one place that promise could quietly stop being true,
 * so the shape is fixed here and the writer stores this and nothing else:
 *
 *   no name, no email, no IP address, no user agent, no referrer, no cookie,
 *   no device id, no session id, no free text beyond the one answer asked for.
 *
 * There is therefore no way to link two submissions to one parent, which is
 * also the limit of it: the count is a count of submissions, not of people.
 */

/* The blob store both endpoints use. Named here rather than in the writer so
   the reader does not have to import the writer to learn it. */
export const STORE = 'parent-feedback';

/* Did it help. Three values, because "partly" is the honest answer most of the
   time and a yes/no forces it into whichever side reads better. */
export const HELPED = ['yes', 'partly', 'no'];

/* Roughly how long the parent and the child sat with it. Buckets rather than a
   number: nobody times this, and a free number invites a precision that is not
   there. */
export const MINUTES = ['under-10', '10-30', '30-60', 'over-60'];

/* Which tool. An allowlist, so the section can grow without the store filling
   with whatever a caller types, and so a tool that is retired keeps its old
   records readable. */
export const TOOLS = ['telling-the-time'];

export const MAX_BYTES = 8 * 1024;
export const MAX_LEARNED = 1000;

/* Returns { record } or { error }. The error is a field name, never the value
   that failed, so nothing a caller sent comes back out in a message. */
export function validate(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'body' };
  }

  if (!TOOLS.includes(body.tool)) return { error: 'tool' };
  if (!HELPED.includes(body.helped)) return { error: 'helped' };
  if (!MINUTES.includes(body.minutes)) return { error: 'minutes' };

  /* The only free text, and it is optional: a parent who answers the first two
     and stops has still said something worth having. Clipped rather than
     rejected, because losing the whole submission over length is worse than
     losing the tail of one answer. */
  const learned = typeof body.learned === 'string'
    ? body.learned.replace(/\s+/g, ' ').trim().slice(0, MAX_LEARNED)
    : '';

  return {
    record: {
      version: 1,
      tool: body.tool,
      helped: body.helped,
      minutes: body.minutes,
      learned,
      /* The server's clock, not the browser's. A client timestamp is a value a
         caller chooses, and the only thing it is needed for is ordering. */
      submittedAt: new Date(now ?? Date.now()).toISOString()
    }
  };
}

/* The tally G reads first. Counts rather than averages: "yes" and "no" have no
   midpoint, and a mean over three words would invent one. */
export function tally(records) {
  const empty = () => Object.create(null);
  const out = { total: records.length, helped: empty(), minutes: empty(), withText: 0 };
  for (const k of HELPED) out.helped[k] = 0;
  for (const k of MINUTES) out.minutes[k] = 0;
  for (const r of records) {
    if (r.helped in out.helped) out.helped[r.helped] += 1;
    if (r.minutes in out.minutes) out.minutes[r.minutes] += 1;
    if (r.learned) out.withText += 1;
  }
  return out;
}

/* CSV, for the spreadsheet G will actually open. Here rather than in the reader
   so the escaping is tested without a blob store: the only free text in a
   record is written by a stranger, and a leading =, +, - or @ is a formula to a
   spreadsheet, not a word. */
export const CSV_HEAD = ['submittedAt', 'tool', 'helped', 'minutes', 'learned'];

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
