/* Store one scoring card from the Public Speaking Drill.
 *
 * Two kinds of record land here, distinguished by `role`:
 *
 *   self   the speaker. Carries the one point they intended, which is the thing
 *          the relay is measured against, plus their own read on themselves.
 *   room   everybody else, all scoring the same card. Eleven of these is what
 *          makes Appeared a figure that holds, and it means the five is scored
 *          by the room rather than by two people.
 *
 * Netlify Blobs rather than Postgres, deliberately, and the same choice
 * quad.mjs made for the same reason: no connection string to leak and no
 * service to be down on the morning of a live session. The record is versioned
 * so the warehouse can read the store and load it later.
 *
 * Keyed session/speaker/scorer, so a refresh, a second device or a genuine
 * correction replaces that person's own row rather than doubling the mean.
 */
import { getStore } from '@netlify/blobs';
import { refFor } from './drill-roster.mjs';

const MAX_BYTES = 24 * 1024;
const SCALE = [1, 2, 3, 4, 5];
const ROLES = ['self', 'room'];
const OUTCOME = ['confident', 'clear', 'believed'];
const FIVE = ['pause', 'pace', 'volume', 'emotion', 'tonality'];
const WHAT = ['held', 'aimed'];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const okEmail = (e) => /^\S+@\S+\.\S+$/.test(e) && e.length <= 200;

/* Pull out exactly the keys expected at exactly the values allowed. A missing
   score is null rather than an error: a scorer who ran out of time before the
   next speaker started has still given us the rest, and dropping their whole
   card to punish that would cost more than it protects. */
function scores(obj, keys) {
  const out = {};
  for (const k of keys) {
    const v = obj && obj[k];
    out[k] = SCALE.includes(v) ? v : null;
  }
  return out;
}
const anyScored = (o) => Object.values(o).some((v) => v !== null);

/* A speaker's own record sits at session/ref/ref, so a ref resolves with one
   read. It fails closed: an unknown ref returns nothing rather than falling
   back to whatever address the caller also sent. */
async function resolveRef(store, session, ref) {
  const rec = await store.get(`${session}/${ref}/${ref}`, { type: 'json' });
  return rec && rec.role === 'self' && rec.speaker ? rec.speaker : '';
}

/* The page is the only caller and it is same-origin, so there is deliberately
   no CORS preamble: anything cross-origin is stopped by the browser. */
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

  const session = clip(body.session, 64).toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  const role = ROLES.includes(body.role) ? body.role : null;
  if (!role) {
    return json(400, { error: 'role' });
  }

  /* The store is opened here rather than at the write, because resolving a
     speaker ref needs it too. It throws synchronously when the environment is
     not configured, which is why every use sits inside a try. */
  let store;
  try {
    store = getStore('drill-scores');
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  /* Both addresses are lower-cased before they become part of the key. The same
     person typing Nina@ on their phone and nina@ on a laptop must not appear
     twice in a mean of eleven.

     A scorer posts `speakerRef`, not an address, so the roster never has to
     hand out everybody's email. Resolving it means reading the session's self
     records, which is also the check that the speaker exists. */
  let speaker = '';
  const ref = clip(body.speakerRef, 24);
  if (/^[0-9a-f]{12}$/.test(ref)) {
    try {
      speaker = await resolveRef(store, session, ref);
    } catch {
      return json(502, { error: 'store unavailable' });
    }
    if (!speaker) {
      return json(404, { error: 'no such speaker in this session' });
    }
  } else {
    speaker = clip(body.speaker, 200).toLowerCase();
  }
  if (!okEmail(speaker)) {
    return json(400, { error: 'speaker' });
  }
  const scorer = role === 'self' ? speaker : clip(body.scorer, 200).toLowerCase();
  if (!okEmail(scorer)) {
    return json(400, { error: 'scorer' });
  }
  if (role !== 'self' && scorer === speaker) {
    return json(400, { error: 'cannot score yourself as the room' });
  }

  const now = new Date().toISOString();
  const record = {
    version: 1,
    session,
    role,
    speaker,
    scorer,
    scorerName: clip(body.scorerName, 120),
    submittedAt: now,
    outcome: scores(body.outcome, OUTCOME),
    reserve: SCALE.includes(body.reserve) ? body.reserve : null
  };

  /* When somebody joined, kept separate from when they last saved. The roster is
     ordered by this, so rows never reshuffle under the facilitator's finger when
     a latecomer arrives. Saving your card again must not move you. */
  if (role === 'self') {
    try {
      const prior = await store.get(`${session}/${refFor(session, speaker)}/${refFor(session, speaker)}`,
                                    { type: 'json' });
      record.joinedAt = (prior && prior.joinedAt) || now;
    } catch {
      record.joinedAt = now;
    }
  }

  record.five = scores(body.five, FIVE);

  if (role === 'self') {
    /* The flap. Written before delivering and never shown to the room until
       their write-backs are in, which is the only thing making the relay a
       measurement rather than a vote. */
    record.intent = clip(body.intent, 600);
  } else {
    record.relay = clip(body.relay, 600);
    record.what = scores(body.what, WHAT);
    record.fix = clip(body.fix, 600);
  }

  /* An empty card is a page bug or a bot, not a participant. Reject it rather
     than storing a row that drags a mean toward nothing.

     Joining is the exception. A speaker registers before they have a point or a
     score, and that record is what puts them on the roster, so a self record
     with a name is content in its own right. */
  const hasContent =
    (role === 'self' && record.scorerName.length > 0) ||
    anyScored(record.outcome) ||
    anyScored(record.five) ||
    record.reserve !== null ||
    (record.intent || '').length > 0 ||
    (record.relay || '').length > 0;
  if (!hasContent) {
    return json(400, { error: 'empty card' });
  }

  /* The key is built from the digests, never from the addresses.
     Percent-encoding an address into a key does not survive the round trip: the
     store encodes the key again, so a written "%40" lists back as "%2540" and
     the record can never be read. Found by running it rather than by reading
     it, because a stubbed store happily returns whatever key it was given. */
  const key = `${session}/${refFor(session, speaker)}/${refFor(session, scorer)}`;

  try {
    await store.setJSON(key, record);
  } catch {
    /* Say it plainly. A failure here must never look like a success to the
       person who just filled the card, because they will not fill it twice. */
    return json(502, { error: 'store unavailable' });
  }

  return json(200, { ok: true, role, speaker });
};
