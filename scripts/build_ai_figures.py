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
import json
import math
import os
import random

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
for n, f in (("Arial", "arial.ttf"), ("Arial-B", "arialbd.ttf"),
             ("Hand", "segoeprb.ttf")):
    pdfmetrics.registerFont(TTFont(n, os.path.join(WINF, f)))

# Pencil. Ported from ops-log/_ai_people_figure.py, which drew the annotated
# version of the old two-row figure: a ring that wobbles and overshoots where
# it closes reads as someone marking up a printout, and a perfect ellipse
# reads as another piece of chart furniture.
WOBBLE = 3.0
RING_PAD_X, RING_PAD_Y = 16, 14
PENCIL = "#B9B9B9"

# ----------------------------------------------------------------- i18n ---
# ENGLISH IS THE KEY, ALWAYS. Stage names are not only labels: they index
# LEVERS, span_of(), the per-subject rules and OUTCOMES. Translating the data
# would mean translating the keys, and then a Polish figure would look up a
# Polish lever against an English stage and find nothing. So the data stays
# English end to end and the only thing that changes is what gets DRAWN.
#
# A missing key falls back to English rather than raising, so a half-finished
# translation renders as a mixed figure that is obviously incomplete instead
# of a crash. `coverage()` reports exactly what is missing.
NL = chr(10)      # a translation may carry its own line breaks
LANG = os.environ.get("FIG_LANG", "en")
LANG_DIR = os.path.join(SITE, "lang")


def _load(code):
    p = os.path.join(LANG_DIR, "figures.%s.json" % code)
    if not os.path.exists(p):
        return {}
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


STRINGS = _load(LANG) if LANG != "en" else {}


def T(key):
    """Draw-time only. Never use the result as a key."""
    if isinstance(key, (list, tuple)):
        return [T(k) for k in key]
    return STRINGS.get(key, key)


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
# G, 3 November. It goes UNDER the url rather than beside it: the credit block
# is a mark, a rule and a domain, and a fourth element on that line turns a
# signature into a sentence. Grey rather than white so it reads as a subtitle
# to the domain and does not compete with the board above it.
TAGLINE = "Human intelligence AI can’t replace"
SZ_TAGLINE = 21
TAGLINE_GAP = 22          # baseline to baseline ends up 34, not 25
TAGLINE_GREY = "#9A9A9A"
TAGLINE_STYLE = os.environ.get("TAGLINE_STYLE", "caps")
MARK_H = 46
MARK_GAP = 18
SZ_CREDIT = 24
RULE_W = 1.6
# Lifted from 130 to make room for the tagline UNDER the domain while the
# tagline's own descenders still land on the margin the sides use.
CREDIT_Y = 162

BAR_H = 76
SEG_GAP = 8

# A part-filled stage with rounds is drawn round by round rather than as
# one white head. Off would restore the single-split drawing.
PER_CYCLE = True

# WHITE IS THE HUMAN SHARE. G, 5 November: "the black boxes should be AI (often
# people call the workings of AI a black box), and the white boxes, the light,
# human judgement and clarity".
#
# It is the better metaphor and it does something the first version got
# backwards: it makes the human part the BRIGHT part of every bar, which is the
# argument the figure exists to make. Before, the eye went straight to the AI.
#
# The DATA still records AI's share, because that is the honest way to hold it
# and every check reads it that way. Only the ink is inverted, in one function,
# so the legend and the bars cannot disagree.
AI_IS_BLACK = True


def white_share(ai):
    """The fraction of a bar drawn in the light ink."""
    if ai is True:
        return 0.0 if AI_IS_BLACK else 1.0
    if ai is False:
        return 1.0 if AI_IS_BLACK else 0.0
    return (1.0 - ai) if AI_IS_BLACK else ai

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

# What people think AI did. EVERYTHING solid, and the whole thing over early.
#
# Trigger was the one exception, on the reasoning that nobody imagines AI
# asking the question for a minister. G's own caption for this set says the
# assumption is that "AI turns them all black", and the product set already
# draws its first stage that way, so the exception contradicted both the words
# he is publishing and the other subject. The LENGTH still does not move,
# which is the claim that matters: nothing about AI makes a minister ask
# sooner. This row is the belief the talk is there to correct, so it is drawn
# the way the belief feels: short, white, and unbothered.
THINK = [("Trigger", 130, 1, True), ("Consultation", 85, 1, True),
         ("Design", 75, 1, True), ("Build", 70, 1, True),
         ("Approval", 90, 1, True), ("Pilot", 110, 4, True),
         ("Redesign", 70, 1, True), ("Adoption", 95, 1, True)]

# What actually happens. Design, Build and Pilot are the stages AI genuinely
# moves, and even those are not whole: somebody still decides what to build,
# still reads what the pilot found, and is still the one being piloted on. So
# none of them is a solid block. The row lands where Before AI landed.
REAL = [("Trigger", 130, 1, 0.12), ("Consultation", 160, 1, 0.22),
        ("Design", 105, 1, 0.70), ("Build", 110, 1, 0.75),
        ("Approval", 185, 1, 0.22), ("Pilot", 240, 8, 0.35),
        ("Redesign", 165, 1, 0.25), ("Adoption", 130, 1, 0.12)]

# (heading lines, stages, bar bottom, does this row fill)
#
# The bar bottom here is a placeholder: each variant renders two rows and emit()
# rebinds them onto ROW_Y, so a row sits at a different height depending on
# which image it is in. Two rows on a 1080 page can breathe where three could
# not, which is most of what the split buys.
ROW_BEFORE = (["Before AI"], BEFORE, 0, False)
ROW_THINK = (["With AI", "what people think"], THINK, 0, True)
ROW_REAL = (["With AI", "in reality"], REAL, 0, True)

# ---------------------------------------------------------------- product ---
# G, 3 November: "let's change the business one, let's adopt the same type of
# thinking with Before AI, With AI (What people think), then With AI the
# reality".
#
# ONE BUILDER, TWO SUBJECTS, rather than a second script. The product figure
# used to live in ops-log/_ai_speed_figure.py with its own copy of every
# drawing routine, which is how two figures that make the same argument end up
# disagreeing about what a bar looks like. This file already carried the note
# that the ministry stages were chosen to map onto the product ones, so the
# two were always meant to be one thing.
#
# WHAT CHANGED IN THE MODEL. The old product figure had two rows and a binary
# legend, "Faster with AI" against "Not faster with AI", which is a property of
# the STAGE. The ministry model asks a different question of each row: in THIS
# row, who does it. That is what lets a stage be partly AI and partly a person,
# and it is the whole reason the reality row can land where Before AI landed.
# A SEVENTH STAGE AT THE FRONT. G, 3 November: "I'd add a little strip at the
# very beginning with a wee arrow that says 'your idea / trigger'". It is the
# product's version of the ministry's Trigger, and it was the one stage the
# old two-row figure never had: the thing that starts the work. Narrow,
# because it is a moment rather than a phase, and a person's in every row,
# because nothing about AI hands you the idea.
#
# VALIDATION IS SOLID IN THE BELIEF ROW NOW. G: "validation people think it's
# gonna be faster too." It was drawn as a person's job even in the fantasy,
# which understated the belief the slide exists to correct.
#
# Lengths are pixels and the page is 1920 wide, so adding a stage means every
# other one gives up a little. All three rows are scaled by the same factor:
# the comparison is between rows, so they shrink together and the argument is
# untouched. BEFORE and REAL both total 1197, which is the whole point.
P_BEFORE = [("Your idea", 81, 1, False), ("Validation", 141, 1, False),
            ("Design", 167, 1, False), ("Build", 274, 1, False),
            ("Sell", 192, 1, False), ("Iteration", 201, 2, False),
            ("Adopt", 141, 1, False)]

P_THINK = [("Your idea", 81, 1, True), ("Validation", 77, 1, True),
           ("Design", 68, 1, True), ("Build", 73, 1, True),
           ("Sell", 81, 1, True), ("Iteration", 98, 4, True),
           ("Adopt", 81, 1, True)]

# Validation is 25% AI: it will summarise what people said, and it will not
# have the conversation. Sell is 25% for the same reason one layer out.
P_REAL = [("Your idea", 81, 1, 0.15), ("Validation", 141, 1, 0.18),
          ("Design", 111, 1, 0.70), ("Build", 107, 1, 0.75),
          ("Sell", 274, 1, 0.18), ("Iteration", 342, 8, 0.35),
          ("Adopt", 141, 1, 0.12)]

# G, 3 November, naming the rest himself. Six now, one on every stage but the
# idea, which is the same claim his annotated figure made in handwriting:
# all of it requires people to go through other people.
# G, 3 November: "'your idea' should remove & awareness here, that's the
# human skill that's needed to have an idea". So it moves off the bar and
# onto the bottom line with the other six, which also takes the widest
# label in the figure off the narrowest bar.
P_LEVERS = [("Your idea", ["Awareness"]),
            ("Validation", ["Deep curiosity"]),
            ("Design", ["Creativity"]),
            ("Build", ["Judgement on tools", "and imagination"]),
            ("Sell", ["Strong relationships"]),
            ("Iteration", ["Judgement of", "quality"]),
            ("Adopt", ["Adaptability to", "pivot and change"])]

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


SUBJECTS = {
    "ministry": dict(
        eyebrow="DELIVERING A PUBLIC SERVICE",
        slug="ministry",
        start_arrow=False,
        before=BEFORE, think=THINK, real=REAL,
        levers=LEVERS,
        value=["Perceived", "public value"],
        outcomes={"Before AI": "Serves the public",
                  "With AI, what people think": "Sooner, and better",
                  "With AI, in reality": "Serves the public really well"},
        # What the assertions below mean FOR THIS SUBJECT. They were written
        # against the ministry stage names, so parameterising the data without
        # parameterising these would leave every check silently testing the
        # ministry while the product is on the page.
        rules=dict(first="Trigger", cycle="Pilot",
                   collapse=("Design", "Build"),
                   grow=("Approval", "Redesign"),
                   mostly_ai=("Design", "Build"),
                   mostly_person=("Consultation", "Approval", "Redesign",
                                  "Pilot"),
                   levers={"Consultation", "Approval", "Pilot", "Redesign",
                           "Adoption"},
                   no_lever=("Trigger", "Design", "Build"),
                   first_note="nothing about AI makes a minister ask sooner")),
    "product": dict(
        eyebrow="BUILDING A PRODUCT",
        slug="product",
        start_arrow=True,
        before=P_BEFORE, think=P_THINK, real=P_REAL,
        levers=P_LEVERS,
        value=["Perceived", "value"],
        outcomes={"Before AI": "Solves their problem",
                  "With AI, what people think": "Sooner, and better",
                  "With AI, in reality": "Solves their problem really well"},
        rules=dict(first="Your idea", cycle="Iteration",
                   collapse=("Design", "Build"),
                   grow=("Sell",),
                   mostly_ai=("Design", "Build"),
                   mostly_person=("Sell", "Validation", "Iteration",
                                  "Your idea", "Adopt"),
                   levers={"Your idea", "Validation", "Design", "Build",
                           "Sell", "Iteration", "Adopt"},
                   no_lever=(),
                   first_note="nothing about AI hands you the idea")),
}

SUBJECT = "ministry"
START_ARROW = False
EYEBROW = SUBJECTS[SUBJECT]["eyebrow"]
SLUG = SUBJECTS[SUBJECT]["slug"]


def use(key):
    """Rebind the module state one subject at a time.

    The drawing code reads ROWS, LEVERS, VALUE_LABEL and OUTCOMES as module
    globals, which emit() already rebinds per variant. This does the same one
    level up, so a subject is data rather than a second copy of the file.
    """
    global START_ARROW
    global SUBJECT, EYEBROW, SLUG, LEVERS, VALUE_LABEL, OUTCOMES
    global ROW_BEFORE, ROW_THINK, ROW_REAL, VARIANTS
    global BEFORE, THINK, REAL, RULES
    d = SUBJECTS[key]
    SUBJECT, EYEBROW, SLUG = key, d["eyebrow"], d["slug"]
    START_ARROW = d.get("start_arrow", False)
    # check() and the value-dot geometry read these by name, so rebinding only
    # the ROW_ tuples would draw the product and verify the ministry.
    BEFORE, THINK, REAL, RULES = d["before"], d["think"], d["real"], d["rules"]
    LEVERS, VALUE_LABEL, OUTCOMES = d["levers"], d["value"], d["outcomes"]
    ROW_BEFORE = (["Before AI"], d["before"], 0, False)
    ROW_THINK = (["With AI", "what people think"], d["think"], 0, True)
    ROW_REAL = (["With AI", "in reality"], d["real"], 0, True)
    VARIANTS = [
        ("belief", [ROW_BEFORE, ROW_THINK],
         dict(levers=False, outcomes=False, cycles=False, mark=True,
              before_mark=False),
         "it is all fast, and it is over early"),
        ("reality", [ROW_THINK, ROW_REAL],
         dict(levers=False, outcomes=False, cycles=False, mark=True,
              before_mark=True),
         "it lands no sooner"),
        ("levers", [ROW_REAL],
         dict(levers=True, outcomes=False, cycles=True, mark=False,
              before_mark=False, rings=False),
         "where the time went, and that they are all people"),
        ("skills", [ROW_REAL],
         dict(levers=True, outcomes=False, cycles=True, mark=False,
              before_mark=False, rings=True),
         "the same board, marked up: every one of them is a human skill"),
    ]


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
    """White where a person does it, dark where AI does, split where both.

    THE LIGHT PART LEADS. G, 5 November: "it should be more white on the left
    side of the boxes and less black". The first version put AI first on the
    reasoning that a machine drafts and a person judges after. That is the
    wrong way round for most of this work: a person decides what is worth
    validating, what to sell and what the pilot means BEFORE a machine touches
    it, and the machine executes inside that decision. So the bar opens light
    and the dark is what the machine takes out of the middle of it.

    The Before AI row comes through as solid white, and that is correct rather
    than a side effect: before AI a person did all of it.
    """
    if is_partly(ai) and cycles > 1 and PER_CYCLE:
        # EACH ROUND IS ITS OWN LITTLE BLOCK. G, 3 November: "iteration is many
        # shorter black and white blocks together actually". One white head
        # across the whole stage says AI does the first 55% of the iterating and
        # then stops, which is not what happens: every round has a machine part
        # and a human part, and there are eight rounds. Drawn per cycle, the
        # stage reads as alternating work, which is the claim.
        step = (x1 - x0) / float(cycles)
        c.setFillColor(BLACK)
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.6)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=1, fill=1)
        c.saveState()
        p = c.beginPath()
        p.roundRect(x0, y, x1 - x0, BAR_H, 6)
        c.clipPath(p, stroke=0, fill=0)
        c.setFillColor(WHITE)
        ws = white_share(ai)
        for k in range(cycles):
            sx = x0 + step * k
            # the light part OPENS each round: a person decides what this
            # round is for, the machine runs it
            c.rect(sx, y, step * ws, BAR_H, stroke=0, fill=1)
        c.restoreState()
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.2)
        for k in range(1, cycles):
            c.line(x0 + step * k, y + 7, x0 + step * k, y + BAR_H - 7)
        return WHITE

    if is_partly(ai):
        c.setFillColor(BLACK)
        c.setStrokeColor(WHITE)
        c.setLineWidth(2.6)
        c.roundRect(x0, y, x1 - x0, BAR_H, 6, stroke=1, fill=1)
        # the cut is where the person stops and the machine starts
        cut = x0 + (x1 - x0) * white_share(ai)
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
    if white_share(ai) >= 0.999:
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
    # FALL BACK TO THE ORIGINAL LINES, not to the joined key. Joining is
    # only how a translator is asked the question; in English the data
    # already carries the line break, and returning the joined string
    # rendered "Perceived public value" as one line 25 units past the
    # right margin.
    joined = " ".join(text)
    rendered = T(joined).split(NL) if joined in STRINGS else list(text)
    for i, line in enumerate(rendered):
        label(c, (x0 + x1) / 2.0, y - 46 - drop - i * SZ_LABEL * 1.1,
              line, align="c")


def ring_points(cx, cy, rx, ry, rng, n=96):
    """A hand drawn ellipse: smooth wobble, and it overshoots where it closes."""
    amps = [rng.uniform(0.4, 1.0) * WOBBLE for _ in range(3)]
    phs = [rng.uniform(0, 2 * math.pi) for _ in range(3)]
    start = rng.uniform(-0.3, 0.3)
    sweep = 2 * math.pi + rng.uniform(0.18, 0.40)
    out = []
    for i in range(n + 1):
        t = start + sweep * i / float(n)
        d = sum(a * math.sin(k * t + p)
                for a, k, p in zip(amps, (2, 3, 5), phs))
        out.append((cx + math.cos(t) * (rx + d), cy + math.sin(t) * (ry + d)))
    return out


def draw_ring(c, cx, cy, rx, ry, rng):
    pts = ring_points(cx, cy, rx, ry, rng)
    c.setStrokeColor(HexColor(PENCIL))
    c.setLineWidth(2.4)
    c.setDash()
    c.setLineCap(1)
    c.setLineJoin(1)
    p = c.beginPath()
    p.moveTo(*pts[0])
    for pt in pts[1:]:
        p.lineTo(*pt)
    c.drawPath(p, stroke=1, fill=0)


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
    # Right-aligned to the same edge as the block above it, so the two share a
    # margin instead of merely sitting near each other.
    # G, 3 November: "the tagline is spaced strangely and the font doesn't
    # quite fit". Three treatments, switchable, so the choice is made by
    # looking. "caps" echoes the tracked eyebrow at top left, which makes the
    # two corners one typographic system instead of two.
    ty = CREDIT_Y - TAGLINE_GAP
    if TAGLINE_STYLE == "caps":
        f, sz, track = "Arial", 15, 2.3
        txt = T(TAGLINE).upper()
        wid = pdfmetrics.stringWidth(txt, f, sz) + track * (len(txt) - 1)
        t = c.beginText(W - MARGIN - wid, ty)
        t.setFont(f, sz)
        t.setFillColor(HexColor(TAGLINE_GREY))
        t.setCharSpace(track)
        t.textOut(txt)
        c.drawText(t)
        reset = c.beginText(0, 0)
        reset.setCharSpace(0)
        reset.textOut("")
        c.drawText(reset)
    elif TAGLINE_STYLE == "left":
        # left edge flush with the domain rather than the block's right edge
        m = white_mark()
        lx = (W - MARGIN - credit_width()
              + MARK_H * m.width / float(m.height) + MARK_GAP * 2 + RULE_W)
        c.setFont("Arial", 18)
        c.setFillColor(HexColor("#B0B0B0"))
        c.drawString(lx, ty, T(TAGLINE))
    else:
        c.setFont("Arial", SZ_TAGLINE)
        c.setFillColor(HexColor(TAGLINE_GREY))
        c.drawRightString(W - MARGIN, ty, T(TAGLINE))


def build(pdf_path):
    c = canvas.Canvas(pdf_path, pagesize=(W, H))
    c.setFillColor(BLACK)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    t = c.beginText(MARGIN, 920)
    t.setFont("Arial-B", SZ_EYEBROW)
    t.setFillColor(WHITE)
    t.setCharSpace(TRACKING)
    t.textOut(T(EYEBROW))
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
        # A WEE ARROW INTO THE FIRST STRIP. G, 3 November. It goes in the gap
        # between the row-name column and the bars, which is 34 units wide and
        # otherwise empty, so it costs the timeline nothing. It marks where the
        # work starts, which is the point of the narrow first stage: the idea
        # is yours, and no part of the row before it belongs to anyone else.
        if START_ARROW:
            # The row name is right-aligned at LABEL_COL - 34, so a 22-unit
            # arrow starting at LABEL_COL - 30 left four units of air and read
            # as part of the words: "Before AI" with a tail. Shorter, and
            # pushed right, so it sits in clear space between the name and the
            # first bar.
            ay = by + BAR_H / 2.0
            tip = LABEL_COL - 5
            tail = tip - 13
            c.setStrokeColor(WHITE)
            c.setLineWidth(3.0)
            c.setDash()
            c.setLineCap(1)
            c.line(tail, ay, tip, ay)
            c.line(tip - 6, ay + 5.5, tip, ay)
            c.line(tip - 6, ay - 5.5, tip, ay)
            c.setLineCap(0)
            assert tail > LABEL_COL - 34 + 14, "the arrow is touching the row name"

        c.setFillColor(WHITE)
        head_y = by + BAR_H / 2.0 - 9 + (len(lines) - 1) * 16
        for i, line in enumerate(lines):
            if i == 0:
                c.setFont("Arial-B", SZ_HEADING)
                c.drawRightString(LABEL_COL - 34, head_y, T(line))
            else:
                c.setFont("Arial", SZ_LABEL)
                # The qualifier was the one draw site T() missed, so the
                # Polish board read "Z AI / in reality". Caught by looking at
                # the render, not by any check: a missing translation is a
                # legal string, so nothing can assert its way to finding one.
                c.drawRightString(LABEL_COL - 34,   # qualifier
                                  head_y - SZ_HEADING * 0.72 - (i - 1) * SZ_LABEL * 1.1,
                                  T(line))

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
            # A LEADER LINE UNDER A RAISED NAME. G, 3 November: the belief row
            # "is so messy". The names already alternated, but with nothing
            # joining a raised name to its bar the reader has to guess, and on
            # a row of 70-unit bars every guess is between two neighbours.
            ly = by + BAR_H + LABEL_DY + levels[name]
            if levels[name]:
                c.setStrokeColor(HexColor("#7A7A7A"))
                c.setLineWidth(1.3)
                c.setDash()
                c.line((x0 + x1) / 2.0, by + BAR_H + 5,
                       (x0 + x1) / 2.0, ly - 4)
            label(c, (x0 + x1) / 2.0, ly,
                  size=SZ_BAR, colour=WHITE, align="c", text=T(name))

        end = row_end(stages)
        c.setFillColor(WHITE)
        c.circle(end + 30, by + BAR_H / 2.0, 15, stroke=0, fill=1)

        # The outcome sentence and the value label are off by default. Five
        # pieces of furniture were saying what the dot and the dashed line
        # already say, and the bar ending where it ends IS the claim.
        if OPTS["outcomes"]:
            text = T(OUTCOMES[", ".join(lines)])
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
        vjoin = " ".join(VALUE_LABEL)
        vlines = (T(vjoin).split(NL) if vjoin in STRINGS
                  else list(VALUE_LABEL))
        for i, line in enumerate(vlines):
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
        label(c, W - MARGIN, bot_y - 36, T("Where it finished before AI"),
              align="r")

    by = ROWS[-1][2]
    # The brackets are their own image now. On the other two they were a third
    # of the marks on the board, saying something the five skill cards say one
    # at a time.
    showing_reality = OPTS["levers"] and any(st is REAL for _l, st, _b, _f in ROWS)
    # Five brackets under the last row, so the labels collide unless they are
    # measured. Anything that would overlap its neighbour drops a line, and the
    # drop alternates rather than accumulating, so a run of long labels does not
    # walk off the bottom of the page.
    # TWO LEVELS, STRICTLY ALTERNATING, each with a leader line. G, 3
    # November: "the P3 words are quite muddled and hard to read."
    #
    # The old rule dropped a label only when it would have collided, which
    # with six adjacent brackets produced three depths in no pattern, and a
    # reader could not tell which bracket a word belonged to. Alternating
    # every other one is regular, so the eye learns it at a glance, and the
    # leader line removes the guess.
    #
    # Wrapping each label to its own bar was tried first and cannot work:
    # "Judgement on tools and imagination" over a 107-unit Build bar is about
    # three characters a line.
    many = len(LEVERS) > 3
    step = 2 * SZ_LABEL * 1.1 + 14
    placed, rings = [], []
    for i, (name, lines) in enumerate(LEVERS if showing_reality else []):
        x0, x1 = span_of(REAL, name)
        mid = (x0 + x1) / 2.0
        half = max(pdfmetrics.stringWidth(l, "Arial", SZ_LABEL)
                   for l in lines) / 2.0
        if many:
            drop = (i % 2) * step
        else:
            drop = 0
            for pmid, phalf, pdrop, pn in placed:
                if pdrop == 0 and abs(mid - pmid) < half + phalf + 18:
                    drop = pn * SZ_LABEL * 1.1 + 16
        base = by - LEVER_DY
        if many and drop:
            c.setStrokeColor(HexColor("#7A7A7A"))
            c.setLineWidth(1.4)
            c.setDash()
            c.line(mid, base - 10, mid, base - drop - 18)
        lever(c, x0, x1, base, lines, drop=drop)
        placed.append((mid, half, drop, len(lines)))
        top = base - 46 - drop + SZ_LABEL * 0.72
        bot = (base - 46 - drop
               - (len(lines) - 1) * SZ_LABEL * 1.1
               - SZ_LABEL * 0.22)
        rings.append((mid, (top + bot) / 2.0, half + RING_PAD_X,
                      (top - bot) / 2.0 + RING_PAD_Y))

    # ALL OF THESE ARE HUMAN SKILLS. G, 3 November: "we circle in highlighter
    # or pencil these human skills and point an arrow". The rings go round the
    # WORDS, not the bars: the bar is the measurement and the word is the
    # skill, and ringing a bar puts a lens over a length nobody is arguing
    # about. Seeded per figure so two runs give the same wobble.
    if OPTS.get("rings") and rings:
        rng = random.Random(11)
        for cx, cy, rx, ry in rings:
            draw_ring(c, cx, cy, rx, ry, rng)
        low = min(cy - ry for _cx, cy, _rx, ry in rings)
        mids = sorted(cx for cx, _cy, _rx, _ry in rings)
        nx = (mids[0] + mids[-1]) / 2.0
        ny = low - 104
        c.setFont("Hand", 40)
        c.setFillColor(HexColor(PENCIL))
        note = T("all of these are human skills")
        nw = pdfmetrics.stringWidth(note, "Hand", 40)
        c.drawCentredString(nx, ny, note)
        # one arrow, from the note up to the nearest ring above it
        target = min(rings, key=lambda r: abs(r[0] - nx))
        tx, ty = target[0], target[1] - target[3] - 6
        c.setStrokeColor(HexColor(PENCIL))
        c.setLineWidth(2.4)
        c.setLineCap(1)
        c.line(nx, ny + 46, tx, ty)
        ang = math.atan2(ty - (ny + 46), tx - nx)
        for d in (2.6, -2.6):
            c.line(tx, ty, tx - 20 * math.cos(ang + d), ty - 20 * math.sin(ang + d))
        assert ny - 14 > 180 + SZ_LABEL * 0.8,             "the pencil note reaches the legend"

    y, x = 180, MARGIN
    spans = []
    for ai, _t in LEGEND:
        text = T(_t)
        start = x
        # The legend reads white_share() like the bars do. It used to carry its
        # own copy of the fill logic, which is how a legend ends up describing
        # a board that no longer looks like that.
        ws = white_share(ai)
        if is_partly(ai):
            c.setFillColor(BLACK)
            c.setStrokeColor(WHITE)
            c.setLineWidth(2.2)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=1, fill=1)
            c.saveState()
            p = c.beginPath()
            p.rect(x, y - 2, 36 * ws, 24)
            c.clipPath(p, stroke=0, fill=0)
            c.setFillColor(WHITE)
            c.roundRect(x, y - 2, 36, 24, 4, stroke=0, fill=1)
            c.restoreState()
            c.setStrokeColor(WHITE)
            c.setLineWidth(2.2)
            c.line(x + 36 * ws, y - 2, x + 36 * ws, y + 22)
        elif ws >= 0.999:
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
    # ALL BUT THE FIRST, not a fixed six. The ministry row has eight stages
    # and the product row has six, so a literal count passes one subject
    # and fails the other while meaning the same thing in both.
    # ALL BUT THE FIRST, not a fixed six. The ministry row has eight
    # stages and the product row has six, so a literal count passes one
    # subject and fails the other while meaning the same thing in both.
    assert len(solid) >= len(THINK) - 1, (
        "the belief row has to look like AI did nearly all of it: %s"
        % solid)

    # 2. Reality lands where Before AI landed. The whole argument is that the
    #    date did not move, so a gap here would quietly concede the point.
    gap = abs(row_end(REAL) - row_end(BEFORE))
    assert gap < 60,         "reality has to finish where Before AI finished: %d apart" % gap

    # 3. Nothing in reality is a solid block. G, 28 October: design, build and
    #    pilot "shouldn't be completely white blocks".
    for name, _d, _c, x in REAL:
        assert x is not True,             "%s is drawn as wholly AI's in the reality row" % name
    for name in RULES["mostly_ai"]:
        share = dict((n, x) for n, _d, _c, x in REAL)[name]
        assert is_partly(share) and share >= 0.5,             "%s is where AI really does help, so it has to be mostly filled" % name
    for name in RULES["mostly_person"]:
        share = dict((n, x) for n, _d, _c, x in REAL)[name]
        assert is_partly(share) and share <= 0.45,             "%s is mostly a person's job, so it has to be mostly open" % name

    # 4. AI still collapses the making, measured against Before AI
    for name in RULES["collapse"]:
        assert r[name][0] < b[name][0] * 0.75, "%s has to visibly collapse" % name
    assert r[RULES["first"]][0] == b[RULES["first"]][0],         RULES["first_note"]
    for name in RULES["grow"]:
        assert r[name][0] > b[name][0],             "%s grows: more arrives at the same desk" % name

    # 5. Piloting: more rounds, each shorter, more time in total
    _cy = RULES["cycle"]
    assert r[_cy][1] >= b[_cy][1] * 3,         "AI has to add rounds: %d vs %d" % (r[_cy][1], b[_cy][1])
    per_b = b[_cy][0] / float(b[_cy][1])
    per_r = r[_cy][0] / float(r[_cy][1])
    assert per_r < per_b * 0.6,         "each round has to be clearly shorter: %.0f vs %.0f" % (per_r, per_b)
    assert r[_cy][0] > b[_cy][0],         "more rounds means it takes longer in total"

    # 6. The levers, stated rather than derived. There is no numeric rule that
    #    produces this set: Pilot is drawn as 55% AI and still carries a lever,
    #    because the 45% left is the people being piloted on. A rule based on
    #    the share would either drop Pilot or pick up Design, and inventing one
    #    to look principled would be worse than naming the five.
    levered = set(n for n, _t in LEVERS)
    assert levered == RULES["levers"], "the levers are %s" % sorted(levered)
    shares = dict((n, x) for n, _d, _c, x in REAL)
    for name in levered:
        assert shares[name] is not True, \
            "%s carries a lever and is drawn as wholly AI's" % name
    for name in RULES["no_lever"]:
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
    pdf = os.path.join(HERE, "_ai-speed-%s-%s-%s.pdf" % (SLUG, name, LANG))
    png = os.path.join(SITE, "images",
                       "ai-before-after-%s-%s-v%d%s.png"
                       % (SLUG, name, VERSION,
                          "" if LANG == "en" else "-" + LANG))
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
for _subject in ("ministry", "product"):
    use(_subject)
    print("%s  (%s)" % (_subject, EYEBROW))
    for _name, _rows, _opts, _note in VARIANTS:
        emit(_name, _rows, _opts, _note)
print("checks passed")
