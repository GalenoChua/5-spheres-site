/* THE REGRESSION ITSELF: replay 9 November, then speak again, and check round 1 survives. */
import fs from 'node:fs';
import { collate, sheetFor } from
  '../../netlify/functions/drill-results.mjs';
import { roundKey } from
  '../../netlify/functions/_rounds.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };

const recs = JSON.parse(fs.readFileSync(
  'ops-log/drill-export/drill-scores__ps-2026-11-09-73040c.json', 'utf-8')).records;
const entries = recs
  .filter(r => r.key.split('/').length === 3 && !r.key.endsWith('_stage'))
  .map(r => ({ key: r.key, rec: r }));

// --- baseline, exactly as the night ran
const base = collate(entries);
const HIK = '6d61eefcf4fd';                       // Hikmat
const r1cards = base.bySpeaker.get(HIK).get(1);
const r1sheet = sheetFor(base.selves.get(HIK).get(1), r1cards);
ok(base.selves.size === 7, 'seven people');
ok(base.bySpeaker.get(HIK).size === 1, 'Hikmat has exactly one round on the night');
ok(r1sheet.appeared === 85, `round 1 appeared is 85 (got ${r1sheet.appeared})`);
ok(r1sheet.scorers === 4, `round 1 had 4 scorers (got ${r1sheet.scorers})`);

// --- now he speaks again. Same scorers, same speaker, deliberately different numbers.
const round2 = r1cards.map(c => ({
  key: `ps-2026-11-09-73040c/${HIK}/${roundKey(c.key.split('/')[2], 2)}`,
  rec: { ...c, outcome: { confident: 3, clear: 3, believed: 3 },
         five: { pause: 3, pace: 3, volume: 3, emotion: 3, tonality: 3 } }
}));
const after = collate([...entries, ...round2]);

ok(after.bySpeaker.get(HIK).size === 2, 'Hikmat now has two rounds');
const keep = sheetFor(after.selves.get(HIK).get(1), after.bySpeaker.get(HIK).get(1));
const two  = sheetFor(after.selves.get(HIK).get(1), after.bySpeaker.get(HIK).get(2));

ok(keep.appeared === r1sheet.appeared,
   `ROUND 1 SURVIVED: appeared still ${keep.appeared}, was ${r1sheet.appeared}`);
ok(keep.scorers === r1sheet.scorers, `round 1 still has ${keep.scorers} scorers`);
ok(two.appeared !== keep.appeared, `round 2 is its own number (${two.appeared} vs ${keep.appeared})`);
ok(after.selves.size === 7, 'still seven people, not fourteen');
ok(after.bySpeaker.get('77e71d1642c8').size === 1, 'other speakers are untouched');

// --- and the old behaviour, to show what was being lost
const collided = new Map();
for (const e of [...entries, ...round2]) {
  const p = e.key.split('/');
  if (p[1] === HIK && p[1] !== p[2]) collided.set(`${p[1]}/${p[2].split('~')[0]}`, e.rec);
}
ok(collided.size === r1cards.length,
   `without the round suffix all ${r1cards.length} round-1 cards would have been replaced`);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
