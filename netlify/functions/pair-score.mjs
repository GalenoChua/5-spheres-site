/* One card about one delivery.
 *
 * Three kinds land here, and they are kept apart for the rest of their life:
 *
 *   self      the person who delivered it, scoring their own attempt.
 *   receiver  the person it was delivered to. This is the card that counts. The page
 *             says so in as many words: the receiver is the only person in the room who
 *             can answer whether they left feeling respected.
 *   observer  the third person in a triad. Useful, and not the same thing.
 *
 * ── THE ROUND AND THE TURN COME FROM THE SERVER ─────────────────────────────────────
 *
 * The page says which delivery it thinks it is scoring, and the server decides whether
 * that is still open. A page that has been sitting on a phone since the first delivery
 * does not know the room has swapped, and trusting it is how a card lands against the
 * wrong conversation. drill-score carries the full account of the day that cost two real
 * readings in the public speaking drill.
 *
 * A card for a delivery that has already been scored and moved past is accepted and
 * marked `late`, not refused. Refusing throws away what somebody just typed, and they
 * will not type it twice. A card for a delivery that has not happened yet is refused,
 * because there is nothing it could be about.
 *
 * ── AND THE ROLE IS DERIVED, NOT CLAIMED ────────────────────────────────────────────
 *
 * The page does not say "I am the receiver". The groups and the turn are on the stage,
 * rolesFor() in _pair.mjs turns those into who delivers and who receives, and this
 * function reads the role off that. A claimed role is a role that can be claimed wrongly,
 * and the receiver's card is the one the whole session turns on.
 */
import { getStore } from '@netlify/blobs';
import {
  SCALE, OUTCOME, STEPS, APPROACHES, STORE,
  stepAt, stageKey, cKey, pKey, groupOf, rolesFor, roleOf, scoringStepFor,
} from './_pair.mjs';

const MAX_BYTES = 16 * 1024;

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/* Exactly the keys expected, at exactly the values allowed. A missing score is null and
   not an error: somebody who ran out of time before the swap has still given us the rest,
   and dropping the whole card to punish that costs more than it protects. */
function scores(obj, items) {
  const out = {};
  for (const item of items) {
    const v = obj && obj[item.key];
    out[item.key] = SCALE.includes(v) ? v : null;
  }
  return out;
}
const anyScored = (o) => Object.values(o).some((v) => v !== null);

export default async (request) => {
  if (request.method !== 'POST') { return json(405, { error: 'POST only' }); }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) { return json(413, { error: 'too large' }); }

  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'not json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'not an object' });
  }

  const session = clip(body.session, 64).toLowerCase();
  if (!/^[a-z0-9-]{6,64}$/.test(session)) { return json(400, { error: 'session' }); }

  const pid = clip(body.pid, 24);
  const subject = clip(body.subject, 24);
  if (!/^[0-9a-f]{12}$/.test(pid)) { return json(400, { error: 'pid' }); }
  if (!/^[0-9a-f]{12}$/.test(subject)) { return json(400, { error: 'subject' }); }

  let store;
  try { store = getStore({ name: STORE, consistency: 'strong' }); }
  catch { return json(502, { error: 'store unavailable' }); }

  /* The scorer has to be somebody who joined this session. An unknown id fails closed
     rather than being written as a card from nobody. */
  let me;
  try { me = await store.get(pKey(session, pid), { type: 'json' }); }
  catch { return json(502, { error: 'store unavailable' }); }
  if (!me) { return json(404, { error: 'Rejoin from the session link: this device is not in the room.' }); }

  let stage;
  try { stage = await store.get(stageKey(session), { type: 'json' }); }
  catch { return json(502, { error: 'store unavailable' }); }
  if (!stage) { return json(409, { error: 'The session has not started yet.' }); }

  const here = stepAt(stage.step) || null;
  const currentStep = here ? Number(stage.step) : 0;

  /* WHICH DELIVERY IS THIS CARD ABOUT? The page's answer, checked against the clock. */
  const round = Number(body.round);
  const turn = Number(body.turn);
  const owns = scoringStepFor(round, turn);
  if (owns < 0) { return json(400, { error: 'round' }); }
  if (owns > currentStep) {
    return json(409, { error: 'That delivery has not happened yet. Refresh the page.' });
  }
  const late = owns < currentStep;

  const groups = (stage.groupsByRound && stage.groupsByRound[round]) || [];
  const group = groupOf(groups, pid);
  if (!group) { return json(409, { error: 'You were not in a group for that round.' }); }

  const roles = rolesFor(group, turn);
  if (!roles) { return json(409, { error: 'There was no delivery in your group on that turn.' }); }
  if (roles.subject !== subject) {
    /* The one case worth a specific sentence: the page is a swap behind, so it is offering
       a card about the wrong person in the right group. */
    return json(409, { error: 'Your group has moved on. Refresh the page.' });
  }
  const role = roleOf(group, turn, pid);
  if (!role) { return json(409, { error: 'You were not part of that delivery.' }); }

  const outcome = scores(body.outcome, OUTCOME);
  const steps = scores(body.steps, STEPS);
  const fix = clip(body.fix, 600);
  const approach = APPROACHES.includes(body.approach) ? body.approach : null;

  /* An empty card is a page bug or a stray tap, not a judgement. Storing it drags a mean
     toward nothing and makes "nobody has scored this yet" unreadable. */
  if (!anyScored(outcome) && !anyScored(steps) && !fix && !approach) {
    return json(400, { error: 'empty card' });
  }

  const now = new Date().toISOString();
  const key = cKey(session, round, turn, subject, pid);
  let prior = null;
  try { prior = await store.get(key, { type: 'json' }); } catch { prior = null; }

  const record = {
    v: 1,
    /* Named on the record so a reader never has to infer it, which is the rule _scale.mjs
       exists to enforce. */
    scale: SCALE[SCALE.length - 1],
    session, round, turn, subject,
    scorer: pid,
    scorerName: clip(me.name, 40),
    role,
    outcome, steps, approach, fix,
    submittedAt: now,
    firstSubmittedAt: (prior && prior.firstSubmittedAt) || now,
    late: late || (prior && prior.late === true) || false,
  };

  try { await store.setJSON(key, record); }
  catch {
    /* Say it plainly. A failure here must never read as a success to the person who just
       filled the card, because they will not fill it twice. */
    return json(502, { error: 'That did not save. Try again.' });
  }

  return json(200, { ok: true, role, late: record.late });
};
