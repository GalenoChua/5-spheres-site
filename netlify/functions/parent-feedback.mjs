/* Store one Tools for Parents feedback submission. Write only.
 *
 * WHY THIS IS A SEPARATE FILE FROM THE READER. This endpoint is in the page
 * source, so it is public and will eventually be found by something that is not
 * a parent. It can only append. The reader is parent-feedback-read.mjs, it needs
 * a token, and it is not referenced from any page. Splitting them means no
 * mistake in the write path can hand anybody the answers.
 *
 * Netlify Blobs rather than a database, for the same reason as the Sensing Quad:
 * it ships with the site, there is no connection string to leak and no service
 * to be down. One blob per submission, keyed by time, so two parents submitting
 * in the same second cannot overwrite each other.
 *
 * WHAT IS STORED is fixed in _parent_feedback.mjs and nothing is added here. No
 * address, no identifier, no request metadata. The section promises the parent
 * that on the page, and this is where that promise is either kept or broken.
 */
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { validate, MAX_BYTES, STORE } from './_parent_feedback.mjs';

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

  const { record, error } = validate(body);
  if (error) return json(400, { error });

  /* Key: the timestamp first so a listing comes back in order, then a uuid so
     nothing collides. Nothing in the key identifies anyone. */
  const key = `${record.submittedAt}-${randomUUID()}`;

  try {
    await getStore({ name: STORE, consistency: 'strong' }).setJSON(key, record);
  } catch (err) {
    /* getStore throws synchronously when the site has no blob context, which is
       what a local `netlify dev` without login looks like. Say so plainly rather
       than telling the parent their answer was saved. */
    console.error('parent-feedback: store write failed', err);
    return json(503, { error: 'store' });
  }

  return json(200, { ok: true });
};
