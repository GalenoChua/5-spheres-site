# -*- coding: utf-8 -*-
"""Start a field note.

    python scripts/new_post.py "Putting yourself in their shoes"
    python scripts/new_post.py "Czym jest empatia w pracy" --lang pl
    python scripts/new_post.py "A title" --translation-of some-english-slug

Writes a markdown file with the front matter filled in, then tells you the two
commands that publish it. It does not render anything: `build_blog.py` does
that, and keeping them separate means you can rewrite the draft ten times
without touching the site.

The slug matters more than it looks. It becomes the URL, and the words in a URL
are part of what a search is matched against, so a Polish post gets a Polish
slug rather than a transliterated English one.
"""
import argparse
import datetime
import io
import os
import re
import sys
import unicodedata

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Polish letters do not survive a naive ASCII fold: "ł" has no decomposition and
# would simply vanish, turning "człowiek" into "czowiek". Mapped by hand.
FOLD = {"ą": "a", "ć": "c", "ę": "e", "ł": "l", "ń": "n", "ó": "o",
        "ś": "s", "ź": "z", "ż": "z"}


def slugify(text):
    text = text.strip().lower()
    text = "".join(FOLD.get(ch, ch) for ch in text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"^-+|-+$", "", text)[:70]


TEMPLATE = """---
title: {title}
description: {description}
kicker: {kicker}
date: {date}
lang: {lang}
slug: {slug}
{translation}---

{starter}
"""

STARTERS = {
    "en": (
        "Open with the thing that happened, not with what the piece is about.\n\n"
        "## A heading that is a claim, not a label\n\n"
        "Write the body in markdown. Paragraphs, ## and ### headings, **bold**,\n"
        "*italic*, lists and > quotes all render into the site's own styles.\n\n"
        "Before this goes out, run the voice pass:\n\n"
        "    python \"%USERPROFILE%\\\\.claude\\\\brain\\\\voice\\\\voicepass.py\" <this file>\n"
    ),
    "pl": (
        "Tekst po polsku. Napisz tresc w markdownie.\n\n"
        "## Naglowek\n\n"
        "Akapity, naglowki ## i ###, **pogrubienie**, *kursywa*, listy i cytaty.\n"
    ),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("title")
    ap.add_argument("--lang", default="en", choices=["en", "pl"])
    ap.add_argument("--slug", default=None,
                    help="override the slug derived from the title")
    ap.add_argument("--kicker", default=None,
                    help="the small label above the headline")
    ap.add_argument("--description", default="",
                    help="one sentence; it is the meta description and the standfirst")
    ap.add_argument("--date", default=datetime.date.today().isoformat())
    ap.add_argument("--translation-of", default=None, metavar="SLUG",
                    help="the slug of this post in the other language")
    args = ap.parse_args()

    slug = args.slug or slugify(args.title)
    if not slug:
        sys.exit("could not make a slug from %r; pass --slug" % args.title)

    out_dir = os.path.join(ROOT, "content", "field-notes", args.lang)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, slug + ".md")
    if os.path.exists(path):
        sys.exit("%s already exists" % path)

    kicker = args.kicker or ("Notatki" if args.lang == "pl" else "Field note")
    translation = ("translation: %s\n" % args.translation_of
                   if args.translation_of else "")
    description = args.description or "One sentence on what this is and who it is for."

    io.open(path, "w", encoding="utf-8", newline="").write(TEMPLATE.format(
        title=args.title, description=description, kicker=kicker,
        date=args.date, lang=args.lang, slug=slug, translation=translation,
        starter=STARTERS[args.lang]))

    url = ("/pl/notatki/%s/" if args.lang == "pl" else "/field-notes/%s/") % slug
    print("wrote %s" % os.path.relpath(path, ROOT).replace(os.sep, "/"))
    print("it will publish at %s" % url)
    if not args.description:
        print("\nfill in `description`: it is the meta description Google shows "
              "and the standfirst under the headline.")
    print("\nthen:")
    print("  python scripts/build_blog.py")
    print("  git add content field-notes sitemap.xml && git commit && git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
