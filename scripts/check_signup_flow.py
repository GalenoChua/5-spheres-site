# -*- coding: utf-8 -*-
"""Submit every sign-up form in a real browser and read what it actually sends.

    python scripts/check_signup_flow.py                     against production
    python scripts/check_signup_flow.py http://localhost:8899

WHAT MAKES THIS SAFE TO RUN ANYWHERE. The POST to the function is intercepted
and answered with {"ok":true}, so no subscriber is written and MailerLite is
never reached. What it proves is the half that neither the static checks nor the
function's unit tests can reach: that the deployed PAGE and the deployed
FUNCTION agree. The page has to fetch a token, put it in the body, name the
right list, and then render its own success state.

WHY IT EXISTS. On 22 October every form on this site had been reporting success
for months while adding nobody, because the page could not read the response it
was given. On 26 October the function began requiring a sign-up token, which is
one more thing every page has to get right and one more way for all of them to
break at once.

The honeypot measurement is here for the same reason. The first version of it
shipped visible on two pages, because those pages do not load styles.css and the
rule that hid it lived there. Playwright's is_visible() returned true on all
four pages and so distinguished nothing; a bounding box does.
"""
import json
import re
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = (sys.argv[1].rstrip("/") if len(sys.argv) > 1
        else "https://5spheresofempathy.com")

PAGES = ["/", "/apply", "/resources/sphere-1-self-audit/", "/bsfp-accelerator/",
         "/events/public-speaking/", "/events/the-sensing-drill/",
         "/resources/kpq/"]

# The homepage carries two forms for two different lists. MailerLite's own
# script kept them apart with a per-form callback; the shared handler has to do
# the same. A section-wide selector flips both, so the visitor who joined the
# newsletter is also told the coaching session is on its way.
PAIRS = [("/", 0, "empathy-coach"), ("/", 1, "inbox")]

TOKEN = re.compile(r"^\d{13}\.[0-9a-f]{32}\.[0-9a-f]{64}$")
EMAIL = "qa-signup-flow@example.com"

FORM = 'form:has(input[name="fields[email]"])'

fails = []


def intercept(page, sent):
    """Answer the function ourselves, so this writes nothing anywhere."""
    def route(r):
        if r.request.method == "POST":
            try:
                sent.append(json.loads(r.request.post_data or "{}"))
            except ValueError:
                sent.append({"unparseable": r.request.post_data})
            r.fulfill(status=200, content_type="application/json",
                      body='{"ok":true}')
        else:
            r.continue_()
    page.route("**/.netlify/functions/subscribe", route)


FILL = """(i) => {
  const f = document.querySelectorAll(%s)[i];
  f.querySelector('input[name="fields[name]"]').value = 'QA signup flow';
  f.querySelector('input[name="fields[email]"]').value = %s;
  /* Satisfy every OTHER required control, whatever it happens to be. The
     sensing drill has a required fields[attendance] select, and the first
     version of this check read the resulting refusal as a broken page. */
  for (const el of f.querySelectorAll('[required]')) {
    if (el.name === 'fields[name]' || el.name === 'fields[email]') continue;
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find(o => o.value);
      if (opt) { el.value = opt.value; }
    } else if (el.type === 'radio' || el.type === 'checkbox') {
      el.checked = true;
    } else {
      el.value = 'A check';
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const bad = [...f.elements].filter(e => !e.checkValidity())
    .map(e => (e.name || e.type) + ': ' + e.validationMessage);
  f.querySelector('button[type=submit]').click();
  return bad;
}""" % (json.dumps(FORM), json.dumps(EMAIL))


def submit(page, index=0):
    """Fill form `index` on the page, submit it, and return anything invalid."""
    return page.evaluate(FILL, index)


VISIBLE = """() => {
  const tall = (el) => el.getBoundingClientRect().height > 4;
  return {
    successes: [...document.querySelectorAll('.row-success, .gate-download')]
      .filter(tall).length,
    forms: [...document.querySelectorAll(%s)].filter(tall).length,
    error: ([...document.querySelectorAll('.gate-error')]
      .map(e => e.textContent.trim()).filter(Boolean)[0]) || ''
  };
}""" % json.dumps(FORM)


def honeypots(page):
    return page.evaluate("""() => [...document.querySelectorAll('input[name="website"]')]
        .map(el => { const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height),
                   x: Math.round(r.left) }; })""")


def check_each_page(browser):
    for path in PAGES:
        ctx = browser.new_context(viewport={"width": 1280, "height": 1000})
        page = ctx.new_page()
        sent, errs = [], []
        intercept(page, sent)
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(BASE + path, wait_until="networkidle")

        pots = honeypots(page)
        if not pots:
            fails.append("%s: no honeypot at all" % path)
        for pot in pots:
            if pot["x"] > -1000 and (pot["w"] > 2 or pot["h"] > 2):
                fails.append("%s: honeypot renders %dx%d at x=%d"
                             % (path, pot["w"], pot["h"], pot["x"]))

        if not page.query_selector(FORM):
            fails.append("%s: no sign-up form found" % path)
            ctx.close()
            continue

        invalid = submit(page)
        if invalid:
            fails.append("%s: form was invalid before submit: %s" % (path, invalid))
        page.wait_for_timeout(1200)

        token_ok = bool(sent) and bool(TOKEN.match(str(sent[0].get("token") or "")))
        if not sent:
            fails.append("%s: submitting posted nothing to the function" % path)
        else:
            if not token_ok:
                fails.append("%s: posted token %r is not the expected shape"
                             % (path, str(sent[0].get("token"))[:46]))
            if not sent[0].get("list"):
                fails.append("%s: posted no list" % path)
            if sent[0].get("email") != EMAIL:
                fails.append("%s: posted email %r" % (path, sent[0].get("email")))

        state = page.evaluate(VISIBLE)
        if not state["successes"]:
            fails.append("%s: no success state after a successful submit%s"
                         % (path, (" (said %r)" % state["error"][:70])
                            if state["error"] else ""))
        if errs:
            fails.append("%s: javascript error %s" % (path, errs[0][:90]))

        print("  %-34s list=%-18s token=%-3s success=%s"
              % (path, (sent[0].get("list") if sent else "-"),
                 "ok" if token_ok else "NO",
                 "shown" if state["successes"] else "MISSING"))
        ctx.close()


def check_homepage_pair(browser):
    for path, idx, want in PAIRS:
        ctx = browser.new_context(viewport={"width": 1280, "height": 1000})
        page = ctx.new_page()
        sent = []
        intercept(page, sent)
        page.goto(BASE + path, wait_until="networkidle")
        submit(page, idx)
        page.wait_for_timeout(1200)

        got = sent[0].get("list") if sent else None
        if got != want:
            fails.append("%s form %d posted list %r, expected %r"
                         % (path, idx, got, want))
        state = page.evaluate(VISIBLE)
        if state["successes"] != 1:
            fails.append("%s form %d: %d success blocks shown, expected 1"
                         % (path, idx, state["successes"]))
        if state["forms"] != 1:
            fails.append("%s form %d: %d form(s) left on screen, expected the other one"
                         % (path, idx, state["forms"]))
        print("  %-34s form %d -> list=%-16s successes=%d  other form intact=%s"
              % (path, idx, got, state["successes"], state["forms"] == 1))
        ctx.close()


def main():
    print("%s\n" % BASE)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        check_each_page(browser)
        print()
        check_homepage_pair(browser)
        browser.close()

    print()
    for f in fails:
        print("  FAIL  " + f)
    if fails:
        print("\n%d problem(s)." % len(fails))
        return 1
    print("every form posts a token, names its list, and shows its success state")
    return 0


if __name__ == "__main__":
    sys.exit(main())
