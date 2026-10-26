# -*- coding: utf-8 -*-
"""Prove the analytics beacon actually fires, in a real browser.

    python scripts/check_analytics_live.py                  against production
    python scripts/check_analytics_live.py http://localhost:8899

WHY THIS IS SEPARATE FROM THE MARKUP CHECK. check_site.py asserts the tag is in
the HTML and the CSP names the right hosts. Neither proves a measurement left
the browser. Between the tag and the report there are three ways to read zero
visitors while looking perfectly configured:

  * the Content-Security-Policy refuses the script, or refuses the POST it makes
    to a DIFFERENT origin than the one that served it
  * the token is wrong by one character, which cannot be seen by reading it
  * the zone is DNS-only and somebody switched the site back to Cloudflare's
    "automatic setup", which injects nothing into HTML Cloudflare never proxies

All three are silent. The site ran with no analytics at all until 26 October and
nothing on any page looked wrong, which is the whole argument for measuring the
request rather than the markup.

What it asserts: the beacon script loads with HTTP 200, the browser reports no
CSP violation for either Cloudflare host, and the page POSTs a measurement to
the reporting endpoint.
"""
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = (sys.argv[1].rstrip("/") if len(sys.argv) > 1
        else "https://5spheresofempathy.com")

# A spread, not just the homepage: the tag is inserted per page, so a page that
# missed it is exactly what this should catch.
PAGES = ["/", "/resources/kpq/", "/coaching/", "/events/the-sensing-drill/",
         "/field-notes/", "/bsfp-accelerator/"]

SCRIPT_HOST = "static.cloudflareinsights.com"
REPORT_HOST = "cloudflareinsights.com"

fails = []


def main():
    print("%s\n" % BASE)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for path in PAGES:
            ctx = browser.new_context(viewport={"width": 1280, "height": 900})
            page = ctx.new_page()

            loaded = []      # the beacon script itself
            reports = []     # the measurement it sends
            blocked = []     # CSP refusals naming either host

            def on_response(r):
                if SCRIPT_HOST in r.url:
                    loaded.append(r.status)

            def on_request(r):
                # The report goes to cloudflareinsights.com/cdn-cgi/rum, a
                # different origin from the script host, so match on the path.
                if REPORT_HOST in r.url and "/cdn-cgi/rum" in r.url:
                    reports.append(r.method)

            def on_console(m):
                t = m.text
                if "Content Security Policy" in t and REPORT_HOST in t:
                    blocked.append(t[:120])

            page.on("response", on_response)
            page.on("request", on_request)
            page.on("console", on_console)

            page.goto(BASE + path, wait_until="networkidle")
            # The beacon reports on visibility change and page hide, so give it
            # a nudge rather than waiting for a timeout that may never come.
            page.evaluate("() => { window.dispatchEvent(new Event('pagehide')); }")
            page.wait_for_timeout(2500)

            tag = page.evaluate(
                """() => !!document.querySelector('script[data-cf-beacon]')""")
            token = page.evaluate(
                """() => { const s = document.querySelector('script[data-cf-beacon]');
                     if (!s) return null;
                     try { return JSON.parse(s.dataset.cfBeacon).token; }
                     catch { return 'unparseable'; } }""")

            if not tag:
                fails.append("%s: no beacon tag on the page" % path)
            if token and len(str(token)) != 32:
                fails.append("%s: beacon token is %r, expected 32 hex chars"
                             % (path, token))
            if not loaded:
                fails.append("%s: the beacon script was never requested" % path)
            elif not any(s == 200 for s in loaded):
                fails.append("%s: the beacon script returned %s"
                             % (path, loaded))
            if blocked:
                fails.append("%s: CSP blocked the beacon: %s" % (path, blocked[0]))
            if not reports:
                fails.append("%s: the beacon sent no measurement" % path)

            print("  %-30s tag=%-3s script=%-5s report=%-3s"
                  % (path, "yes" if tag else "NO",
                     (loaded[0] if loaded else "none"),
                     "sent" if reports else "NO"))
            ctx.close()
        browser.close()

    print()
    for f in fails:
        print("  FAIL  " + f)
    if fails:
        print("\n%d problem(s)." % len(fails))
        return 1
    print("the beacon loads and reports on every page checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
