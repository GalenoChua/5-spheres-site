/* Store one Sensing Quad submission.
 *
 * One record per person per session, carrying both rounds. That is the whole
 * reason this exists rather than two form submissions: pairing a before and an
 * after across two records means matching email addresses by hand afterwards,
 * and the group numbers are promised to participants the same week.
 *
 * Netlify Blobs rather than an external database. It ships with the site, has
 * no connection string to leak and no service to be down on the morning of a
 * live session. If this data needs to end up in Postgres later, GET the store
 * and load it — the shape is stable and versioned.
 */
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 8 * 1024;
const SCALE = [1, 2, 3, 4, 5];
const DIMS = ['sense_others', 'present', 'sense_self', 'sensed_by_others'];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

/* The page is the only caller and it is same-origin, so there is no CORS
   preamble here on purpose — anything cross-origin gets rejected by the
   browser before it arrives. */
export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return json(413, { error: 'too large' });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'not json' });
  }

  /* Validate rather than trust. This endpoint is public — the URL is in the
     page source — so it will eventually be found by something that is not a
     participant. Reject anything that is not shaped like a real submission. */
  const email = String(body.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) {
    return json(400, { error: 'email' });
  }
  const session = String(body.session || '').trim();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }
  for (const round of ['before', 'after']) {
    const scores = body[round];
    if (!scores || typeof scores !== 'object') {
      return json(400, { error: round });
    }
    for (const d of DIMS) {
      if (!SCALE.includes(scores[d])) {
        return json(400, { error: `${round}.${d}` });
      }
    }
  }

  const clip = (v, n) => String(v ?? '').slice(0, n);
  const nps = Number.isInteger(body.nps) && body.nps >= 0 && body.nps <= 10 ? body.nps : null;

  const record = {
    version: 1,
    session,
    name: clip(body.name, 120),
    email,
    startedAt: clip(body.startedAt, 40),
    submittedAt: new Date().toISOString(),
    before: Object.fromEntries(DIMS.map((d) => [d, body.before[d]])),
    after: Object.fromEntries(DIMS.map((d) => [d, body.after[d]])),
    focus: DIMS.includes(body.focus) ? body.focus : null,
    intention: clip(body.intention, 1200),
    nps,
    describe: clip(body.describe, 1200),
    testimonial: clip(body.testimonial, 60)
  };

  /* Keyed by session and email, so somebody who submits twice — a refresh, a
     second device, a genuine correction — replaces their own row rather than
     quietly doubling the group numbers. The email is lowercased and encoded
     because it goes into the key.

     getStore() is inside the try, not outside it: it throws synchronously when
     the environment is not configured, which on an unconfigured deploy meant an
     unhandled 500 with no JSON body rather than the 502 the page is written to
     fall back on. */
  const key = `${session}/${encodeURIComponent(email.toLowerCase())}`;

  try {
    const store = getStore('sensing-quad');
    await store.setJSON(key, record);
  } catch (err) {
    /* Say it plainly and let the page fall back to the Netlify form. A failure
       here must never look like a success to the participant. */
    return json(502, { error: 'store unavailable' });
  }

  return json(200, { ok: true, focus: record.focus });
};
