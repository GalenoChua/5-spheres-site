/* Say who the room is scoring right now.
 *
 * One writer, the facilitator, and everybody else reads it through the roster.
 * That is the whole point: in a live session nobody should be typing a name or
 * being told which card to open, because that is twelve chances a minute for
 * somebody to score the wrong person.
 *
 * Protected by DRILL_TOKEN, set in the Netlify environment and never in the
 * repository. Without it the endpoint is closed rather than open: an unguarded
 * version of this lets any participant move the room on mid-answer.
 */
import { getStore } from '@netlify/blobs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* Compared in constant time so the endpoint does not leak the token one
   character at a time to anybody willing to measure. */
function tokenOk(given, expected) {
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/* How many people are in the room right now, counted from the self records. */
async function roomSize(store, session) {
  const listed = await store.list({ prefix: `${session}/` });
  let n = 0;
  for (const b of listed.blobs || []) {
    const parts = b.key.split('/');
    if (parts.length === 3 && parts[1] === parts[2]) n += 1;
  }
  return n;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'not json' });
  }

  /* Fail shut. No token configured means nobody can drive the session, which is
     a stuck session rather than an open one. */
  const expected = process.env.DRILL_TOKEN || '';
  if (!tokenOk(String(body.token || ''), expected)) {
    /* Say which half is wrong without saying anything about the value.
       "configured" is whether the function can see DRILL_TOKEN at all, which
       separates a scope or deploy-context problem from a value that does not
       match. Without it, an unset variable and a wrong token are the same
       refusal, and the session cannot start either way. */
    return json(403, { error: 'no', configured: Boolean(expected) });
  }

  /* Checking a token must never write. The facilitator page proves the token
     before it has polled anything, and an earlier version proved it by writing
     the floor state it thought it had, which was nothing: opening or reloading
     the panel knocked the speaker off the floor mid-sentence. */
  if (body.verify === true) {
    return json(200, { ok: true, verified: true });
  }

  const session = String(body.session || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  /* An empty ref is how the facilitator closes the floor between speakers, so
     it is a valid value rather than a missing one. */
  const current = String(body.current || '').trim();
  if (current && !/^[0-9a-f]{12}$/.test(current)) {
    return json(400, { error: 'current' });
  }

  try {
    const store = getStore('drill-scores');
    const prior = (await store.get(`${session}/_stage`, { type: 'json' })) || {};
    const sizes = prior.sizes && typeof prior.sizes === 'object' ? prior.sizes : {};

    /* Freeze how big the room was when this speaker went up. Counting against
       the live roster instead means a speaker who was scored by everybody goes
       back to looking incomplete the moment somebody arrives late, and can
       never read as finished again. */
    if (current && !sizes[current]) {
      sizes[current] = await roomSize(store, session);
    }

    await store.setJSON(`${session}/_stage`, {
      current: current || null,
      changedAt: new Date().toISOString(),
      sizes
    });
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  return json(200, { ok: true, current: current || null });
};
