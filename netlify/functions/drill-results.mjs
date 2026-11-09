/* Read a drill session back: one sheet per speaker, plus the group picture.
 *
 * Token in a POST body, never in a URL, for the reason the Quad learned the hard
 * way: an & in the value gets the token cut in half and a # never arrives.
 *
 * Everything here is derived at read time from the stored cards rather than
 * computed during the session and saved. A scoring rule can therefore be fixed
 * after a session without the records being wrong.
 */
import { getStore } from '@netlify/blobs';
import { mayDrive, globalConfigured } from './_session.mjs';
import { refFor } from './drill-roster.mjs';
import { pctOf, scaleOf } from './_scale.mjs';
import { baseRef, roundOf, isSelf } from './_rounds.mjs';

const OUTCOME = ['confident', 'clear', 'believed'];
const FIVE = ['pause', 'pace', 'volume', 'emotion', 'tonality'];
const WHAT = ['held', 'aimed'];

const json = (status, body) =>
  new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

/* The constant-time comparison moved to _session.mjs, which is the only place that now
   decides whether a caller may read a room. */

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
/* The span comes from the record, never from a constant here. A reader that
   assumes the wrong one does not error, it returns a number that is wrong by
   about a factor of two and looks entirely plausible. */
const pct = (m, rec) => pctOf(m, rec, 'drill');
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.round(Math.sqrt(xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length - 1)));
}

/* Stand-in for the AI comparison, and the same one the test bench uses: shared
   meaningful words in both directions. Shown beside the texts, never alone. */
const STOP = new Set(('a an the and or but if to of in on for with that this it is are was were ' +
  'be been being as at by from they them their we you your i my our not no so then than there ' +
  'what which who how when about into over more most can will would should could do does did ' +
  'have has had').split(' '));
const words = (s) => [...new Set((String(s || '').toLowerCase().match(/[a-z0-9']+/g) || [])
  .filter((w) => w.length > 2 && !STOP.has(w)))];
function overlap(a, b) {
  const A = words(a); const B = words(b);
  if (!A.length || !B.length) return null;
  return Math.round(A.filter((w) => B.includes(w)).length / Math.max(A.length, B.length) * 100);
}

/* SPLIT A SESSION'S RECORDS INTO PEOPLE AND THEIR ROUNDS.
 *
 * Pure, and exported, because the thing worth testing here is exactly this: that a second
 * round lands beside the first rather than on top of it. Leaving it inside the handler
 * meant the only way to exercise it was to run a live drill, which is how the overwrite
 * survived unnoticed until a room of seven people hit it. */
export function collate(entries) {
  const selves = new Map();      // ref -> round -> self record
  const bySpeaker = new Map();   // ref -> round -> peer cards
  const put = (map, ref, fn) => {
    if (!map.has(ref)) map.set(ref, new Map());
    fn(map.get(ref));
  };
  for (const { key, rec } of entries) {
    const parts = key.split('/');
    if (parts.length !== 3 || !rec) continue;
    const ref = baseRef(parts[1]);
    const round = roundOf(parts[2]);
    if (rec.role === 'self' && isSelf(parts[1], parts[2])) {
      put(selves, ref, (m) => m.set(round, rec));
    } else {
      put(bySpeaker, ref, (m) => {
        if (!m.has(round)) m.set(round, []);
        m.get(round).push(rec);
      });
    }
  }
  return { selves, bySpeaker };
}

function sheetFor(self, cards) {
  const perScorer = cards
    .map((c) => ({ c, vs: OUTCOME.map((k) => c.outcome && c.outcome[k]).filter((v) => v != null) }))
    .filter((x) => x.vs.length)
    .map((x) => pct(mean(x.vs), x.c));
  const appeared = perScorer.length ? Math.round(mean(perScorer)) : null;

  const halfPct = (half) => {
    if (!half || !half.outcome) return null;
    const vs = OUTCOME.map((k) => half.outcome[k]).filter((v) => v != null);
    return vs.length ? pct(mean(vs), self) : null;
  };
  const assumedBefore = halfPct(self && self.before);
  const assumedAfter = halfPct(self && self.after);

  const gapBefore = (assumedBefore != null && appeared != null) ? assumedBefore - appeared : null;
  const gapAfter = (assumedAfter != null && appeared != null) ? assumedAfter - appeared : null;
  const closed = (gapBefore != null && gapAfter != null)
    ? Math.abs(gapBefore) - Math.abs(gapAfter) : null;

  const intent = (self && self.intent) || '';
  const relay = cards.filter((c) => c.relay).map((c) => ({
    scorerName: c.scorerName || 'Unnamed',
    wrote: c.relay,
    match: overlap(intent, c.relay)
  }));
  /* COUNT THE MATCHES, NOT THE CARDS.
     This was `relay.length ? ... : null`, which asks whether anybody WROTE
     something, when the question is whether anything could be COMPARED. When
     the room wrote relay text but every overlap() returned null, relay.length
     was truthy, mean([]) returned null, and Math.round(null) is 0.
     Every overlap is null when the speaker's intent is empty: they never wrote
     down the point they were trying to land. The sheet then told them Relay 0,
     which reads as "none of what you said got across". The truth was "you never
     said what you were aiming at", and only one of those is about speaking. */
  const relayMatches = relay.map((r) => r.match).filter((m) => m != null);
  const relayMean = relayMatches.length ? Math.round(mean(relayMatches)) : null;

  const roomMean = (field, key) => {
    const vs = cards.map((c) => c[field] && c[field][key]).filter((v) => v != null);
    return vs.length ? r1(mean(vs)) : null;
  };
  const selfVal = (half, field, key) =>
    (self && self[half] && self[half][field] && self[half][field][key] != null)
      ? self[half][field][key] : null;

  const five = {};
  FIVE.forEach((k) => { five[k] = { self: selfVal('after', 'five', k), room: roomMean('five', k) }; });
  const message = {};
  WHAT.forEach((k) => { message[k] = { self: selfVal('after', 'what', k), room: roomMean('what', k) }; });

  const reserveRoom = (() => {
    const vs = cards.map((c) => c.reserve).filter((v) => v != null);
    return vs.length ? r1(mean(vs)) : null;
  })();
  const reserveSelf = (self && self.after && self.after.reserve != null) ? self.after.reserve : null;

  const scored = Object.keys(five).filter((k) => five[k].room != null)
    .sort((a, b) => five[a].room - five[b].room);

  return {
    /* The raw fives, the message pair and reserve all go out unscaled, so the
       sheet has to say what they are out of. */
    scale: scaleOf(self || cards[0], 'drill'),
    appeared,
    assumedBefore,
    assumedAfter,
    gapBefore,
    gapAfter,
    closed,
    spread: sd(perScorer),
    scorers: perScorer.length,
    intent,
    relay,
    relayMean,
    five,
    message,
    reserve: { self: reserveSelf, room: reserveRoom,
               distance: (reserveSelf != null && reserveRoom != null)
                 ? r1(Math.abs(reserveSelf - reserveRoom)) : null },
    changeFirst: scored.length ? scored[0] : null,
    whatTheySaid: cards.filter((c) => c.fix).map((c) => c.fix),
    ownFix: (self && self.after && self.after.fix) || (self && self.before && self.before.fix) || ''
  };
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

  /* A coach reads their OWN room with their own token, or any room with the site-wide
     one. The session is therefore resolved before the token is judged, and an unknown
     session answers the same 403 as a wrong token so this cannot be used to discover
     which session names exist. */
  const session = String(body.session || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  const verdict = await mayDrive(session, String(body.token || ''));
  if (!verdict.ok) {
    return json(403, { error: 'no', configured: globalConfigured() });
  }

  let store;
  let blobs;
  try {
    store = getStore({ name: 'drill-scores', consistency: 'strong' });
    const listed = await store.list({ prefix: `${session}/` });
    blobs = listed.blobs || [];
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  /* GROUPED BY PERSON, THEN SPLIT BY ROUND.
   *
   * The speaker segment stays bare whatever the round, so everything one person did still
   * collects under one ref: one sheet, with their rounds inside it. Blending the rounds
   * into a single mean instead would quietly reward a second attempt by averaging it with
   * the first, and the whole point of speaking again is to see the two apart. */
  const entries = [];
  for (const b of blobs) {
    if (b.key.split('/').length !== 3) continue;
    let rec;
    try {
      rec = await store.get(b.key, { type: 'json' });
    } catch {
      continue;
    }
    if (rec) entries.push({ key: b.key, rec });
  }
  const { selves, bySpeaker } = collate(entries);

  const people = [];
  for (const [ref, byRound] of selves) {
    const cardRounds = bySpeaker.get(ref) || new Map();
    const nums = [...new Set([...byRound.keys(), ...cardRounds.keys()])].sort((a, b) => a - b);

    const rounds = nums.map((n) => {
      const self = byRound.get(n) || byRound.get(1) || null;
      const cards = cardRounds.get(n) || [];
      return { round: n, ...sheetFor(self, cards) };
    });

    /* The LAST round a person actually spoke in is what the top level carries, so every
       reader written before rounds existed keeps working and keeps showing something
       true. In a session where nobody spoke twice that is round one, which is exactly
       what those readers returned before. */
    const spokenIn = rounds.filter((r) => r.scorers > 0);
    const head = spokenIn.length ? spokenIn[spokenIn.length - 1] : rounds[0];
    const latestSelf = byRound.get(head ? head.round : 1) || byRound.get(1);
    const self = latestSelf || [...byRound.values()][0];

    people.push({
      ref,
      name: self.scorerName || 'Unnamed',
      email: self.speaker,
      joinedAt: self.joinedAt || self.submittedAt || '',
      wrotePoint: Boolean(self.intent),
      scoredSelfBefore: Boolean(self.before),
      scoredSelfAfter: Boolean(self.after),
      cardsGiven: 0,
      roundsSpoken: spokenIn.length,
      rounds,
      ...(head || {})
    });
  }
  /* How many cards each person gave to others, which is what tells a facilitator
     who is participating as a scorer rather than only as a speaker. */
  const given = new Map();
  for (const byRound of bySpeaker.values()) {
    for (const cards of byRound.values()) {
      for (const c of cards) {
        const k = refFor(session, c.scorer);
        given.set(k, (given.get(k) || 0) + 1);
      }
    }
  }
  people.forEach((p) => { p.cardsGiven = given.get(p.ref) || 0; });
  people.sort((a, b) => (a.joinedAt || '').localeCompare(b.joinedAt || ''));

  const spoke = people.filter((p) => p.scorers > 0);
  const num = (f) => {
    const vs = spoke.map(f).filter((v) => v != null);
    return vs.length ? Math.round(mean(vs)) : null;
  };

  const group = {
    /* The five and reserve go out as raw scores, so the page has to say what
       they are out of. Null where the room holds two scales at once, which
       should not happen inside one session and is worth seeing if it does. */
    scale: (() => {
      const set = [...new Set(people.map((p) => p.scale).filter(Boolean))];
      return set.length === 1 ? set[0] : null;
    })(),
    inTheRoom: people.length,
    spoke: spoke.length,
    appeared: num((p) => p.appeared),
    relay: num((p) => p.relayMean),
    calibration: (() => {
      const vs = spoke.map((p) => p.gapAfter).filter((v) => v != null).map(Math.abs);
      return vs.length ? Math.round(mean(vs)) : null;
    })(),
    spread: num((p) => p.spread),
    overRating: spoke.filter((p) => p.gapAfter != null && p.gapAfter >= 15).length,
    underRating: spoke.filter((p) => p.gapAfter != null && p.gapAfter <= -15).length,
    aligned: spoke.filter((p) => p.gapAfter != null && Math.abs(p.gapAfter) < 15).length,
    corrected: spoke.filter((p) => p.closed != null && p.closed >= 10).length,
    five: (() => {
      const o = {};
      FIVE.forEach((k) => {
        const vs = spoke.map((p) => p.five[k].room).filter((v) => v != null);
        o[k] = vs.length ? r1(mean(vs)) : null;
      });
      return o;
    })(),
    changeFirst: (() => {
      const o = {};
      FIVE.forEach((k) => { o[k] = spoke.filter((p) => p.changeFirst === k).length; });
      return o;
    })()
  };

  /* The group view carries no names. It is the half that can be shown to a room
     or to a client; the per-person sheets are for the person they belong to. */
  const anonymous = {
    session,
    group,
    gaps: spoke.map((p) => p.gapAfter).filter((v) => v != null).sort((a, b) => a - b),
    appearedSpread: spoke.map((p) => p.appeared).filter((v) => v != null).sort((a, b) => a - b),
    note: `${spoke.length} people scored by the room, ${people.length} in the session. `
        + 'A reading from one occasion, not a measure.'
  };

  if (body.view === 'group') {
    return json(200, anonymous);
  }
  return json(200, { ...anonymous, people });
};

/* NAMED EXPORTS FOR OFFLINE USE. The default export is the handler and stays the
   only thing Netlify calls. These exist so the sheet maths can be run against an
   export of the store without reimplementing it: on 9 November the charts sent to
   participants had to agree with sheets the room had already received, and a second
   implementation of sheetFor is a second set of numbers waiting to disagree. */
export { sheetFor, OUTCOME, FIVE, WHAT, overlap };
