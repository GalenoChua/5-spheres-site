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
  const dimensions = DIMS.map(([key, label]) => {
    const before = rows.map((r) => r.before[key]).filter(Number.isFinite);
    const after = rows.map((r) => r.after[key]).filter(Number.isFinite);
    const mb = mean(before);
    const ma = mean(after);
    return {
      dimension: label,
      before: round2(mb),
      after: round2(ma),
      change: round2(ma - mb),
      improved: rows.filter((r) => r.after[key] > r.before[key]).length,
      unchanged: rows.filter((r) => r.after[key] === r.before[key]).length,
      declined: rows.filter((r) => r.after[key] < r.before[key]).length,
      chosenAsFocus: rows.filter((r) => r.focus === key).length
    };
  });

  const npsScores = rows.map((r) => r.nps).filter((n) => Number.isInteger(n));
  const promoters = npsScores.filter((n) => n >= 9).length;
  const detractors = npsScores.filter((n) => n <= 6).length;

  const summary = {
    session,
    n: rows.length,
    dimensions,
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
