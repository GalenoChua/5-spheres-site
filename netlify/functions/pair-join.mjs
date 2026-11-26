/* Joining a pair drill: a first name, and nothing else.
 *
 * The public speaking drill keys a person by their email address, because that is what
 * lets somebody read their own sheet back a week later. This drill does not offer that,
 * so it does not ask for an address: G's instruction is no accounts, a session link and a
 * first name. An address collected and never used is a liability with no upside.
 *
 * WHAT IDENTIFIES A PERSON INSTEAD. A random participant id issued here and kept in the
 * browser. It is not derived from the name, so two people called Anna are two people, and
 * nobody can work out anybody else's id from anything they can see.
 *
 * THE SESSION MUST ALREADY EXIST. A join against an unknown session is refused rather
 * than creating one, so a mistyped link cannot quietly start a second empty room that the
 * facilitator is not looking at. That is the failure drill-create was written to end.
 */
import { getStore } from '@netlify/blobs';
import { randomBytes } from 'node:crypto';
import { readSession } from './_session.mjs';
import { pKey, STORE } from './_pair.mjs';

/* Eight places is the standard for every skill drill. The cap is well above it because a
   facilitator adding a ninth in the room is a decision, not an error, and a cap that bites
   in a live session is worse than a long list. */
const MAX_PEOPLE = 24;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export default async (request) => {
  if (request.method !== 'POST') { return json(405, { error: 'POST only' }); }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'not json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'not an object' });
  }

  const session = clip(body.session, 64).toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) { return json(400, { error: 'session' }); }

  /* A name is the only thing a participant types, so the message when it is missing is
     the one sentence they will read. */
  const name = clip(body.name, 40);
  if (!name) { return json(400, { error: 'Your first name, so the room knows who you are.' }); }

  const known = await readSession(session);
  if (!known) { return json(404, { error: 'That link does not match a session.' }); }

  let store;
  try { store = getStore({ name: STORE, consistency: 'strong' }); }
  catch { return json(502, { error: 'store unavailable' }); }

  /* STRONG CONSISTENCY, FOR THE SAME REASON THE ROSTER USES IT. Eight people join inside
     the same minute and the facilitator is watching the list fill. An eventual read puts
     a lag of up to a minute between a person joining and anybody seeing it, which in a
     live room reads as a broken link and gets the person to join again. */
  try {
    /* A name correction, or a page that already holds an id. Updating rather than adding
       is what stops a refresh producing two of the same person in the groups. */
    const given = clip(body.pid, 24);
    if (/^[0-9a-f]{12}$/.test(given)) {
      const prior = await store.get(pKey(session, given), { type: 'json' });
      if (prior && prior.session === session) {
        await store.setJSON(pKey(session, given), { ...prior, name, renamedAt: new Date().toISOString() });
        return json(200, { ok: true, pid: given, name, renamed: true });
      }
    }

    const listed = await store.list({ prefix: `${session}/p/` });
    if ((listed.blobs || []).length >= MAX_PEOPLE) {
      return json(409, { error: 'This room is full.' });
    }

    const pid = randomBytes(6).toString('hex');
    await store.setJSON(pKey(session, pid), {
      v: 1, session, pid, name, joinedAt: new Date().toISOString(),
    });
    return json(200, { ok: true, pid, name });
  } catch {
    return json(502, { error: 'store unavailable' });
  }
};
