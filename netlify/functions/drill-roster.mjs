/* Who is speaking in this session, for the picker on the scoring page.
 *
 * A scorer has to say who they are scoring, and the key for a person is their
 * email address. Serving the roster as addresses would hand every participant
 * a list of everybody else's, which is a worse trade than the convenience is
 * worth. So each speaker gets a `ref`: a short digest of the session and their
 * address, stable for the session and meaningless outside it. The page shows
 * names and posts refs, and the addresses never leave the server.
 *
 * A speaker joins the roster by writing their own `self` record, which they do
 * before delivering anyway, because that is where the flap lives.
 */
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* Exported so drill-score resolves a ref the same way this produces one. Two
   implementations of the same digest is how they drift apart. */
export const refFor = (session, email) =>
  createHash('sha256').update(`${session}:${email.toLowerCase()}`).digest('hex').slice(0, 12);

export default async (request) => {
  const url = new URL(request.url);
  const session = (url.searchParams.get('session') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  let store;
  try {
    store = getStore('drill-scores');
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  /* Every record for the session, filtered to the speakers. The alternative is
     a second store holding the roster, which would then have to be kept in step
     with the records that actually exist. */
  let blobs;
  try {
    const listed = await store.list({ prefix: `${session}/` });
    blobs = listed.blobs || [];
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  /* One pass over the session. Self records become the roster; everything else
     is counted against the speaker it scores, which is what tells the
     facilitator whether the room has finished and it is safe to move on. */
  const speakers = [];
  const scored = new Map();
  for (const b of blobs) {
    const parts = b.key.split('/');
    if (parts.length !== 3) continue;          /* session/_stage and anything else */
    let rec;
    try {
      rec = await store.get(b.key, { type: 'json' });
    } catch {
      continue;
    }
    if (!rec) continue;
    if (rec.role === 'self' && parts[1] === parts[2]) {
      speakers.push({
        ref: parts[1],
        name: rec.scorerName || 'Unnamed',
        ready: Boolean(rec.intent),
        joinedAt: rec.joinedAt || rec.submittedAt || ''
      });
    } else {
      scored.set(parts[1], (scored.get(parts[1]) || 0) + 1);
    }
  }
  speakers.forEach((s) => { s.scores = scored.get(s.ref) || 0; });

  /* Ordered by arrival. A name sort is the same on every device too, but it
     reshuffles: a latecomer called Aaron lands at row zero and pushes every
     other row down, under the finger of a facilitator who is about to tap. */
  speakers.sort((a, b) => (a.joinedAt || '').localeCompare(b.joinedAt || '') ||
                          a.ref.localeCompare(b.ref));

  /* Who the room is scoring right now. The facilitator sets it; everybody else
     follows it, so nobody has to be told which card to open. */
  let current = null;
  let sizes = {};
  try {
    const stage = await store.get(`${session}/_stage`, { type: 'json' });
    if (stage && stage.current) current = stage.current;
    if (stage && stage.sizes) sizes = stage.sizes;
  } catch {
    /* A missing stage is a session that has not started, not a failure. */
  }

  /* How many cards this speaker should expect: the room as it was when they
     went up, less themselves. A speaker who has not been up yet is measured
     against the room as it stands. */
  speakers.forEach((s) => {
    const frozen = sizes[s.ref];
    s.expected = Math.max((frozen || speakers.length) - 1, 0);
    s.done = s.expected > 0 && s.scores >= s.expected;
    s.hasSpoken = Boolean(frozen);
  });

  return json(200, { session, current, speakers });
};
