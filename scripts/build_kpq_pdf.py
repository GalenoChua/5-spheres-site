# -*- coding: utf-8 -*-
"""Print the KPQ worksheet to PDF, and assert it is the handout we meant.

    python scripts/build_kpq_pdf.py

WHY IT LIVES HERE. This existed only inside a session scratchpad, so the PDF
on the site could not be rebuilt by anyone who did not have that folder. The
worksheet is a published asset; its generator belongs with the site.

WHAT IT ASSERTS, and why each one is here:

  two pages        a handout that silently runs to four is a different artefact
                   from the one intended, and the first build did exactly that
  under 900 KB     the page carries a cream ground; if that ever rasterises the
                   same two pages come out around 9 MB
  required strings including the ones added on 22 October, because the boxes
                   used to print only the impact area and people wrote the
                   impact instead of the indicator
"""
import os
import subprocess
import sys
import threading
import functools
import http.server
import socketserver

import fitz

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "the-kpq-worksheet.pdf")
PAGE = "/resources/kpq/worksheet-print.html"
PORT = 8794
WANT_PAGES = 2

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PROFILE = os.path.join(ROOT, ".netlify", "_kpqpdf")

MUST_PAGE_1 = ["The KPQ Worksheet", "sensecheck", "Specific, Measurable"]
MUST_PAGE_2 = [
    "Write the indicator, not the area it sits in",
    "The indicator that shows it is controlled",
    "The indicator that shows it is growing",
    "The indicator that shows the money works",
    "The indicator you measure against",
    "intention to be your guide",
]


class Handler(http.server.SimpleHTTPRequestHandler):
    """python -m http.server has no woff2 type, and Chrome then refuses the
    font and prints in a system serif. Same trap as ops-log/_fontserver.py."""
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map[".woff2"] = "font/woff2"
    extensions_map[".woff"] = "font/woff"

    def log_message(self, *a):
        pass


def main():
    # A locked PDF fails silently and the OLD file then passes every check.
    if os.path.exists(OUT):
        try:
            os.remove(OUT)
        except OSError as e:
            sys.exit("cannot replace the PDF, it is open somewhere: %s" % e)

    os.makedirs(PROFILE, exist_ok=True)
    srv = socketserver.TCPServer(
        ("127.0.0.1", PORT), functools.partial(Handler, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        subprocess.run([
            CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
            "--virtual-time-budget=15000", "--user-data-dir=" + PROFILE,
            "--print-to-pdf=" + OUT,
            "http://127.0.0.1:%d%s" % (PORT, PAGE),
        ], check=True, capture_output=True, timeout=180)
    finally:
        srv.shutdown()

    d = fitz.open(OUT)
    size_kb = os.path.getsize(OUT) / 1024
    text = [pg.get_text() for pg in d]
    print("pages %d | %.0f KB" % (d.page_count, size_kb))
    for i, t in enumerate(text):
        print("  page %d: %d chars" % (i + 1, len(t.strip())))

    problems = []
    if d.page_count != WANT_PAGES:
        problems.append("wanted %d pages, got %d" % (WANT_PAGES, d.page_count))
    if size_kb >= 900:
        problems.append("%.0f KB, the cream ground probably rasterised" % size_kb)
    whole = "\n".join(text)
    for must in MUST_PAGE_1 + MUST_PAGE_2:
        if must not in whole:
            problems.append("missing from the PDF: %r" % must)
    # The fault G reported: an area printed with no ask beside it.
    if whole.count("The indicator") < 4:
        problems.append("a KPI box prints its area without asking for the indicator")
    d.close()

    if problems:
        print()
        for p in problems:
            print("  FAIL  " + p)
        return 1
    print("OK: %d pages, every required string present" % WANT_PAGES)
    return 0


if __name__ == "__main__":
    sys.exit(main())
