/* THE PAIR AND TRIAD ENGINE.
 *
 * The public speaking drill puts one person on the floor and has the whole room score
 * them. Letting Someone Go does not work that way: everybody is busy at once, in pairs or
 * in a triad, and the score that matters comes from the one person who received the news.
 * So the floor model does not fit, and this is the second shape rather than a flag on the
 * first.
 *
 * What it keeps from the first: the scale (1 to 10, from _scale.mjs, not a new one), the
 * rule that the SERVER decides which round a card belongs to, and the rule that a value
 * read in several files is declared once. _scale.mjs says why: a reader that disagrees
 * with the writer does not error, it answers wrongly and plausibly.
 *
 * WHY THIS FILE IMPORTS NO STORE. Everything here is a pure function, so the tests run it
 * with `node`, with no @netlify/blobs installed and no network. The functions that do
 * touch the store import this; this imports nothing of theirs.
 *
 * MEANT TO BE REUSED. The sensing drill and the pitching drill are the same shape: small
 * groups, a turn each, the people in the group score the turn. The question set is the
 * only part that is specific to Letting Someone Go, and it is the first export here so
 * that a second drill is a second QUESTIONS block rather than a second engine.
 */
import { SCALE, SCALE_MAX } from './_scale.mjs';

/* ── THE QUESTION SET ────────────────────────────────────────────────────────────────
 *
 * Every item is lifted from the live page at /events/letting-someone-go/ rather than
 * invented here, because the page is what the room was sold and the scoring card has to
 * ask what they were told it would ask.
 *
 * OUTCOME is the three things the page says are at stake: that they left feeling
 * respected, which is the question the whole session turns on; that they knew what was
 * actually said, which is the sandwich failure the page names; and that they would still
 * be an ally, which is the page's own test of getting it right.
 *
 * STEPS are the five the page teaches, in the page's order. Scored, because the second
 * approach is the one most leaders have never practised and the steps are what hold it
 * together.
 */
export const OUTCOME = [
  { key: 'respected', label: 'They left feeling respected' },
  { key: 'clear',     label: 'They knew exactly what had been decided' },
  { key: 'ally',      label: 'They would still speak well of the company' },
];

export const STEPS = [
  { key: 'common',   label: 'Started from shared purpose and common ground' },
  { key: 'cost',     label: 'Named what had gone wrong, and what it was costing' },
  { key: 'decision', label: 'Stated the decision plainly' },
  { key: 'forward',  label: 'Offered a way forward, support, and what happens next' },
  { key: 'thanks',   label: 'Thanked them for their time and their contribution' },
];

/* The two ways the page teaches. Recorded, never scored: which one the conversation
   called for is the facilitator's teaching point, not a mark out of ten. */
export const APPROACHES = ['band-aid', 'values'];

/* Who is scoring. The receiver's card is the one that counts, and it is kept apart from
   the observer's everywhere downstream for that reason. */
export const ROLES = ['self', 'receiver', 'observer'];

export { SCALE, SCALE_MAX };

/* ── THE 110 MINUTES ─────────────────────────────────────────────────────────────────
 *
 * The session is 110 minutes in events/_events.json, so the sequence is built to that
 * number and not to a round one. It is the tool's DEFAULT and nothing more: the
 * facilitator can sit on a step or skip one, and the clock follows the step rather than
 * the step following the clock.
 *
 * Two rounds, because one practice of each approach is the point of the night, and both
 * halves of a pair have to deliver. Four deliveries per person over the session: two of
 * their own and two received.
 *
 * `scores` marks the steps where a card is open. A card open during a delivery is how a
 * room watches a screen instead of a person.
 */
export const SEQUENCE = [
  { key: 'welcome',   mins: 5,  round: 0, label: 'Welcome, and the one question this turns on' },
  { key: 'theory',    mins: 20, round: 0, label: 'The band-aid, the one built from your values, the five steps' },
  { key: 'groups1',   mins: 5,  round: 1, label: 'Round one: groups, scenario, who goes first' },
  { key: 'deliver1a', mins: 8,  round: 1, turn: 1, label: 'Round one, first delivery' },
  { key: 'score1a',   mins: 4,  round: 1, turn: 1, scores: true, label: 'Round one, score the first delivery' },
  { key: 'deliver1b', mins: 8,  round: 1, turn: 2, label: 'Round one, swap, second delivery' },
  { key: 'score1b',   mins: 4,  round: 1, turn: 2, scores: true, label: 'Round one, score the second delivery' },
  { key: 'break',     mins: 5,  round: 1, label: 'Break' },
  { key: 'groups2',   mins: 4,  round: 2, label: 'Round two: new pairing, the other approach' },
  { key: 'deliver2a', mins: 8,  round: 2, turn: 1, label: 'Round two, first delivery' },
  { key: 'score2a',   mins: 4,  round: 2, turn: 1, scores: true, label: 'Round two, score the first delivery' },
  { key: 'deliver2b', mins: 8,  round: 2, turn: 2, label: 'Round two, swap, second delivery' },
  { key: 'score2b',   mins: 4,  round: 2, turn: 2, scores: true, label: 'Round two, score the second delivery' },
  { key: 'readback',  mins: 10, round: 2, label: 'Where the three scores disagree, read back' },
  { key: 'debrief',   mins: 13, round: 2, label: 'Debrief, and the one thing each person takes' },
];

export const SEQUENCE_MINS = SEQUENCE.reduce((n, s) => n + s.mins, 0);

export const stepAt = (i) => SEQUENCE[Number(i)] || null;
export const stepIndex = (key) => SEQUENCE.findIndex((s) => s.key === key);

/* ── GROUPS ──────────────────────────────────────────────────────────────────────────
 *
 * Pairs, and ONE triad when the count is odd. Not two triads, not a spare person: eight
 * places is the standard for every skill drill, and the count that actually turns up is
 * whatever it is. A triad is the only shape that absorbs an odd number without leaving
 * somebody watching, and the page already sells "triad or pair".
 *
 * A group of one cannot happen: with three or more people the odd one joins a pair, and
 * below three there is no drill to run, which the facilitator sees as a refusal rather
 * than as a room of solo groups.
 *
 * ROUND TWO MUST NOT REPEAT ROUND ONE. Delivering the same news to the same person twice
 * is half a session. `avoid` carries the pairings already used and the shuffle retries
 * until it finds a set that does not reuse one, then gives up and returns its best
 * attempt rather than hanging: a repeat is a disappointment, a hang is a dead room.
 */
export function makeGroups(ids, avoid = [], rand = Math.random) {
  const list = ids.slice();
  if (list.length < 3) { return list.length === 2 ? [list.slice()] : []; }

  const used = new Set((avoid || []).map(pairKey).filter(Boolean).flat());
  let best = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const pool = shuffle(list, rand);
    const groups = [];
    /* The triad is taken off the front when the count is odd, so the rest divides. */
    if (pool.length % 2 === 1) { groups.push(pool.splice(0, 3)); }
    while (pool.length) { groups.push(pool.splice(0, 2)); }
    const repeats = groups.reduce((n, g) => n + pairKey(g).filter((k) => used.has(k)).length, 0);
    if (repeats === 0) { return groups; }
    if (!best || repeats < best.repeats) { best = { groups, repeats }; }
  }
  return best.groups;
}

/* Every unordered pair inside a group, as a stable string, so round two can ask whether
   two people have already worked together. A triad contributes its three pairs. */
export function pairKey(group) {
  const g = (group || []).filter(Boolean);
  const out = [];
  for (let i = 0; i < g.length; i += 1) {
    for (let j = i + 1; j < g.length; j += 1) {
      out.push([g[i], g[j]].sort().join('|'));
    }
  }
  return out;
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* ── WHO IS DOING WHAT, THIS TURN ────────────────────────────────────────────────────
 *
 * Derived, never stored. The stage holds the groups and the turn number; every page works
 * out its own role from those two, which is what stops a participant page and the
 * facilitator panel disagreeing about who is delivering.
 *
 * The subject delivers. The NEXT person in the group receives. In a triad the remaining
 * person observes, and their card is kept separate because the page is explicit that the
 * receiver is the only one who can answer the question the session turns on.
 *
 * A turn beyond the size of the group returns nothing, which is what a pair looks like on
 * turn three. That is a real state: the facilitator moving a mixed room of pairs and one
 * triad through three turns leaves the pairs idle on the third.
 */
export function rolesFor(group, turn) {
  const g = (group || []).filter(Boolean);
  const t = Number(turn);
  if (g.length < 2 || !Number.isFinite(t) || t < 1 || t > g.length) { return null; }
  const subject = g[t - 1];
  const receiver = g[t % g.length];
  return { subject, receiver, observers: g.filter((p) => p !== subject && p !== receiver) };
}

export function roleOf(group, turn, pid) {
  const r = rolesFor(group, turn);
  if (!r) { return null; }
  if (r.subject === pid) { return 'self'; }
  if (r.receiver === pid) { return 'receiver'; }
  return r.observers.includes(pid) ? 'observer' : null;
}

export const groupOf = (groups, pid) =>
  (groups || []).find((g) => (g || []).includes(pid)) || null;

/* ── KEYS ────────────────────────────────────────────────────────────────────────────
 *
 * Participants under p/, cards under c/, and the stage on its own. Three prefixes rather
 * than one flat space, because every reader here lists the whole session and then has to
 * tell a person from a card. The public speaking store tells them apart by counting path
 * segments, which is why adding a round there could not add a segment. A prefix costs
 * nothing and cannot be miscounted.
 *
 * The round is IN the card key. A second round scoring the same person is a second card,
 * not a replacement, which is the whole lesson of _rounds.mjs restated in a shape that
 * had no history to protect.
 */
/* One store for every pair drill, named once here because four functions open it and a
   fifth that opens a store of a slightly different name reads an empty room and reports
   it as a room where nobody has joined. */
export const STORE = 'pair-drills';

export const pKey = (session, pid) => `${session}/p/${pid}`;
export const cKey = (session, round, turn, subject, scorer) =>
  `${session}/c/${Number(round)}/${Number(turn)}/${subject}/${scorer}`;
export const stageKey = (session) => `${session}/_stage`;

/* The session is part of every key, so one store holds every room and a list of one
   session cannot reach another. The reader below is the only thing that knows the shape,
   which is why the writers above are functions rather than template strings at the call
   sites. */
export function parseCardKey(key) {
  const p = String(key).split('/');
  if (p.length !== 6 || p[1] !== 'c') { return null; }
  const round = parseInt(p[2], 10);
  const turn = parseInt(p[3], 10);
  if (!Number.isFinite(round) || !Number.isFinite(turn)) { return null; }
  return { session: p[0], round, turn, subject: p[4], scorer: p[5] };
}

/* Which step a given round and turn is scored on, so a card can be judged open, late or
   not yet reachable without the page being trusted to say which. A page that has been
   open since the first delivery does not know the room has moved on, and asking it is how
   a card lands against the wrong delivery. */
export function scoringStepFor(round, turn) {
  return SEQUENCE.findIndex(
    (s) => s.scores === true && s.round === Number(round) && s.turn === Number(turn),
  );
}

/* ── THE SUMMARY THE FACILITATOR READS AFTERWARDS ────────────────────────────────────
 *
 * One block per person, and the receiver's mean is never folded into the observers'. The
 * page sells exactly this: "Your own scores, the scores from the people watching, and the
 * score from the person who actually received it. Where those three disagree is the part
 * worth your attention." A single averaged number destroys the only comparison the
 * session is for.
 *
 * `gap` is the receiver's read minus the speaker's own, so a positive number is a person
 * who did better than they thought and a negative one is a person who did not know how it
 * landed. That direction is stated here because a sign read the wrong way inverts the
 * follow-up conversation.
 */
export function collate(people, cards) {
  const out = new Map();
  for (const p of people) {
    out.set(p.pid, { pid: p.pid, name: p.name, rounds: new Map() });
  }
  for (const { key, rec } of cards) {
    const k = parseCardKey(key);
    if (!k || !rec) { continue; }
    if (!out.has(k.subject)) {
      out.set(k.subject, { pid: k.subject, name: '', rounds: new Map() });
    }
    const person = out.get(k.subject);
    if (!person.rounds.has(k.round)) {
      person.rounds.set(k.round, { round: k.round, self: null, receiver: null, observers: [] });
    }
    const slot = person.rounds.get(k.round);
    const card = { ...rec, scorer: k.scorer, turn: k.turn };
    if (rec.role === 'self') { slot.self = card; }
    else if (rec.role === 'receiver') { slot.receiver = card; }
    else { slot.observers.push(card); }
  }
  return out;
}

/* The mean of whatever was actually ticked, over the items that were. A card with three
   of eight answered is worth reading; scoring it as five zeroes is not. Null when nothing
   was ticked, so a surface can say "no card" rather than show a confident 0%. */
export function meanOf(card) {
  if (!card) { return null; }
  const vals = [];
  for (const g of ['outcome', 'steps']) {
    const block = card[g] || {};
    for (const v of Object.values(block)) {
      if (SCALE.includes(v)) { vals.push(v); }
    }
  }
  if (!vals.length) { return null; }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function summaryRow(slot) {
  const self = meanOf(slot && slot.self);
  const recv = meanOf(slot && slot.receiver);
  const obs = (slot && slot.observers || []).map(meanOf).filter((v) => v !== null);
  const obsMean = obs.length ? obs.reduce((a, b) => a + b, 0) / obs.length : null;
  return {
    round: slot ? slot.round : null,
    self, receiver: recv, observers: obsMean, observerCards: obs.length,
    gap: (self !== null && recv !== null) ? Number((recv - self).toFixed(2)) : null,
    approach: (slot && slot.self && slot.self.approach) || null,
    fix: (slot && slot.receiver && slot.receiver.fix)
      || (slot && slot.self && slot.self.fix) || '',
  };
}
