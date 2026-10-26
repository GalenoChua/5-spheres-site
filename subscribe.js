/* One sign-up handler, shared, instead of a fifth copy of the same thirty lines.
 *
 * WHY THIS FILE EXISTS. Every form on the site used to post to MailerLite with
 * mode:'no-cors', which cannot read a response, so the page reported success
 * whatever came back. That was not four bugs; it was one decision copied into
 * four pages. On 22 October it turned out the Resource downloads form had been
 * answering "reCAPTCHA failed" to every submission and nobody had ever been
 * added to the list.
 *
 * Four more forms, on the homepage, the application page and the sphere one
 * audit, were never in that trap because they submitted natively and the
 * visitor saw MailerLite's own answer. They were simply open: no honeypot, no
 * validation, nothing in front of them.
 *
 * Rather than paste the handler a fifth time, this is the shared one. Opt in
 * per form with data-list, so nothing changes for a form that does not carry
 * the attribute:
 *
 *     <form data-list="apply" ...>
 *
 * WITHOUT JAVASCRIPT the form still submits natively to its own action, which
 * is why the action attribute stays on the markup. That path loses the
 * honeypot and the validation, and it is better than losing the sign-up.
 */
(function () {
  'use strict';

  /* ── THE TOKEN ──────────────────────────────────────────────────────────
   *
   * The function issues one on GET and requires it on POST, so a bot posting
   * straight at the endpoint is refused. Fetched once as the page loads, so
   * submitting costs no extra wait.
   *
   * Exposed as window.signupToken() because four pages have their own submit
   * handler for their own success state, and a fifth copy of this is how the
   * no-cors bug came to be on four pages at once. Those pages load this file
   * for the helper alone; their forms carry no data-list, so the handler at
   * the bottom leaves them alone.
   *
   * Returns a promise of a token, or of null. On null the page should submit
   * anyway and let the function answer: being refused with a sentence beats
   * refusing to try. */
  var pending = null;

  function fetchToken() {
    return fetch('/.netlify/functions/subscribe', {
      method: 'GET',
      headers: { 'accept': 'application/json' },
      cache: 'no-store'
    }).then(function (r) { return r.json(); })
      .then(function (j) { return (j && j.token) || null; })
      .catch(function () { return null; });
  }

  /* One in hand at a time. A token is single use, so a second submit on the
     same page needs a fresh one; that is what clearing `pending` is for. */
  window.signupToken = function () {
    if (!pending) { pending = fetchToken(); }
    return pending;
  };
  window.signupTokenSpent = function () { pending = null; };

  /* Warm it on load so the token is already there when the form is submitted. */
  if (document.querySelector('form[data-list], input[name="fields[email]"]')) {
    window.signupToken();
  }

  function fail(form, msg) {
    var p = form.querySelector('.gate-error');
    if (!p) {
      p = document.createElement('p');
      p.className = 'gate-error';
      p.setAttribute('role', 'alert');
      var btn = form.querySelector('button[type="submit"]');
      if (btn && btn.parentNode) { btn.parentNode.insertBefore(p, btn.nextSibling); }
      else { form.appendChild(p); }
    }
    p.textContent = msg;
    p.style.display = 'block';
  }

  /* The success state. All three of MailerLite's stock embeds hid the form and
     showed a sibling .row-success, so that is the convention kept here; the
     sphere one audit uses .gate-form instead of .row-form, hence both.

     Scoped by walking UP from the form to the nearest ancestor that actually
     contains a success block, rather than guessing at a section. The homepage
     has two of these forms on one page and a section-wide selector flips both,
     so the visitor who joined the newsletter is also told the session is on its
     way. */
  function scopeFor(form) {
    var el = form;
    while (el && el !== document.body) {
      if (el.querySelector('.row-success')) { return el; }
      el = el.parentElement;
    }
    return null;
  }

  function succeed(form) {
    var scope = scopeFor(form);
    if (!scope) {
      var p = document.createElement('p');
      p.className = 'fineprint';
      p.textContent = 'Thank you. You are on the list.';
      form.parentNode.insertBefore(p, form);
      form.style.display = 'none';
      return;
    }
    scope.querySelectorAll('.row-form, .gate-form').forEach(function (el) {
      el.style.display = 'none';
    });
    scope.querySelectorAll('.row-success').forEach(function (el) {
      el.style.display = 'block';
    });
  }

  document.querySelectorAll('form[data-list]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var err = form.querySelector('.gate-error');
      if (err) { err.style.display = 'none'; }

      var btn = form.querySelector('button[type="submit"]');
      var label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

      var data = new FormData(form);
      var extra = {};
      data.forEach(function (v, k) {
        var m = /^fields\[([a-z][a-z0-9_]*)\]$/.exec(k);
        if (m && m[1] !== 'name' && m[1] !== 'email') { extra[m[1]] = v; }
      });

      window.signupToken().then(function (token) {
        window.signupTokenSpent();
        return fetch('/.netlify/functions/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            list: form.getAttribute('data-list'),
            name: data.get('fields[name]'),
            email: data.get('fields[email]'),
            website: data.get('website'),
            token: token,
            fields: extra
          })
        });
      }).then(function (r) {
        return r.json().catch(function () { return { ok: false }; });
      }).then(function (j) {
        if (j && j.ok) { succeed(form); return; }
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
        fail(form, (j && j.error) || 'We could not add you just then. Please try again.');
      }).catch(function () {
        if (btn) { btn.disabled = false; btn.innerHTML = label; }
        fail(form, 'No connection just then. Please try again.');
      });
    });
  });
})();
