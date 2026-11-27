/* The clock app's five languages, driven in a real browser.
 *
 *     node scripts/test_clock_languages.mjs
 *
 * WHY A BROWSER, same reason as test_clock_marking.mjs: render(), reveal() and
 * the language table live inside one IIFE in the page, so there is nothing to
 * import. The only honest way to assert what a parent sees is to lay the page
 * out, tap the buttons and read the text back.
 *
 * WHAT IT GUARDS, added 24 November 2026 with reference version 12:
 *
 *   - five in-app languages, not three, and switching actually changes the copy
 *   - the Polish reveal names the hour twice, morning and evening, and names
 *     the NEXT hour for wpol do / za kwadrans / za X, which is the half of
 *     plHourPair that a single spot check would miss
 *   - the pinyin toggle appears for Chinese and for nothing else
 *   - the trivia card offers all five languages and the 2 o'clock fact is the
 *     autumn clock change, not the watch-poster claim that was not true
 *   - no language leaves a level button, a hint or the note empty, which is
 *     what a missing key in one of the five tables looks like on the page
 *
 * IT IS NOT IN check_site.py, for the reason stated there: a check that needs
 * a browser does not run on every push. This one is opt in.
 */
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { serveRoot } from './_serve.mjs';

/* Served over http, not opened as a file: see scripts/_serve.mjs for why.
   A file:// page never loads /styles.css, so it lays out with browser defaults. */
const PATH = '/tools-for-parents/telling-the-time/';

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const where of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(where); } catch (e) { /* next */ }
  }
  console.error('This test needs playwright: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const { chromium } = loadPlaywright();

const LANGS = ['en', 'pl', 'zh', 'id', 'fr'];

/* One known phrase per language, specific enough that the wrong table cannot
   satisfy it. The prompt on level 1 is the shortest string that differs in all
   five. */
const PROMPT1 = {
  en: /What time is it\?/,
  pl: /Która godzina\?/,
  zh: /现在几点/,
  id: /Pukul berapa sekarang\?/,
  fr: /Quelle heure est-il \?/
};

async function main() {
  const site = await serveRoot();
  const PAGE = site.base + PATH;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PAGE);

  const langBtn = (code) => page.locator(`.tt-langs button[data-tt-lang="${code}"]`);
  const pick = async (code) => { await langBtn(code).click(); };

  // ---- A. five in-app languages, in the expected order -------------------
  assert.equal(await page.locator('.tt-langs button').count(), 5,
    'the app should offer five languages');
  for (const code of LANGS) {
    assert.equal(await langBtn(code).count(), 1, `the app should offer ${code}`);
  }

  // ---- B. switching changes the copy, and nothing is left blank ----------
  for (const code of LANGS) {
    await pick(code);
    assert.equal(await langBtn(code).getAttribute('aria-pressed'), 'true',
      `${code} should read as the selected language`);
    assert.match(await page.locator('#tt-prompt').innerText(), PROMPT1[code],
      `${code} should set the level 1 prompt in its own language`);
    assert.notEqual((await page.locator('#tt-hint').innerText()).trim(), '',
      `${code} should carry a hint`);
    assert.notEqual((await page.locator('#tt-note').innerText()).trim(), '',
      `${code} should carry the note under the clock`);
    assert.notEqual((await page.locator('#tt-apptitle').innerText()).trim(), '',
      `${code} should carry the app title`);
    assert.notEqual((await page.locator('#tt-score').innerText()).trim(), '',
      `${code} should carry the score line`);
    for (const lv of ['1', '2', '3', '4']) {
      const b = page.locator(`.tt-levels button[data-tt-level="${lv}"]`);
      assert.notEqual((await b.innerText()).trim(), '',
        `${code} should name level ${lv}`);
    }
  }

  // ---- C. the language row does not push the page sideways on a phone ----
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 0,
    `five language pills should not cause a sideways scroll, got ${overflow}px`);

  // ---- D. the pinyin toggle is for Chinese and nothing else --------------
  for (const code of LANGS) {
    await pick(code);
    const shown = await page.locator('#tt-pytoggle').isVisible();
    assert.equal(shown, code === 'zh',
      `the pinyin toggle should ${code === 'zh' ? '' : 'not '}show for ${code}`);
  }

  // ---- E. the Polish reveal names the hour morning and evening ----------
  // Driven through the hands rather than a random question, so the assertion
  // is about a known time and not about whatever came up.
  await pick('pl');
  const setTime = (h, m) => page.evaluate(([hh, mm]) => {
    /* The page keeps `cur` inside its IIFE, so set the time the way a parent
       does, by dragging: dispatch the same pointer maths the drag handler
       reads. Simpler and just as honest: click the hand, then move it. */
    const svg = document.getElementById('tt-clock');
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const at = (deg, frac) => {
      const a = deg * Math.PI / 180;
      return { clientX: cx + (r.width / 2) * frac * Math.sin(a),
               clientY: cy - (r.height / 2) * frac * Math.cos(a) };
    };
    const drag = (id, deg) => {
      const el = document.getElementById(id);
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      const p = at(deg, 0.7);
      window.dispatchEvent(new MouseEvent('mousemove',
        { bubbles: true, clientX: p.clientX, clientY: p.clientY }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    };
    drag('tt-minhand', mm * 6);
    drag('tt-hourhand', (hh % 12) * 30);
  }, [h, m]);

  // 6:00 -> the hour under the hand: szosta / osiemnasta
  await setTime(6, 0);
  await page.locator('#tt-reveal').click();
  let out = await page.locator('#tt-digital').innerText();
  assert.match(out, /06:00/, 'the reveal should show the digital time');
  assert.match(out, /szósta \/ osiemnasta/,
    'six o’clock in Polish should name both szósta and osiemnasta');

  // 5:30 -> "wpol do szostej", so the pair is about SIX, not five
  await setTime(5, 30);
  await page.locator('#tt-reveal').click();
  out = await page.locator('#tt-digital').innerText();
  assert.match(out, /wpół do szóstej/, 'half past five in Polish is wpół do szóstej');
  assert.match(out, /szósta \/ osiemnasta/,
    'half past five names the NEXT hour, so the pair should be szósta / osiemnasta');
  assert.ok(!/piąta \/ siedemnasta/.test(out),
    'half past five should not pair the hour under the hand');

  // 11:45 -> "za kwadrans dwunasta", and twelve has only one name
  await setTime(11, 45);
  await page.locator('#tt-reveal').click();
  out = await page.locator('#tt-digital').innerText();
  assert.match(out, /za kwadrans dwunasta/, 'quarter to twelve in Polish');
  assert.match(out, /\(dwunasta\)/,
    'twelve should be named once: dwunasta is both midday and midnight');

  // and the pair belongs to Polish alone
  await pick('en');
  await page.locator('#tt-reveal').click();
  out = await page.locator('#tt-digital').innerText();
  assert.ok(!/osiemnasta|dwunasta/.test(out),
    'the Polish hour pair should not appear in another language');

  // ---- F. the trivia card: five languages, and hour 2 is the clock change -
  assert.equal(await page.locator('.tt-tlangs button').count(), 5,
    'the trivia card should offer five languages');
  await setTime(2, 0);
  for (const code of LANGS) {
    await page.locator(`.tt-tlangs button[data-tt-t="${code}"]`).click();
    const back = await page.locator('#tt-flipback').innerText();
    assert.notEqual(back.trim(), '', `the 2 o'clock fact should be present in ${code}`);
    assert.ok(!/watch poster|plakat|海报|poster jam|affiche/i.test(back),
      `the 2 o'clock fact in ${code} should no longer be the watch-poster claim`);
  }
  await page.locator('.tt-tlangs button[data-tt-t="en"]').click();
  assert.match(await page.locator('#tt-flipback').innerText(), /clocks go back/,
    'the 2 o’clock fact should be the autumn clock change');

  assert.deepEqual(errors, [], 'the page should raise no script errors');

  await browser.close();
  await site.close();
  console.log('clock languages: all assertions pass');
}

main().catch((err) => { console.error(err); process.exit(1); });
