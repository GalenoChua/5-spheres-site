/* Course progress, for the Business Sustainability First Principles lessons.
 *
 * ONE FILE, LOADED BY ALL EIGHTEEN PAGES. It replaces an inline script that was
 * copied into each of them. Eighteen copies of the same logic is eighteen
 * places to forget when one changes.
 *
 * IT WORKS SIGNED OUT, UNCHANGED. The course is public and free, and nobody has
 * to make an account to take it. localStorage does exactly what it did before:
 * visiting a lesson ticks it, the sidebar shows the ticks, the bar fills.
 *
 * SIGNED IN, THE SAME PROGRESS FOLLOWS YOU. The visit is also posted to the
 * platform, so a phone and a laptop agree, and clearing site data no longer
 * loses where you were. On the first signed-in visit, whatever this device
 * already remembers is offered to the account rather than thrown away.
 *
 * WHERE THINGS LIVE, because it is a fair question:
 *   localStorage  the reader's own browser, on their own machine. Not ours.
 *   the platform  our database, but only for people who chose to sign in.
 *
 * The platform call is best-effort. If it fails, is blocked, or the reader has
 * no account, the page behaves exactly as it did before this file existed. A
 * course that breaks because an API is down would be a worse course.
 */
(function () {
  var KEY = 'bsfp-progress';
  var IMPORTED = 'bsfp-progress-imported';
  var COURSE = 'bsfp';
  var API = 'https://app.5spheresofempathy.com/api/course/progress';
  var TOTAL = 18;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; }
  }
  function write(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  var here = document.querySelector('.side-item.current');
  var slug = here && here.dataset ? here.dataset.slug : null;

  var done = read();
  if (slug) { done[slug] = 1; write(done); }

  /* Paint from whatever we have now. The network may add to this later, and a
     reader should never watch an empty sidebar while a request is in flight. */
  function paint(map) {
    document.querySelectorAll('.side-item').forEach(function (a) {
      if (map[a.dataset.slug]) a.classList.add('done');
    });
    var n = Object.keys(map).length;
    var count = document.querySelector('[data-progress-count]');
    var fill = document.querySelector('[data-progress-fill]');
    if (count) count.textContent = n;
    if (fill) fill.style.width = Math.round((n / TOTAL) * 100) + '%';
    if (n >= TOTAL) {
      var cert = document.querySelector('.side-cert');
      if (cert) cert.classList.add('ready');
    }
    return n;
  }

  paint(done);

  /* ── the signed-in half ─────────────────────────────────────────────
   *
   * credentials: 'include' is what makes the session cookie travel, because
   * this is a different origin from the page. Without it every call looks
   * signed out and the feature silently does nothing.
   */
  function api(method, body) {
    return fetch(API + (method === 'GET' ? '?course=' + COURSE : ''), {
      method: method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return r.ok ? r.json() : null; });
  }

  api('GET').then(function (state) {
    if (!state || !state.signedIn) return;      // not signed in: nothing more to do

    /* First signed-in visit on this device: hand over what the browser already
       remembers. Marked as imported on the server, because the date is when it
       was imported and not when the lesson was read. Done once, so a reader who
       deliberately clears their progress does not have it restored. */
    var alreadyOffered = false;
    try { alreadyOffered = localStorage.getItem(IMPORTED) === '1'; } catch (e) {}

    var mine = Object.keys(read());
    var theirs = state.done || [];
    var toImport = mine.filter(function (s) { return theirs.indexOf(s) === -1; });

    var chain = Promise.resolve(state);
    if (!alreadyOffered && toImport.length) {
      chain = api('POST', { course: COURSE, import: toImport }).then(function (r) {
        try { localStorage.setItem(IMPORTED, '1'); } catch (e) {}
        return r || state;
      });
    }

    chain.then(function () {
      /* Record this visit as a real one, after any import, so it is stored as a
         visit rather than swept into the imported batch. */
      if (slug) { return api('POST', { course: COURSE, lesson: slug }); }
    }).then(function () {
      return api('GET');
    }).then(function (fresh) {
      if (!fresh || !fresh.signedIn) return;

      /* The account is now the fuller picture, so fold it back into this device.
         Someone who did lessons on their phone sees those ticks here too. */
      var map = read();
      (fresh.done || []).forEach(function (s) { map[s] = 1; });
      write(map);
      paint(map);

      /* Point the certificate at the real thing rather than an email. */
      var cert = document.querySelector('.side-cert');
      if (cert) {
        cert.setAttribute('href', 'https://app.5spheresofempathy.com/certificate?course=' + COURSE);
        cert.removeAttribute('target');
        if (fresh.certificate) { cert.textContent = 'Your certificate'; }
      }
    }).catch(function () { /* best effort, see the note at the top */ });
  }).catch(function () { /* same */ });
})();
