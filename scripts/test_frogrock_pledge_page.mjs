/* The Frog Rock pledge panel in a real browser: the counter, what the form
 * posts, and what it says when the post fails.
 *
 *     node scripts/test_frogrock_pledge_page.mjs
 *
 * WHY THIS EXISTS SEPARATELY from test_frogrock_pledge.mjs. That one asserts
 * what the server will accept. This one asserts what the page actually sends
 * and what a backer is told, which is the half that was wrong on this site
 * before: every sign-up form said "it is on its way" whether the submission had
 * been accepted, rejected or refused outright, because the response was
 * unreadable by design.
 *
 * It also asserts the counter, which is the new thing on this page and the
 * thing with the most ways to be quietly wrong. A counter is a number a
 * stranger reads as a fact about other people, so the cases that matter are the
 * ones where the page knows nothing: a failed call, a 500, a body with no count
 * in it. None of those may render a confident zero.
 *
 * Neither function is running here. Playwright answers both fetches instead,
 * which is how the failures can be driven on demand.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { serveRoot } from './_serve.mjs';
import { validate, GOAL } from '../netlify/functions/_frogrock_pledge.mjs';

/* Served over http, not opened as a file: see scripts/_serve.mjs for why.
   A file:// page never loads /styles.css, so it lays out with browser defaults. */
const PATH = '/tools-for-parents/';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const where of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(where); } catch (e) { /* next */ }
  }
  console.error('This test needs playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}
const { chromium } = loadPlaywright();

const PLEDGE = '**/.netlify/functions/frogrock-pledge';
const COUNT = '**/.netlify/functions/frogrock-count';

async function main() {
  const site = await serveRoot();
  const PAGE = site.base + PATH;
  const browser = await chromium.launch();

  /* Every attempted post, in order, whether it was answered or not. */
  const posted = [];
  let pledgeAnswer = { status: 500, body: '{"error":"store"}' };
  let countAnswer = { status: 200, body: JSON.stringify({ count: 0, goal: 100, unit: null, percent: 0, reached: false }) };

  async function open(width = 360) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route(COUNT, (route) => route.fulfill({
      status: countAnswer.status, contentType: 'application/json', body: countAnswer.body
    }));
    await page.route(PLEDGE, async (route) => {
      posted.push({ method: route.request().method(), body: route.request().postData() });
      await route.fulfill({
        status: pledgeAnswer.status, contentType: 'application/json', body: pledgeAnswer.body
      });
    });
    await page.goto(PAGE);
    page.__errors = errors;
    return page;
  }

  let page = await open(360);
  const say = () => page.locator('#fr-say').innerText();
  const num = () => page.locator('#fr-num').innerText();
  const note = () => page.locator('#fr-note').innerText();
  const thanksShown = () => page.locator('#fr-thanks').isVisible();
  const send = () => page.locator('#fr-send');

  // ---- A. the page fits a phone ------------------------------------------
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0, `the page should not scroll sideways, got ${overflow}px`);

  // ---- B. the counter reads the function, and says so when it is empty ---
  await page.waitForFunction(() => document.getElementById('fr-num').innerText.trim() === '0');
  assert.equal((await num()).trim(), '0');
  assert.match(await note(), /Nobody yet/, 'an empty count should invite the first backer');
  assert.equal(await page.locator('#fr-of').innerText(), 'of ' + GOAL,
    'the target on the page should be the target in the module');
  assert.equal(await page.locator('#fr-bar').getAttribute('aria-valuenow'), '0');

  // ---- C. an address is required, and nothing is posted without one ------
  await send().click();
  assert.match(await say(), /need an email address/,
    'an empty submission should say what is missing');
  assert.equal(posted.length, 0, 'an incomplete submission must not be posted');
  assert.equal(await thanksShown(), false, 'nothing should be thanked yet');

  await page.locator('#fr-email').fill('parent at example.com');
  await send().click();
  assert.match(await say(), /does not look right/, 'a bad address should be named as bad');
  assert.equal(posted.length, 0, 'a bad address must not be posted');

  // ---- D. a failed post says so, and does not thank anybody --------------
  await page.locator('#fr-email').fill('parent@example.com');
  await send().click();
  await page.waitForFunction(() => /did not send/.test(
    document.getElementById('fr-say').innerText));
  assert.equal(posted.length, 1, 'an address alone should be enough to post');
  assert.match(await say(), /hello@5spheresofempathy\.com/,
    'the failure should offer the way round it');
  assert.equal(await thanksShown(), false, 'a failed post must not show the thank you');
  assert.equal(await send().isDisabled(), false,
    'the button should come back so they can try again');

  // the body is what the function accepts, checked against the function itself
  let body = JSON.parse(posted[0].body);
  assert.deepEqual(Object.keys(body).sort(),
    ['email', 'message', 'name', 'website'].sort(),
    'the page should post these four fields and no others');
  /* No money in the post, asserted rather than assumed: it is the promise this
     build makes to G, and a later edit adding a price field would break it
     here first. */
  for (const k of ['amount', 'currency', 'quantity', 'card', 'paymentToken', 'price']) {
    assert.ok(!(k in body), `the page must not post ${k}`);
  }
  assert.equal(body.website, '', 'the honeypot should go out empty');
  assert.equal(validate(body).error, undefined,
    'what the page posts should pass the function own validation');

  // ---- E. a 200 that is not {ok:true} is still a failure -----------------
  pledgeAnswer = { status: 200, body: '{"error":"email"}' };
  await send().click();
  await page.waitForFunction(() => /did not send/.test(
    document.getElementById('fr-say').innerText));
  assert.equal(await thanksShown(), false,
    'a 200 with no ok flag must not be read as success');

  // ---- F. a real success thanks them, hides the form, refetches the count -
  pledgeAnswer = { status: 200, body: '{"ok":true}' };
  countAnswer = { status: 200, body: JSON.stringify({ count: 1, goal: 100, unit: null, percent: 1, reached: false }) };
  await page.locator('#fr-name').fill('Ada');
  await page.locator('#fr-message').fill('My daughter has read it four times.');
  await send().click();
  await page.waitForFunction(() =>
    document.getElementById('fr-thanks').classList.contains('fr-show'));
  assert.equal(await thanksShown(), true, 'a success should show the thank you');
  assert.equal(await page.locator('#fr-form').isVisible(), false,
    'a success should take the form away so it cannot be sent twice');
  body = JSON.parse(posted[posted.length - 1].body);
  assert.equal(body.name, 'Ada', 'the name should be posted as typed');
  assert.equal(body.message, 'My daughter has read it four times.');
  /* The count is refetched rather than incremented in the page, because a
     second pledge from one address overwrites the first in the store and an
     incremented page would be reporting a person who is not there. */
  await page.waitForFunction(() => document.getElementById('fr-num').innerText.trim() === '1');
  assert.match(await note(), /One person so far/, 'one should read in the singular');
  assert.deepEqual(page.__errors, [], 'the page should raise no script errors');
  await page.close();

  // ---- G. a counter that knows nothing must not read zero ---------------
  for (const [label, answer] of [
    ['a 500', { status: 500, body: '{"error":"store"}' }],
    ['a body with no count', { status: 200, body: '{}' }],
    ['a count that is not a number', { status: 200, body: '{"count":"many","goal":100}' }],
    ['a body that is not json', { status: 200, body: 'not json' }]
  ]) {
    countAnswer = answer;
    page = await open(360);
    await page.waitForFunction(() => /not loading/.test(
      document.getElementById('fr-note').innerText));
    assert.notEqual((await num()).trim(), '0',
      `${label} must not render a confident zero`);
    assert.match(await note(), /The form still works/,
      `${label} should still point at the form`);
    assert.equal(await page.locator('#fr-form').isVisible(), true,
      `${label} should leave the form usable`);
    assert.deepEqual(page.__errors, [], `${label} should raise no script errors`);
    await page.close();
  }

  // ---- H. past the target, the bar stops and the count does not ----------
  countAnswer = { status: 200, body: JSON.stringify({ count: 137, goal: 100, unit: null, percent: 100, reached: true }) };
  page = await open(360);
  await page.waitForFunction(() => document.getElementById('fr-num').innerText.trim() === '137');
  assert.equal(await page.locator('#fr-bar').getAttribute('aria-valuenow'), '100',
    'the bar should stop at full');
  assert.match(await note(), /hundred is there/,
    'reaching the target should say so rather than reading as one more step');
  await page.close();

  // ---- I. the two offers are separate on a phone and side by side wide ---
  /* The brief asks for free tools on one side and a thing to back on the other.
     Measured rather than eyeballed, because a grid that silently collapses to
     one column at 1200px puts a pledge form directly under a free tool and the
     page stops making the distinction it was built to make. */
  countAnswer = { status: 200, body: JSON.stringify({ count: 0, goal: 100, unit: null, percent: 0, reached: false }) };
  for (const [width, sideBySide] of [[360, false], [1200, true]]) {
    page = await open(width);
    const box = await page.evaluate(() => {
      const sides = [...document.querySelectorAll('.tfp-split > .tfp-side')];
      return sides.map((s) => {
        const r = s.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top) };
      });
    });
    assert.equal(box.length, 2, 'there should be exactly two sides');
    const same = box[0].top === box[1].top && box[0].left !== box[1].left;
    assert.equal(same, sideBySide,
      `at ${width}px the two offers should ${sideBySide ? '' : 'not '}sit side by side`);
    await page.close();
  }

  // ---- J. the panel says the price is not settled, before it asks ------
  /* G has not decided what the next installment is, what a hundred counts or
     what one costs. The page must not read as a shop, and the order matters:
     somebody who types an address has to have passed the sentence saying no
     money is taken. */
  page = await open(1200);
  const order = await page.evaluate(() => {
    const pending = document.querySelector('.fr-pending');
    const email = document.getElementById('fr-email');
    return {
      pending: pending ? pending.innerText : '',
      pendingTop: pending.getBoundingClientRect().top,
      emailTop: email.getBoundingClientRect().top
    };
  });
  assert.match(order.pending, /not a sale/i, 'the panel should say it is not a sale');
  assert.match(order.pending, /no money is taken/i,
    'the panel should say no money is taken');
  assert.ok(order.pendingTop < order.emailTop,
    'the open questions should sit above the address field, not below it');
  /* And no payment field anywhere on the page, which is the hard limit this
     build was given. */
  const money = await page.evaluate(() => [...document.querySelectorAll('input, select')]
    .map((el) => (el.name || '') + ' ' + (el.id || '') + ' ' + (el.type || ''))
    .filter((s) => /card|cvc|cvv|iban|amount|price|quantity|payment/i.test(s)));
  assert.deepEqual(money, [], 'the page must carry no payment field of any kind');
  assert.deepEqual(page.__errors, [], 'the page should raise no script errors');
  await page.close();

  await browser.close();
  await site.close();
  console.log('frogrock pledge page: all assertions pass');
}

main().catch((err) => { console.error(err); process.exit(1); });
