/* Whether the room can see its own Sensing Quad numbers yet.
 *
 * The same separation the drill uses. Results landing on every phone while the
 * session is still running changes what people do next, so the facilitator says
 * when, and it is a deliberate act rather than a side effect of anything else.
 *
 * Token in a POST body. GET reads the flag and needs no token, because whether
 * the room has been released is not a secret and both the participant page and
 * the room screen have to be able to ask.
 */
import { getStore } from '@netlify/blobs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
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

const okSession = (s) => /^[a-z0-9-]{6,64}$/.test(s);

export default async (request) => {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const session = String(url.searchParams.get('session') || '').trim().toLowerCase();
    if (!okSession(session)) return json(400, { error: 'session' });
    try {
      const store = getStore('sensing-quad');
      const rec = await store.get(`${session}/_release`, { type: 'json' });
      return json(200, { session, released: Boolean(rec && rec.released) });
    } catch {
      return json(502, { error: 'store unavailable' });
    }
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'GET or POST' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'not json' });
  }

  const expected = process.env.QUAD_TOKEN || '';
  if (!tokenOk(String(body.token || ''), expected)) {
    return json(403, { error: 'no', configured: Boolean(expected) });
  }

  const session = String(body.session || '').trim().toLowerCase();
  if (!okSession(session)) return json(400, { error: 'session' });

  const released = body.released === true;
  try {
    const store = getStore('sensing-quad');
    await store.setJSON(`${session}/_release`, {
      released,
      changedAt: new Date().toISOString()
    });
  } catch {
    return json(502, { error: 'store unavailable' });
  }
  return json(200, { ok: true, session, released });
};
