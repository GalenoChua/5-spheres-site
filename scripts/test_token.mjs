/* The sign-up token, exercised against a fake blob store.
 *
 *     node scripts/test_token.mjs
 *
 * WHY A FAKE STORE. The branches that matter cannot be reached against the real
 * thing: an expired token needs a clock four hours in the past, and a replay
 * needs a token already spent. Both are set up here in memory, and nothing in
 * this file touches the network, so the whole run takes about a second.
 *
 * HOW THE STUB GETS IN. subscribe.mjs imports getStore from '@netlify/blobs',
 * and the repo's own node_modules holds the real package. So this writes a
 * throwaway tree beside it with a stub of that name and runs a copy of the
 * function from in there. No loader hooks, no mocking framework.
 *
 * WHAT IT DOES NOT COVER. That the deployed page and the deployed function
 * agree. That is scripts/check_signup_flow.py, which drives a real browser.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'token-test-'));
const stub = path.join(tmp, 'node_modules', '@netlify', 'blobs');
fs.mkdirSync(stub, { recursive: true });
fs.writeFileSync(path.join(stub, 'package.json'),
  JSON.stringify({ name: '@netlify/blobs', version: '0.0.0', type: 'module', exports: './index.mjs' }));
fs.writeFileSync(path.join(stub, 'index.mjs'), `
const mem = new Map();
export const getStore = () => ({
  get: async (k) => (mem.has(k) ? mem.get(k) : null),
  set: async (k, v) => { mem.set(k, v); },
});
`);
fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'module' }));
fs.copyFileSync(path.join(ROOT, 'netlify', 'functions', 'subscribe.mjs'),
                path.join(tmp, 'subscribe.mjs'));

/* The function logs every refusal, which is right in production and noise here. */
const realError = console.error;
console.error = () => {};

/* pathToFileURL, not the bare path: on Windows an absolute path starts
   with a drive letter and the ESM loader reads `c:` as a URL scheme. */
const mod = await import(pathToFileURL(path.join(tmp, 'subscribe.mjs')).href);

const call = (method, body, raw) => mod.default(new Request('https://x/', {
  method,
  body: raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body)),
  headers: { 'content-type': 'application/json' },
}));

const post = async (body) => {
  const r = await call('POST', body);
  let j = null;
  try { j = JSON.parse(await r.text()); } catch { /* reported by the caller */ }
  return { code: r.status, body: j };
};

const issue = async () => {
  const r = await call('GET');
  return (JSON.parse(await r.text())).token;
};

/* Everything below is refused before the function would reach MailerLite, with
   the single exception noted at the bottom, which is why there is no network
   stub in here. */
let ran = 0;
let failed = 0;
async function it(label, fn) {
  ran += 1;
  try {
    await fn();
    realError('  ok   ' + label);
  } catch (err) {
    failed += 1;
    realError('  FAIL ' + label + '\n         ' + String(err.message).split('\n')[0]);
  }
}

const GOOD = { list: 'inbox', name: 'A Name', email: 'a@example.com' };
const refused = (got) => assert.strictEqual(got.code, 403,
  'expected 403, got ' + got.code + ' ' + JSON.stringify(got.body));

await it('GET issues a token of the documented shape', async () => {
  const t = await issue();
  const [ts, nonce, mac] = t.split('.');
  assert.match(ts, /^\d{13}$/, 'timestamp');
  assert.match(nonce, /^[0-9a-f]{32}$/, 'nonce');
  assert.match(mac, /^[0-9a-f]{64}$/, 'signature');
});

await it('two requests are never issued the same token', async () => {
  assert.notStrictEqual(await issue(), await issue());
});

await it('a POST with no token is refused', async () => {
  refused(await post(GOOD));
});

await it('a forged signature is refused', async () => {
  const t = await issue();
  refused(await post({ ...GOOD, token: t.replace(/\.[0-9a-f]{64}$/, '.' + '0'.repeat(64)) }));
});

await it('a made-up token is refused', async () => {
  refused(await post({ ...GOOD, token: 'x'.repeat(111) }));
  refused(await post({ ...GOOD, token: 42 }));
  refused(await post({ ...GOOD, token: { a: 1 } }));
});

await it('a token signed four hours ago is refused as expired', async () => {
  /* Issued legitimately against a doctored clock, so the signature is valid and
     only the age is wrong. Rewriting the timestamp on a fresh token instead
     would be caught by the signature check and never reach this branch, which
     is what an earlier version of this test actually did. */
  const real = Date.now;
  Date.now = () => real() - 4 * 60 * 60 * 1000;
  const old = await issue();
  Date.now = real;
  refused(await post({ ...GOOD, token: old }));
});

await it('a token from the future is refused', async () => {
  const real = Date.now;
  Date.now = () => real() + 10 * 60 * 1000;
  const ahead = await issue();
  Date.now = real;
  refused(await post({ ...GOOD, token: ahead }));
});

await it('a token cannot be spent twice', async () => {
  const t = await issue();
  /* A blank name, so the first spend passes the token gate and then stops at
     validation without reaching MailerLite. The token is spent either way. */
  const first = await post({ ...GOOD, name: '   ', token: t });
  assert.strictEqual(first.code, 400, 'first spend should reach validation');
  assert.strictEqual(first.body.field, 'name');
  refused(await post({ ...GOOD, token: t }));
});

await it('the honeypot answers before the token, so a bot learns nothing', async () => {
  const got = await post({ ...GOOD, website: 'http://spam.example' });
  assert.strictEqual(got.code, 200);
  assert.strictEqual(got.body.skipped, 'bot');
});

await it('an unknown list is refused after a good token', async () => {
  const got = await post({ ...GOOD, list: 'not-a-list', token: await issue() });
  assert.strictEqual(got.code, 400);
  assert.strictEqual(got.body.error, 'list');
});

await it('a body that is not an object does not throw', async () => {
  /* JSON.parse('null') succeeds and the first field read off it threw. Netlify
     answers a throw with 502 and the stack trace, so four characters of request
     body returned errorType, errorMessage and a trace to whoever asked. */
  for (const raw of ['null', '7', '"a string"', '[]']) {
    const r = await call('POST', undefined, raw);
    const text = await r.text();
    assert.strictEqual(r.status, 400, raw + ' gave ' + r.status);
    assert.ok(!text.includes('errorType') && !text.includes('trace'),
              raw + ' leaked a trace');
  }
});

await it('a method that is neither GET nor POST is refused', async () => {
  const r = await call('DELETE');
  assert.strictEqual(r.status, 405);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.error = realError;
console.log('\n%d checks, %s', ran, failed ? failed + ' FAILED' : 'all pass');
process.exit(failed ? 1 : 0);
