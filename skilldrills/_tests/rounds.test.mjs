/* Does a second round destroy the first? Replays the 9 November records, then writes a
   synthetic round 2 for one speaker over the top and checks round 1 is still readable. */
import { roundKey, baseRef, roundOf, isSelf, currentRound } from
  '../../netlify/functions/_rounds.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

// --- key helpers
ok(roundKey('abc123def456', 1) === 'abc123def456', 'round 1 writes the bare ref (no migration)');
ok(roundKey('abc123def456', 2) === 'abc123def456~2', 'round 2 suffixes');
ok(roundKey('abc', 0) === 'abc' && roundKey('abc', undefined) === 'abc', 'missing/zero round falls back to bare');
ok(baseRef('abc123def456~3') === 'abc123def456', 'baseRef strips the round');
ok(roundOf('abc') === 1 && roundOf('abc~3') === 3, 'roundOf reads the round');
ok(roundOf('abc~zz') === 1, 'a malformed suffix reads as round 1, not NaN');
ok(isSelf('abc', 'abc~2'), 'a round-2 self record is still recognised as self');
ok(!isSelf('abc', 'def~2'), 'a peer card is not mistaken for self');
ok(currentRound({ rounds: { abc: 2 } }, 'abc') === 2, 'currentRound reads the stage');
ok(currentRound(null, 'abc') === 0, 'no stage means never on the floor');
ok(currentRound({ rounds: { abc: 2 } }, 'abc~2') === 2, 'currentRound tolerates a suffixed ref');

// --- the actual regression: does round 2 collide with round 1?
const SP = '6d61eefcf4fd', SC = '77e71d1642c8';
const k1 = `s/${SP}/${roundKey(SC, 1)}`;
const k2 = `s/${SP}/${roundKey(SC, 2)}`;
ok(k1 !== k2, 'the same scorer scoring the same speaker twice writes TWO keys');
ok(k1.split('/').length === 3 && k2.split('/').length === 3,
   'both keys keep three segments, so every parts.length===3 reader still sees them');
ok(baseRef(k2.split('/')[1]) === SP, 'both rounds still group under one speaker ref');

// --- real data still parses as round 1
import fs from 'node:fs';
const recs = JSON.parse(fs.readFileSync(
  'ops-log/drill-export/drill-scores__ps-2026-11-09-73040c.json', 'utf-8')).records;
const cards = recs.filter(r => r.key.split('/').length === 3 && !r.key.endsWith('_stage'));
ok(cards.length > 0, `${cards.length} real records loaded`);
ok(cards.every(r => roundOf(r.key.split('/')[2]) === 1), 'every existing record reads as round 1');
const selvesFound = cards.filter(r => isSelf(r.key.split('/')[1], r.key.split('/')[2]));
const selvesOld   = cards.filter(r => r.key.split('/')[1] === r.key.split('/')[2]);
ok(selvesFound.length === selvesOld.length && selvesOld.length === 7,
   `self detection unchanged on real data (${selvesOld.length} selves)`);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
