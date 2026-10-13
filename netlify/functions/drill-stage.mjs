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
import { mayDrive, globalOk, globalConfigured } from './_session.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* The constant-time comparison moved to _session.mjs, which is the only place that now
   decides whether a caller may drive a room. */

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
     a stuck session rather than an open one.

     THE SESSION IS READ BEFORE THE TOKEN IS JUDGED, because a room may now be driven by
     its own token as well as by the site-wide one. Order matters: the session name has to
     be validated first, so it is parsed above this and not below it. */
  const earlySession = String(body.session || '').trim().toLowerCase();
  const verdict = body.verify === true
    ? { ok: globalOk(String(body.token || ''), process.env.DRILL_TOKEN || ''), by: 'global' }
    : await mayDrive(earlySession, String(body.token || ''));
  if (!verdict.ok) {
    /* Say which half is wrong without saying anything about the value.
       "configured" is whether the function can see DRILL_TOKEN at all, which
       separates a scope or deploy-context problem from a value that does not
       match. Without it, an unset variable and a wrong token are the same
       refusal, and the session cannot start either way. */
    return json(403, { error: 'no', configured: globalConfigured() });
  }

  /* Checking a token must never write. The facilitator page proves the token
     before it has polled anything, and an earlier version proved it by writing
     the floor state it thought it had, which was nothing: opening or reloading
     the panel knocked the speaker off the floor mid-sentence. */
  if (body.verify === true) {
    return json(200, { ok: true, verified: true });
  }

  const session = earlySession;
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  /* An empty ref is how the facilitator closes the floor between speakers, so
     it is a valid value rather than a missing one.

     ABSENT IS NOT THE SAME AS EMPTY, and the difference is load-bearing. An empty
     string means close the floor; a `current` that was never sent means this call
     is about something else and must leave the floor exactly where it is. Without
     that distinction a call that only declares the session type would knock the
     speaker off mid-sentence, which is the bug the verify path above exists to
     avoid and which would now have a second way in. */
  const hasCurrent = Object.prototype.hasOwnProperty.call(body, 'current');
  const current = String(body.current || '').trim();
  if (current && !/^[0-9a-f]{12}$/.test(current)) {
    return json(400, { error: 'current' });
  }

  /* Releasing is what puts everybody's own sheet on their own phone. It is a
     separate act from moving the floor, because results landing while the
     eleventh person is still speaking would change the last turns of the room. */
  const release = body.release === true ? true : (body.release === false ? false : null);

  /* WHETHER THIS SESSION IS A REHEARSAL, SAID RATHER THAN GUESSED.
   *
   * _export_drills.mjs classifies on the session NAME, against
   * /^(preflight|preview|qa|smoke|test|demo)[-_]/. Treating an unmatched name as real is the
   * safe direction and the right default, and on 12 October it still produced a false
   * positive: a session called `asc-2026-10-07` holding one facilitator, one colleague and a
   * record from diag-probe@example.com was reported as a real session in every summary.
   *
   * The inverse is the one that costs something, and 22 October is the session where it
   * would. A real room named `test-run-asc` is dropped from the record and nobody finds out,
   * because a quiet exclusion looks exactly like a session that was never scored.
   *
   * So the facilitator says. It is sent with the stage call they already make before the
   * first speaker, it is written once and carried forward on every later call, and a session
   * that never declares falls back to the name. Explicit beats inferred; inferred beats
   * nothing. */
  const isTest = body.test === true ? true : (body.test === false ? false : null);

  let nextCurrent = null;
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

    /* Computed once so the response cannot disagree with what was written. */
    nextCurrent = (release === null && hasCurrent) ? (current || null) : (prior.current || null);
    await store.setJSON(`${session}/_stage`, {
      current: nextCurrent,
      changedAt: new Date().toISOString(),
      released: release === null ? (prior.released === true) : release,
      /* Sticky once set. A later call that says nothing must not quietly turn a declared
         rehearsal back into an unknown, because every call after the first one says
         nothing: the facilitator declares at the top and then only moves the floor. */
      test: isTest === null ? (typeof prior.test === 'boolean' ? prior.test : null) : isTest,
      sizes
    });
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  return json(200, { ok: true, current: nextCurrent, released: release, test: isTest, authBy: verdict.by });
};
