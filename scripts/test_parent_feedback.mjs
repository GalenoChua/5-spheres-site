/* What a Tools for Parents feedback submission is allowed to be.
 *
 *     node scripts/test_parent_feedback.mjs
 *
 * No browser and no blob store: validate(), tally() and toCsv() are pure, which
 * is the reason they live in _parent_feedback.mjs rather than inside the
 * endpoint. The endpoints themselves are a store write and a token compare
 * around these three.
 *
 * WHAT IT GUARDS. The section promises a parent, on the page, that nothing
 * about them is collected. The way that promise breaks is not a redesign, it is
 * one extra field copied into a record by a later edit, so the shape of a record
 * is asserted key by key and an unexpected key fails. It also guards the two
 * things a stranger controls: the length of the free text, and whether that text
 * can arrive in a spreadsheet as a formula.
 */
import assert from 'node:assert';
import {
  validate, tally, toCsv, csvCell,
  HELPED, MINUTES, TOOLS, MAX_LEARNED, CSV_HEAD, STORE
} from '../netlify/functions/_parent_feedback.mjs';

const good = { tool: 'telling-the-time', helped: 'partly', minutes: '10-30',
               learned: 'She can read half past now.' };

// ---- A. a good submission becomes a record, and only these keys ------------
const { record, error } = validate(good, Date.UTC(2026, 10, 24, 17, 0, 0));
assert.equal(error, undefined, 'a good submission should not error');
assert.deepEqual(Object.keys(record).sort(),
  ['helped', 'learned', 'minutes', 'submittedAt', 'tool', 'version'].sort(),
  'a record should carry these keys and no others');
assert.equal(record.helped, 'partly');
assert.equal(record.minutes, '10-30');
assert.equal(record.learned, 'She can read half past now.');
assert.equal(record.submittedAt, '2026-11-24T17:00:00.000Z',
  'the time should come from the server clock passed in, not from the caller');

// ---- B. nothing a caller adds gets stored ---------------------------------
const sneaky = validate({
  ...good,
  email: 'parent@example.com', name: 'A Parent', ip: '203.0.113.9',
  userAgent: 'Mozilla/5.0', childName: 'Ada', childAge: 7,
  submittedAt: '1999-01-01T00:00:00.000Z', version: 99, id: 'abc'
}, Date.UTC(2026, 10, 24, 17, 0, 0)).record;
for (const k of ['email', 'name', 'ip', 'userAgent', 'childName', 'childAge', 'id']) {
  assert.ok(!(k in sneaky), `a record must not carry ${k}`);
}
assert.equal(sneaky.version, 1, 'the caller must not set the record version');
assert.equal(sneaky.submittedAt, '2026-11-24T17:00:00.000Z',
  'the caller must not set the timestamp');

// ---- C. the three answers are allowlisted ---------------------------------
assert.equal(validate({ ...good, tool: 'something-else' }).error, 'tool');
assert.equal(validate({ ...good, helped: 'maybe' }).error, 'helped');
assert.equal(validate({ ...good, minutes: '45' }).error, 'minutes');
assert.equal(validate({ ...good, helped: undefined }).error, 'helped');
assert.equal(validate(null).error, 'body');
assert.equal(validate('yes').error, 'body');
assert.equal(validate([good]).error, 'body', 'an array is not a submission');
for (const h of HELPED) assert.equal(validate({ ...good, helped: h }).error, undefined);
for (const m of MINUTES) assert.equal(validate({ ...good, minutes: m }).error, undefined);
for (const t of TOOLS) assert.equal(validate({ ...good, tool: t }).error, undefined);

// An error names the field, never the value, so nothing a caller sent comes
// back out in a message.
assert.equal(validate({ ...good, helped: '<script>x</script>' }).error, 'helped');

// ---- D. the free text is optional, clipped, and never fatal ---------------
assert.equal(validate({ ...good, learned: undefined }).record.learned, '',
  'a parent who answers the first two and stops has still submitted');
assert.equal(validate({ ...good, learned: 42 }).record.learned, '',
  'a non-string answer should be dropped, not stored and not fatal');
const long = validate({ ...good, learned: 'x'.repeat(MAX_LEARNED + 500) }).record;
assert.equal(long.learned.length, MAX_LEARNED,
  'over-long text should be clipped rather than rejecting the submission');
assert.equal(validate({ ...good, learned: '  she  can\n\ntell  the\ttime ' }).record.learned,
  'she can tell the time', 'whitespace should be collapsed and trimmed');

// ---- E. the tally counts, and counts zeroes too --------------------------
const t = tally([
  validate({ ...good, helped: 'yes', minutes: 'under-10' }).record,
  validate({ ...good, helped: 'yes', minutes: 'over-60', learned: '' }).record,
  validate({ ...good, helped: 'no', minutes: '10-30', learned: 'Nothing yet.' }).record
]);
assert.equal(t.total, 3);
assert.equal(t.helped.yes, 2);
assert.equal(t.helped.no, 1);
assert.equal(t.helped.partly, 0, 'an answer nobody gave should read 0, not be missing');
assert.equal(t.minutes['30-60'], 0);
assert.equal(t.withText, 2, 'the two with text should count, the empty one should not');
assert.equal(tally([]).total, 0, 'an empty store should tally rather than throw');

// ---- F. the spreadsheet cannot be handed a formula -----------------------
assert.equal(csvCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"',
  'a leading = should be defused');
for (const lead of ['=', '+', '-', '@']) {
  assert.ok(csvCell(lead + 'x').startsWith('"\''), `${lead} should be defused`);
}
assert.equal(csvCell('she said "half past"'), '"she said ""half past"""',
  'quotes should be doubled');
assert.equal(csvCell(undefined), '""', 'a missing value should be an empty cell');
assert.equal(csvCell('a,b'), '"a,b"', 'a comma should stay inside one quoted cell');
assert.equal(csvCell('a\nb'), '"a\nb"', 'csvCell should quote a newline rather than split the row');

/* And a stored record can never contain one, because validate() collapses
   whitespace. Asserted rather than assumed: it is the reason one record is
   always one line in the file G opens. */
const typed = validate({ ...good, learned: 'a,b\nc' }).record;
assert.equal(typed.learned, 'a,b c', 'a newline a parent typed should collapse to a space');
const csv = toCsv([typed]);
assert.equal(csv.split('\n')[0], CSV_HEAD.join(','), 'the header row should be the schema');
assert.deepEqual(csv.split('\n').length, 3, 'header, one row, trailing newline');
assert.ok(csv.includes('"a,b c"'), 'the comma should stay inside one quoted cell');

// ---- G. the store name is one string in one place ------------------------
assert.equal(STORE, 'parent-feedback');

console.log('parent feedback: all assertions pass');
