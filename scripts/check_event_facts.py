"""Does the event page still say what the event actually is?

    python scripts/check_event_facts.py

WHY THIS EXISTS. On 7 October 2026 the Public Speaking Drill moved to 13:00
Europe/Warsaw on Google Meet. The page went on saying 09:00 CEST on Zoom in six
places, three of them machine readable: the schema.org startDate and endDate,
and the UTC range inside the add-to-calendar link. A search engine, a rich
result and anyone who clicked "Add to Google Calendar" would all have been told
a time at which nobody would be there, and none of it would have looked broken.

The failure is not that somebody forgot. It is that one fact lived in six
places with nothing holding them together. events/_events.json is now the one
place, and this refuses the drift.

IT CHECKS FOR THE OLD VALUE AS WELL AS THE NEW ONE. A page can contain the
right time in the heading and the wrong one in the calendar link, and a check
that only looks for the right string passes happily.
"""
import io
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "events", "_events.json")

problems = []
checked = 0


def check(ok, what, detail=""):
    global checked
    checked += 1
    if not ok:
        problems.append(f"{what}{(' — ' + detail) if detail else ''}")


def main():
    doc = json.load(io.open(SOURCE, encoding="utf-8"))

    for slug, e in doc["events"].items():
        path = os.path.join(ROOT, e["page"].replace("/", os.sep))
        if not os.path.exists(path):
            problems.append(f"{slug}: page not found at {e['page']}")
            continue
        html = io.open(path, encoding="utf-8").read()

        # EVERY PAGE THAT STATES THESE FACTS, NOT ONLY THE ONE NAMED IN `page`.
        #
        # The whole point of this file is that one fact lived in six places with nothing
        # holding them together. It then checked exactly one page, so the SEVENTH place
        # drifted undisturbed: /skilldrills/ advertised "Thursday, 09:00 CEST, Zoom,
        # 90 min" from 7 October to 28 October, every value of which is listed as retired
        # below. That is the funnel page. Anyone arriving from a field note or the
        # navigation read the wrong time, the wrong day and a platform we had left.
        #
        # `alsoOn` lists the other pages carrying the same facts. The retired-value checks
        # run against all of them; the machine-readable checks stay on the canonical page,
        # because only it carries schema.org and the calendar link.
        for extra in e.get("alsoOn", []):
            xp = os.path.join(ROOT, extra.replace("/", os.sep))
            if not os.path.exists(xp):
                problems.append(f"{slug}: alsoOn page not found at {extra}")
                continue
            xflat = re.sub(r"\s+", " ", io.open(xp, encoding="utf-8").read())
            # PLATFORMS ONLY, NOT DURATIONS, ON A SHARED PAGE.
            # A retired platform is always wrong wherever it appears: we are not on it.
            # A retired DURATION may be the category's rather than this event's.
            # /skilldrills/ promises "ninety minutes on one skill, then ninety days",
            # which is the shape of every drill, while this one event now runs 110. The
            # first version of this check called all five of those a failure.
            for retired in e.get("retiredPlatforms", []):
                hits = len(re.findall(re.escape(retired), xflat, re.I))
                check(hits == 0, f"{slug}: {extra} still says {retired!r}", f"{hits} time(s)")
            check(e["displayDate"] in xflat, f"{slug}: {extra} is missing the date",
                  f"expected {e['displayDate']!r}")

        # SEARCH A WHITESPACE-FLATTENED COPY, NOT THE RAW SOURCE.
        # "ninety minutes" sat in the hero copy of this page as "ninety\n    minutes",
        # because the paragraph wrapped at eighty columns between the two words. Every
        # retired-string check below is an exact match, so the phrase the retired list
        # exists to catch was invisible to it, and the page advertised ninety minutes
        # for a 110-minute session through three passes of this script. A reader sees
        # one space there; so should the check.
        flat = re.sub(r"\s+", " ", html)

        start = datetime.strptime(e["startsUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        end = datetime.strptime(e["endsUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

        # The offset the page's own label claims. CEST is +2, CET is +1. Getting
        # this wrong is the single likeliest error in October, which is why the
        # source file holds UTC and the label separately.
        # ICT is Indochina Time, UTC+7, and it has no daylight saving at all, which
        # is why the November drill is published in it: the audience that has to be
        # awake for it is in Cambodia, Indonesia, Vietnam and Thailand, and a European
        # label moves under them twice a year while theirs never moves.
        offset = {"CEST": 2, "CET": 1, "UTC": 0, "ICT": 7}.get(e["displayZoneLabel"])
        check(offset is not None, f"{slug}: unknown zone label {e['displayZoneLabel']}")
        if offset is None:
            continue

        local_start = start + timedelta(hours=offset)
        local_end = end + timedelta(hours=offset)

        # 1. schema.org, which is what search engines read
        iso_start = local_start.strftime(f"%Y-%m-%dT%H:%M:%S+0{offset}:00")
        iso_end = local_end.strftime(f"%Y-%m-%dT%H:%M:%S+0{offset}:00")
        check(f'"startDate": "{iso_start}"' in html,
              f"{slug}: schema.org startDate", f"expected {iso_start}")
        check(f'"endDate": "{iso_end}"' in html,
              f"{slug}: schema.org endDate", f"expected {iso_end}")

        # 2. the add-to-calendar link, which writes straight into someone's diary
        cal = f"{start.strftime('%Y%m%dT%H%M%SZ')}/{end.strftime('%Y%m%dT%H%M%SZ')}"
        has_cal_link = "calendar.google.com" in html
        if has_cal_link:
            check(cal in html, f"{slug}: add-to-calendar UTC range", f"expected dates={cal}")

        # 3. what a reader sees
        check(e["displayTime"] in flat, f"{slug}: visible time", f"expected {e['displayTime']!r}")
        check(e["displayDate"] in flat, f"{slug}: visible date", f"expected {e['displayDate']!r}")
        check(e["lengthLabel"] in flat, f"{slug}: visible length", f"expected {e['lengthLabel']!r}")
        check(e["platform"] in flat, f"{slug}: platform named", f"expected {e['platform']!r}")

        # 4. AND that the old answer is gone. This is the half that catches a
        #    page which is right at the top and stale further down.
        for retired in e.get("retiredPlatforms", []):
            hits = len(re.findall(re.escape(retired), flat, re.I))
            check(hits == 0, f"{slug}: retired platform {retired!r} still appears",
                  f"{hits} time(s)")

        # A duration is claimed in the <title> and the og:title as well as in the
        # facts list, and those two are what show on every shared link. The page
        # said 90 in seven places while the facts list said 110.
        for retired in e.get("retiredDurations", []):
            hits = len(re.findall(re.escape(retired), flat, re.I))
            check(hits == 0, f"{slug}: retired duration {retired!r} still appears",
                  f"{hits} time(s)")

        if e.get("availability"):
            check(e["availability"] in flat, f"{slug}: availability",
                  f"expected {e['availability']!r}")

        # 5. the duration the page claims must match the times it states
        stated = (end - start).total_seconds() / 60
        check(stated == e["lengthMinutes"],
              f"{slug}: lengthMinutes disagrees with startsUtc/endsUtc",
              f"times give {stated:.0f}, file says {e['lengthMinutes']}")

        # 6. a sanity check on the label itself: Europe is on summer time until
        #    the last Sunday of October, and a page that says CET before then is
        #    an hour out even when every other string agrees with it.
        if e["displayZone"] == "Europe/Warsaw":
            last_sun = datetime(start.year, 10, 31, tzinfo=timezone.utc)
            while last_sun.weekday() != 6:
                last_sun -= timedelta(days=1)
            should_be = "CEST" if start < last_sun else "CET"
            check(e["displayZoneLabel"] == should_be,
                  f"{slug}: zone label should be {should_be} on this date",
                  f"file says {e['displayZoneLabel']}; Europe changes on "
                  f"{last_sun.strftime('%d %B')}")

    print(f"{checked} checks across {len(doc['events'])} event(s)")
    if problems:
        print()
        for p in problems:
            print(f"  FAIL  {p}")
        print(f"\n{len(problems)} problem(s). The page and events/_events.json disagree.")
        return 1
    print("the page agrees with events/_events.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
