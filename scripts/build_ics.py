"""Write each event's .ics from events/_events.json.

    python scripts/build_ics.py

WHY THIS EXISTS. check_event_facts.py holds the page to the facts file, and
never opened the .ics. So on 22 October 2026 the page said 13:00 Europe/Warsaw
on Google Meet for 110 minutes, and the calendar file sitting next to it said
07:00 UTC on Zoom for 90 minutes. Four hours apart, on the same page, through
two buttons a foot from each other.

Anyone who clicked "Download a calendar file for Outlook or Apple" had the
session in their diary at 09:00 Warsaw, pointing at a platform nobody was on.
They would have experienced that as never being told, which is exactly what G
was hearing.

The file is generated rather than checked, because a second copy of a fact
drifts whatever you do to it. Nothing here is typed twice.
"""
import io
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "events", "_events.json")
SITE = "https://5spheresofempathy.com"


def fold(line):
    """RFC 5545: 75 octets to a line, continued with a leading space.

    Outlook is the one that minds. The previous file was folded by hand, which
    is one more thing that stays right only until somebody edits it.
    """
    raw = line.encode("utf-8")
    if len(raw) <= 73:
        return line
    out, first = [], True
    while raw:
        limit = 73 if first else 72
        cut = min(limit, len(raw))
        while cut < len(raw) and (raw[cut] & 0xC0) == 0x80:
            cut -= 1          # never split a multi-byte character
        out.append(("" if first else " ") + raw[:cut].decode("utf-8"))
        raw = raw[cut:]
        first = False
    return "\r\n".join(out)


def esc(s):
    return (str(s).replace("\\", "\\\\").replace(";", r"\;")
            .replace(",", r"\,").replace("\n", r"\n"))


def ics_for(slug, e):
    start = datetime.strptime(e["startsUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    end = datetime.strptime(e["endsUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    page = SITE + "/" + os.path.dirname(e["page"]).replace(os.sep, "/") + "/"

    desc = e.get("icsDescription") or (
        "A %s live session. Details: %s" % (e["lengthLabel"], page))

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//The 5 Spheres of Empathy//%s//EN" % e["name"],
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:%s-%s@5spheresofempathy.com" % (slug, start.strftime("%Y-%m-%d")),
        # Generated files should not churn on every run, so the stamp is the
        # event's own date rather than now().
        "DTSTAMP:%s" % start.strftime("%Y%m%dT%H%M%SZ"),
        "DTSTART:%s" % start.strftime("%Y%m%dT%H%M%SZ"),
        "DTEND:%s" % end.strftime("%Y%m%dT%H%M%SZ"),
        "SUMMARY:%s" % esc(e["name"]),
        fold("DESCRIPTION:%s" % esc(desc)),
        "LOCATION:%s" % esc(e["platform"]),
        "URL:%s" % page,
        "STATUS:CONFIRMED",
        "BEGIN:VALARM",
        "TRIGGER:-PT1H",
        "ACTION:DISPLAY",
        "DESCRIPTION:%s starts in an hour" % esc(e["name"]),
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


def target_for(e):
    return os.path.join(ROOT, e["icsPath"].replace("/", os.sep))


def main(write=True):
    doc = json.load(io.open(SOURCE, encoding="utf-8"))
    changed = []
    for slug, e in doc["events"].items():
        if not e.get("icsPath"):
            continue
        want = ics_for(slug, e)
        path = target_for(e)
        have = io.open(path, encoding="utf-8", newline="").read() if os.path.exists(path) else None
        if have == want:
            print("  unchanged  %s" % e["icsPath"])
            continue
        changed.append(e["icsPath"])
        if write:
            io.open(path, "w", encoding="utf-8", newline="").write(want)
            print("  WROTE      %s" % e["icsPath"])
        else:
            print("  DRIFTED    %s" % e["icsPath"])
    return changed


if __name__ == "__main__":
    check_only = "--check" in sys.argv
    drift = main(write=not check_only)
    if check_only and drift:
        print("\n%d calendar file(s) disagree with events/_events.json."
              "\nRun: python scripts/build_ics.py" % len(drift))
        sys.exit(1)
    print("calendar files agree with events/_events.json")
