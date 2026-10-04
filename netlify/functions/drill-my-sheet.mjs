/* One person's own sheet, read back on their own phone.
 *
 * A ref is a digest of the address, so anybody who knows a colleague's email can
 * work out their ref. That makes a ref useless as a key to somebody's results.
 * This matches instead on the secret the page generated when they joined and
 * kept on their device, which nobody else has.
 *
 * It also waits for the facilitator to release the session. Results landing on
 * twelve phones while the eleventh person is still speaking would turn the last
 * turns of the room into a different event.
 */
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const OUTCOME = ['confident', 'clear', 'believed'];
const FIVE = ['pause', 'pace', 'volume', 'emotion', 'tonality'];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (m) => (m === null ? null : Math.round((m - 1) / 4 * 100));
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

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

  const session = String(body.session || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) {
    return json(400, { error: 'session' });
  }
  const ref = String(body.ref || '').trim();
  const secret = String(body.secret || '').trim();
  if (!/^[0-9a-f]{12}$/.test(ref) || !/^[0-9a-f]{16,80}$/.test(secret)) {
    return json(400, { error: 'who' });
  }

  let store;
  try {
    store = getStore('drill-scores');
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  let self;
  let stage;
  try {
    self = await store.get(`${session}/${ref}/${ref}`, { type: 'json' });
    stage = await store.get(`${session}/_stage`, { type: 'json' });
  } catch {
    return json(502, { error: 'store unavailable' });
  }
  if (!self || self.role !== 'self') {
    return json(404, { error: 'no such person in this session' });
  }

  const offered = createHash('sha256').update(secret).digest('hex');
  if (!self.secretHash || self.secretHash !== offered) {
    return json(403, { error: 'not yours' });
  }

  /* The facilitator decides when the room can see its sheets. */
  if (!stage || stage.released !== true) {
    return json(200, { released: false, name: self.scorerName || '' });
  }

  let blobs;
  try {
    const listed = await store.list({ prefix: `${session}/${ref}/` });
    blobs = listed.blobs || [];
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  const cards = [];
  for (const b of blobs) {
    const parts = b.key.split('/');
    if (parts.length !== 3 || parts[2] === ref) continue;
    try {
      const rec = await store.get(b.key, { type: 'json' });
      if (rec) cards.push(rec);
    } catch { /* one unreadable card is not worth failing the sheet */ }
  }

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
  const assumedBefore = halfPct(self.before);
  const assumedAfter = halfPct(self.after);
  const gapAfter = (assumedAfter != null && appeared != null) ? assumedAfter - appeared : null;
  const gapBefore = (assumedBefore != null && appeared != null) ? assumedBefore - appeared : null;

  const intent = self.intent || '';
  const relay = cards.filter((c) => c.relay).map((c) => ({
    wrote: c.relay,
    match: overlap(intent, c.relay)
  }));

  const five = {};
  FIVE.forEach((k) => {
    const vs = cards.map((c) => c.five && c.five[k]).filter((v) => v != null);
    five[k] = {
      self: (self.after && self.after.five && self.after.five[k] != null) ? self.after.five[k] : null,
      room: vs.length ? r1(mean(vs)) : null
    };
  });
  const scored = FIVE.filter((k) => five[k].room != null).sort((a, b) => five[a].room - five[b].room);

  return json(200, {
    released: true,
    name: self.scorerName || '',
    scorers: perScorer.length,
    appeared,
    assumedBefore,
    assumedAfter,
    gapBefore,
    gapAfter,
    closed: (gapBefore != null && gapAfter != null)
      ? Math.abs(gapBefore) - Math.abs(gapAfter) : null,
    relayMean: relay.length
      ? Math.round(mean(relay.map((r) => r.match).filter((m) => m != null))) : null,
    intent,
    relay,
    five,
    changeFirst: scored.length ? scored[0] : null,
    whatTheySaid: cards.filter((c) => c.fix).map((c) => c.fix)
  });
};
