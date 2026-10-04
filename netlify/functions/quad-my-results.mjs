/* One person's own Sensing Quad numbers, read back on their own phone.
 *
 * The key for a Quad record is the email address, which a colleague knows, so
 * an address is useless as proof. This matches on the secret the page made when
 * they submitted and kept on their device.
 *
 * It returns that person's own four dimensions and their state check, with the
 * group means beside each so they can see where they sat. It never returns
 * another person's row, and it never returns a name or an address.
 */
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const DIMS = [
  ['sense_others', 'How well did I sense others?'],
  ['present', 'How present was I?'],
  ['sense_self', 'How well did I sense myself?'],
  ['sensed_by_others', 'How well did others sense me?']
];
const STATE = [
  ['physical', 'Physical'],
  ['mental', 'Mental'],
  ['emotional', 'Emotional']
];

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/* Both record shapes. Version 1 had before/after at the top level and no state
   check; a2 is round one scored again and only version 3 carries it. */
function pick(r, which) {
  if (r.version < 2) return which === 'b' ? r.after : r.before;
  if (which === 'a2') return (r.quad && r.quad.a2) || (r.quad && r.quad.a);
  return r.quad && r.quad[which];
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
  const email = String(body.email || '').trim().toLowerCase();
  const secret = String(body.secret || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^[0-9a-f]{16,80}$/.test(secret)) {
    return json(400, { error: 'who' });
  }

  let store;
  let mine;
  let rel;
  try {
    store = getStore('sensing-quad');
    mine = await store.get(`${session}/${encodeURIComponent(email)}`, { type: 'json' });
    rel = await store.get(`${session}/_release`, { type: 'json' });
  } catch {
    return json(502, { error: 'store unavailable' });
  }
  if (!mine) {
    return json(404, { error: 'no submission from that address in this session' });
  }

  const offered = createHash('sha256').update(secret).digest('hex');
  if (!mine.secretHash || mine.secretHash !== offered) {
    return json(403, { error: 'not yours' });
  }
  if (!rel || rel.released !== true) {
    return json(200, { released: false, name: mine.name || '' });
  }

  /* The group, for context only. Names and addresses never leave here. */
  let rows = [];
  try {
    const listed = await store.list({ prefix: `${session}/` });
    for (const b of listed.blobs || []) {
      if (b.key.endsWith('/_release')) continue;
      const r = await store.get(b.key, { type: 'json' });
      if (r && r.quad) rows.push(r);
    }
  } catch {
    rows = [];
  }

  const dims = DIMS.map(([key, label]) => {
    const myA2 = pick(mine, 'a2') || {};
    const myB = pick(mine, 'b') || {};
    const groupA2 = rows.map((r) => (pick(r, 'a2') || {})[key]).filter(Number.isFinite);
    const groupB = rows.map((r) => (pick(r, 'b') || {})[key]).filter(Number.isFinite);
    return {
      dimension: label,
      you: { from: myA2[key] ?? null, to: myB[key] ?? null,
             change: (Number.isFinite(myA2[key]) && Number.isFinite(myB[key]))
               ? myB[key] - myA2[key] : null },
      room: { from: r1(mean(groupA2)), to: r1(mean(groupB)) }
    };
  });

  const state = mine.state
    ? STATE.map(([key, label]) => ({
        layer: label,
        start: mine.state.start ? mine.state.start[key] ?? null : null,
        end: mine.state.end ? mine.state.end[key] ?? null : null
      }))
    : null;

  const focusLabel = (DIMS.find(([k]) => k === mine.focus) || [null, null])[1];

  return json(200, {
    released: true,
    name: mine.name || '',
    n: rows.length,
    dimensions: dims,
    state,
    focus: mine.focus || null,
    focusLabel,
    intention: mine.intention || ''
  });
};
