/* What a Frog Rock pledge is allowed to be.
 *
 *     node scripts/test_frogrock_pledge.mjs
 *
 * No browser and no blob store: validate(), keyFor(), progress() and toCsv()
 * are pure, which is the reason they live in _frogrock_pledge.mjs rather than
 * inside the endpoint. The endpoints themselves are a store write, a key count
 * and a token compare around these four.
 *
 * WHAT IT GUARDS, and it is not the same thing the feedback test guards. There
 * the promise is that nothing identifying is stored at all. Here the whole point
 * is an email address, so what has to hold is narrower and easier to break by
 * accident:
 *
 *   * the record carries the address and these three other fields, and nothing
 *     a caller adds gets through,
 *   * one address is one backer however it is typed, because the counter on the
 *     page is a count of these keys and a capital letter must not become a
 *     second person,
 *   * there is no money in a record anywhere, since this build takes none,
 *   * the counter cannot be made to report something it was not told, including
 *     from a count that is negative, missing or not a number.
 */
import assert from 'node:assert';
import {
  validate, keyFor, normaliseEmail, progress, toCsv, csvCell,
  GOAL, UNIT, MAX_NAME, MAX_MESSAGE, CSV_HEAD, STORE
} from '../netlify/functions/_frogrock_pledge.mjs';

const good = { email: 'parent@example.com', name: 'Ada',
               message: 'My daughter has read it four times.' };
const NOW = Date.UTC(2026, 10, 25, 9, 0, 0);

// ---- A. a good pledge becomes a record, and only these keys ----------------
const { record, key, error } = validate(good, NOW);
assert.equal(error, undefined, 'a good pledge should not error');
assert.deepEqual(Object.keys(record).sort(),
  ['email', 'message', 'name', 'pledgedAt', 'version'].sort(),
  'a record should carry these keys and no others');
assert.equal(record.email, 'parent@example.com');
assert.equal(record.name, 'Ada');
assert.equal(record.pledgedAt, '2026-11-25T09:00:00.000Z',
  'the time should come from the server clock passed in, not from the caller');
assert.equal(key, keyFor('parent@example.com'), 'the key should be the address key');

// ---- B. nothing a caller adds gets stored, and above all no money ---------
const sneaky = validate({
  ...good,
  amount: 500, currency: 'PLN', quantity: 3, card: '4111111111111111',
  paymentToken: 'tok_abc', ip: '203.0.113.9', userAgent: 'Mozilla/5.0',
  childName: 'Ada', pledgedAt: '1999-01-01T00:00:00.000Z', version: 99, id: 'x'
}, NOW).record;
for (const k of ['amount', 'currency', 'quantity', 'card', 'paymentToken',
                 'ip', 'userAgent', 'childName', 'id']) {
  assert.ok(!(k in sneaky), `a record must not carry ${k}`);
}
assert.equal(sneaky.version, 1, 'the caller must not set the record version');
assert.equal(sneaky.pledgedAt, '2026-11-25T09:00:00.000Z',
  'the caller must not set the timestamp');
/* Stated as an assertion rather than left to the eye, because the one thing
   this build promises G is that it never touches money. */
assert.equal(JSON.stringify(sneaky).toLowerCase().includes('4111'), false,
  'a card number a caller sent must not survive into a record');

// ---- C. the address is the only required field ---------------------------
assert.equal(validate({ email: 'parent@example.com' }, NOW).error, undefined,
  'an address on its own is a pledge');
assert.equal(validate({ ...good, email: '' }).error, 'email');
assert.equal(validate({ ...good, email: 'parent@example' }).error, 'email',
  'a domain with no dot is not an address');
assert.equal(validate({ ...good, email: 'parent at example.com' }).error, 'email');
assert.equal(validate({ ...good, email: 'a@b.c d@e.f' }).error, 'email',
  'whitespace in the middle is two addresses, not one');
assert.equal(validate({ ...good, email: 42 }).error, 'email');
assert.equal(validate({ ...good, email: 'x'.repeat(250) + '@example.com' }).error, 'email',
  'an absurd address should be refused rather than stored');
assert.equal(validate(null).error, 'body');
assert.equal(validate('parent@example.com').error, 'body');
assert.equal(validate([good]).error, 'body', 'an array is not a pledge');

// An error names the field, never the value, so nothing a caller sent comes
// back out in a message.
assert.equal(validate({ ...good, email: '<script>x</script>' }).error, 'email');

// ---- D. one person is one backer, however they type it -------------------
/* This is what the counter counts, so it is the assertion the number on the
   page rests on. */
const forms = ['parent@example.com', 'Parent@Example.com', '  parent@example.com  ',
               'PARENT@EXAMPLE.COM'];
const keys = new Set(forms.map(keyFor));
assert.equal(keys.size, 1, 'the same address typed four ways should be one key');
assert.equal(normaliseEmail('  A@B.Co '), 'a@b.co');
assert.equal(normaliseEmail(undefined), '');
assert.notEqual(keyFor('a@example.com'), keyFor('b@example.com'),
  'two addresses should be two keys');
assert.match(keyFor('a@example.com'), /^[0-9a-f]{64}$/,
  'a key should be a hex digest and carry no address in it');
assert.ok(!keyFor('parent@example.com').includes('parent'),
  'the address must not be readable in the key');

// ---- E. the optional fields are optional, clipped, and never fatal -------
assert.equal(validate({ email: 'a@b.co', name: undefined }, NOW).record.name, '');
assert.equal(validate({ email: 'a@b.co', name: 42 }, NOW).record.name, '',
  'a non-string name should be dropped, not stored and not fatal');
assert.equal(
  validate({ email: 'a@b.co', name: 'x'.repeat(MAX_NAME + 50) }, NOW).record.name.length,
  MAX_NAME, 'an over-long name should be clipped rather than rejecting the pledge');
assert.equal(
  validate({ email: 'a@b.co', message: 'y'.repeat(MAX_MESSAGE + 50) }, NOW).record.message.length,
  MAX_MESSAGE);
assert.equal(validate({ email: 'a@b.co', message: ' he  loved\n\nthe  frog ' }, NOW).record.message,
  'he loved the frog', 'whitespace should be collapsed and trimmed');

// ---- F. the counter reports what it was told, and nothing else ------------
assert.equal(GOAL, 100);
assert.equal(UNIT, null,
  'the unit is pending G and must stay null until he answers, so no page can print one');
const p0 = progress(0);
assert.deepEqual(Object.keys(p0).sort(), ['count', 'goal', 'percent', 'reached', 'unit'].sort(),
  'the public counter should expose these five and nothing about who');
assert.equal(p0.percent, 0);
assert.equal(p0.reached, false);
assert.equal(progress(1).percent, 1);
assert.equal(progress(50).percent, 50);
assert.equal(progress(99).reached, false);
assert.equal(progress(100).reached, true);
assert.equal(progress(100).percent, 100);
/* Over the target the bar stops and the count does not, because passing a
   hundred is news and a page capped at a hundred would hide it. */
assert.equal(progress(137).count, 137, 'a count over the goal should be reported raw');
assert.equal(progress(137).percent, 100, 'the bar should stop at full');
for (const bad of [-5, NaN, Infinity, undefined, null, '12']) {
  assert.equal(progress(bad).count, 0, `a count of ${String(bad)} should read 0`);
  assert.equal(progress(bad).percent, 0);
}
assert.equal(progress(3.7).count, 3, 'a fractional count should floor rather than show a decimal');

// ---- G. the spreadsheet cannot be handed a formula -----------------------
assert.equal(csvCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"', 'a leading = should be defused');
for (const lead of ['=', '+', '-', '@']) {
  assert.ok(csvCell(lead + 'x').startsWith('"\''), `${lead} should be defused`);
}
assert.equal(csvCell('he said "yes"'), '"he said ""yes"""', 'quotes should be doubled');
assert.equal(csvCell(undefined), '""', 'a missing value should be an empty cell');
assert.equal(csvCell('a,b'), '"a,b"', 'a comma should stay inside one quoted cell');

const typed = validate({ email: 'a@b.co', name: 'A,B', message: 'c,d\ne' }, NOW).record;
assert.equal(typed.message, 'c,d e', 'a newline somebody typed should collapse to a space');
const csv = toCsv([typed]);
assert.equal(csv.split('\n')[0], CSV_HEAD.join(','), 'the header row should be the schema');
assert.equal(csv.split('\n').length, 3, 'header, one row, trailing newline');
assert.ok(csv.includes('"c,d e"'), 'the comma should stay inside one quoted cell');
assert.equal(toCsv([]).trim(), CSV_HEAD.join(','), 'an empty store should still produce a header');
/* An address starting with a quote is the other half of the escaping, and a
   plausible thing for somebody to paste. */
assert.ok(toCsv([{ ...typed, email: '"a"@b.co' }]).includes('"""a""@b.co"'));

// ---- H. the store name is one string in one place ------------------------
assert.equal(STORE, 'frogrock-pledges');
assert.notEqual(STORE, 'parent-feedback',
  'the pledges must not land in the feedback store, which promises no addresses');

console.log('frogrock pledge: all assertions pass');
