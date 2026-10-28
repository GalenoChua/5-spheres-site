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

  /* ALL OF THEM AT ONCE, NOT ONE AT A TIME.
   *
   * This was a sequential await inside the loop. Measured in production: five records answered
   * in 0.71s and thirty in 2.30s, about 56ms a record over a half-second floor. A thirteen
   * speaker room where everybody scores everybody is 13 self + 156 room + 1 stage = 170
   * records, so about ten seconds, and ten seconds is the synchronous function limit. Around
   * eighty records a single poll already takes longer than the four-second interval every
   * participant and the facilitator poll on, so the page falls permanently behind.
   *
   * What that looks like in a live room is cards that stop advancing to the next speaker and a
   * facilitator count that stops climbing, with no error, because the participant page
   * swallows a dropped poll on purpose. The biggest session ever seeded is five speakers, so
   * nothing had ever run the shape the 22nd will be.
   *
   * Ordering is not lost: speakers are sorted by arrival below and the scores are a tally. */
  const keys = blobs.map((b) => b.key).filter((k) => k.split('/').length === 3);
  const fetched = await Promise.all(keys.map(async (k) => {
    try {
      return [k, await store.get(k, { type: 'json' })];
    } catch {
      return [k, null];               /* one unreadable record is not a failed roster */
    }
  }));

  /* One pass over the session. Self records become the roster; everything else
     is counted against the speaker it scores, which is what tells the
     facilitator whether the room has finished and it is safe to move on. */
  const speakers = [];
  const scored = new Map();
  for (const [key, rec] of fetched) {
    const parts = key.split('/');
    if (!rec) continue;
    if (rec.role === 'self' && parts[1] === parts[2]) {
      speakers.push({
        ref: parts[1],
        name: rec.scorerName || 'Unnamed',
        ready: Boolean(rec.intent),
        /* Whether their pre-speech card is actually saved. This is what makes it
           safe to offer somebody their second card while they are still on the
           floor: the reason that was forbidden was that flipping the page cleared
           an unsaved first card. With the first card in the store, there is
           nothing left to lose. */
        savedBefore: Boolean(rec.before),
        savedAfter: Boolean(rec.after),
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
  let released = false;
  try {
    const stage = await store.get(`${session}/_stage`, { type: 'json' });
    if (stage && stage.current) current = stage.current;
    if (stage && stage.sizes) sizes = stage.sizes;
    if (stage && stage.released === true) released = true;
  } catch {
    /* A missing stage is a session that has not started, not a failure. */
  }

  /* How many cards this speaker should expect: the room as it was when they
     went up, less themselves. A speaker who has not been up yet is measured
     against the room as it stands. */
  speakers.forEach((s) => {
    const frozen = sizes[s.ref];
    const base = Math.max((frozen || speakers.length) - 1, 0);
    /* Never below the cards already received. The frozen figure is read from a
       listing, and listings here are eventually consistent: a speaker put up
       seconds after the last person joined can be frozen against a roster that
       has not caught up, and would then read as finished while cards are still
       arriving. Clamping means the count can only ever be generous. */
    s.expected = Math.max(base, s.scores);
    s.done = s.expected > 0 && s.scores >= s.expected;
    /* SPOKEN MEANS CAME OFF THE FLOOR, NOT WAS PUT ON IT.
       sizes[ref] is written the moment the facilitator puts somebody up, so this used to be
       true while they were still standing there about to talk. The page reads it as
       iHaveSpoken, which switched their own card to the after half, in the past tense, and
       cleared it. A speaker who had not already saved a first card lost their before reading,
       and that reading is half of what the instrument measures. It also made this list say
       "has spoken" about the person speaking. */
    s.hasSpoken = Boolean(frozen) && s.ref !== current;
    /* MAY THIS PERSON OPEN THEIR SECOND CARD YET?
     *
     * `hasSpoken` answers "did the floor move off them", which is the facilitator's
     * clock and not the speaker's. Jia Hong named the cost of that in the room on
     * 22 October: "now the window of time is after I submit mine and before you start
     * the next person, that's all the time I get to score myself". The whole stretch
     * while the room is scoring them, which is the natural moment to catch how they
     * think it went, they are locked out and shown the before card instead.
     *
     * `mayScoreAfter` is the speaker's own clock. It opens as soon as they have been
     * put up AND their first card is saved, so the page can offer them a finished
     * button while they are still current. The old condition stays as the fallback
     * for anybody who never presses it. */
    s.mayScoreAfter = Boolean(frozen) && s.savedBefore;
  });

  return json(200, { session, current, released, roomNow: speakers.length, speakers });
};
