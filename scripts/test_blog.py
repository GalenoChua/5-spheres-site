# -*- coding: utf-8 -*-
"""What the post generator has to get right.

    python scripts/test_blog.py

Writes nothing into the site: every case renders in memory.

WHY THE RAW HTML CASE IS FIRST. The existing field notes carry CTA bars written
as raw HTML inside the article body, like <div class="openbar">. A markdown
renderer that escapes those would turn a button into visible angle brackets on
the page, and the generator would be unusable for the posts this site actually
publishes. It is the one case that would have made the whole thing worthless.

WHY hreflang IS TESTED FOR ABSENCE TOO. Claiming a Polish counterpart that does
not exist is worse than claiming nothing: it points Google at a 404 and the
pairing is ignored for both pages.
"""
import re
import sys

sys.path.insert(0, "scripts")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import build_blog as b                                        # noqa: E402

ARTICLE = r'<div class="article-body">(.*?)</div>\s*\n\s*</div>'

ran = failed = 0


def check(label, ok, detail=""):
    global ran, failed
    ran += 1
    if ok:
        print("  ok   " + label)
    else:
        failed += 1
        print("  FAIL " + label + (("\n         " + detail) if detail else ""))


def post(body, **over):
    meta = {"title": "A Title", "heading": "A title", "description": "A line.",
            "kicker": "Field note", "date": "2026-10-26", "updated": "2026-10-26",
            "lang": "en", "slug": "a-title", "image": "/og.png",
            "_body_md": body}
    meta.update(over)
    return meta


def body_of(html):
    return re.search(ARTICLE, html, re.S).group(1)


parts = b.chrome()

# ---- raw HTML and the markdown vocabulary the posts use --------------------
html = b.render(post(
    "Before.\n\n"
    '<div class="openbar" style="margin-top: 30px;">\n'
    '  <a class="btn" href="/agree-to-disagree/">See the tables &#8594;</a>\n'
    "</div>\n\n"
    "After, with **bold**, *italic* and a [link](/coaching/).\n\n"
    "> A pulled quote.\n\n"
    "## A heading\n\n### A smaller one\n\n- one\n- two\n"), [], parts)
body = body_of(html)

check("a raw HTML block is not escaped",
      '<div class="openbar"' in body and "&lt;div" not in body, body[:200])
check("the button inside it survives",
      'class="btn" href="/agree-to-disagree/"' in body)
for label, want in [("bold", "<strong>bold</strong>"),
                    ("italic", "<em>italic</em>"),
                    ("links", '<a href="/coaching/">link</a>'),
                    ("blockquote", "<blockquote>"),
                    ("h2", "<h2>A heading</h2>"),
                    ("h3", "<h3>A smaller one</h3>"),
                    ("lists", "<li>one</li>")]:
    check("markdown %s renders" % label, want in body)

# ---- the head -------------------------------------------------------------
check("canonical is absolute and ends in a slash",
      '<link rel="canonical" href="https://5spheresofempathy.com/field-notes/a-title/">' in html)
check("article:published_time is set",
      '<meta property="article:published_time" content="2026-10-26">' in html)
check("the Article schema names the language",
      '"inLanguage": "en"' in html)
check("the analytics beacon is on the page",
      "cloudflareinsights" in html,
      "a generated post that drops the beacon is invisible to analytics")
check("a title with quotes does not break the markup",
      '&quot;' in b.render(post("x", title='He said "no"'), [], parts))

# ---- hreflang -------------------------------------------------------------
check("no hreflang when there is no translation",
      'hreflang' not in html,
      "pointing at a counterpart that does not exist is worse than silence")

en = post("English body.", lang="en", slug="the-post")
pl = post("Polska tresc.", lang="pl", slug="ten-wpis", kicker="Notatki")
en["_twin"] = pl
paired = b.render(en, [], parts)
check("hreflang pairs both languages",
      'hreflang="en"' in paired and 'hreflang="pl"' in paired)
check("the Polish URL uses the Polish path",
      'href="https://5spheresofempathy.com/pl/notatki/ten-wpis/"' in paired)
check("x-default points at English",
      'hreflang="x-default" href="https://5spheresofempathy.com/field-notes/the-post/"'
      in paired)

pl_page = b.render(dict(pl, _twin=en), [], parts)
check("a Polish post declares lang=pl", '<html lang="pl">' in pl_page)
check("a Polish post dates in Polish",
      "26 pazdziernika 2026" in pl_page,
      "an English date on a Polish page is a tell that nobody read it")

# ---- the sitemap is not a leak --------------------------------------------
check("a noindex page is kept out of the sitemap",
      not b.public("/quad/", '<meta name="robots" content="noindex, nofollow">'))
check("a normal page stays in",
      b.public("/field-notes/a-title/", "<html>"))
check("the facilitator console stays out",
      not b.public("/skilldrills/public-speaking/facilitator/", "<html>"))
check("print pages stay out",
      not b.public("/resources/kpq/worksheet-print.html", "<html>"))

# ---- slugs ----------------------------------------------------------------
sys.path.insert(0, "scripts")
import new_post                                               # noqa: E402

check("a Polish slug keeps its letters as ASCII",
      new_post.slugify("Czym jest empatia w pracy") == "czym-jest-empatia-w-pracy")
check("the Polish l with stroke does not vanish",
      new_post.slugify("Człowiek i empatia") == "czlowiek-i-empatia",
      "got %r; NFKD alone deletes it, turning czlowiek into czowiek"
      % new_post.slugify("Człowiek i empatia"))
check("Polish diacritics fold rather than drop",
      new_post.slugify("Zażółć gęślą jaźń") == "zazolc-gesla-jazn",
      "got %r" % new_post.slugify("Zażółć gęślą jaźń"))

print("\n%d checks, %s" % (ran, "%d FAILED" % failed if failed else "all pass"))
sys.exit(1 if failed else 0)
