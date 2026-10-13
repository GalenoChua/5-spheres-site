/* The session registry, and the one rule about who may drive a room.
 *
 * WHY THIS IS A MODULE AND NOT A COPY IN EACH FUNCTION. _scale.mjs already states the
 * reason: a value read in several files, with a reader that disagrees with the writer,
 * does not error. It answers wrongly and plausibly. Authorisation has the same shape and
 * a worse failure, so the check lives once.
 *
 * ── WHAT WAS WRONG WITH ONE SHARED TOKEN ──────────────────────────────────────────────
 *
 * DRILL_TOKEN gates drill-stage and drill-results. One value, site-wide, so every coach
 * holding it can drive, release and read the results of EVERY session, including rooms
 * they were not in. Revoking one coach means rotating for all of them, which in practice
 * means nobody is ever revoked.
 *
 * A session now carries its own token. The global one still works, so the 22 October
 * session and everything already booked is untouched, and it can be retired once every
 * live room has its own.
 *
 * ── WHAT IS STORED, AND WHAT IS NOT ───────────────────────────────────────────────────
 *
 * The token is stored as a SHA-256 hash and never in clear. It is returned exactly once,
 * at creation, and cannot be read back afterwards by anyone including us. A coach who
 * loses it gets a new one for that session, which costs nothing and locks out nobody else.
 * That is the behaviour Netlify's own secret-marked variables have, and the reason is the
 * same: a secret that can be read back is a secret in every log that ever printed it.
 */
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSIONS = 'drill-sessions';

/* Session ids are issued, never typed. The date half is for a human reading a list; the
   random half is what stops one coach guessing another's room, which matters because the
   id is the only thing between a stranger and a roster of names. */
export function newSessionId(prefix = 'ps') {
  const d = new Date().toISOString().slice(0, 10);
  return `${prefix}-${d}-${randomBytes(3).toString('hex')}`;
}

export const newToken = () => randomBytes(12).toString('hex');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');

/* Constant time, and length-safe. timingSafeEqual throws on a length mismatch, which would
   itself leak the length, so both sides are hashed to a fixed width first. */
export function sameToken(given, expectedHash) {
  if (!given || !expectedHash) { return false; }
  const a = Buffer.from(hashToken(given), 'hex');
  const b = Buffer.from(String(expectedHash), 'hex');
  if (a.length !== b.length) { return false; }
  return timingSafeEqual(a, b);
}

/* The global token, compared the same way. Kept so nothing that works today stops working. */
export function globalOk(given, envValue) {
  if (!envValue || !given) { return false; }
  const a = Buffer.from(hashToken(given), 'hex');
  const b = Buffer.from(hashToken(envValue), 'hex');
  return timingSafeEqual(a, b);
}

export async function readSession(session) {
  try {
    return await getStore(SESSIONS).get(session, { type: 'json' });
  } catch {
    return null;
  }
}

/* MAY THIS CALLER DRIVE THIS ROOM?
 *
 * Two ways to yes, and they are deliberately not equivalent. `global` is the old shared
 * value and grants every session; `session` is the room's own and grants one. The caller
 * is told which one answered so a surface can say so, and so the day the global token is
 * retired the logs show who was still using it.
 *
 * Returns { ok, by }. Never throws: a store that is down must deny rather than crash into
 * a 500 that a caller might read as something other than no. */
export async function mayDrive(session, given) {
  if (globalOk(given, process.env.DRILL_TOKEN || '')) {
    return { ok: true, by: 'global' };
  }
  const rec = await readSession(session);
  if (rec && rec.tokenHash && sameToken(given, rec.tokenHash)) {
    return { ok: true, by: 'session' };
  }
  return { ok: false, by: null };
}

/* Whether the environment has a global token at all. Surfaced on a refusal so a coach can
   tell a missing deploy variable from a wrong value, which is the distinction drill-stage
   already drew and the only one that makes a failed unlock diagnosable in a live room. */
export const globalConfigured = () => Boolean(process.env.DRILL_TOKEN);
