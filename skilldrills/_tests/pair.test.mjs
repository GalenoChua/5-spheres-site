/* THE PAIR ENGINE, exercised rather than read.
 *
 * Every assertion here is a failure that would be invisible in a live room: a group of
 * one, a person in two groups, a card attributed to the wrong delivery, round two
 * repeating round one, or the receiver's read folded into the observers' and the one
 * comparison the session exists for quietly lost.
 *
 * Needs no store, no network and no node_modules, so it runs anywhere:
 *
 *     node skilldrills/_tests/pair.test.mjs
 */
import {
  SEQUENCE, SEQUENCE_MINS, stepAt, stepIndex, scoringStepFor,
  makeGroups, pairKey, rolesFor, roleOf, groupOf,
  pKey, cKey, stageKey, parseCardKey,
  collate, summaryRow, meanOf, OUTCOME, STEPS, SCALE_MAX,
} from '../../netlify/functions/_pair.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

/* ── the 110 minutes ── */
ok(SEQUENCE_MINS === 110, `the sequence is ${SEQUENCE_MINS} minutes, and the session is 110`);
ok(SEQUENCE.filter((s) => s.scores).length === 4, 'four scoring windows, two deliveries in each of two rounds');
ok(SEQUENCE.filter((s) => s.round === 1 && s.turn).length === 4
   && SEQUENCE.filter((s) => s.round === 2 && s.turn).length === 4,
   'both rounds carry two deliveries and two scorings');
ok(stepAt(0).key === 'welcome' && stepAt(999) === null, 'a step past the end is null, not a crash');
ok(stepIndex('score1b') === scoringStepFor(1, 2), 'the scoring step for round 1 turn 2 is found both ways');
ok(scoringStepFor(2, 1) > scoringStepFor(1, 2), 'round two is scored after round one');
ok(scoringStepFor(3, 1) === -1, 'a round that does not exist has no scoring step');

/* ── groups ── */
/* Twelve characters, like the real ones, and distinct. Padded on the LEFT: padding `p1`
   and `p10` on the right to the same width makes them the same string, which showed up
   here as makeGroups putting one person in two groups and was this helper all along. */
const ids = (n) => Array.from({ length: n }, (_, i) => String(i + 1).padStart(12, '0'));

for (const n of [3, 4, 5, 6, 7, 8, 9, 12, 13]) {
  const g = makeGroups(ids(n));
  const flat = g.flat();
  ok(flat.length === n, `${n} people are all placed (${g.map((x) => x.length).join('+')})`);
  ok(new Set(flat).size === n, `${n} people, nobody in two groups`);
  ok(g.every((x) => x.length === 2 || x.length === 3), `${n} people make pairs and at most one triad`);
  ok(g.filter((x) => x.length === 3).length === (n % 2 === 1 ? 1 : 0),
     `${n} people: a triad appears only when the count is odd`);
}
ok(makeGroups(ids(2)).length === 1 && makeGroups(ids(2))[0].length === 2,
   'two people are one pair');
ok(makeGroups(ids(1)).length === 0, 'one person is no drill, not a group of one');

/* Round two must not repeat round one. Run it enough times that a lucky shuffle cannot
   be mistaken for the avoidance working. */
let repeats = 0;
for (let i = 0; i < 200; i += 1) {
  const people = ids(8);
  const r1 = makeGroups(people);
  const r2 = makeGroups(people, r1);
  const used = new Set(r1.flatMap(pairKey));
  if (r2.flatMap(pairKey).some((k) => used.has(k))) { repeats += 1; }
}
ok(repeats === 0, `round two never reused a round one pairing in 200 draws (${repeats} repeats)`);

ok(pairKey(['a', 'b']).length === 1, 'a pair is one pairing');
ok(pairKey(['a', 'b', 'c']).length === 3, 'a triad is three pairings');
ok(pairKey(['b', 'a'])[0] === pairKey(['a', 'b'])[0], 'a pairing is unordered');

/* ── who is doing what ── */
const pair = ['alice', 'bob'];
const triad = ['alice', 'bob', 'carol'];
ok(rolesFor(pair, 1).subject === 'alice' && rolesFor(pair, 1).receiver === 'bob',
   'turn one of a pair: the first delivers, the second receives');
ok(rolesFor(pair, 2).subject === 'bob' && rolesFor(pair, 2).receiver === 'alice',
   'turn two of a pair swaps them');
ok(rolesFor(pair, 1).observers.length === 0, 'a pair has no observer');
ok(rolesFor(pair, 3) === null, 'a pair is idle on turn three, and says so');
ok(rolesFor(triad, 1).receiver === 'bob' && rolesFor(triad, 1).observers[0] === 'carol',
   'a triad: the next person receives and the third observes');
ok(rolesFor(triad, 3).subject === 'carol' && rolesFor(triad, 3).receiver === 'alice',
   'the triad wraps round on the last turn');
ok(['alice', 'bob', 'carol'].every((p) =>
  [1, 2, 3].filter((t) => roleOf(triad, t, p) === 'self').length === 1),
   'everybody in a triad delivers exactly once');
ok(['alice', 'bob', 'carol'].every((p) =>
  [1, 2, 3].filter((t) => roleOf(triad, t, p) === 'receiver').length === 1),
   'everybody in a triad receives exactly once');
ok(roleOf(triad, 1, 'dave') === null, 'somebody outside the group has no role in it');
ok(roleOf(pair, 1, 'alice') === 'self' && roleOf(pair, 1, 'bob') === 'receiver',
   'the role is derived from the group and the turn, never claimed');
ok(groupOf([pair, triad], 'carol') === triad && groupOf([pair], 'carol') === null,
   'a person is found in their own group and nowhere else');

/* ── keys ── */
const S = 'lsg-2026-11-30-ab12cd';
ok(pKey(S, 'abc') === `${S}/p/abc`, 'a participant key carries the session');
ok(cKey(S, 1, 2, 'sub', 'scr') === `${S}/c/1/2/sub/scr`, 'a card key carries round and turn');
ok(cKey(S, 1, 1, 'sub', 'scr') !== cKey(S, 2, 1, 'sub', 'scr'),
   'the same pair in round two writes a SECOND card, it does not replace round one');
ok(parseCardKey(cKey(S, 2, 1, 'sub', 'scr')).round === 2, 'a card key reads back');
ok(parseCardKey(pKey(S, 'abc')) === null, 'a participant key is not read as a card');
ok(parseCardKey(stageKey(S)) === null, 'the stage record is not read as a card');

/* ── the summary, and the thing it must never do ── */
const ten = (v) => Object.fromEntries(OUTCOME.map((q) => [q.key, v]));
const tenSteps = (v) => Object.fromEntries(STEPS.map((q) => [q.key, v]));
const people = [{ pid: 'aaa', name: 'Alice' }, { pid: 'bbb', name: 'Bob' }];
const cards = [
  { key: cKey(S, 1, 1, 'aaa', 'aaa'), rec: { role: 'self', outcome: ten(8), steps: tenSteps(8), approach: 'values', fix: 'I rushed it' } },
  { key: cKey(S, 1, 1, 'aaa', 'bbb'), rec: { role: 'receiver', scorerName: 'Bob', outcome: ten(4), steps: tenSteps(4), fix: 'I did not know what had been decided' } },
  { key: cKey(S, 1, 1, 'aaa', 'ccc'), rec: { role: 'observer', scorerName: 'Carol', outcome: ten(6), steps: tenSteps(6), fix: '' } },
  { key: cKey(S, 2, 1, 'aaa', 'bbb'), rec: { role: 'receiver', scorerName: 'Bob', outcome: ten(9), steps: tenSteps(9) } },
];
const got = collate(people, cards);
const alice = got.get('aaa');
ok(alice.rounds.size === 2, 'two rounds are two rows for the same person');
const r1 = summaryRow(alice.rounds.get(1));
ok(r1.self === 8 && r1.receiver === 4 && r1.observers === 6,
   'the three reads stay in three columns and are never averaged together');
ok(r1.gap === -4, 'the gap is the receiver minus the self, so a person who misread the room is negative');
ok(summaryRow(alice.rounds.get(2)).gap === null,
   'no self card means no gap, rather than a gap against zero');
ok(r1.observerCards === 1, 'the observer count is stated, so one card is not read as a consensus');
ok(r1.approach === 'values', 'which approach was practised is carried through');
ok(r1.fix === 'I did not know what had been decided',
   "the receiver's written note is the one the summary leads with");
ok(got.get('bbb').rounds.size === 0, 'somebody who never delivered has no rows, and is still listed');

/* A partly filled card is worth its own mean, and an empty one is null rather than a
   confident zero. */
ok(meanOf({ outcome: { respected: 10 }, steps: {} }) === 10, 'a card with one answer means that answer');
ok(meanOf({ outcome: {}, steps: {} }) === null, 'a card with nothing ticked has no mean');
ok(meanOf(null) === null, 'no card has no mean');
ok(meanOf({ outcome: ten(SCALE_MAX + 5), steps: {} }) === null,
   'a value off the scale is not counted, so a hand-posted 99 cannot move a mean');

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
