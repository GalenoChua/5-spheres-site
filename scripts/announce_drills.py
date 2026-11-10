# -*- coding: utf-8 -*-
"""What needs announcing, and the drafts to do it with.

    python scripts/announce_drills.py              what is due or overdue, nothing written
    python scripts/announce_drills.py --write      also write the drafts
    python scripts/announce_drills.py --all        every beat, not only the due ones

WHY THIS EXISTS

Two drills went unannounced. The 9 November public speaking session ran while
every page still advertised it as upcoming, and Letting Someone Go sat finished
and unpublished twenty days out. Neither was a decision. Both were a thing
nobody was holding.

So this does not send anything. It answers the question that was never asked in
time: what should have gone out by now, and what goes out next.

WHERE THE FACTS COME FROM

events/_events.json, the same file check_event_facts.py holds the pages to. A
draft cannot name a date the site does not also name, because it never types a
date: it reads displayDate, displayTime, priceEur and availability from the
record. If the drill moves, the drafts move with it.

WHAT IT CANNOT DO, AND WHY

It cannot send the newsletter. subscribe.mjs reaches MailerLite over the JSONP
form endpoint, which only ever adds a subscriber, and there is no MailerLite
API key in the Netlify environment. Sending a campaign is a human in the
MailerLite UI pasting what this writes. That is a real limit and it is stated
here rather than discovered on the night.

It does not post to social either. It writes the copy and names the image.
"""
import argparse
import datetime as dt
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS = os.path.join(ROOT, "events", "_events.json")
OUT = os.path.join(ROOT, "ops-log", "announce-drafts")
SITE = "https://5spheresofempathy.com"

# The beats, in days before the session. Chosen from what went wrong rather than
# from a template: the 21 is the one that was missed on both drills, and the 2 is
# there because eight places do not sell themselves in the last week without it.
BEATS = [
    (21, "newsletter", "Announce"),
    (21, "social",     "Announce"),
    (14, "social",     "The argument, not the invitation"),
    (7,  "newsletter", "One week, places left"),
    (7,  "social",     "One week"),
    (2,  "social",     "Last call"),
]

# An email without an image is a miss, and the asset usually already exists.
IMAGES = {
    "public-speaking":    "/images/field-notes/public-speaking-drill-room.jpg",
    "letting-someone-go": "/images/field-notes/public-speaking-drill-room.jpg",
}


def load():
    with io.open(EVENTS, encoding="utf-8") as f:
        return json.load(f)["events"]


def page_text(rel):
    """The live page's own words, so a draft cannot drift from what it sells."""
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return ""
    with io.open(p, encoding="utf-8") as f:
        s = f.read()
    body = s[s.find("</style>"):]
    body = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", body, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", body)
    for a, b in [("&rsquo;", "’"), ("&euro;", "€"), ("&middot;", "·"),
                 ("&amp;", "&"), ("&nbsp;", " "), ("&rarr;", "→")]:
        txt = txt.replace(a, b)
    return re.sub(r"\s+", " ", txt).strip()


def hero_lines(rel, n=4):
    """The hero's own PARAGRAPHS, in order.

    Sentences were the wrong unit twice over. The eyebrow and the h1 carry no full
    stop, so the first "sentence" was the kicker, the title and the opening line run
    together, and dropping it to skip the title threw the hook away. And splitting on
    full stops turned "I still think about it. I don't think they do. But I do." into
    three fragments, then cut the third, which is the only one that turns.
    """
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return []
    with io.open(p, encoding="utf-8") as f:
        s = f.read()
    head = s[s.find("<header"):s.find("</header>")]
    out = []
    for m in re.finditer(r'<p class="subhead[^"]*">(.*?)</p>', head, re.S):
        t = re.sub(r"<[^>]+>", "", m.group(1))
        for a, b in [("&rsquo;", "’"), ("&euro;", "€"), ("&middot;", "·"),
                     ("&amp;", "&"), ("&nbsp;", " ")]:
            t = t.replace(a, b)
        t = re.sub(r"\s+", " ", t).strip()
        if t:
            out.append(t)
    return out[:n]


def url_for(slug):
    return "%s/events/%s/" % (SITE, slug)


def newsletter(slug, e, label):
    lines = hero_lines(e["page"])
    body = "\n\n".join(lines)
    img = IMAGES.get(slug, "")
    return """SUBJECT: {name}, {date}

PREHEADER: {time}. {price}, {avail}.

[IMAGE: {site}{img}]
Alt: a recent skill drill on Google Meet, cameras on

{body}

{date} · {time}
{length} · {platform} · {price}, {avail}

Take a place: {url}

---
Beat: {label}
Send from: MailerLite, by hand. There is no API key, so this cannot be sent from
a script. Paste the above, attach the image, check the footer comes from
Defaults rather than Company profile.
""".format(name=e["name"], date=e["displayDate"], time=e["displayTime"],
           length=e["lengthLabel"], platform=e["platform"],
           price="€%s" % e["priceEur"], avail=e.get("availability", ""),
           body=body, url=url_for(slug), label=label, site=SITE, img=img)


def social(slug, e, label):
    lines = hero_lines(e["page"], 3)
    img = IMAGES.get(slug, "")
    return """{hook}

{rest}

{date}, {time}. {platform}. {price}, {avail}.
{url}

[IMAGE: {site}{img}]

---
Beat: {label}
Post to: LinkedIn page. Not the personal profile, which is Optomize and
Crossleaf.
""".format(hook=lines[0] if lines else e["name"],
           rest="\n\n".join(lines[1:]) if len(lines) > 1 else "",
           date=e["displayDate"], time=e["displayTime"], platform=e["platform"],
           price="€%s" % e["priceEur"], avail=e.get("availability", ""),
           url=url_for(slug), label=label, site=SITE, img=img)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="write the drafts to ops-log/announce-drafts/")
    ap.add_argument("--all", action="store_true", help="every beat, not only those due")
    ap.add_argument("--today", help="pretend it is this date, YYYY-MM-DD")
    a = ap.parse_args()

    today = (dt.date.fromisoformat(a.today) if a.today
             else dt.datetime.now(dt.timezone.utc).date())
    rows, due = [], []
    for slug, e in load().items():
        start = dt.datetime.fromisoformat(e["startsUtc"].replace("Z", "+00:00")).date()
        days = (start - today).days
        if days < 0:
            rows.append((slug, e["displayDate"], days, "ran", ""))
            continue
        for at, channel, label in BEATS:
            when = start - dt.timedelta(days=at)
            if when < today:
                state = "OVERDUE"
            elif when == today:
                state = "DUE TODAY"
            else:
                state = when.isoformat()
            if a.all or state in ("OVERDUE", "DUE TODAY"):
                rows.append((slug, e["displayDate"], days, "%s %s" % (channel, label), state))
                if state in ("OVERDUE", "DUE TODAY"):
                    due.append((slug, e, channel, label))

    print("  today %s" % today.isoformat())
    print("  %-20s %-22s %5s  %-38s %s" % ("drill", "date", "in", "beat", "when"))
    for r in rows:
        print("  %-20s %-22s %5s  %-38s %s" % (r[0], r[1], r[2], r[3], r[4]))
    if not rows:
        print("  nothing due")

    if a.write and due:
        os.makedirs(OUT, exist_ok=True)
        for slug, e, channel, label in due:
            fn = "%s_%s_%s.txt" % (slug, channel, label.lower().replace(" ", "-").replace(",", ""))
            text = newsletter(slug, e, label) if channel == "newsletter" else social(slug, e, label)
            with io.open(os.path.join(OUT, fn), "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            print("  wrote %s" % os.path.join("ops-log/announce-drafts", fn))
    elif due:
        print("\n  %d draft(s) ready. Add --write to produce them." % len(due))

    return 0


if __name__ == "__main__":
    sys.exit(main())
