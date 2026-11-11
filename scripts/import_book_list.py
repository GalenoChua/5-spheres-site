# -*- coding: utf-8 -*-
"""Add the book pre-registration list to MailerLite, but only those who said yes.

    python scripts/import_book_list.py                     dry run, shows what would happen
    python scripts/import_book_list.py --commit            actually writes to MailerLite

WHY THE FILTER IS THE WHOLE POINT

The form asks a separate question about being contacted beyond the book, and the
answers are split: some rows say yes, some say they only want the book. Adding
everybody would put people on a marketing list who explicitly declined one, which
is both the wrong thing to do and the kind of thing that gets a sending domain
burned.

So the default is DRY RUN, the filter is positive rather than negative, and a row
is only taken when its answer clearly starts with "yes". A blank, an unexpected
answer, a reworded option: all excluded. The failure mode is excluding somebody
who agreed, which costs one subscriber. The other way costs trust.

NO ADDRESSES ARE EVER PRINTED. Counts only, here and in the log. If something
needs eyeballing, it says how many and where, not who.

WHERE THE FILE COMES FROM

File, Download, Comma Separated Values, from the responses sheet, saved to
ops-log/book-preregistration.csv. ops-log is gitignored, so none of this can
reach the repository.
"""
import argparse
import csv
import io
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CSV = os.path.join(ROOT, "ops-log", "book-preregistration.csv")
GROUP_NAME = "Book pre-registration"
ACCOUNT_ID = "mr-g-i-oqgqw"
SITE_ID = "bc184e10-10cb-4409-9258-7660130e44e9"

# Matched loosely against the header, because form questions get reworded.
CONSENT_HINTS = ("would you like", "notif", "keep me", "updates")
EMAIL_HINTS = ("email",)
FIRST_HINTS = ("first name",)
LAST_HINTS = ("last name",)


def key():
    """From Netlify, never from a file in the repo and never typed here."""
    out = subprocess.run(
        ["netlify", "api", "getEnvVars", "--data",
         json.dumps({"accountId": ACCOUNT_ID, "siteId": SITE_ID})],
        capture_output=True, text=True, shell=True, cwd=ROOT).stdout
    for v in json.loads(out):
        if v["key"] == "MAILERLITE_API_KEY":
            return v["values"][0]["value"]
    raise SystemExit("no MAILERLITE_API_KEY on the 5 Spheres site")


def api(k, path, method="GET", body=None):
    cmd = ["curl", "-s", "--max-time", "30", "-X", method,
           "-H", "Authorization: Bearer " + k, "-H", "Accept: application/json"]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    cmd.append("https://connect.mailerlite.com/api/" + path)
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except Exception:
        return {}


def pick(headers, hints):
    for i, h in enumerate(headers):
        low = (h or "").strip().lower()
        if any(x in low for x in hints):
            return i
    return -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=DEFAULT_CSV)
    ap.add_argument("--commit", action="store_true",
                    help="actually write to MailerLite; without it nothing is sent")
    a = ap.parse_args()

    if not os.path.exists(a.csv):
        print("  no file at %s" % a.csv)
        print("  File, Download, Comma Separated Values, and save it there.")
        return 1

    with io.open(a.csv, encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))
    if not rows:
        print("  the file is empty")
        return 1

    head = rows[0]
    ci, ei = pick(head, CONSENT_HINTS), pick(head, EMAIL_HINTS)
    fi, li = pick(head, FIRST_HINTS), pick(head, LAST_HINTS)
    print("  columns found")
    print("    email   : %s" % (head[ei] if ei >= 0 else "NOT FOUND"))
    print("    consent : %s" % (head[ci] if ci >= 0 else "NOT FOUND"))
    if ei < 0 or ci < 0:
        print("\n  Stopping. Without both columns this cannot filter, and importing")
        print("  everything is the one outcome that must not happen by accident.")
        return 1

    answers = {}
    take, skip = [], 0
    for r in rows[1:]:
        if len(r) <= max(ci, ei):
            skip += 1
            continue
        ans = (r[ci] or "").strip()
        answers[ans] = answers.get(ans, 0) + 1
        email = (r[ei] or "").strip().lower()
        if not email or "@" not in email:
            skip += 1
            continue
        if ans.lower().startswith("yes"):
            take.append({
                "email": email,
                "fields": {"name": (r[fi].strip() if 0 <= fi < len(r) else ""),
                           "last_name": (r[li].strip() if 0 <= li < len(r) else "")},
            })

    print("\n  every answer given to the consent question, and how many gave it")
    for ans, n in sorted(answers.items(), key=lambda x: -x[1]):
        mark = "TAKE" if ans.lower().startswith("yes") else "skip"
        print("    %-4s %3d  %s" % (mark, n, (ans or "(blank)")[:90]))

    seen, dedup = set(), []
    for t in take:
        if t["email"] not in seen:
            seen.add(t["email"])
            dedup.append(t)

    print("\n  rows in file            %d" % (len(rows) - 1))
    print("  said yes                %d" % len(take))
    print("  after de-duplication    %d" % len(dedup))
    print("  unusable rows skipped   %d" % skip)

    if not a.commit:
        print("\n  DRY RUN. Nothing was sent. Re-run with --commit to write these")
        print("  %d people into the MailerLite group %r." % (len(dedup), GROUP_NAME))
        return 0

    k = key()
    groups = {g["name"]: g["id"] for g in api(k, "groups?limit=100").get("data", [])}
    gid = groups.get(GROUP_NAME)
    if not gid:
        made = api(k, "groups", "POST", {"name": GROUP_NAME}).get("data") or {}
        gid = made.get("id")
        print("\n  created group %r (%s)" % (GROUP_NAME, gid))
    if not gid:
        print("  could not create or find the group")
        return 1

    added = failed = 0
    for t in dedup:
        res = api(k, "subscribers", "POST",
                  {"email": t["email"], "fields": t["fields"], "groups": [str(gid)]})
        if (res.get("data") or {}).get("id"):
            added += 1
        else:
            failed += 1
    print("\n  added   %d" % added)
    print("  failed  %d" % failed)
    print("  group   %s" % GROUP_NAME)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
