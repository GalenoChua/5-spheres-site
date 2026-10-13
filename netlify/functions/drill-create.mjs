/* A coach makes their own room.
 *
 * Until now a session came into existence when the first record landed, so it had no
 * owner, no date, no list and no way for a coach to say "this one is mine". The name was
 * typed, which is how a stale default put the room screen and the results page on the
 * 7 October session while everybody else was on the 22nd.
 *
 * ── WHAT GATES THIS, AND WHY IT IS A DIFFERENT SECRET ─────────────────────────────────
 *
 * COACH_TOKEN, not DRILL_TOKEN. The distinction is the whole point of the change: a shared
 * secret that grants the ability to CREATE an empty room is a much smaller thing to lose
 * than one granting read access to every room already scored. If COACH_TOKEN leaks, the
 * cost is junk sessions nobody uses. If DRILL_TOKEN leaks today, the cost is every roster
 * and every score on the site.
 *
 * Falls back to DRILL_TOKEN when COACH_TOKEN is not set, so this works the moment it
 * deploys rather than after somebody remembers to add a variable. The response says which
 * one let the caller in, so the fallback cannot go unnoticed for months.
 *
 * ── THE TOKEN IS SHOWN ONCE ───────────────────────────────────────────────────────────
 *
 * Only a hash is stored. There is no endpoint that returns it and no way for us to recover
 * it, which is the same contract Netlify's secret-marked variables have. A coach who loses
 * theirs calls this again with `rotate` and gets a new one for that session alone.
 */
import { getStore } from '@netlify/blobs';
import {
  SESSIONS, newSessionId, newToken, hashToken, globalOk, readSession,
} from './_session.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const okEmail = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length <= 200;

export default async (request) => {
  if (request.method !== 'POST') { return json(405, { error: 'POST only' }); }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'not json' }); }

  const given = String(body.token || '');
  const coachEnv = process.env.COACH_TOKEN || '';
  const drillEnv = process.env.DRILL_TOKEN || '';
  let by = null;
  if (coachEnv && globalOk(given, coachEnv)) { by = 'coach'; }
  else if (drillEnv && globalOk(given, drillEnv)) { by = 'drill'; }
  if (!by) {
    return json(403, { error: 'no', configured: Boolean(coachEnv || drillEnv) });
  }

  const owner = clip(body.owner, 200).toLowerCase();
  if (!okEmail(owner)) { return json(400, { error: 'owner' }); }
  const label = clip(body.label, 120);
  /* Declared at creation, which is earlier than drill-stage can ask and means a room is
     never ambiguous even if the facilitator panel is never opened. */
  const test = body.test === true;

  const store = getStore(SESSIONS);

  /* ROTATION. A coach who lost their token gets a new one for their own room, and only
     the owner may ask: otherwise anybody holding the coach token could take over a room
     they do not run, which is the thing this whole change exists to prevent. */
  if (body.rotate) {
    const session = clip(body.rotate, 64).toLowerCase();
    const rec = await readSession(session);
    if (!rec) { return json(404, { error: 'no such session' }); }
    if (rec.owner !== owner && by !== 'drill') {
      return json(403, { error: 'not your session' });
    }
    const token = newToken();
    await store.setJSON(session, { ...rec, tokenHash: hashToken(token), rotatedAt: new Date().toISOString() });
    return json(200, { ok: true, session, token, rotated: true, authBy: by });
  }

  const session = newSessionId(clip(body.prefix, 8).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'ps');
  const token = newToken();
  await store.setJSON(session, {
    v: 1,
    session,
    label: label || null,
    owner,
    test,
    createdAt: new Date().toISOString(),
    tokenHash: hashToken(token),
  });

  const base = new URL(request.url).origin;
  const q = `?session=${encodeURIComponent(session)}`;
  return json(200, {
    ok: true,
    session,
    token,
    test,
    authBy: by,
    links: {
      participant: `${base}/skilldrills/public-speaking/${q}`,
      room: `${base}/skilldrills/public-speaking/room/${q}`,
      facilitator: `${base}/skilldrills/public-speaking/facilitator/${q}`,
      results: `${base}/skilldrills/public-speaking/results/${q}`,
    },
    /* Said in the response rather than only in a doc, because this is the one moment the
       token exists anywhere a human can see it. */
    note: 'This token is shown once and stored only as a hash. Save it now. If it is lost, '
      + 'call this again with rotate set to the session id and a new one is issued for this '
      + 'session alone.',
  });
};
