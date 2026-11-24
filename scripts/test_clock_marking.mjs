/* The clock app's marking buttons, driven in a real browser.
 *
 *     node scripts/test_clock_marking.mjs
 *
 * WHY A BROWSER. The behaviour under test is entirely about when the two
 * buttons exist in the DOM and what survives a rebuild of them. There is no
 * exported function to call: render(), reveal() and showMark() live inside one
 * IIFE in the page. So the only honest way to assert it is to lay the page out
 * and tap the buttons.
 *
 * WHAT IT GUARDS. Levels 1 to 3 used to get "Got it" and "Missed" only after
 * "Show answer" was tapped, and reveal() rebuilt them from scratch. The rebuild
 * wiped which one the parent had tapped and handed back two buttons that looked
 * live and were dead, because the done flag sits on the container and survived
 * c.innerHTML = "". Both halves are asserted below.
 *
 * IT IS NOT IN check_site.py, on purpose, for the reason stated there: a check
 * that needs a browser does not get run on every push. This one is opt in.
 */
import assert from 'node:assert';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PAGE = pathToFileURL(
  path.join(ROOT, 'tools-for-parents', 'telling-the-time', 'index.html')).href;

/* Playwright is not a dependency of this repo. It is normally installed
   globally beside the browser binary, so try the plain name first and then the
   usual global location. */
function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const where of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(where); } catch (e) { /* next */ }
  }
  console.error('This test needs playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const { chromium } = loadPlaywright();

const text = (el) => el.innerText.trim();

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PAGE);

  const marks = () => page.locator('#tt-choices button');
  const score = () => page.locator('#tt-score').innerText();
  const digital = () => page.locator('#tt-digital').innerText();

  // ---- A. the buttons are there with the question, no reveal needed --------
  assert.equal(await marks().count(), 2,
    'level 1 should render two marking buttons with the question');
  assert.match(await marks().nth(0).innerText(), /Got it/,
    'the first marking button should be "Got it"');
  assert.match(await marks().nth(1).innerText(), /Missed/,
    'the second marking button should be "Missed"');
  assert.equal((await digital()).trim(), '',
    'the answer should not be showing before "Show answer" is tapped');
  assert.match(await score(), /Correct: 0 of 0/);

  // ---- B. marking moves the score and locks the pair ----------------------
  await marks().nth(0).click();
  assert.match(await score(), /Correct: 1 of 1/, 'marking "Got it" should score 1 of 1');
  assert.equal(await marks().nth(0).isDisabled(), true, 'the pair should lock after a mark');
  assert.equal(await marks().nth(1).isDisabled(), true, 'the pair should lock after a mark');

  // ---- C. a reveal after marking must not wipe the mark -------------------
  await page.locator('#tt-reveal').click();
  assert.notEqual((await digital()).trim(), '', '"Show answer" should fill the readout');
  assert.match(await score(), /Correct: 1 of 1/, 'a reveal must not change the score');
  assert.equal(await marks().count(), 2, 'a reveal must not add or remove marking buttons');
  assert.equal(await marks().nth(0).isDisabled(), true,
    'a reveal must not hand back buttons that look live and are dead');
  assert.equal(await marks().nth(0).evaluate((b) => b.style.opacity), '1',
    'the tapped button should stay the full-strength one');
  assert.equal(await marks().nth(1).evaluate((b) => b.style.opacity), '0.45',
    'the untapped button should stay the faded one');

  // ---- D. a new question resets the buttons and the reveal ----------------
  await page.locator('#tt-newq').click();
  assert.equal(await marks().count(), 2, 'a new question should rebuild the marking buttons');
  assert.equal(await marks().nth(0).isDisabled(), false, 'a new question should unlock them');
  assert.equal((await digital()).trim(), '', 'a new question should clear the revealed answer');
  assert.match(await score(), /Correct: 1 of 1/, 'a new question should keep the running score');

  // ---- E. marking AFTER a reveal still works -----------------------------
  await page.locator('#tt-reveal').click();
  await marks().nth(1).click();
  assert.match(await score(), /Correct: 1 of 2/, 'marking after a reveal must not be blocked');

  // ---- F. level 4 is unchanged: four digital choices, no marking pair -----
  await page.locator('.tt-levels button[data-tt-level="4"]').click();
  assert.equal(await marks().count(), 4, 'level 4 should offer four digital times');
  const labels = await marks().allInnerTexts();
  for (const label of labels) {
    assert.match(label.trim(), /^\d\d:\d\d$/, 'level 4 choices should be digital times');
  }

  // ---- G. levels 2 and 3 behave like level 1 ------------------------------
  for (const lv of ['2', '3']) {
    await page.locator(`.tt-levels button[data-tt-level="${lv}"]`).click();
    assert.equal(await marks().count(), 2, `level ${lv} should render the marking pair`);
    assert.match(await marks().nth(0).innerText(), /Got it/,
      `level ${lv} should render "Got it" with the question`);
  }

  assert.deepEqual(errors, [], 'the page should raise no script errors');

  await browser.close();
  console.log('clock marking: all assertions pass');
}

main().catch((err) => { console.error(err); process.exit(1); });
