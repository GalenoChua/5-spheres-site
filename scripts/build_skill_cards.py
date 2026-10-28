# -*- coding: utf-8 -*-
"""The five human skills, one card each, in a civil service setting.

Follows `images/ai-before-after-ministry-reality-v4.png`, where five stages
carry a subline naming the thing a person still has to do. On the board those
are two or three words. In the room they need an example, because "deep
curiosity" means nothing to an official until it is a Tuesday they recognise.

Same house as the bar figures: black, white, Arial, the same credit.

NO INVENTED NUMBERS. Every example here is qualitative on purpose. A card
saying "6 of 10 applicants could not finish the form" looks like a finding, and
a finding about MPTC that nobody measured has no business on a slide in front of
MPTC. The one figure that does appear is G's, from a named source, and it is
marked as his. See the brain note on sample data becoming a finding within hours
of being invented.

The failure line is written as something that happened, not as an accusation.
"Nobody consulted anyone" is a charge; "you consulted the operators who answer
your emails" is a Tuesday, and the room can admit to a Tuesday.
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

VERSION = 1

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
GREY = HexColor("#9A9A9A")
GROUND_RGB = (0, 0, 0)

W, H = 1920, 1080
MARGIN = 130
MIN_WIDTH_PX = 1060
FLOOR_PX = 14
TRACKING = 3.6

SZ_EYEBROW, SZ_SKILL, SZ_HEAD, SZ_BODY, SZ_EG = 28, 72, 26, 34, 32

MARK_SRC = os.path.join(SITE, "images", "5-spheres-mark.png")
CREDIT = "5spheresofempathy.com"
MARK_H = 46
MARK_GAP = 18
SZ_CREDIT = 24
RULE_W = 1.6
CREDIT_Y = 130

# (stage, skill, without, with, example, example source)
CARDS = [
    ("Consultation", "Deep curiosity",
     "You hear from the people who already know how to reach you.",
     "You go and find the ones who tried once and stopped.",
     "The operators who answer your emails are not the ones the rule will "
     "land on.", None),
    ("Approval", "Trust across agencies",
     "Every department verifies the same evidence again, its own way.",
     "One department's check is good enough for the next one.",
     "The same registration, re-proved at each desk it passes, by people who "
     "all did the work properly.", None),
    ("Pilot", "Judgement of what works",
     "You measure whether the system ran.",
     "You measure whether anyone's job got easier.",
     "The platform was up all month. The counter staff kept the paper ledger "
     "anyway.", None),
    ("Redesign", "Courage to change it",
     "What the pilot found is written up, and the build carries on.",
     "What the pilot found changes the design before it goes wide.",
     "The hardest sentence in government is \u201cwe should not scale this "
     "yet\u201d.", None),
    ("Adoption", "Adaptive thinking and relationships",
     "The service launches, and the public is informed.",
     "The people who have to use it helped shape it before launch.",
     "90% of pilots fail when they go to scale. Of what reaches scale, about "
     "15% actually gets used.",
     "Chief of Staff and Director of AI and Financial Transformation, "
     "PwC, six markets"),
]


def esc_ok(s):
    """Arial has to be able to draw every character, or it renders a box."""
    missing = [ch for ch in s if ch not in ("\n",)
               and pdfmetrics.stringWidth(ch, "Arial", 12) == 0 and ch != " "]
    return missing


def wrap(text, font, size, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def white_mark():
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
    return PIL.Image.fromarray(out, "RGBA").crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def credit_width():
    m = white_mark()
    return (MARK_H * m.width / float(m.height) + MARK_GAP * 2 + RULE_W
            + pdfmetrics.stringWidth(CREDIT, "Arial", SZ_CREDIT))


def draw_credit(c):
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


COL_W = (W - MARGIN * 2 - 90) / 2.0


def build(path, card):
    stage, skill, without, with_, example, source = card
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setFillColor(BLACK)
    c.rect(0, 0, W, H, stroke=0, fill=1)

    t = c.beginText(MARGIN, 920)
    t.setFont("Arial-B", SZ_EYEBROW)
    t.setFillColor(WHITE)
    t.setCharSpace(TRACKING)
    t.textOut(stage.upper())
    c.drawText(t)
    reset = c.beginText(0, 0)
    reset.setCharSpace(0)
    reset.textOut("")
    c.drawText(reset)

    # the skill, wrapped: "Adaptive thinking and relationships" is too long for
    # one line at 72pt and silently ran off the page on the first build
    c.setFillColor(WHITE)
    lines = wrap(skill, "Arial-B", SZ_SKILL, W - MARGIN * 2)
    y = 800
    for line in lines:
        c.setFont("Arial-B", SZ_SKILL)
        c.drawString(MARGIN, y, line)
        y -= SZ_SKILL * 1.12
    bottom_of_skill = y + SZ_SKILL * 1.12

    # two columns
    col_y = bottom_of_skill - 110
    deepest_col = col_y
    for i, (head, body) in enumerate((("Without it", without),
                                      ("With it", with_))):
        x = MARGIN + i * (COL_W + 90)
        c.setFont("Arial-B", SZ_HEAD)
        c.setFillColor(GREY if i == 0 else WHITE)
        c.drawString(x, col_y, head.upper())
        c.setStrokeColor(GREY if i == 0 else WHITE)
        c.setLineWidth(2.2)
        c.line(x, col_y - 16, x + COL_W, col_y - 16)
        c.setFont("Arial", SZ_BODY)
        c.setFillColor(WHITE)
        yy = col_y - 62
        for line in wrap(body, "Arial", SZ_BODY, COL_W):
            c.drawString(x, yy, line)
            yy -= SZ_BODY * 1.28
        deepest_col = min(deepest_col, yy)

    # the example, set apart under a rule
    # Follows the columns rather than sitting at a fixed height. The two
    # bodies are different lengths on every card, and a fixed ex_y left a third
    # of the board empty on the short ones.
    ex_y = max(deepest_col - 96, CREDIT_Y + MARK_H + 150)
    c.setStrokeColor(HexColor("#4A4A4A"))
    c.setLineWidth(1.6)
    c.line(MARGIN, ex_y + 64, W - MARGIN, ex_y + 64)
    c.setFont("Arial", SZ_EG)
    c.setFillColor(WHITE)
    yy = ex_y
    for line in wrap(example, "Arial", SZ_EG, W - MARGIN * 2):
        c.drawString(MARGIN, yy, line)
        yy -= SZ_EG * 1.28
    if source:
        c.setFont("Arial", SZ_CREDIT)
        c.setFillColor(GREY)
        for line in wrap(source, "Arial", SZ_CREDIT, W - MARGIN * 2):
            yy -= 6
            c.drawString(MARGIN, yy, line)
            yy -= SZ_CREDIT * 1.2

    draw_credit(c)
    c.showPage()
    c.save()
    return yy


def check(card, lowest):
    stage, skill, without, with_, example, source = card
    for field in (stage, skill, without, with_, example):
        bad = esc_ok(field)
        assert not bad, "Arial cannot draw %r in %r" % (bad, field[:40])
    assert lowest > CREDIT_Y + MARK_H + 20, \
        "the example text reaches the credit: %.0f" % lowest
    for text, size in ((skill, SZ_SKILL),):
        for line in wrap(text, "Arial-B", size, W - MARGIN * 2):
            assert pdfmetrics.stringWidth(line, "Arial-B", size) <= W - MARGIN * 2, \
                "%r overruns" % line
    for body in (without, with_):
        for line in wrap(body, "Arial", SZ_BODY, COL_W):
            assert pdfmetrics.stringWidth(line, "Arial", SZ_BODY) <= COL_W, \
                "%r overruns its column" % line
    scale = MIN_WIDTH_PX / float(W)
    for name, size in (("eyebrow", SZ_EYEBROW), ("head", SZ_HEAD),
                       ("body", SZ_BODY), ("example", SZ_EG)):
        assert size * scale >= FLOOR_PX, \
            "%s renders at %.1fpx at %dpx wide" % (name, size * scale, MIN_WIDTH_PX)


def check_ink(path):
    im = PIL.Image.open(path).convert("RGB")
    a = np.asarray(im).astype(int)
    ink = np.abs(a - np.array(GROUND_RGB)).sum(axis=2) > 60
    ys, xs = np.where(ink)
    assert len(xs), "the card rendered blank"
    unit = im.width / float(W)
    left, right = xs.min() / unit, xs.max() / unit
    top, bottom = (im.height - ys.max()) / unit, (im.height - ys.min()) / unit
    assert left >= MARGIN - 4 and right <= W - MARGIN + 4, \
        "ink runs x %.0f to %.0f against a %d margin" % (left, right, MARGIN)
    assert top >= MARGIN - 4, "ink reaches y %.0f at the foot" % top
    return left, right, top, bottom


TARGET_W = 2400
print("five cards, one per human skill")
for card in CARDS:
    slug = card[1].lower().replace(" ", "-")
    pdf = os.path.join(HERE, "_skill-%s.pdf" % slug)
    png = os.path.join(SITE, "images",
                       "human-skill-%s-v%d.png" % (slug, VERSION))
    lowest = build(pdf, card)
    check(card, lowest)
    doc = fitz.open(pdf)
    doc[0].get_pixmap(matrix=fitz.Matrix(TARGET_W / float(W),
                                         TARGET_W / float(W))).save(png)
    doc.close()
    os.remove(pdf)
    check_ink(png)
    size = os.path.getsize(png)
    assert size < 900 * 1024
    print("  %-14s %-46s %.0f KB" % (card[0], os.path.basename(png), size / 1024))
print("checks passed")
