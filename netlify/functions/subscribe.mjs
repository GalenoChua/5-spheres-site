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

export default async (request) => {
  if (request.method !== 'POST') return json(405, { ok: false, error: 'POST only' });

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: 'not json' }); }

  /* A field no human fills in. Answered means a bot, and a bot is told it worked so it
     does not come back and try a different shape. */
  if (clean(body.website, 80)) return json(200, { ok: true, skipped: 'bot' });

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
  for (const key of Object.keys(extra)) {
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
