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

/* Compared in constant time, so the endpoint does not leak the token one
   character at a time to anybody willing to measure the difference between a
   first-character mismatch and a last-character one. An unset variable fails
   here too, which is the closed default. */
function tokenOk(given, expected) {
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export default async (request) => {
  const url = new URL(request.url);

  /* A POST carries the token in the body, where no character can break it. The
     query string is kept for links that already exist, but it is the weaker
     path: a token with an & in it arrives cut off at that point, a # never
     arrives at all, and whatever does arrive is left in browser history and
     server logs. */
  let posted = {};
  if (request.method === 'POST') {
    try {
      posted = await request.json();
    } catch {
      return json(400, { error: 'not json' });
    }
  }

  const token = String(posted.token || url.searchParams.get('token') || '');
  const expected = process.env.QUAD_TOKEN || '';

  /* No token configured means the endpoint is closed, not open. Failing shut is
     the only safe default for something that can return email addresses. */
  /* A query string eats a plus: "a+b" arrives as "a b". That is a transport
     artefact, not a different token, so restore it and try again rather than
     making the token's character set a thing anybody has to remember. Both
     comparisons are constant time and both are against the real value, so this
     accepts nothing it should not. */
  const unmangled = token.indexOf(' ') > -1 ? token.split(' ').join('+') : token;
  if (!tokenOk(token, expected) && !tokenOk(unmangled, expected)) {
    /* Say which half is wrong without saying anything about the value.
       "configured" is whether the function can see QUAD_TOKEN at all, which
       separates a scope or deploy-context problem from a value that does not
       match. "sameLength" distinguishes a value cut short in transit, by an
       unescaped & or #, from one the same size that simply differs. */
    return json(401, {
      error: 'unauthorised',
      configured: Boolean(expected),
      sameLength: Boolean(expected) && token.length === expected.length,
      received: token.length
    });
  }

  const session = String(posted.session || url.searchParams.get('session') || '').trim();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  /* Removing a row. Test submissions land in the real session by accident and
     one throwaway NPS visibly moves the score in a room of six, so there has to
     be a way to take one out. Token-protected, one address at a time, and it
     says what it did rather than failing quietly. */
  const remove = String(posted.delete || url.searchParams.get('delete') || '').trim().toLowerCase();
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
  const pick = (r, which) => {
    if (r.version < 2) { return which === 'b' ? r.after : r.before; }
    /* a2 is round one scored again after the teaching, and only version 3
       records have it. Where it is missing, fall back to the first pass so an
       earlier row still lands in the table rather than dropping out of it. */
    if (which === 'a2') { return r.quad.a2 || r.quad.a; }
    return r.quad[which];
  };

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

  /* The change worth reporting is measured from the re-score, not the first
     pass. Both were about round one, but the first was scored before anyone
     knew what the questions meant, so a - a2 is the standard moving and
     a2 - b is the skill moving. Reporting b - a would add the two together and
     can show a real improvement as a decline. */
  const dimensions = compare(
    DIMS,
    (r) => pick(r, 'a2'),
    (r) => pick(r, 'b'),
    (key) => ({ chosenAsFocus: rows.filter((r) => r.focus === key).length })
  );

  /* How far the ruler moved. A fall here is people getting more accurate about
     themselves, not worse at the thing. */
  const rescored = rows.filter((r) => r.quad?.a2);
  const standardShift = rescored.length
    ? compare(DIMS, (r) => r.quad.a, (r) => r.quad.a2)
    : null;

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
    nRescored: rescored.length,
    note: 'In dimensions, from is round one re-scored after the teaching and to is '
        + 'round two, so both sit on the same ruler. standardShift is the first '
        + 'pass against that re-score: how far their standard moved, not their '
        + 'skill. Some of any improvement is practice effect rather than teaching '
        + '— the second round is longer and they already know their partner. '
        + 'Where nRescored is below n, the rows without a re-score fall back to '
        + 'their first pass and the dimensions table is contaminated to that '
        + 'extent; check the two numbers match before quoting the change.',
    dimensions,
    standardShift,
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

  if (posted.full === true || url.searchParams.get('full') === '1') {
    return json(200, { ...summary, rows });
  }
  return json(200, summary);
};
