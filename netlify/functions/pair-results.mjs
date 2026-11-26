/* THE FOLLOW-UP SUMMARY, ONE BLOCK PER PERSON.
 *
 * What the facilitator reads after the room has gone, and what the follow-up email is
 * written from. POST, not GET, and the token travels in the body: a token in a query
 * string ends up in a referrer and in every log on the way, and an & in the value gets it
 * cut in half. drill-results made the same choice for the same reason.
 *
 * ── THE THREE READS ARE NEVER AVERAGED TOGETHER ─────────────────────────────────────
 *
 * The page sells the gap, not the mark: "Your own scores, the scores from the people
 * watching, and the score from the person who actually received it. Where those three
 * disagree is the part worth your attention." One blended number is the one output that
 * destroys the thing the session is for, so the receiver, the observers and the person's
 * own read stay in three columns from here to the screen.
 *
 * `gap` is the receiver minus the self, so a positive number is somebody who did better
 * than they thought, and a negative one is somebody who does not know how it landed. The
 * second is the follow-up worth having.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────────────
 *
 * No per-participant self-service sheet. The public speaking drill has one, built on a
 * secret the participant's own device holds, and it is the reason that drill asks for an
 * email address. This drill asks for a first name and nothing else, so there is nobody to
 * send a sheet to and nothing to authenticate them with. The facilitator sends the
 * follow-up by hand from this. Stated rather than left as an apparent omission.
 */
import { getStore } from '@netlify/blobs';
import { mayDrive, globalConfigured } from './_session.mjs';
import {
  STORE, stageKey, parseCardKey, collate, summaryRow,
  OUTCOME, STEPS, SEQUENCE,
} from './_pair.mjs';

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

  /* The session is resolved before the token is judged, so a coach reads their own room
     with their own token or any room with the site-wide one. An unknown session answers
     the same 403 as a wrong token, so this cannot be used to find out which rooms exist. */
  const verdict = await mayDrive(session, String(body.token || ''));
  if (!verdict.ok) { return json(403, { error: 'no', configured: globalConfigured() }); }

  let store;
  try { store = getStore({ name: STORE, consistency: 'strong' }); }
  catch { return json(502, { error: 'store unavailable' }); }

  let people = [];
  let cards = [];
  let stage = null;
  try {
    stage = await store.get(stageKey(session), { type: 'json' });
    const listed = await store.list({ prefix: `${session}/` });
    const keys = (listed.blobs || []).map((b) => b.key);
    /* Everything at once. The public speaking roster measured a sequential await inside
       the loop at about 56ms a record, which at eighty records is already slower than the
       interval the panel polls on. This reader runs after the session rather than during
       it, and it still has no reason to be the slow one. */
    const fetched = await Promise.all(keys.map(async (k) => {
      try { return [k, await store.get(k, { type: 'json' })]; } catch { return [k, null]; }
    }));
    for (const [k, rec] of fetched) {
      if (!rec) { continue; }
      if (parseCardKey(k)) { cards.push({ key: k, rec }); }
      else if (k.includes('/p/')) { people.push(rec); }
    }
  } catch {
    return json(502, { error: 'store unavailable' });
  }

  people.sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
  const collated = collate(people, cards);

  const participants = [...collated.values()].map((person) => {
    const rounds = [...person.rounds.values()].sort((a, b) => a.round - b.round);
    return {
      pid: person.pid,
      name: person.name,
      rounds: rounds.map((slot) => ({
        ...summaryRow(slot),
        receiverName: slot.receiver ? slot.receiver.scorerName : null,
        /* The written answers, which are the part a follow-up actually quotes. Kept
           labelled by who wrote them: "they said you rushed the decision" and "you said
           you rushed the decision" are different conversations. */
        notes: [
          slot.self && slot.self.fix ? { from: 'self', text: slot.self.fix } : null,
          slot.receiver && slot.receiver.fix
            ? { from: 'receiver', name: slot.receiver.scorerName, text: slot.receiver.fix } : null,
          ...slot.observers
            .filter((o) => o.fix)
            .map((o) => ({ from: 'observer', name: o.scorerName, text: o.fix })),
        ].filter(Boolean),
        /* Item by item as well as the mean, because "respected" at 4 inside a decent mean
           is the finding, and a mean hides it. */
        items: {
          outcome: OUTCOME.map((q) => ({
            key: q.key, label: q.label,
            self: slot.self ? (slot.self.outcome || {})[q.key] ?? null : null,
            receiver: slot.receiver ? (slot.receiver.outcome || {})[q.key] ?? null : null,
          })),
          steps: STEPS.map((q) => ({
            key: q.key, label: q.label,
            self: slot.self ? (slot.self.steps || {})[q.key] ?? null : null,
            receiver: slot.receiver ? (slot.receiver.steps || {})[q.key] ?? null : null,
          })),
        },
      })),
    };
  });

  /* Said plainly rather than left to be counted off the rows: a session where half the
     cards never landed is a session whose summary should not be read as complete. */
  const expected = cards.length;
  const withReceiver = participants.reduce(
    (n, p) => n + p.rounds.filter((r) => r.receiver !== null).length, 0,
  );
  const deliveries = participants.reduce((n, p) => n + p.rounds.length, 0);

  return json(200, {
    ok: true,
    session,
    test: stage && typeof stage.test === 'boolean' ? stage.test : null,
    step: stage ? stage.step : null,
    stepLabel: stage && SEQUENCE[stage.step] ? SEQUENCE[stage.step].label : null,
    released: Boolean(stage && stage.released === true),
    counts: { people: people.length, cards: expected, deliveries, withReceiverCard: withReceiver },
    participants,
    authBy: verdict.by,
    /* Exported for the facilitator's own eye: a delivery with no receiver card is the one
       row in the summary that cannot be followed up, and it should be visible rather than
       inferred from a blank. */
    note: deliveries && withReceiver < deliveries
      ? `${deliveries - withReceiver} of ${deliveries} deliveries have no card from the person who received it.`
      : null,
  });
};
