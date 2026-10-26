"""The checks that would have caught what the 22 October QA found.

    python scripts/check_site.py            static checks, no network
    python scripts/check_site.py --render   also opens a browser and measures
    python scripts/check_site.py --live     also posts a real sign-up

WHY THIS EXISTS. Leo Huynh's QA report found seven issues and Marika Vallier
two more. Five of the nine were things no person should have had to find:

  * every form posted with mode:'no-cors', which cannot read a response, so the
    page reported success whatever MailerLite said. It had been saying
    "reCAPTCHA failed" and nobody had ever been added to the list.
  * the honeypot that hides on two pages rendered as a plain text input on the
    other two, because they do not load the shared stylesheet.
  * the calendar file disagreed with its own page by four hours.

None of those looked broken. That is the common thread: a page that silently
does the wrong thing is indistinguishable from a page nobody used, and the only
thing that tells them apart is a check that runs whether or not anyone looks.

WHAT IT DELIBERATELY DOES NOT DO. It does not render. Pixel checks belong in
the render harness, and a check that needs a browser does not get run.
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

# A button label containing an arrow crashed the failure report on a cp1252
# console, so the one run that had something to say could not say it.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://5spheresofempathy.com"
SKIP_DIRS = {".git", "node_modules", ".netlify", "ops-log", "scripts",
             "5 Spheres of Empathy", "5 Spheres of Empathy Books",
             "Global Sustainability Tours", "course-export", "renders"}

problems = []
checks = 0


def check(ok, what, detail=""):
    global checks
    checks += 1
    if not ok:
        problems.append(what + ((" — " + detail) if detail else ""))


def pages():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
        for f in files:
            # PREVIEW-* and _* are local working copies. They are untracked and
            # the host returns 404 for them, so holding them to the live rules
            # only teaches people to ignore the output.
            if f.startswith("PREVIEW-") or f.startswith("_"):
                continue
            if f.endswith(".html"):
                yield os.path.join(base, f)


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


# ---------------------------------------------------------------- forms ---
def strip_comments(html):
    """Comments describe the bug; they are not the bug.

    The note explaining why no-cors was removed contains the words "mode:
    'no-cors'", and the first version of this check failed the page that had
    been fixed.
    """
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    html = re.sub(r"/\*.*?\*/", "", html, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", html)


def check_forms():
    """A sign-up page has to be able to tell success from failure.

    A page that submits NATIVELY is not in that trap: the browser navigates and
    MailerLite's own page reports the result, so the visitor is told. The trap
    is intercepting with JavaScript and then not reading the answer. Only pages
    that intercept are held to the function.
    """
    signup = [p for p in pages()
              if 'name="fields[email]"' in io.open(p, encoding="utf-8").read()]
    check(len(signup) >= 7, "found %d sign-up page(s), expected at least 7" % len(signup))

    for path in signup:
        raw = io.open(path, encoding="utf-8").read()
        html = strip_comments(raw)
        name = rel(path)
        intercepts = "addEventListener('submit'" in html or 'addEventListener("submit"' in html
        if not intercepts:
            continue

        # 1. the bug itself
        check("mode: 'no-cors'" not in html and 'mode: "no-cors"' not in html,
              "%s: intercepts the submit and posts with no-cors" % name,
              "the response is unreadable, so the page cannot know if it worked")

        # 2. and that it goes somewhere that answers
        check("/.netlify/functions/subscribe" in html,
              "%s: intercepts the submit but does not use the subscribe function" % name)

        # 3. a honeypot per form, hidden ON THE ELEMENT. A class is not enough:
        #    two of these pages do not load styles.css and the field rendered
        #    full size on both.
        forms = html.count("<form")
        pots = re.findall(r'<input[^>]*name="website"[^>]*>', html)
        check(len(pots) == forms,
              "%s: %d form(s) but %d honeypot(s)" % (name, forms, len(pots)))
        for tag in pots:
            check("left:-9999px" in tag.replace(" ", ""),
                  "%s: honeypot is not pinned off screen on the element" % name,
                  "a stylesheet rule does not reach every page")


# ---------------------------------------------------------------- links ---
def check_links():
    """Every internal href has to resolve to something on disk."""
    seen = {}
    for path in pages():
        html = io.open(path, encoding="utf-8").read()
        for href in re.findall(r'href="(/[^"#?]*)', html):
            seen.setdefault(href, set()).add(rel(path))

    for href, where in sorted(seen.items()):
        target = href.lstrip("/")
        candidates = [
            os.path.join(ROOT, target.replace("/", os.sep)),
            os.path.join(ROOT, target.replace("/", os.sep), "index.html"),
        ]
        check(any(os.path.exists(c) for c in candidates),
              "dead internal link %s" % href,
              "linked from " + ", ".join(sorted(where)[:3]))


# -------------------------------------------------------------- calendar ---
def check_calendar():
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import build_ics
    drift = build_ics.main(write=False)
    check(not drift, "calendar file(s) disagree with events/_events.json",
          ", ".join(drift))



# ---------------------------------------------------------------- render ---
"""Landing pages: the ask has to be on the first screen."""
LANDING = ["/resources/kpq/"]


def check_render():
    """The one check that needs a browser, and the one that caught the keynote.

    G, 26 October: "the form and CTAs should have been at the top of list, this
    must be a hard design thing for next time."

    On 23 October the QR on a keynote slide pointed at /kpq. Redirect, page and
    form all worked. The gate sat 11,481px down a 13,524px page, 13.6 phone
    screens, with no button of any kind on the first screen. People walked up
    and asked for the worksheet in person. Sign-ups: zero.

    Markup cannot answer this. It is a rendered-height question, so it needs a
    browser, which is why it is opt in rather than in the default run.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        check(False, "render checks need playwright", "pip install playwright")
        return

    with sync_playwright() as pw:
        b = pw.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844},
                            is_mobile=True, has_touch=True)
        page = ctx.new_page()
        for path in LANDING:
            page.goto(SITE + path, wait_until="networkidle")
            d = page.evaluate("""() => {
              const H = innerHeight;
              const cta = document.querySelector(
                '.kpq-gate-form button[type=submit], form button[type=submit], a.btn');
              if (!cta) return { none: true, H };
              const r = cta.getBoundingClientRect();
              return { H, top: Math.round(r.top), bottom: Math.round(r.bottom),
                       label: cta.textContent.trim().slice(0, 30),
                       doc: document.documentElement.scrollHeight };
            }""")
            if d.get("none"):
                check(False, "%s has no call to action at all" % path)
                continue
            check(d["bottom"] <= d["H"],
                  "%s: the primary action is below the fold at 390px" % path,
                  "%r ends at %dpx of a %dpx screen, %0.1f screens down"
                  % (d["label"], d["bottom"], d["H"], d["top"] / d["H"]))
        ctx.close()
        b.close()

# ------------------------------------------------------------------ live ---
def check_live():
    """Post a real sign-up through the deployed function and read the answer.

    This is the only check that proves the thing end to end, and it is opt in
    because it writes a subscriber. The address is obviously disposable.
    """
    import json as _json
    url = SITE + "/.netlify/functions/subscribe"
    cases = [
        ("rejects a fake email", {"list": "resource-downloads", "name": "QA",
                                  "email": "test@test"}, False),
        ("rejects a blank name", {"list": "resource-downloads", "name": "  ",
                                  "email": "qa@example.com"}, False),
        ("accepts a real sign-up", {"list": "resource-downloads",
                                    "name": "QA automated check",
                                    "email": "qa-automated-check@example.com"}, True),
    ]
    # A body of the four characters `null` parses fine and then threw, and
    # Netlify answers a throw with 502 and the stack trace. Raw, not via the
    # case list, because the point is that it is not an object.
    req = urllib.request.Request(url, data=b"null",
                                 headers={"content-type": "application/json"},
                                 method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read().decode()
            code = r.status
    except urllib.error.HTTPError as e:
        raw, code = e.read().decode(), e.code
    check(code == 400 and "trace" not in raw and "errorType" not in raw,
          "live: a null body must not leak a stack trace",
          "got %s %s" % (code, raw[:100]))

    for label, body, want_ok in cases:
        req = urllib.request.Request(
            url, data=_json.dumps(body).encode(),
            headers={"content-type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                got = _json.loads(r.read())
        except urllib.error.HTTPError as err:
            got = _json.loads(err.read())
        except Exception as err:          # network, DNS, timeout
            check(False, "live: %s" % label, repr(err))
            continue
        check(bool(got.get("ok")) == want_ok, "live: %s" % label,
              "got %s" % _json.dumps(got)[:120])


def main():
    check_forms()
    check_links()
    check_calendar()
    if "--render" in sys.argv:
        check_render()
    if "--live" in sys.argv:
        check_live()

    print("%d checks" % checks)
    if problems:
        print()
        for p in problems:
            print("  FAIL  " + p)
        print("\n%d problem(s)." % len(problems))
        return 1
    print("site checks pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
