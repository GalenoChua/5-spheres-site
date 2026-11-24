/* Read back the Tools for Parents feedback. Token required.
 *
 * This is how G sees the answers. It is linked from no page and the token is
 * not in the repository: set PARENT_FEEDBACK_TOKEN in the Netlify UI and the
 * endpoint starts working. Until it is set, every request is refused, which is
 * the closed default and is deliberate.
 *
 *     POST /.netlify/functions/parent-feedback-read   {"token":"..."}
 *     GET  /.netlify/functions/parent-feedback-read?token=...
 *
 * POST is the stronger path, as it is for the Quad reader: a token with an & in
 * it arrives cut off at that point on a GET, a # never arrives at all, and
 * whatever does arrive is left in browser history and in server logs.
 *
 * Add &format=csv (or "format":"csv") for a spreadsheet instead of JSON.
 */
import { getStore } from '@netlify/blobs';
import { tally, toCsv, STORE } from './_parent_feedback.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* Compared in constant time, so the endpoint does not leak the token one
   character at a time to anybody willing to measure the difference between a
   first-character mismatch and a last-character one. An unset variable fails
   here too. */
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
  let given = url.searchParams.get('token') || '';
  let format = url.searchParams.get('format') || 'json';

  if (request.method === 'POST') {
    try {
      const body = JSON.parse(await request.text());
      if (typeof body.token === 'string') given = body.token;
      if (typeof body.format === 'string') format = body.format;
    } catch { /* fall back to the query string */ }
  }

  if (!tokenOk(given, process.env.PARENT_FEEDBACK_TOKEN)) {
    return json(403, { error: 'token' });
  }

  let records = [];
  try {
    const store = getStore({ name: STORE, consistency: 'strong' });
    const { blobs } = await store.list();
    /* The key starts with the timestamp, so sorting the keys sorts the records,
       newest last. */
    for (const b of blobs.sort((x, y) => (x.key < y.key ? -1 : 1))) {
      const r = await store.get(b.key, { type: 'json' });
      if (r) records.push(r);
    }
  } catch (err) {
    console.error('parent-feedback-read: store read failed', err);
    return json(503, { error: 'store' });
  }

  if (format === 'csv') {
    return new Response(toCsv(records), {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="parent-feedback.csv"',
        'cache-control': 'no-store'
      }
    });
  }

  return json(200, { tally: tally(records), records });
};
