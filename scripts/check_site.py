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
             "5 Spheres Admin",
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
    """Every sign-up form goes through the function, carries a honeypot, and
    asks for a token.

    The exemption that used to be here said a page submitting NATIVELY was not
    in the no-cors trap, which was true, and it meant four forms were exempt
    from every other rule as well. They were MailerLite's stock embeds: no
    honeypot, no validation, nothing in front of them, on the homepage, the
    application page and the sphere one audit. On 26 October they were wired to
    the shared handler, so nothing is exempt now.
    """
    signup = [p for p in pages()
              if 'name="fields[email]"' in io.open(p, encoding="utf-8").read()]
    check(len(signup) >= 7, "found %d sign-up page(s), expected at least 7" % len(signup))

    for path in signup:
        raw = io.open(path, encoding="utf-8").read()
        html = strip_comments(raw)
        name = rel(path)
        forms = html.count("<form")

        # 1. the original bug
        check("mode: 'no-cors'" not in html and 'mode: "no-cors"' not in html,
              "%s: posts with no-cors" % name,
              "the response is unreadable, so the page cannot know if it worked")

        # 2. it has to reach something that answers. Either the page has its own
        #    handler, or it opts its forms in to the shared one.
        own = "/.netlify/functions/subscribe" in html
        shared = "/subscribe.js" in html and html.count('data-list=') >= forms
        check(own or shared,
              "%s: does not go through the subscribe function" % name,
              "no own handler, and %d of %d form(s) carry data-list"
              % (html.count('data-list='), forms))

        # 3. the token. A page with its own handler has to ask for one; a page on
        #    the shared handler gets it from /subscribe.js.
        check("/subscribe.js" in html,
              "%s: does not load /subscribe.js, so it sends no sign-up token" % name,
              "the function refuses a POST without one")
        if own:
            check("signupToken" in html,
                  "%s: has its own handler but never calls signupToken()" % name)

        # 4. MailerLite's own script must be gone. Left in place beside our
        #    handler it submits the form a second time, and it is what pulled
        #    jQuery from assets.mlcdn.com at runtime.
        check("groot.mailerlite.com" not in html,
              "%s: still loads MailerLite's webforms script" % name,
              "it would submit the form a second time")

        # 5. a honeypot per form, hidden ON THE ELEMENT. A class is not enough:
        #    two of these pages do not load styles.css and the field rendered
        #    full size on both.
        pots = re.findall(r'<input[^>]*name="website"[^>]*>', html)
        check(len(pots) == forms,
              "%s: %d form(s) but %d honeypot(s)" % (name, forms, len(pots)))
        for tag in pots:
            check("left:-9999px" in tag.replace(" ", ""),
                  "%s: honeypot is not pinned off screen on the element" % name,
                  "a stylesheet rule does not reach every page")


# ----------------------------------------------------------------- lists ---
def check_lists():
    """Every list a page names has to exist in the function's allowlist.

    The allowlist is keyed by MailerLite FORM, not by page, because two pages
    share one form. A first draft keyed it by page, and would have pointed the
    accelerator at the sensing drill's list. Nothing in the page or the function
    would have complained; the subscribers would simply have landed in the wrong
    place, which is the kind of thing only an audit of the groups ever finds.

    This is static on purpose. The live version of it posted a subscriber to
    every list on every run.
    """
    fn = io.open(os.path.join(ROOT, "netlify", "functions", "subscribe.mjs"),
                 encoding="utf-8").read()
    block = fn[fn.index("const FORMS"):fn.index("const ACCOUNT")]
    known = dict(re.findall(r"'([a-z-]+)':\s*'(\d+)'", block))
    check(len(known) >= 6, "the allowlist has %d list(s), expected at least 6"
          % len(known))
    for name, form_id in known.items():
        check(len(form_id) == 18 and form_id.isdigit(),
              "list %r has an implausible form id %r" % (name, form_id))
    check(len(set(known.values())) >= len(known) - 1,
          "two list names point at the same MailerLite form",
          repr(known))

    for path in pages():
        html = strip_comments(io.open(path, encoding="utf-8").read())
        used = set(re.findall(r'data-list="([^"]+)"', html))
        used |= set(re.findall(r"var LIST = '([^']+)'", html))
        used |= set(re.findall(r"list: '([a-z-]+)'", html))
        for name in used:
            check(name in known,
                  "%s names list %r, which the function does not know"
                  % (rel(path), name), "it would be refused with error 'list'")


# ------------------------------------------------------------- analytics ---
BEACON_HOST = "static.cloudflareinsights.com"
REPORT_HOST = "cloudflareinsights.com"


def check_analytics():
    """Every page carries the beacon, and the CSP lets it through.

    Until 26 October this site had no analytics of ANY kind. The Friday keynote
    that converted zero therefore produced no measurement to look at, and the
    only reason anyone knew it had failed was that G was standing in the room.

    Two ways this breaks silently, both already seen on this estate:

    * A NEW PAGE gets added without the tag. It looks fine and is invisible.
    * The CSP blocks the beacon. The site sends a strict Content-Security-Policy
      from /_headers, and a host missing from it is refused by the browser with
      nothing on the page to show for it. That is what the MailerLite jQuery
      host did to the HowLegit forms.

    The report host is checked separately from the script host because they are
    DIFFERENT origins: the script comes from static.cloudflareinsights.com and
    the measurement is POSTed to cloudflareinsights.com/cdn-cgi/rum. Allowing
    only the first loads the beacon and then blocks everything it sends.
    """
    missing = []
    for path in pages():
        if BEACON_HOST not in io.open(path, encoding="utf-8").read():
            missing.append(rel(path))
    check(not missing, "%d page(s) carry no analytics beacon" % len(missing),
          ", ".join(sorted(missing)[:5]))

    headers = io.open(os.path.join(ROOT, "_headers"), encoding="utf-8").read()
    csp = ""
    for line in headers.splitlines():
        if "Content-Security-Policy:" in line:
            csp = line.split("Content-Security-Policy:", 1)[1]
    check(bool(csp), "no Content-Security-Policy found in _headers")

    def directive(name):
        for part in csp.split(";"):
            part = part.strip()
            if part.startswith(name + " "):
                return part
        return ""

    check(BEACON_HOST in directive("script-src"),
          "the CSP script-src does not allow %s" % BEACON_HOST,
          "the beacon is blocked and analytics read zero")
    check(REPORT_HOST in directive("connect-src"),
          "the CSP connect-src does not allow %s" % REPORT_HOST,
          "the beacon loads and every measurement it sends is blocked")


# ------------------------------------------------------------------ blog ---
def check_blog():
    """The rendered site has to match the markdown and the pages on disk.

    Until 26 October the sitemap was hand-maintained. It listed 48 of 49 public
    pages, and 21 entries claimed a lastmod of 31 August for pages that had
    changed since. A post nobody remembered to add was simply invisible.

    So the sitemap and the field-notes index are generated, and this fails if
    either is out of date, which is the only thing that makes "generated" true
    rather than "generated once".
    """
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    try:
        import build_blog
    except SystemExit as err:            # missing markdown/pyyaml
        check(False, "the blog builder will not import", str(err))
        return

    import io as _io
    posts = build_blog.scan_posts()
    want = build_blog.build_sitemap(posts)
    got = _io.open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
    check(want == got, "sitemap.xml is out of date",
          "run: python scripts/build_blog.py")

    for lang in build_blog.SECTIONS:
        old, new = build_blog.build_index(posts, lang)
        if old is None:
            continue
        check(old == new, "the %s field-notes index is out of date" % lang,
              "run: python scripts/build_blog.py")

    # Every post the sitemap offers has to be a page a search engine can use.
    for post in posts:
        for field in ("description", "title"):
            check(bool(post[field]),
                  "%s has no %s" % (post["url"], field))


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
    """Post real sign-ups through the deployed function and read the answers.

    Opt in, because the accepting case writes a subscriber. The address is
    obviously disposable.

    This is the only check that proves the token end to end. The token logic has
    unit tests against a fake store, which is where the expiry and replay
    branches are exercised; what cannot be faked is that the deployed function
    and the deployed page agree about it.
    """
    import json as _json
    url = SITE + "/.netlify/functions/subscribe"

    def post(body, raw=None):
        data = raw if raw is not None else _json.dumps(body).encode()
        req = urllib.request.Request(
            url, data=data, headers={"content-type": "application/json"},
            method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.status, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def token():
        req = urllib.request.Request(url, method="GET",
                                     headers={"accept": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return _json.loads(r.read()).get("token")

    # ---- the token itself ------------------------------------------------
    try:
        t = token()
    except Exception as err:
        check(False, "live: the function will not issue a token", repr(err))
        return
    check(isinstance(t, str) and len(t.split(".")) == 3,
          "live: the issued token is not the expected shape", repr(t)[:80])
    check(token() != t, "live: two requests were issued the same token",
          "a shared token means single use refuses the second visitor")

    # ---- a POST with no token is the whole point -------------------------
    code, raw = post({"list": "resource-downloads", "name": "QA",
                      "email": "qa-no-token@example.com"})
    check(code == 403, "live: a POST with no token must be refused",
          "got %s %s" % (code, raw[:120]))

    code, raw = post({"list": "resource-downloads", "name": "QA",
                      "email": "qa-forged@example.com",
                      "token": t.rsplit(".", 1)[0] + "." + "0" * 64})
    check(code == 403, "live: a forged signature must be refused",
          "got %s %s" % (code, raw[:120]))

    # ---- and a stack trace is never the answer ---------------------------
    # A body of the four characters `null` parses fine and then threw, and
    # Netlify answers a throw with 502 and the stack trace.
    code, raw = post(None, raw=b"null")
    check(code == 400 and "trace" not in raw and "errorType" not in raw,
          "live: a null body must not leak a stack trace",
          "got %s %s" % (code, raw[:100]))

    # ---- the honeypot answers before the token, so a bot learns nothing ---
    code, raw = post({"list": "resource-downloads", "name": "QA",
                      "email": "qa-pot@example.com", "website": "http://x"})
    check(code == 200 and '"skipped"' in raw,
          "live: the honeypot must answer before the token check",
          "got %s %s" % (code, raw[:120]))

    # ---- validation, each with a fresh token -----------------------------
    for label, body, want_ok in [
        ("rejects a fake email", {"name": "QA", "email": "test@test"}, False),
        ("rejects a blank name", {"name": "  ", "email": "qa@example.com"}, False),
        ("accepts a real sign-up", {"name": "QA automated check",
                                    "email": "qa-automated-check@example.com"}, True),
    ]:
        body = dict(body, list="resource-downloads", token=token())
        code, raw = post(body)
        try:
            got = _json.loads(raw)
        except ValueError:
            check(False, "live: %s" % label, "unparseable: %s" % raw[:120])
            continue
        check(bool(got.get("ok")) == want_ok, "live: %s" % label,
              "got %s %s" % (code, _json.dumps(got)[:120]))

    # ---- single use ------------------------------------------------------
    spent = token()
    first = post({"list": "resource-downloads", "name": "QA replay",
                  "email": "qa-replay@example.com", "token": spent})
    check(first[0] == 200, "live: the first spend of a token must be accepted",
          "got %s %s" % (first[0], first[1][:120]))
    code, raw = post({"list": "resource-downloads", "name": "QA replay",
                      "email": "qa-replay@example.com", "token": spent})
    check(code == 403, "live: a token must not be spendable twice",
          "got %s %s" % (code, raw[:120]))


def main():
    check_forms()
    check_lists()
    check_analytics()
    check_blog()
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
