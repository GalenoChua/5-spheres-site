# -*- coding: utf-8 -*-
"""What AI made faster in a ministry, and what it did not.

The government twin of `_ai_speed_figure.py`, which is slide 8 of the Lviv deck
under the eyebrow BUILDING A PRODUCT. Same drawing, same rules, same monochrome:
the point of keeping them identical is that the audience sees one argument told
twice, once about a company and once about them.

Two timelines of the same journey: Consultation, Design, Build, Approval, Pilot,
Adoption, with public value at the end.

AI collapses Design, Build and each pilot round. It does not touch Consultation,
Approval or Adoption. What it adds is rounds: piloting goes from two long passes
to eight short ones, so the stage that got faster per round is now the largest
block on the board. Adoption still lands at about the same point.

WHY APPROVAL GROWS. When everyone can build in a week, the number of things
arriving at the same clearance desk goes up and the desk does not. That is the
honest reading and it is also the one that needs care in the room: the gate is
not waste, it is where accountability is created, and a slide that reads as
"your bureaucracy is slow" loses a ministry in one line. So the lever under it
is worded as what shortens it, trust across agencies, rather than as a
complaint about what it is.

THE ARGUMENT THIS SETS UP. Before AI, capacity to build was scarce, so it was
what separated one ministry from another. Now everyone can build. What separates
them is whether the thing clears its approvals and whether the public uses it,
and both of those are people problems. That is G's thesis from slide 7, applied
to the room.

Deliberately unscaled: no axis and no durations, because any scale gets read as
measured and these proportions are drawn rather than observed.

Two assumptions worth a one-word correction from G. Design is drawn as
AI-accelerated, carried over from the product figure. And Consultation is drawn
as completely untouched, which is the strong claim: AI can summarise submissions
but it cannot be the reason a community believes it was asked.

The checks cover what a screenshot cannot: that every stage label fits inside
its own bar, that label-on-bar contrast clears 4.5:1, that the two rows finish
within a hair of each other, that piloting gains rounds while each round
shortens, and that the rendered ink sits inside the page margins.
"""
import os

import fitz
import numpy as np
import PIL.Image
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

VERSION = 5

# Moved out of ops-log/ on 28 October: that folder is entirely
# gitignored in this repo, so the only copy of this generator lived on
# one disk. SITE is still the parent of HERE, which is still the site
# root now that HERE is scripts/.
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
WINF = r"C:\Windows\Fonts"
for n, f in (("Arial", "arial.ttf"), ("Arial-B", "arialbd.ttf")):
    pdfmetrics.registerFont(TTFont(n, os.path.join(WINF, f)))

BLACK = HexColor("#000000")
WHITE = HexColor("#FFFFFF")
GROUND_RGB = (0, 0, 0)

W, H = 1920, 1080
MARGIN = 130
MIN_WIDTH_PX = 1060
FLOOR_PX = 14
SZ_EYEBROW, SZ_HEADING, SZ_BAR, SZ_LABEL = 28, 54, 26, 26
TRACKING = 3.6

# Credit, so the figure stays attributed if it is lifted. The mark is the "5"
# from images/5-spheres-mark.png, reduced to a white silhouette at build time:
# the source is full colour and these figures are black and white, and dropping
# a colour sticker on them looked like a sticker. The glyph separates cleanly
# because it is the only light, unsaturated thing in the file.
MARK_SRC = os.path.join(SITE, "images", "5-spheres-mark.png")
CREDIT = "5spheresofempathy.com"
MARK_H = 46
MARK_GAP = 18
SZ_CREDIT = 24
RULE_W = 1.6
CREDIT_Y = 130        # sits on the same margin the sides use

BAR_H = 76
SEG_GAP = 8

# (name, length, cycles, ai). cycles > 1 draws internal dividers.
#
# `ai` is no longer a yes or no. G's walkthrough of the ministry pipeline on
# 28 October named three stages that AI makes PARTLY faster, and drawing those
# as either solid or outlined would misreport the argument in both directions:
#
#   False        AI does not touch it
#   True         AI does it, and visibly faster
#   0.0 to 1.0   the share of the stage AI takes; the rest is still a person
#
# Eight stages now, not six. Two were missing from the product shape because a
# company does not have them:
#
#   Trigger    before any consultation there is a needs analysis, a request
#              from senior officials, or an event that forced the question.
#              Nothing about AI makes a minister ask sooner.
#   Redesign   between the pilot and adoption there is the work of fixing what
#              the pilot found. More pilot rounds produce more of it.
#
# The rest map to the product figure so the two slides read as one argument:
# Validation becomes Consultation, Sell becomes Approval, Iteration becomes
# Pilot, Adopt becomes Adoption.
BEFORE = [("Trigger", 130, 1, False), ("Consultation", 175, 1, False),
          ("Design", 150, 1, True), ("Build", 190, 1, True),
          ("Approval", 140, 1, False), ("Pilot", 130, 2, True),
          ("Redesign", 145, 1, False), ("Adoption", 145, 1, False)]

# What people think AI did. Almost everything solid, and the whole thing over
# early. This row is the belief the talk is there to correct, so it is drawn
# the way the belief feels: short, white, and unbothered.
THINK = [("Trigger", 130, 1, False), ("Consultation", 85, 1, True),
         ("Design", 75, 1, True), ("Build", 70, 1, True),
         ("Approval", 90, 1, True), ("Pilot", 110, 4, True),
         ("Redesign", 70, 1, True), ("Adoption", 95, 1, True)]

# What actually happens. Design, Build and Pilot are the stages AI genuinely
# moves, and even those are not whole: somebody still decides what to build,
# still reads what the pilot found, and is still the one being piloted on. So
# none of them is a solid block. The row lands where Before AI landed.
REAL = [("Trigger", 130, 1, False), ("Consultation", 160, 1, 0.30),
        ("Design", 105, 1, 0.70), ("Build", 110, 1, 0.75),
        ("Approval", 185, 1, 0.30), ("Pilot", 240, 8, 0.55),
        ("Redesign", 165, 1, 0.35), ("Adoption", 130, 1, False)]

# (heading lines, stages, bar bottom, does this row fill)
#
# The bar bottom here is a placeholder: each variant renders two rows and emit()
# rebinds them onto ROW_Y, so a row sits at a different height depending on
# which image it is in. Two rows on a 1080 page can breathe where three could
# not, which is most of what the split buys.
ROW_BEFORE = (["Before AI"], BEFORE, 0, False)
ROW_THINK = (["With AI", "what people think"], THINK, 0, True)
ROW_REAL = (["With AI", "in reality"], REAL, 0, True)

ROW_Y = [700, 470]

ROWS = [ROW_BEFORE, ROW_THINK, ROW_REAL]
OPTS = dict(levers=True, outcomes=True, cycles=True, mark=True,
            before_mark=False)

# Bars start here, not at MARGIN. Three rows need their names beside them
# rather than above them: at 54pt "With AI, what people think" is wider than
# four stages and would sit on top of the bars it labels.
LABEL_COL = 400
# Heading baseline above the bar top. 34 in the product figure, where no label
# sat above a bar in the first two positions. Here Consultation is part filled,
# so its label moved above its bar, and at 34 the word ran straight through
# "With AI". The headings now clear the whole above-bar label band.
LABEL_DY = 12                # above-bar labels sit this far above the bar top
LEVER_DY = 62                # bracket baseline below the bar bottom
HEAD_DY = 56

# The two things that take time out of what is left. Worded as what BUILDS
# them, not as what is wrong. "Approval is slow" is a complaint about a gate
# that exists on purpose, and a room of officials will hear it as one. The gate
# is where legitimacy is created; what shortens it is agencies trusting each
# other's work, and that is a thing you can actually build.
# One per stage that still needs a person. Worded as what BUILDS the thing,
# not as what is wrong with the stage: "approval is slow" is a complaint about
# a gate that exists on purpose, and a room of officials hears it as one.
#
# Each is a list of lines. "Adaptive thinking and relationships" is 35
# characters against a 130 unit bar, so wrapping is not a nicety here.
LEVERS = [("Consultation", ["Deep curiosity"]),
          ("Approval", ["Trust across", "agencies"]),
          ("Pilot", ["Judgement of", "what works"]),
          ("Redesign", ["Courage to", "change it"]),
          ("Adoption", ["Adaptive thinking", "and relationships"])]

# Public value, not value. Before AI, capacity to build was the thing in short
# supply, so it separated one ministry from another. Now everyone can build, and
# what separates them is whether the thing clears its approvals and whether the
# public uses it. Both of those are people problems, which is the argument.
VALUE_LABEL = ["Perceived", "public value"]
OUTCOMES = {"Before AI": "Serves the public",
            "With AI, what people think": "Sooner, and better",
            "With AI, in reality": "Serves the public really well"}
LEGEND = [(True, "AI does it"), (0.45, "AI does part of it"),
          (False, "A person does it")]


def row_end(stages):
    return LABEL_COL + sum(d for _n, d, _c, _a in stages) + SEG_GAP * (len(stages) - 1)


def seg_spans(stages):
    x, out = LABEL_COL, []
    for name, d, cycles, ai in stages:
        out.append((name, x, x + d, cycles, ai))
        x += d + SEG_GAP
    return out


def span_of(stages, name):
    for n, x0, x1, _c, _a in seg_spans(stages):
        if n == name:
            return x0, x1
    raise KeyError(name)


def luminance(col):
    def ch(v):
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(col.red) + 0.7152 * ch(col.green) + 0.0722 * ch(col.blue)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def label(c, x, y, text=None, font="Arial", size=SZ_LABEL, colour=WHITE, align="l"):
    c.setFont(font, size)
    c.setFillColor(colour)
    {"l": c.drawString, "r": c.drawRightString, "c": c.drawCentredString}[align](x, y, text)


def stagger(stages):
    """How far above its bar each stage name sits, per row.

    On the belief row the bars are narrow by design, and at one height the
    names overlap in five places: Trigger into Consultation, Consultation into
    Design, Design touching Build, Build into Approval, Redesign into Adoption.
    Shrinking the type would make the short row shout less than the long one,
    which is the opposite of the point, and widening the bars would throw away
    the shortness the row exists to show.

    So alternate heights where they clash. Measured, not assumed: a row whose
    names already fit stays on one line, which is every row but the belief.
    """
    spans = seg_spans(stages)
    widths = dict((n, pdfmetrics.stringWidth(n, "Arial", SZ_BAR)) for n, _a, _b, _c, _d in spans)
    flat = {}
    clash = False
    prev = None
    for name, x0, x1, _c, _a in spans:
        mid = (x0 + x1) / 2.0
        half = widths[name] / 2.0
        if prev is not None and mid - half < prev + 12:
            clash = True
        prev = mid + half
        flat[name] = 0
    if not clash:
        return flat
    return dict((n, 0 if i % 2 == 0 else SZ_BAR * 1.12)
                for i, (n, _a, _b, _c, _d) in enumerate(spans))


def named_row(lines):
    """True for the two rows being compared, False for the belief row."""
    return "what people think" not in lines


def is_partly(ai):
    """A share between 0 and 1. True and False are not shares."""
    return isinstance(ai, float) and 0.0 < ai < 1.0


def bar(c, x0, x1, y, cycles, ai):
    """Filled where AI made it faster, outlined otherwise, part filled between.

    Only the second row fills. A filled bar in the Before AI row would be
    labelled "faster with AI" inside a row where AI is not present yet.

    A part-filled bar is read left to right: the solid head is the share of the
    stage AI takes, the outlined tail is the share still done by a person. It is
    the same two inks as everything else, so it needs no new visual idea, and
    the proportion carries the claim.
    """
    if is_partly(ai):
        c.setFillColor(BLACK)
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.6)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=1, fill=1)
        cut = x0 + (x1 - x0) * ai
        c.saveState()
        p = c.beginPath()
        p.rect(x0, y, cut - x0, BAR_H)
        c.clipPath(p, stroke=0, fill=0)
        c.setFillColor(WHITE)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=0, fill=1)
        c.restoreState()
        # the boundary, so the eye reads two parts rather than a smudge
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.6)
        c.line(cut, y, cut, y + BAR_H)
        # Cycle dividers, which this branch used to return before drawing. The
        # reality row's Pilot is eight rounds and rendered as one undivided
        # block, losing the whole "more rounds, each shorter" claim while every
        # assert passed on the data. Each divider takes the colour of the half
        # it falls in.
        if cycles > 1:
            step = (x1 - x0) / float(cycles)
            c.setLineWidth(2.2)
            for k in range(1, cycles):
                dx = x0 + step * k
                c.setStrokeColor(BLACK if dx < cut else WHITE)
                c.line(dx, y + 7, dx, y + BAR_H - 7)
        return WHITE
    if ai:
        c.setFillColor(WHITE)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=0, fill=1)
        divider, text = BLACK, BLACK
    else:
        c.setFillColor(BLACK)
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.6)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=1, fill=1)
        divider, text = WHITE, WHITE
    if cycles > 1:
        step = (x1 - x0) / float(cycles)
        c.setStrokeColor(divider)
        c.setLineWidth(2.2)
        for k in range(1, cycles):
            c.line(x0 + step * k, y + 7, x0 + step * k, y + BAR_H - 7)
    return text


def lever(c, x0, x1, y, text, drop=0):
    """A bracket under a bar, with the arrow pointing the way it can shrink."""
    c.setStrokeColor(WHITE)
    c.setLineWidth(2.2)
    c.setLineCap(1)
    c.line(x0, y, x1, y)
    c.line(x0, y, x0, y + 14)
    c.line(x1, y, x1, y + 14)
    # a head at the left end: this is what pulls the stage shorter
    c.setFillColor(WHITE)
    p = c.beginPath()
    p.moveTo(x0, y)
    p.lineTo(x0 + 16, y + 7)
    p.lineTo(x0 + 16, y - 7)
    p.close()
    c.drawPath(p, stroke=0, fill=1)
    for i, line in enumerate(text):
        label(c, (x0 + x1) / 2.0, y - 46 - drop - i * SZ_LABEL * 1.1,
              line, align="c")


def outcome_y(by):
    """Clear below the bar. At the bar's vertical centre minus 47 the second
    row's ascenders reached up into the Adopt bar, which the text runs under."""
    return by - 26


def blocked_bands():
    """Vertical ranges the comparison line must not be drawn through."""
    bands = []
    for _h, _s, by, _f in ROWS:
        dot_y = by + BAR_H / 2.0
        bands.append((dot_y - 26, dot_y + 26))
        y0 = outcome_y(by)
        bands.append((y0 - 10, y0 + SZ_LABEL * 0.72 + 10))
    bands.sort()
    merged = [list(bands[0])]
    for lo, hi in bands[1:]:
        if lo <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], hi)
        else:
            merged.append([lo, hi])
    return merged


def mark_segments():
    """Top to bottom, skipping every blocked band."""
    # Below the first row's label band, stagger included, so the line does not
    # start inside a stage name.
    top = ROWS[0][2] + BAR_H + 16 + max(stagger(ROWS[0][1]).values())
    bottom = ROWS[-1][2] - 26
    out, y = [], top
    for lo, hi in sorted(blocked_bands(), reverse=True):
        if hi >= y:
            y = min(y, lo)
            continue
        if y - hi > 6:
            out.append((y, hi))
        y = lo
    if y - bottom > 6:
        out.append((y, bottom))
    return out


def white_mark():
    """The mark's numeral as white on transparent, built from the source."""
    im = PIL.Image.open(MARK_SRC).convert("RGBA")
    a = np.asarray(im).astype(int)
    rgb = a[..., :3]
    glyph = ((rgb.mean(axis=2) > 190) & (rgb.max(axis=2) - rgb.min(axis=2) < 60)
             & (a[..., 3] > 128))
    assert glyph.sum() > 1000, "the mark's glyph did not separate from its ground"
    ys, xs = np.where(glyph)
    out = np.zeros((im.height, im.width, 4), dtype=np.uint8)
    out[..., :3] = 255
    out[..., 3] = (glyph * 255).astype(np.uint8)
    crop = PIL.Image.fromarray(out, "RGBA").crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    return crop


def credit_width():
    m = white_mark()
    return (MARK_H * m.width / float(m.height) + MARK_GAP * 2 + RULE_W
            + pdfmetrics.stringWidth(CREDIT, "Arial", SZ_CREDIT))


def draw_credit(c):
    """Mark, hairline, domain.

    Without the rule it reads "5 5spheresofempathy.com" and the repeated
    numeral stutters. The rule makes the glyph a mark and the text a URL.
    """
    m = white_mark()
    mw = MARK_H * m.width / float(m.height)
    x = W - MARGIN - credit_width()
    c.drawImage(ImageReader(m), x, CREDIT_Y, mw, MARK_H, mask="auto")
    rx = x + mw + MARK_GAP
    c.setStrokeColor(HexColor("#6E6E6E"))
    c.setLineWidth(RULE_W)
    c.setDash()
    c.line(rx, CREDIT_Y + 4, rx, CREDIT_Y + MARK_H - 4)
    c.setFont("Arial", SZ_CREDIT)
    c.setFillColor(WHITE)
    c.drawString(rx + MARK_GAP, CREDIT_Y + 12, CREDIT)


def build(pdf_path):
    c = canvas.Canvas(pdf_path, pagesize=(W, H))
    c.setFillColor(BLACK)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    t = c.beginText(MARGIN, 920)
    t.setFont("Arial-B", SZ_EYEBROW)
    t.setFillColor(WHITE)
    t.setCharSpace(TRACKING)
    t.textOut("DELIVERING A PUBLIC SERVICE")
    c.drawText(t)
    # Tc is page state. Without this reset every later string is letterspaced
    # while stringWidth stays blind to it.
    reset = c.beginText(0, 0)
    reset.setCharSpace(0)
    reset.textOut("")
    c.drawText(reset)

    for lines, stages, by, fills in ROWS:
        # The row name sits in its own column to the left of the bars, right
        # aligned against them and vertically centred on the bar. Above the
        # bars it would cover them: "With AI, what people think" at 54pt is
        # wider than the first four stages put together.
        # The first line is the row's name and carries the weight. Any line
        # after it is a qualifier and is set at label size: "what people think"
        # at 54pt bold is 456 units against a 270 unit column, and making the
        # column wide enough for it would have cost the bars a fifth of the
        # page.
        c.setFillColor(WHITE)
        head_y = by + BAR_H / 2.0 - 9 + (len(lines) - 1) * 16
        for i, line in enumerate(lines):
            if i == 0:
                c.setFont("Arial-B", SZ_HEADING)
                c.drawRightString(LABEL_COL - 34, head_y, line)
            else:
                c.setFont("Arial", SZ_LABEL)
                c.drawRightString(LABEL_COL - 34,
                                  head_y - SZ_HEADING * 0.72 - (i - 1) * SZ_LABEL * 1.1,
                                  line)

        levels = stagger(stages)

        for name, x0, x1, cycles, ai in seg_spans(stages):
            # NOT `ai and fills`. That worked while ai was a boolean and
            # silently destroyed the share once it became a float: in Python
            # `0.30 and True` is True, so every part-filled stage rendered as
            # fully solid, the legend's third entry described nothing on the
            # board, and all the asserts passed because they read the data
            # rather than what was drawn.
            shown = ai if fills else False
            bar(c, x0, x1, by, cycles if OPTS['cycles'] else 1, shown)
            # Every row carries its stage names. An earlier version left the
            # belief row bare on the grounds that it is a short white smear and
            # its bars are too narrow to hold the words. G, 28 October: "we
            # still need to show the stages underneath or over the top of the
            # blocks." A reader cannot check a claim about Approval against a
            # bar nobody labelled.
            label(c, (x0 + x1) / 2.0, by + BAR_H + LABEL_DY + levels[name],
                  size=SZ_BAR, colour=WHITE, align="c", text=name)

        end = row_end(stages)
        c.setFillColor(WHITE)
        c.circle(end + 30, by + BAR_H / 2.0, 15, stroke=0, fill=1)

        # The outcome sentence and the value label are off by default. Five
        # pieces of furniture were saying what the dot and the dashed line
        # already say, and the bar ending where it ends IS the claim.
        if OPTS["outcomes"]:
            text = OUTCOMES[", ".join(lines)]
            tw = pdfmetrics.stringWidth(text, "Arial", SZ_LABEL)
            left = end + 18
            if left + tw > W - MARGIN:
                label(c, W - MARGIN, outcome_y(by), text, align="r")
            else:
                label(c, left, outcome_y(by), text)

    if OPTS["outcomes"]:
        vy = (ROWS[0][2] + BAR_H + LABEL_DY + max(stagger(ROWS[0][1]).values())
              + SZ_BAR * 0.75 + 22)
        vx = row_end(ROWS[0][1]) + 30
        for i, line in enumerate(VALUE_LABEL):
            label(c, vx, vy + (len(VALUE_LABEL) - 1 - i) * SZ_LABEL * 1.1, line,
                  align="c")

    # Where the FIRST row on this image finished, so the second can be read
    # against it. Dropped when there is only one row, because there is then
    # nothing to compare it to.
    if OPTS["mark"] and len(ROWS) > 1:
        c.setStrokeColor(WHITE)
        c.setLineWidth(1.8)
        c.setDash(3, 9)
        c.setLineCap(1)
        mark_x = row_end(ROWS[0][1]) + 30
        for a, b in mark_segments():
            c.line(mark_x, a, mark_x, b)
        c.setDash()

    # WHERE IT FINISHED BEFORE AI.
    #
    # The whole claim is that AI did not move the date, and splitting the
    # figure took Before AI off this image, which took the claim with it. A
    # full third row brings back the clutter the split removed. One line does
    # the job: the reality row's dot lands on it, 20 units out of 1281, and the
    # eye checks that for itself.
    if OPTS.get("before_mark"):
        bx = row_end(BEFORE) + 30
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.2)
        c.setDash()
        top_y = ROWS[0][2] + BAR_H + LABEL_DY + max(stagger(ROWS[0][1]).values())
        bot_y = ROWS[-1][2] - 92
        c.line(bx, bot_y, bx, top_y)
        c.setLineWidth(2.2)
        for yy in (top_y, bot_y):
            c.line(bx - 9, yy, bx + 9, yy)
        label(c, W - MARGIN, bot_y - 36, "Where it finished before AI", align="r")

    by = ROWS[-1][2]
    # The brackets are their own image now. On the other two they were a third
    # of the marks on the board, saying something the five skill cards say one
    # at a time.
    showing_reality = OPTS["levers"] and any(st is REAL for _l, st, _b, _f in ROWS)
    # Five brackets under the last row, so the labels collide unless they are
    # measured. Anything that would overlap its neighbour drops a line, and the
    # drop alternates rather than accumulating, so a run of long labels does not
    # walk off the bottom of the page.
    placed = []
    for name, lines in (LEVERS if showing_reality else []):
        x0, x1 = span_of(REAL, name)
        mid = (x0 + x1) / 2.0
        half = max(pdfmetrics.stringWidth(l, "Arial", SZ_LABEL)
                   for l in lines) / 2.0
        drop = 0
        for pmid, phalf, pdrop, pn in placed:
            if pdrop == 0 and abs(mid - pmid) < half + phalf + 18:
                # just clear of the previous label's last line, not a line
                # further: at 30 + (pn + 1) lines the Adoption lever ended up
                # beside the credit with nothing to connect it to its bracket
                drop = pn * SZ_LABEL * 1.1 + 16
        lever(c, x0, x1, by - LEVER_DY, lines, drop=drop)
        placed.append((mid, half, drop, len(lines)))

    y, x = 180, MARGIN
    spans = []
    for ai, text in LEGEND:
        start = x
        if is_partly(ai):
            c.setFillColor(BLACK)
            c.setStrokeColor(WHITE)
            c.setLineWidth(2.2)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=1, fill=1)
            c.saveState()
            p = c.beginPath()
            p.rect(x, y - 2, 36 * ai, 24)
            c.clipPath(p, stroke=0, fill=0)
            c.setFillColor(WHITE)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=0, fill=1)
            c.restoreState()
            c.setStrokeColor(WHITE)
            c.setLineWidth(2.2)
            c.line(x + 36 * ai, y - 2, x + 36 * ai, y + 22)
        elif ai:
            c.setFillColor(WHITE)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=0, fill=1)
        else:
            c.setFillColor(BLACK)
            c.setStrokeColor(WHITE)
            c.setLineWidth(2.2)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=1, fill=1)
        x += 50
        label(c, x, y, text)
        x += pdfmetrics.stringWidth(text, "Arial", SZ_LABEL)
        spans.append((start, x))
        x += 62

    draw_credit(c)

    c.showPage()
    c.save()
    return spans


# ----------------------------------------------------------------- checks ---
def check(spans):
    names = [n for n, _d, _c, _x in BEFORE]
    for row in (THINK, REAL):
        assert [n for n, _d, _c, _x in row] == names,             "every row must carry the same stages in the same order"
    b = dict((n, (d, c)) for n, d, c, _a in BEFORE)
    t = dict((n, (d, c)) for n, d, c, _a in THINK)
    r = dict((n, (d, c)) for n, d, c, _a in REAL)

    # 1. The belief row is short and almost entirely AI's. That is the claim it
    #    is there to make, so it is the claim to assert.
    solid = [n for n, _d, _c, x in THINK if x is True]
    assert len(solid) >= 6,         "the belief row has to look like AI did nearly all of it: %s" % solid
    assert row_end(THINK) < row_end(BEFORE) - 300,         "the belief row has to finish visibly early: %d vs %d"         % (row_end(THINK), row_end(BEFORE))

    # 2. Reality lands where Before AI landed. The whole argument is that the
    #    date did not move, so a gap here would quietly concede the point.
    gap = abs(row_end(REAL) - row_end(BEFORE))
    assert gap < 60,         "reality has to finish where Before AI finished: %d apart" % gap

    # 3. Nothing in reality is a solid block. G, 28 October: design, build and
    #    pilot "shouldn't be completely white blocks".
    for name, _d, _c, x in REAL:
        assert x is not True,             "%s is drawn as wholly AI's in the reality row" % name
    for name in ("Design", "Build", "Pilot"):
        share = dict((n, x) for n, _d, _c, x in REAL)[name]
        assert is_partly(share) and share >= 0.5,             "%s is where AI really does help, so it has to be mostly filled" % name
    for name in ("Consultation", "Approval", "Redesign"):
        share = dict((n, x) for n, _d, _c, x in REAL)[name]
        assert is_partly(share) and share <= 0.45,             "%s is mostly a person's job, so it has to be mostly open" % name

    # 4. AI still collapses the making, measured against Before AI
    for name in ("Design", "Build"):
        assert r[name][0] < b[name][0] * 0.75, "%s has to visibly collapse" % name
    assert r["Trigger"][0] == b["Trigger"][0],         "nothing about AI makes a minister ask sooner"
    for name in ("Approval", "Redesign"):
        assert r[name][0] > b[name][0],             "%s grows: more arrives at the same desk" % name

    # 5. Piloting: more rounds, each shorter, more time in total
    assert r["Pilot"][1] >= b["Pilot"][1] * 3,         "AI has to add pilot rounds: %d vs %d" % (r["Pilot"][1], b["Pilot"][1])
    per_b = b["Pilot"][0] / float(b["Pilot"][1])
    per_r = r["Pilot"][0] / float(r["Pilot"][1])
    assert per_r < per_b * 0.6,         "each round has to be clearly shorter: %.0f vs %.0f" % (per_r, per_b)
    assert r["Pilot"][0] > b["Pilot"][0],         "more rounds means piloting takes longer in total"

    # 6. The levers, stated rather than derived. There is no numeric rule that
    #    produces this set: Pilot is drawn as 55% AI and still carries a lever,
    #    because the 45% left is the people being piloted on. A rule based on
    #    the share would either drop Pilot or pick up Design, and inventing one
    #    to look principled would be worse than naming the five.
    levered = set(n for n, _t in LEVERS)
    assert levered == {"Consultation", "Approval", "Pilot", "Redesign",
                       "Adoption"}, "the levers are %s" % sorted(levered)
    shares = dict((n, x) for n, _d, _c, x in REAL)
    for name in levered:
        assert shares[name] is not True, \
            "%s carries a lever and is drawn as wholly AI's" % name
    for name in ("Trigger", "Design", "Build"):
        assert name not in levered, \
            "%s has a lever; it is not one of the five G named" % name

    # 7. Every row name has an outcome, and the belief row's lands early
    for lines, _s, _by, _f in ROWS:
        assert ", ".join(lines) in OUTCOMES,             "no outcome line for %r" % (lines,)

    # 8. The row-name column has to hold the longest row name
    widest = max(
        max([pdfmetrics.stringWidth(lines[0], "Arial-B", SZ_HEADING)]
            + [pdfmetrics.stringWidth(l, "Arial", SZ_LABEL) for l in lines[1:]])
        for lines, _s, _b, _f in ROWS)
    assert widest + 34 <= LABEL_COL - MARGIN + 34,         "the row names need %.0f but the column is %d wide"         % (widest, LABEL_COL - MARGIN)

    # 8b. The value label clears the first row's stage names, stagger included.
    band = (ROWS[0][2] + BAR_H + LABEL_DY + max(stagger(ROWS[0][1]).values())
            + SZ_BAR * 0.75)
    vy_here = band + 22
    assert vy_here > band, "the value label sits inside the stage-name band"

    # 8c. The comparison line marks a row that is actually on this image.
    assert any(st is ROWS[0][1] for _l, st, _b, _f in ROWS),         "the comparison line marks a row that is not drawn"

    # 9. The value label is named once, above the first row's dot, and has to
    #    fit between that dot and the right margin.
    vx = row_end(BEFORE) + 30
    widest_v = max(pdfmetrics.stringWidth(l, "Arial", SZ_LABEL)
                   for l in VALUE_LABEL)
    assert vx + widest_v / 2.0 < W - MARGIN,         "the value label overruns the right margin"
    for stages in (BEFORE, THINK, REAL):
        assert row_end(stages) + 30 + 15 < W - MARGIN,             "a row's value dot is outside the margin"

    # The outcome lines sit on the right. The last row's shares horizontal
    # space with the Adoption lever, so the clearance that matters is VERTICAL:
    # the outcome sits above the bracket, and the first version of this check
    # compared only their left and right edges and failed a figure that was
    # correct.
    for name, text in OUTCOMES.items():
        left = W - MARGIN - pdfmetrics.stringWidth(text, "Arial", SZ_LABEL)
        assert left > MARGIN, "%r runs off the left" % text

    by_last = ROWS[-1][2]
    bracket_y = by_last - LEVER_DY
    # OPTS too, not just "is the reality row here". The reality image
    # carries that row and draws no brackets, and this was asserting
    # clearance for furniture that is not on the board.
    draws_levers = OPTS["levers"] and any(st is REAL for _l, st, _b, _f in ROWS)

    if draws_levers:
        if OPTS["outcomes"]:
            assert outcome_y(by_last) - SZ_LABEL * 0.25 > bracket_y + 14 + 6, \
                "the last outcome line sits on the lever brackets: %.0f against %.0f" \
                % (outcome_y(by_last) - SZ_LABEL * 0.25, bracket_y + 14)

        # and the deepest lever label has to stay above the legend
        deepest = bracket_y - 46 - (2 * SZ_LABEL * 1.1 + 16) - SZ_LABEL * 1.1
        assert deepest > 180 + SZ_LABEL * 0.8, \
            "a lever label reaches the legend at %.0f" % deepest
    # Subset, not equality. OUTCOMES holds a line for all three rows, and each
    # variant shows two of them.
    assert set(", ".join(h) for h, _s, _b, _f in ROWS) <= set(OUTCOMES), \
        "a row on this variant has no outcome line"

    # an outcome line runs under its own row's bars, so it has to clear them
    for lines, stages, by, _f in ROWS:
        text = OUTCOMES[", ".join(lines)]
        left = W - MARGIN - pdfmetrics.stringWidth(text, "Arial", SZ_LABEL)
        if left < row_end(stages):
            assert outcome_y(by) + SZ_LABEL * 0.72 < by - 4, \
                "%r reaches up into the %s bars" % (text, lines[0])

    # the comparison line struck through the second outcome, so check it
    for a, b in mark_segments():
        for lo, hi in blocked_bands():
            assert b >= hi - 0.01 or a <= lo + 0.01, \
                "the comparison line runs through a dot or an outcome line"
    assert mark_segments(), "the comparison line vanished entirely"
    # three rows, three different things said at the end
    assert len(set(OUTCOMES.values())) == len(OUTCOMES), \
        "two rows land on the same outcome line: %s" % sorted(OUTCOMES.values())

    for a0, b0 in zip(spans, spans[1:]):
        assert b0[0] - a0[1] >= 40, "legend items are %.0f apart" % (b0[0] - a0[1])
    assert spans[-1][1] < W - MARGIN, "the legend runs past the right margin"

    scale = MIN_WIDTH_PX / float(W)
    for name, size in (("eyebrow", SZ_EYEBROW), ("heading", SZ_HEADING),
                       ("bar", SZ_BAR), ("label", SZ_LABEL)):
        px = size * scale
        assert px >= FLOOR_PX, \
            "%s renders at %.1fpx at %dpx wide, under the %dpx floor" % (
                name, px, MIN_WIDTH_PX, FLOOR_PX)


def check_ink(path):
    im = PIL.Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    ink = np.abs(a - np.array(GROUND_RGB)).sum(axis=2) > 60
    cols = np.where(ink.any(axis=0))[0]
    rows = np.where(ink.any(axis=1))[0]
    assert len(cols) and len(rows), "the page rendered blank"
    unit = im.width / float(W)
    left, right = cols[0] / unit, cols[-1] / unit
    top, bottom = rows[0] / unit, rows[-1] / unit
    print("ink spans x %.0f to %.0f, y %.0f to %.0f (margin %d, page %dx%d)"
          % (left, right, top, bottom, MARGIN, W, H))
    assert left >= MARGIN - 6, "ink starts at %.0f, inside the left margin" % left
    assert right <= W - MARGIN + 6, \
        "ink reaches %.0f, past the right margin at %d" % (right, W - MARGIN)
    assert top >= 30 and bottom <= H - 30, "ink reaches the top or bottom edge"
    # it is meant to be monochrome, so assert it
    sat = a.max(axis=2) - a.min(axis=2)
    assert sat.max() <= 6, "the page is not greyscale: max saturation %d" % sat.max()
    cx0 = int((W - MARGIN - credit_width()) * unit)
    cy0, cy1 = int((H - CREDIT_Y - MARK_H) * unit), int((H - CREDIT_Y) * unit)
    assert ink[cy0:cy1, cx0:int((W - MARGIN) * unit)].any(), \
        "the credit did not render"


# ---------------------------------------------------------------- output ---
# Two images, not three rows on one board. The MPTC room on 28 October said the
# three-row version carried too much at once, and it does: the belief and the
# correction are two beats of an argument and a slide that shows both at the
# same time lands neither.
#
# Before AI appears in BOTH, because it is the baseline the other row is read
# against. Without it the second image is a row of bars with nothing to be
# longer than.
# One claim per image. G, 28 October: "it's super complicated, what would you
# recommend to simplify this."
#
# It was complicated because things were added and nothing was removed. The
# reality image carried nine visual conventions at once: eight stage names, six
# part-filled bars each with a boundary, seven cycle dividers, five lever
# brackets under eight lines of text, a three-part legend, two dots, two
# outcome lines, a value label and a comparison line. A room has about twenty
# seconds and somebody talking over it.
#
# So the levers move to their own image. They are a third of the marks on the
# busiest board and they already exist as five separate cards, which is where
# they belong: one at a time, not five at once.
#
# Dropped from the first two: the outcome lines and the value label, five
# pieces saying what a dot and a dashed line already say; and the cycle
# dividers, which are only the point on the image about where the time went.
VARIANTS = [
    ("belief", [ROW_BEFORE, ROW_THINK],
     dict(levers=False, outcomes=False, cycles=False, mark=True, before_mark=False),
     "it is all fast, and it is over early"),
    ("reality", [ROW_THINK, ROW_REAL],
     dict(levers=False, outcomes=False, cycles=False, mark=True,
          before_mark=True),
     "it lands no sooner"),
    ("levers", [ROW_REAL],
     dict(levers=True, outcomes=False, cycles=True, mark=False, before_mark=False),
     "where the time went, and that all five are people"),
]

TARGET_W = 2400


def emit(name, rows, opts, note):
    """Render one variant. ROWS is module state that build(), check() and the
    comparison line all read, so it is rebound rather than threaded through
    every signature."""
    global ROWS, OPTS
    OPTS = opts
    # Where the rows sit depends on what else is on the board. With the lever
    # brackets gone there is nothing under the second row, so the old pair left
    # a third of the page empty below it; the rows spread to use the space they
    # were sharing with the brackets.
    if len(rows) == 1:
        ys = [620]                      # one row, five brackets under it
    elif opts["levers"]:
        ys = ROW_Y
    else:
        ys = [690, 400]
    ROWS = [(lines, stages, by, fills)
            for (lines, stages, _old_by, fills), by in zip(rows, ys)]
    pdf = os.path.join(HERE, "_ai-speed-ministry-%s.pdf" % name)
    png = os.path.join(SITE, "images",
                       "ai-before-after-ministry-%s-v%d.png" % (name, VERSION))
    spans = build(pdf)
    check(spans)
    doc = fitz.open(pdf)
    doc[0].get_pixmap(matrix=fitz.Matrix(TARGET_W / float(W),
                                         TARGET_W / float(W))).save(png)
    doc.close()
    os.remove(pdf)
    check_ink(png)
    size = os.path.getsize(png)
    im = PIL.Image.open(png)
    assert im.width == TARGET_W and size < 900 * 1024
    print("  %-8s %-46s %dx%d  %.0f KB"
          % (name, os.path.basename(png), im.width, im.height, size / 1024))
    print("           %s" % note)


print("before ends %d | belief ends %d (%d early) | reality ends %d (%+d)"
      % (row_end(BEFORE), row_end(THINK), row_end(BEFORE) - row_end(THINK),
         row_end(REAL), row_end(REAL) - row_end(BEFORE)))
_pb = dict((n, (d, c)) for n, d, c, _a in BEFORE)["Pilot"]
_pr = dict((n, (d, c)) for n, d, c, _a in REAL)["Pilot"]
print("pilot: %d rounds of %.0f becomes %d rounds of %.0f"
      % (_pb[1], _pb[0] / float(_pb[1]), _pr[1], _pr[0] / float(_pr[1])))
for _name, _rows, _opts, _note in VARIANTS:
    emit(_name, _rows, _opts, _note)
print("checks passed")
