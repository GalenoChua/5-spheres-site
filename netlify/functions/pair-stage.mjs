/* WHERE THE ROOM IS, AND WHO IS WITH WHOM.
 *
 * GET  returns the state every page reads: who has joined, which step the session is on,
 *      the groups for the current round, and when the clock for this step runs out.
 * POST moves it, and only the facilitator can, gated by the session's own token through
 *      mayDrive in _session.mjs.
 *
 * ── ONE WRITER, EVERYBODY ELSE READS ────────────────────────────────────────────────
 *
 * The same rule drill-stage states: in a live session nobody should be typing a name or
 * deciding for themselves which card they are on, because that is a dozen chances a
 * minute to score the wrong person. So a participant page never decides its own role. It
 * reads the groups and the turn and works the role out from them, and because the
 * derivation lives in _pair.mjs, the panel and the phone cannot reach different answers.
 *
 * ── WHY THE STEP CARRIES THE ROUND AND THE TURN ─────────────────────────────────────
 *
 * The 110 minutes in _pair.mjs name the round and the turn for every step. So the
 * facilitator advances a step and the round and the turn follow, rather than being three
 * separate things to keep in step by hand. The one at the top of the list that moved on
 * its own is the one that goes wrong at minute seventy.
 *
 * ── THE CLOCK IS A DEADLINE, NOT A COUNTDOWN ────────────────────────────────────────
 *
 * Stored as the instant the step is due to end, stamped by the server. A countdown held
 * in each page drifts apart between phones and stops when a phone sleeps, and this tool
 * is explicitly meant to sit in a second tab beside Google Meet, where a background tab
 * is throttled. A deadline read off a shared clock survives all of that.
 */
import { getStore } from '@netlify/blobs';
import { mayDrive, globalConfigured, readSession } from './_session.mjs';
import {
  SEQUENCE, SEQUENCE_MINS, stepAt, makeGroups, stageKey, parseCardKey,
  OUTCOME, STEPS, APPROACHES, SCALE_MAX, STORE,
} from './_pair.mjs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const okSession = (s) => /^[a-z0-9-]{6,64}$/.test(s);

function open() {
  return getStore({ name: STORE, consistency: 'strong' });
}

const EMPTY_STAGE = { v: 1, step: 0, groupsByRound: {}, timerEndsAt: null, released: false, test: null };

async function readStage(store, session) {
  try {
    const rec = await store.get(stageKey(session), { type: 'json' });
    return rec || { ...EMPTY_STAGE };
  } catch {
    return { ...EMPTY_STAGE };
  }
}

/* Everybody in the room, oldest first, so a late arrival is added to the bottom of the
   facilitator's list rather than reshuffling it under their finger. */
async function readPeople(store, session) {
  const listed = await store.list({ prefix: `${session}/p/` });
  const keys = (listed.blobs || []).map((b) => b.key);
  const recs = await Promise.all(keys.map(async (k) => {
    try { return await store.get(k, { type: 'json' }); } catch { return null; }
  }));
  return recs.filter(Boolean)
    .map((r) => ({ pid: r.pid, name: r.name, joinedAt: r.joinedAt }))
    .sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
}

/* How many cards have landed for each delivery, which is the only thing that tells the
   facilitator whether it is safe to move on. Counted per round and turn and per subject,
   because a mixed room of pairs and one triad expects a different number from each group. */
async function countCards(store, session) {
  const listed = await store.list({ prefix: `${session}/c/` });
  const counts = {};
  for (const b of listed.blobs || []) {
    const k = parseCardKey(b.key);
    if (!k) { continue; }
    const id = `${k.round}.${k.turn}.${k.subject}`;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

function shape(session, stage, people, counts) {
  const step = stepAt(stage.step) || SEQUENCE[0];
  const round = step.round || 0;
  const groups = (stage.groupsByRound && stage.groupsByRound[round]) || [];
  return {
    ok: true,
    session,
    scaleMax: SCALE_MAX,
    questions: { outcome: OUTCOME, steps: STEPS, approaches: APPROACHES },
    sequence: SEQUENCE.map((s, i) => ({ i, ...s })),
    sequenceMins: SEQUENCE_MINS,
    stage: {
      step: stage.step,
      stepKey: step.key,
      stepLabel: step.label,
      stepMins: step.mins,
      scoring: step.scores === true,
      round,
      turn: step.turn || 0,
      groups,
      timerEndsAt: stage.timerEndsAt || null,
      released: stage.released === true,
      test: typeof stage.test === 'boolean' ? stage.test : null,
      changedAt: stage.changedAt || null,
    },
    people,
    cards: counts || {},
    /* Sent so a page can tell a slow poll from a clock that is wrong on the device. A
       phone an hour out would otherwise show a step as already over. */
    now: new Date().toISOString(),
  };
}

export default async (request) => {
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const session = (url.searchParams.get('session') || '').trim().toLowerCase();
    if (!okSession(session)) { return json(400, { error: 'session' }); }
    let store;
    try { store = open(); } catch { return json(502, { error: 'store unavailable' }); }
    try {
      const [stage, people, counts] = await Promise.all([
        readStage(store, session), readPeople(store, session), countCards(store, session),
      ]);
      return json(200, shape(session, stage, people, counts));
    } catch {
      return json(502, { error: 'store unavailable' });
    }
  }

  if (request.method !== 'POST') { return json(405, { error: 'GET or POST' }); }

  let body;
  try { body = await request.json(); } catch { return json(400, { error: 'not json' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { error: 'not an object' });
  }

  const session = clip(body.session, 64).toLowerCase();
  if (!okSession(session)) { return json(400, { error: 'session' }); }

  /* THE SESSION IS READ BEFORE THE TOKEN IS JUDGED, so a room driven by its own token
     works as well as one driven by the site-wide one. Same order as drill-stage, for the
     same reason: the session name has to be valid before mayDrive can use it. */
  const verdict = await mayDrive(session, String(body.token || ''));
  if (!verdict.ok) {
    /* Which half is wrong, without saying anything about the value. An unset variable and
       a wrong token are otherwise the same refusal, and the session does not start either
       way. */
    return json(403, { error: 'no', configured: globalConfigured() });
  }

  /* Proving the token must never write. The panel checks it before it has polled
     anything, and an earlier version of the public speaking panel proved it by writing
     the floor state it thought it had, which knocked the speaker off mid-sentence. */
  if (body.verify === true) {
    const known = await readSession(session);
    return json(200, { ok: true, verified: true, label: (known && known.label) || null });
  }

  let store;
  try { store = open(); } catch { return json(502, { error: 'store unavailable' }); }

  try {
    const prior = await readStage(store, session);
    const next = {
      ...EMPTY_STAGE,
      ...prior,
      groupsByRound: (prior.groupsByRound && typeof prior.groupsByRound === 'object')
        ? { ...prior.groupsByRound } : {},
    };

    /* ABSENT IS NOT THE SAME AS SENT. A call that only starts the clock must leave the
       step exactly where it is, which is why every field below is tested for presence
       rather than for truth. drill-stage learned this when a call that declared the
       session type moved the floor as a side effect. */
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);

    if (has('step')) {
      const n = Number(body.step);
      if (!Number.isInteger(n) || n < 0 || n >= SEQUENCE.length) {
        return json(400, { error: 'step' });
      }
      next.step = n;
      /* A new step gets a fresh clock only when the facilitator asks for one. Moving the
         step and starting the clock are one tap on the panel and two fields here, so a
         facilitator who moves early does not also lose the ability to pause. */
      if (body.timer === true) {
        next.timerEndsAt = new Date(Date.now() + (stepAt(n).mins * 60 * 1000)).toISOString();
      } else if (body.timer === false) {
        next.timerEndsAt = null;
      }
    } else if (has('timer')) {
      const step = stepAt(next.step) || SEQUENCE[0];
      next.timerEndsAt = body.timer === false
        ? null
        : new Date(Date.now() + (step.mins * 60 * 1000)).toISOString();
    }

    /* MAKING THE GROUPS IS AN ACT, NOT A SETTING, and it is kept per round so round one
       is still readable after round two is drawn. Overwriting one list would leave every
       round-one card pointing at a pairing that no longer exists, and the cards are
       keyed by person, so nothing would error. The summary would simply describe the
       wrong conversation. */
    if (body.groups === 'make') {
      const round = (stepAt(next.step) || SEQUENCE[0]).round || 0;
      if (!round) { return json(400, { error: 'that step is not in a round' }); }
      const people = await readPeople(store, session);
      /* Two is a pair and a pair is a drill. Three or more is where the triad logic
         starts to matter. Refusing at two would have left the facilitator of a small room
         with a message and no way past it. */
      if (people.length < 2) {
        return json(400, {
          error: 'Only ' + people.length + ' here so far. Draw the groups once a second person has joined.',
          people: people.length,
        });
      }
      const avoid = Object.keys(next.groupsByRound)
        .filter((r) => Number(r) !== round)
        .flatMap((r) => next.groupsByRound[r] || []);
      next.groupsByRound[round] = makeGroups(people.map((p) => p.pid), avoid);
    } else if (Array.isArray(body.groups)) {
      /* The facilitator moving one person by hand. Validated against who has joined, so a
         stale panel cannot write a group around somebody who has left the list. */
      const round = (stepAt(next.step) || SEQUENCE[0]).round || 0;
      if (!round) { return json(400, { error: 'that step is not in a round' }); }
      const people = await readPeople(store, session);
      const known = new Set(people.map((p) => p.pid));
      const groups = body.groups
        .filter(Array.isArray)
        .map((g) => g.map((v) => clip(v, 24)).filter((v) => known.has(v)))
        .filter((g) => g.length >= 2);
      const seen = new Set();
      for (const g of groups) {
        for (const pid of g) {
          if (seen.has(pid)) { return json(400, { error: 'somebody is in two groups' }); }
          seen.add(pid);
        }
      }
      next.groupsByRound[round] = groups;
    }

    if (has('release')) { next.released = body.release === true; }

    /* Sticky once declared, exactly as drill-stage keeps it: every call after the first
       says nothing about it, and a rehearsal must not quietly become an unknown. */
    if (typeof body.test === 'boolean') { next.test = body.test; }

    next.changedAt = new Date().toISOString();
    await store.setJSON(stageKey(session), next);

    const [people, counts] = await Promise.all([
      readPeople(store, session), countCards(store, session),
    ]);
    return json(200, { ...shape(session, next, people, counts), authBy: verdict.by });
  } catch {
    return json(502, { error: 'store unavailable' });
  }
};
