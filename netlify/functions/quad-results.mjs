/* Read back a session's Sensing Quad results.
 *
 * Two shapes. `?session=...&token=...` returns the anonymised group table —
 * the thing participants were promised by email, with no names, no addresses
 * and no free text. Adding `&full=1` returns everything, which is the MEAL
 * export and is the only reason the token exists.
 *
 * The token lives in the QUAD_TOKEN environment variable, set in the Netlify
 * UI. It is not in the repository and it is not in the page: the browser tool
 * only ever writes.
 */
import { getStore } from '@netlify/blobs';

const DIMS = [
  ['sense_others', 'How well did I sense others?'],
  ['present', 'How present was I?'],
  ['sense_self', 'How well did I sense myself?'],
  ['sensed_by_others', 'How well did others sense me?']
];

/* The Zone 1 scan. Reported as its own table because how somebody feels and
   how well they read a room are different claims, and averaging them together
   would be a third claim nobody made. */
const STATE = [
  ['physical', 'Physical — how settled'],
  ['mental', 'Mental — how clear'],
  ['emotional', 'Emotional — how steady']
];

const json = (status, body) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

export default async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const expected = process.env.QUAD_TOKEN || '';

  /* No token configured means the endpoint is closed, not open. Failing shut is
     the only safe default for something that can return email addresses. */
  if (!expected || token !== expected) {
    return json(401, { error: 'unauthorised' });
  }

  const session = String(url.searchParams.get('session') || '').trim();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  /* Removing a row. Test submissions land in the real session by accident and
     one throwaway NPS visibly moves the score in a room of six, so there has to
     be a way to take one out. Token-protected, one address at a time, and it
     says what it did rather than failing quietly. */
  const remove = String(url.searchParams.get('delete') || '').trim().toLowerCase();
  if (remove) {
    if (!/^\S+@\S+\.\S+$/.test(remove)) {
      return json(400, { error: 'delete must be an email address' });
    }
    try {
      const store = getStore('sensing-quad');
      const key = `${session}/${encodeURIComponent(remove)}`;
      const existing = await store.get(key, { type: 'json' });
      if (!existing) {
        return json(404, { error: 'no such submission', session, email: remove });
      }
      await store.delete(key);
      return json(200, { deleted: true, session, email: remove });
    } catch (err) {
      return json(502, { error: 'store unavailable' });
    }
  }

  /* Same reason as the writer: getStore throws synchronously on an
     unconfigured environment, so it belongs inside the try. */
  let rows = [];
  try {
    const store = getStore('sensing-quad');
    const { blobs } = await store.list({ prefix: `${session}/` });
    for (const b of blobs) {
      const r = await store.get(b.key, { type: 'json' });
      if (r) rows.push(r);
    }
  } catch (err) {
    return json(502, { error: 'store unavailable' });
  }

  if (!rows.length) {
    return json(200, { session, n: 0, note: 'no submissions yet' });
  }

  /* The group table. Per dimension: mean before, mean after, the movement, and
     how many people that dimension was the lowest for — which is the number
     worth talking about, because it is what the room is collectively worst at. */
  /* Two shapes of record can be in the store: version 1 had before/after at
     the top level and no state check. Read both so an early test row does not
     break the table. */
  const pick = (r, which) =>
    r.version >= 2 ? r.quad[which === 'a' ? 'a' : 'b'] : (which === 'a' ? r.before : r.after);

  const compare = (list, first, second, extra = () => ({})) =>
    list.map(([key, label]) => {
      const fs = rows.map((r) => first(r)?.[key]).filter(Number.isFinite);
      const ss = rows.map((r) => second(r)?.[key]).filter(Number.isFinite);
      const mf = mean(fs);
      const ms = mean(ss);
      return {
        dimension: label,
        from: round2(mf),
        to: round2(ms),
        change: round2(ms - mf),
        improved: rows.filter((r) => second(r)?.[key] > first(r)?.[key]).length,
        unchanged: rows.filter((r) => second(r)?.[key] === first(r)?.[key]).length,
        declined: rows.filter((r) => second(r)?.[key] < first(r)?.[key]).length,
        ...extra(key)
      };
    });

  const dimensions = compare(
    DIMS,
    (r) => pick(r, 'a'),
    (r) => pick(r, 'b'),
    (key) => ({ chosenAsFocus: rows.filter((r) => r.focus === key).length })
  );

  /* Only version 2 records carry a state check. */
  const withState = rows.filter((r) => r.state);
  const stateTable = withState.length
    ? compare(STATE, (r) => r.state?.start, (r) => r.state?.end)
    : null;

  const npsScores = rows.map((r) => r.nps).filter((n) => Number.isInteger(n));
  const promoters = npsScores.filter((n) => n >= 9).length;
  const detractors = npsScores.filter((n) => n <= 6).length;

  const summary = {
    session,
    n: rows.length,
    note: 'from is the first round, to is the second. Some of any improvement is '
        + 'practice effect rather than teaching — the second round is longer and '
        + 'they already know their partner.',
    dimensions,
    state: stateTable,
    wantResultsEmailed: rows.filter((r) => r.emailMe).map((r) => r.email),
    nps: npsScores.length
      ? {
          responses: npsScores.length,
          mean: round2(mean(npsScores)),
          /* The real NPS, not the average. They are different numbers and the
             average is the one people quote by mistake. */
          score: Math.round(((promoters - detractors) / npsScores.length) * 100),
          promoters,
          passives: npsScores.length - promoters - detractors,
          detractors
        }
      : null
  };

  if (url.searchParams.get('full') === '1') {
    return json(200, { ...summary, rows });
  }
  return json(200, summary);
};
