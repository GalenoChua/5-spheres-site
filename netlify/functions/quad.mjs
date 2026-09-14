/* Store one Sensing Quad submission.
 *
 * One record per person per session, carrying both rounds and both state
 * checks. That is the whole reason this exists rather than four form
 * submissions: pairing them means matching email addresses by hand afterwards,
 * and the group numbers are promised to participants the same week.
 *
 * Netlify Blobs rather than an external database. It ships with the site, has
 * no connection string to leak and no service to be down on the morning of a
 * live session. If this needs to end up in Postgres later, read the store and
 * load it — the shape is versioned.
 */
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 8 * 1024;
const SCALE = [1, 2, 3, 4, 5];
const QUAD = ['sense_others', 'present', 'sense_self', 'sensed_by_others'];
const STATE = ['physical', 'mental', 'emotional'];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

/* The page is the only caller and it is same-origin, so there is deliberately
   no CORS preamble — anything cross-origin is stopped by the browser. */
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

  /* Validate rather than trust. The URL is in the page source, so this will be
     found eventually by something that is not a participant. */
  const email = String(body.email || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 200) {
    return json(400, { error: 'email' });
  }
  const session = String(body.session || '').trim();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  /* Pull out exactly the keys expected, at exactly the values allowed. Anything
     else a caller sends is dropped rather than stored. */
  const block = (obj, keys, label) => {
    if (!obj || typeof obj !== 'object') { throw new Error(label); }
    const out = {};
    for (const k of keys) {
      if (!SCALE.includes(obj[k])) { throw new Error(`${label}.${k}`); }
      out[k] = obj[k];
    }
    return out;
  };

  let quad, state;
  try {
    quad = {
      a: block(body.quad?.a, QUAD, 'quad.a'),
      b: block(body.quad?.b, QUAD, 'quad.b')
    };
    state = {
      start: block(body.state?.start, STATE, 'state.start'),
      end: block(body.state?.end, STATE, 'state.end')
    };
  } catch (err) {
    return json(400, { error: err.message });
  }

  const clip = (v, n) => String(v ?? '').slice(0, n);
  const nps = Number.isInteger(body.nps) && body.nps >= 0 && body.nps <= 10 ? body.nps : null;

  const record = {
    version: 2,
    session,
    name: clip(body.name, 120),
    email,
    startedAt: clip(body.startedAt, 40),
    submittedAt: new Date().toISOString(),
    quad,
    state,
    focus: QUAD.includes(body.focus) ? body.focus : null,
    intention: clip(body.intention, 1200),
    nps,
    describe: clip(body.describe, 1200),
    testimonial: clip(body.testimonial, 60),
    emailMe: body.emailMe === true
  };

  /* Keyed by session and email, so somebody who submits twice — a refresh, a
     second device, a genuine correction — replaces their own row rather than
     quietly doubling the group numbers.

     getStore() is inside the try: it throws synchronously when the environment
     is not configured, which outside the try meant an unhandled 500 with no
     body instead of the 502 the page is written to fall back on. */
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
