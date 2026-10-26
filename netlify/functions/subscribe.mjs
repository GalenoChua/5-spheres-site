/* One door to the list, and it tells the truth about what happened.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────
 *
 * Every sign-up form on the site posted straight to MailerLite's JSONP endpoint with
 * `mode: 'no-cors'`. That mode makes the response unreadable by design, so the page
 * revealed the download and said "It is on its way" whether MailerLite had accepted the
 * address, rejected it, or refused the whole submission.
 *
 * It was refusing. On 22 October 2026 the Resource downloads form (191733181639034609),
 * which is the one behind the KPQ worksheet, answered every valid submission with:
 *
 *     {"success":false,"message":"reCAPTCHA failed. Try again."}
 *
 * reCAPTCHA is switched on for that form in MailerLite, and a hand-rolled form carries no
 * token, so it could never pass. The form has never added a subscriber. The other two
 * forms on the site answered {"success":true} to the same probe, so this is per-form and
 * not an account-wide setting.
 *
 * The endpoint always returns HTTP 200. Success and failure are distinguished only by the
 * body, which is exactly the shape `no-cors` throws away, and exactly why this went
 * unnoticed from the page.
 *
 * ── WHY A FUNCTION RATHER THAN FIXING THE FETCH ───────────────────────────────────────
 *
 * The browser cannot read that response at all: MailerLite sends no CORS headers, so any
 * mode other than no-cors fails outright. Server side there is no such restriction, and a
 * proxy needs no API key because the endpoint is public. That also keeps the MailerLite
 * embed script off the site, which would otherwise need `assets.mlcdn.com` in the CSP and
 * brings its own layout.
 *
 * ── AND IT IS THE ONE PLACE TO VALIDATE ───────────────────────────────────────────────
 *
 * The pages relied on the browser's own checks, which accept `a@b` and a name of three
 * spaces. Checks in the page are a courtesy to the visitor; these are the ones that hold.
 */
import { getStore } from '@netlify/blobs';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/* An allowlist, so this cannot be used as an open relay into somebody else's MailerLite
   account. The page names a list; it never names a URL. */
const FORMS = {
  /* Named for the MailerLite form, not for the page, because two pages share
     one: /resources/kpq/ and /bsfp-accelerator/ both feed Resource downloads.
     Naming these after pages had the accelerator pointed at the sensing drill
     list, which would have been invisible until somebody audited the groups. */
  'resource-downloads': '191733181639034609',
  'sensing-drill': '196872740626498737',
  'public-speaking': '200050059381835246',
  /* Added 26 October. These four forms posted straight to MailerLite with no
     honeypot and no validation of any kind, on the homepage, the application
     page and the sphere one audit. They were never in the no-cors trap because
     they submitted natively, so the visitor saw the result; they were simply
     open. */
  'empathy-coach': '189443333940053728',
  'inbox': '189738547467519573',
  'apply': '189808223124980825',
};
const ACCOUNT = '2409610';

const clean = (v, n) =>
  String(v == null ? '' : v)
    .split('')
    /* no escapes: the character class here held real control bytes after a
       shell heredoc ate the backslashes, and a NUL in a JS file is a hazard */
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join('')
    .trim()
    .slice(0, n);

/* A real address has a dot in the host and a plausible tail. `a@b` and `test@test` both
   pass the browser's check and MailerLite rejects the second, so without this the visitor
   is told it worked by us and then nothing arrives. */
function badEmail(e) {
  if (e.length < 6 || e.length > 200) return 'length';
  const m = /^[^\s@]+@([^\s@.]+\.)+[a-z]{2,}$/i.exec(e);
  return m ? null : 'shape';
}

/* ── THE SIGN-UP TOKEN ────────────────────────────────────────────────────────────────
 *
 * G, 26 October: "I'm getting junk contacts already, there are so many."
 *
 * The honeypot that replaced the reCAPTCHA stops a crawler that fills every field it
 * finds. It stops nothing that was written against this form, and the HowLegit list ran
 * 146 spam out of 152, so the bar has to be higher than that.
 *
 * So: GET this function and it issues a token. POST without one is refused. A bot that
 * posts straight at the endpoint never loaded a page, has no token, and gets nothing.
 * There is no third party, no puzzle, and nothing for the visitor to do.
 *
 * WHY SIGNED RATHER THAN STORED. Issuing a token on every page view and storing it would
 * write a blob per view and never delete one, because Netlify Blobs has no expiry. The
 * token carries its own timestamp and a signature instead, so issuing writes nothing.
 * Only a token that is actually SPENT is recorded, and that is a few dozen rows, which is
 * what makes single use affordable.
 *
 * WHERE THE KEY COMES FROM. It is generated once and kept in the blob store, so there is
 * no environment variable to set and nothing to paste into a console. Losing it would
 * invalidate tokens already in flight, which costs a visitor one retry.
 */
const TOKENS = 'signup-tokens';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;   /* a page left open over a long lunch */

let keyPromise = null;

/* STRONG CONSISTENCY IS LOAD BEARING. Netlify Blobs reads are eventually consistent by
   default, served from a regional cache, and single use is a read of something written
   moments earlier, probably by a different instance. Against the default store a token
   spent twice in quick succession was accepted BOTH times in production, while the unit
   tests against an in-memory store passed. Caught by check_site.py --live on 26 October,
   about ninety seconds after the deploy. */
function store() {
  return getStore({ name: TOKENS, consistency: 'strong' });
}

/* Cached in module scope: a warm function instance signs without touching the store. */
function signingKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const kv = store();
      let raw = await kv.get('key');
      if (!raw) {
        raw = [...crypto.getRandomValues(new Uint8Array(32))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        /* Two cold instances can land here together. Whoever wrote last wins and
           the other's tokens stop verifying, so re-read rather than trust ours. */
        await kv.set('key', raw);
        raw = (await kv.get('key')) || raw;
      }
      return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(raw),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
    })().catch((err) => {
      keyPromise = null;      /* so a transient store failure is not permanent */
      throw err;
    });
  }
  return keyPromise;
}

async function sign(message) {
  const mac = await crypto.subtle.sign('HMAC', await signingKey(),
    new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function issue() {
  const ts = Date.now();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const body = `${ts}.${nonce}`;
  return `${body}.${await sign(body)}`;
}

/* Returns null when the token is good, or a short reason for the log. The visitor is
   never shown the reason: it tells a bot which half to fix. */
async function spend(token) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 200) return 'shape';
  const parts = token.split('.');
  if (parts.length !== 3) return 'shape';
  const [ts, nonce, mac] = parts;
  if (!/^\d{13}$/.test(ts) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(mac)) {
    return 'shape';
  }

  const expected = await sign(`${ts}.${nonce}`);
  /* Constant time. The comparison is over hex of a fixed length, so a plain !== leaks
     how many leading characters matched, which is enough to forge one given patience. */
  if (expected.length !== mac.length) return 'signature';
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  if (diff !== 0) return 'signature';

  const age = Date.now() - Number(ts);
  if (age < -60000) return 'future';
  if (age > MAX_AGE_MS) return 'expired';

  /* Single use. Checked last, so a forged token never costs a store round trip. */
  const kv = store();
  const key = `used/${nonce}`;
  if (await kv.get(key)) return 'replay';
  await kv.set(key, String(ts));
  return null;
}


const handle = async (request) => {
  /* A page asks for a token as it loads. Cached nowhere: a cached token is a
     shared token, and single use would then refuse the second visitor. */
  if (request.method === 'GET') {
    return json(200, { token: await issue() });
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: 'not json' }); }
  /* JSON.parse('null') and JSON.parse('7') both succeed, and the first thing
     read off the body then threw. Netlify's default handler answers a throw
     with 502 and the stack trace, so a body of the four characters `null`
     returned errorType, errorMessage and a trace to whoever asked. */
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json(400, { ok: false, error: 'not an object' });
  }

  /* A field no human fills in. Answered means a bot, and a bot is told it worked so it
     does not come back and try a different shape. */
  if (clean(body.website, 80)) return json(200, { ok: true, skipped: 'bot' });

  /* Before the list lookup, so a direct POST is turned away without us having
     learned anything about it or reaching MailerLite. */
  const bad = await spend(body.token);
  if (bad) {
    console.error('token refused', { reason: bad, list: body.list });
    return json(403, {
      ok: false,
      error: 'This form has been open a while. Refresh the page and try again.',
      stale: true,
    });
  }

  const formId = FORMS[clean(body.list, 40)];
  if (!formId) return json(400, { ok: false, error: 'list', field: 'list' });

  const name = clean(body.name, 120);
  const email = clean(body.email, 200).toLowerCase();
  if (!name) return json(400, { ok: false, error: 'Tell us your first name.', field: 'name' });
  if (badEmail(email)) {
    return json(400, { ok: false, error: 'That email does not look right.', field: 'email' });
  }

  const payload = new URLSearchParams();
  payload.set('fields[name]', name);
  payload.set('fields[email]', email);
  payload.set('ml-submit', '1');
  payload.set('anticsrf', 'true');

  /* Anything else the form collects. The drill pages ask "what do you have to say
     soon, and to whom?" as fields[why_now], and a proxy that forwarded only name and
     email would have dropped the single most useful thing on the form without anyone
     noticing. Key shape is constrained so this cannot be used to set arbitrary
     MailerLite internals. */
  const extra = body.fields && typeof body.fields === 'object' ? body.fields : {};
  /* Capped. Nothing on the site sends more than one, and without a limit a
     caller could hand over a thousand keys and have us build the request. */
  for (const key of Object.keys(extra).slice(0, 8)) {
    if (key === 'name' || key === 'email') continue;
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) continue;
    const value = clean(extra[key], 1000);
    if (value) payload.set(`fields[${key}]`, value);
  }

  let res, text;
  try {
    res = await fetch(`https://assets.mailerlite.com/jsonp/${ACCOUNT}/forms/${formId}/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });
    text = await res.text();
  } catch {
    return json(502, { ok: false, error: 'The list is not answering. Try again in a minute.' });
  }

  let data = null;
  try { data = JSON.parse(text); } catch { /* handled below */ }

  /* Anything other than an explicit success is a failure, including a body we cannot
     parse. Guessing in the optimistic direction is the bug this function replaces. */
  if (!data || data.success !== true) {
    const detail =
      (data && data.message) ||
      (data && data.errors && JSON.stringify(data.errors)) ||
      text.slice(0, 200);
    /* Logged so a refusal is visible in the function log rather than only to the visitor,
       which is how "reCAPTCHA failed" went unseen from July to October. */
    console.error('mailerlite refused', { list: body.list, formId, status: res.status, detail });
    return json(502, {
      ok: false,
      error: 'We could not add you just then. Try again, or email hello@5spheresofempathy.com.',
      detail,
    });
  }

  return json(200, { ok: true });
};


/* Netlify answers an uncaught throw with 502 and the stack trace. A body of
   the four characters `null` was enough to produce one. The crash itself is
   fixed above; this is so the NEXT one is a sentence rather than a trace. */
export default async (request) => {
  try {
    return await handle(request);
  } catch (err) {
    console.error('subscribe threw', err);
    return json(500, { ok: false, error: 'Something went wrong at our end.' });
  }
};
