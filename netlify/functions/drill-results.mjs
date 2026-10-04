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
import { refFor } from './drill-roster.mjs';

const OUTCOME = ['confident', 'clear', 'believed'];
const FIVE = ['pause', 'pace', 'volume', 'emotion', 'tonality'];
const WHAT = ['held', 'aimed'];

const json = (status, body) =>
  new Response(JSON.stringify(body, null, 1), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

function tokenOk(given, expected) {
  if (!expected || !given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (m) => (m === null ? null : Math.round((m - 1) / 4 * 100));
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

function sheetFor(self, cards) {
  const perScorer = cards
    .map((c) => OUTCOME.map((k) => c.outcome && c.outcome[k]).filter((v) => v != null))
    .filter((vs) => vs.length)
    .map((vs) => pct(mean(vs)));
  const appeared = perScorer.length ? Math.round(mean(perScorer)) : null;

  const halfPct = (half) => {
    if (!half || !half.outcome) return null;
    const vs = OUTCOME.map((k) => half.outcome[k]).filter((v) => v != null);
    return vs.length ? pct(mean(vs)) : null;
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
  const relayMean = relay.length ? Math.round(mean(relay.map((r) => r.match).filter((m) => m != null))) : null;

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

  const expected = process.env.DRILL_TOKEN || '';
  if (!tokenOk(String(body.token || ''), expected)) {
    return json(403, { error: 'no', configured: Boolean(expected) });
  }

  const session = String(body.session || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }

  let store;
  let blobs;
  try {
    store = getStore('drill-scores');
    const listed = await store.list({ prefix: `${session}/` });
    blobs = listed.blobs || [];
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  const selves = new Map();
  const bySpeaker = new Map();
  for (const b of blobs) {
    const parts = b.key.split('/');
    if (parts.length !== 3) continue;
    let rec;
    try {
      rec = await store.get(b.key, { type: 'json' });
    } catch {
      continue;
    }
    if (!rec) continue;
    if (rec.role === 'self' && parts[1] === parts[2]) {
      selves.set(parts[1], rec);
    } else {
      if (!bySpeaker.has(parts[1])) bySpeaker.set(parts[1], []);
      bySpeaker.get(parts[1]).push(rec);
    }
  }

  const people = [];
  for (const [ref, self] of selves) {
    const cards = bySpeaker.get(ref) || [];
    const sheet = sheetFor(self, cards);
    people.push({
      ref,
      name: self.scorerName || 'Unnamed',
      email: self.speaker,
      joinedAt: self.joinedAt || self.submittedAt || '',
      wrotePoint: Boolean(self.intent),
      scoredSelfBefore: Boolean(self.before),
      scoredSelfAfter: Boolean(self.after),
      cardsGiven: 0,
      ...sheet
    });
  }
  /* How many cards each person gave to others, which is what tells a facilitator
     who is participating as a scorer rather than only as a speaker. */
  const given = new Map();
  for (const cards of bySpeaker.values()) {
    for (const c of cards) {
      const k = refFor(session, c.scorer);
      given.set(k, (given.get(k) || 0) + 1);
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
