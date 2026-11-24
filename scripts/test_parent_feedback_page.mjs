/* The feedback form in a real browser: what it posts, and what it says when
 * the post fails.
 *
 *     node scripts/test_parent_feedback_page.mjs
 *
 * WHY THIS EXISTS SEPARATELY from test_parent_feedback.mjs. That one asserts
 * what the server will accept. This one asserts what the page actually sends
 * and what the parent is told, which is the half that was wrong on this site
 * before: every sign-up form said "it is on its way" whether the submission had
 * been accepted, rejected, or refused outright, because the response was
 * unreadable by design. A form that thanks somebody for an answer that never
 * arrived is worse than one that fails loudly, so the failure path is asserted
 * first and hardest.
 *
 * The function is not running here. Playwright answers the fetch instead, which
 * is how both the failure and the success can be driven on demand.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { serveRoot } from './_serve.mjs';
import { HELPED, MINUTES, TOOLS, validate }
  from '../netlify/functions/_parent_feedback.mjs';

/* Served over http, not opened as a file: see scripts/_serve.mjs for why.
   A file:// page never loads /styles.css, so it lays out with browser defaults. */
const PATH = '/tools-for-parents/feedback/';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const where of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(where); } catch (e) { /* next */ }
  }
  console.error('This test needs playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const ENDPOINT = '**/.netlify/functions/parent-feedback';

async function main() {
  const site = await serveRoot();
  const PAGE = site.base + PATH;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  /* Every attempted post, in order, whether it was answered or not. */
  const posted = [];
  let answer = { status: 500, body: '{"error":"store"}' };
  await page.route(ENDPOINT, async (route) => {
    const req = route.request();
    posted.push({ method: req.method(), body: req.postData() });
    await route.fulfill({
      status: answer.status,
      contentType: 'application/json',
      body: answer.body
    });
  });

  await page.goto(PAGE);

  const say = () => page.locator('#pf-say').innerText();
  const thanksShown = () => page.locator('#pf-thanks').isVisible();
  const send = () => page.locator('#pf-send');

  // ---- A. the page fits a phone -----------------------------------------
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `the form should not scroll sideways, got ${overflow}px`);

  // ---- B. an empty submission is refused in the page, and posts nothing --
  await send().click();
  assert.match(await say(), /Pick one for the first question/,
    'an empty submission should name the first missing answer');
  assert.equal(posted.length, 0, 'an incomplete submission must not be posted');
  assert.equal(await thanksShown(), false, 'nothing should be thanked yet');

  await page.locator('label[for="pf-h-partly"]').click();
  await send().click();
  assert.match(await say(), /how long you were sat together/,
    'the second missing answer should be named next');
  assert.equal(posted.length, 0, 'still nothing to post');

  // ---- C. the text answer is optional ------------------------------------
  await page.locator('label[for="pf-m-2"]').click();
  await send().click();
  await page.waitForFunction(() => document.querySelectorAll('#pf-say').length &&
    !/Sending\.$/.test(document.getElementById('pf-say').innerText));
  assert.equal(posted.length, 1, 'the two radio answers alone should be enough to post');

  // ---- D. a failed post says so, and does not thank anybody --------------
  assert.match(await say(), /did not send/,
    'a 500 should be reported to the parent, not hidden');
  assert.match(await say(), /hello@5spheresofempathy\.com/,
    'the failure should offer the way round it');
  assert.equal(await thanksShown(), false,
    'a failed post must not show the thank you');
  assert.equal(await send().isDisabled(), false,
    'the button should come back so the parent can try again');

  // the body is what the function accepts, checked against the function itself
  let body = JSON.parse(posted[0].body);
  assert.deepEqual(Object.keys(body).sort(),
    ['helped', 'learned', 'minutes', 'tool'].sort(),
    'the page should post these four fields and no others');
  assert.ok(HELPED.includes(body.helped), 'helped should be a value the function allows');
  assert.ok(MINUTES.includes(body.minutes), 'minutes should be a value the function allows');
  assert.ok(TOOLS.includes(body.tool), 'tool should be a value the function allows');
  assert.equal(validate(body).error, undefined,
    'what the page posts should pass the function’s own validation');

  // ---- E. a 200 that is not {ok:true} is still a failure -----------------
  answer = { status: 200, body: '{"error":"token"}' };
  await send().click();
  await page.waitForFunction(() => /did not send/.test(
    document.getElementById('pf-say').innerText));
  assert.equal(await thanksShown(), false,
    'a 200 with no ok flag must not be read as success');

  // ---- F. a real success thanks them and hides the form ------------------
  answer = { status: 200, body: '{"ok":true}' };
  await page.locator('#pf-learned').fill('She got half past on her own.');
  await send().click();
  await page.waitForFunction(() =>
    document.getElementById('pf-thanks').classList.contains('pf-show'));
  assert.equal(await thanksShown(), true, 'a success should show the thank you');
  assert.equal(await page.locator('#pf-form').isVisible(), false,
    'a success should take the form away so it cannot be sent twice');
  body = JSON.parse(posted[posted.length - 1].body);
  assert.equal(body.learned, 'She got half past on her own.',
    'the text answer should be posted as typed');

  // ---- G. the counter counts the characters that are left ----------------
  assert.deepEqual(errors, [], 'the page should raise no script errors');
  await page.goto(PAGE);
  assert.match(await page.locator('#pf-count').innerText(), /^1000 characters left$/);
  await page.locator('#pf-learned').fill('x'.repeat(999));
  assert.match(await page.locator('#pf-count').innerText(), /^1 character left$/,
    'one left should read in the singular');

  assert.deepEqual(errors, [], 'the page should raise no script errors');
  await browser.close();
  await site.close();
  console.log('parent feedback page: all assertions pass');
}

main().catch((err) => { console.error(err); process.exit(1); });
