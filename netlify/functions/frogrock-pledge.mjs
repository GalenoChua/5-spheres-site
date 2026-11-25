/* Register one Frog Rock pledge. Write only.
 *
 * WHY THIS IS A SEPARATE FILE FROM THE READER, the same reason the feedback
 * form splits them: this endpoint is in the page source, so it is public and
 * will eventually be found by something that is not a reader of Frog Rock. It
 * can only write. The reader is frogrock-pledge-read.mjs, it needs a token, and
 * it is referenced from no page. Splitting them means no mistake in the write
 * path can hand anybody a list of email addresses.
 *
 * It cannot read, either, and that is load bearing rather than tidy. The key is
 * a hash of the address, so a second pledge from one person overwrites the first
 * and the count stays a count of people. That works without ever reading a
 * record back, which is why the writer does not have the capability at all.
 *
 * NO MONEY MOVES HERE. There is no amount, no quantity, no card field and no
 * processor. This records that somebody wants the next installment made, and
 * frogrock-count.mjs reports how many have said so. G connects a processor
 * himself once he has decided what a pledge buys.
 *
 * Netlify Blobs rather than a database, for the same reason as the Sensing Quad
 * and the feedback form: it ships with the site, there is no connection string
 * to leak and no service to be down.
 */
import { getStore } from '@netlify/blobs';
import { validate, MAX_BYTES, STORE } from './_frogrock_pledge.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* The page is the only caller and it is same-origin, so there is no CORS
   preamble: anything cross-origin is stopped by the browser. */
export default async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });

  const raw = await request.text();
  if (raw.length > MAX_BYTES) return json(413, { error: 'too large' });

  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'not json' }); }

  /* The honeypot, answered before anything else and answered with a success, so
     a bot filling every field learns nothing from the reply. Nothing is stored.
     The field is pinned off screen on the element itself rather than by a class,
     because a stylesheet rule does not reach every page and this one did render
     full size on two of them once. */
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json(200, { ok: true, skipped: true });
  }

  const { record, key, error } = validate(body);
  if (error) return json(400, { error });

  try {
    await getStore({ name: STORE, consistency: 'strong' }).setJSON(key, record);
  } catch (err) {
    /* getStore throws when the site has no blob context, which is what a local
       `netlify dev` without login looks like. Say so plainly rather than telling
       somebody their pledge was recorded. */
    console.error('frogrock-pledge: store write failed', err);
    return json(503, { error: 'store' });
  }

  return json(200, { ok: true });
};
