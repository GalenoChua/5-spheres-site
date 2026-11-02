# -*- coding: utf-8 -*-
"""Facebook and LinkedIn covers for The 5 Spheres of Empathy.

    python scripts/build_social_covers.py

THE LINE IS G'S OWN. The marketing promise in
assets/5Spheres_Brand_Guidelines_v1-0.md opens: "The 5 Spheres of Empathy is
for people who believe that in an age of AI, the human skills are the ones that
matter most." That clause is the tagline. Nothing here is invented copy.

A second line was drafted and cut. "A place to do the work" and "Monthly
drills, a field guide, and coaching" both carry no verb, and the voice floor
blocks that outright. A wordmark, one sentence and a web address is enough.

THE TYPE IS THE BRAND'S. The guide asks for a compressed gothic in caps for
headers and Helvetica for body, so the wordmark is Arial Narrow Bold tracked
and the tagline is Arial Bold. A first pass set it in the site's Fraunces and
G called it an AI tell, which it was: that was my choice and not his, and Arial
Bold is both the guide's Helvetica and what the ministry figures and the two
consoles already use.

SAFE ZONES ARE THE WHOLE JOB. Both platforms cover part of their own banner:

  * Facebook crops the SIDES on mobile. The desktop cover is 820x312 and the
    mobile one is a taller crop of it, so anything near the left or right edge
    is gone on a phone.
  * LinkedIn lays the profile photo over the BOTTOM LEFT of a personal banner.
    Text there is simply covered.

So the photo sits on the left and the text on the right, clear of the avatar on
both, and every text box is asserted against the safe rectangle rather than
eyeballed.

THE PHOTOGRAPHS. G ruled on 2 November that identifiable participants may be
used, and asked for more than one: "there are more screenshots and stage shots
than that". So each cover carries a hero and two supporting frames. One room
shows one room; three show a programme that runs repeatedly, in Warsaw and in
Phnom Penh.
"""
import os
import time
import sys

import PIL.Image
import PIL.ImageDraw
import PIL.ImageChops
import PIL.ImageFilter
import PIL.ImageFont

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
OUT_DIR = os.path.join(SITE, "images", "social")

# Brand, from assets/5Spheres_Brand_Guidelines_v1-0.md
# THE COVERS FOLLOW THE WEBSITE, NOT THE BOOK.
#
# G, 2 November: "the colour pallete is not working have you read our brand
# guide? or seen the website or the book cover that's all on disk?" Fair, and
# the answer was no to the last two. There are THREE systems on disk and they
# do not agree:
#
#   the brand PDF   blue #002c45 marked Primary, red, off-white, orange ramp
#   the book cover  warm orange gradient, navy type with a red offset shadow
#   THE WEBSITE     paper #faf6ef, ink #1d2a52, ember #e8862e, Fraunces serif
#
# A social cover is the thing a stranger sees immediately before the website,
# so it follows the website. These values are read from the live page's custom
# properties rather than guessed from a screenshot.
PAPER = (250, 246, 239)         # --paper
PAPER_WARM = (243, 236, 223)    # --paper-warm
INK = (29, 42, 82)              # --ink
INK_DEEP = (20, 29, 58)         # --ink-deep
EMBER = (232, 134, 46)          # --ember
EMBER_SOFT = (242, 160, 61)     # --ember-soft
MUTED = (107, 111, 124)         # --muted
LINE = (224, 217, 201)          # --line

# PALETTES AND HERO FACES ARE SWITCHABLE, because three palettes have now been
# rejected and guessing a fourth is not a method. Render them together and let
# the people whose brand it is choose by looking.
PALETTES = {
    # paper ground, navy type. The website's own arrangement.
    "paper":     dict(ground=PAPER, ink=INK, quiet=MUTED, bar=INK, bar_ink=PAPER),
    # navy ground, paper type. The site's proof bar, enlarged. Highest
    # contrast of the set and the most confident at a glance.
    "ink":       dict(ground=INK, ink=PAPER, quiet=(168, 176, 196), bar=INK_DEEP, bar_ink=PAPER),
    "ink-deep":  dict(ground=INK_DEEP, ink=PAPER, quiet=(162, 170, 192), bar=INK, bar_ink=PAPER),
    # ember ground, navy type. The book's energy, checked at 4.92:1.
    "ember":     dict(ground=EMBER, ink=INK, quiet=(74, 48, 18), bar=INK, bar_ink=PAPER),
    # warm paper, a half step toward the book without leaving the site.
    "warm":      dict(ground=PAPER_WARM, ink=INK, quiet=MUTED, bar=INK, bar_ink=PAPER),
}
# G chose A on 2 November: navy ground, Source Sans 3 Bold. Highest
# contrast of the six rendered, the photographs carry the colour instead
# of competing with a coloured ground, and a bold grotesque reads as
# commercial where the serif read as editorial.
PALETTE = os.environ.get("COVER_PALETTE", "ink")
_P = PALETTES[PALETTE]
GROUND, BAR = _P["ground"], _P["bar"]
BAR_INK, QUIET = _P["bar_ink"], _P["quiet"]
HERO_INK = _P["ink"]

BLUE = INK                      # kept: older comments and the rule refer to it
OFFWHITE = PAPER
RED = EMBER
ACCENT = EMBER

WORDMARK = "THE 5 SPHERES OF EMPATHY"
URL = "5spheresofempathy.com"

PANELS = os.path.join(SITE, "5 Spheres of Empathy", "Agree to Disagree Panels")

PHOTO_DRILL = os.path.join(SITE, "images", "field-notes",
                           "public-speaking-drill-room.jpg")
PHOTO_STAGE = os.path.join(SITE, "images", "infoshare-stage.jpg")
# G in front of a room that is applauding, name badge visible. The hero,
# because he asked for a picture of himself and this is the only one where he
# is both recognisable and clearly running the thing.
PHOTO_G = os.path.join(PANELS,
                       "Agree to disagree Nice Doesnt Scale Venture Cafe "
                       "Warsaw 25.09.2026", "G moderating.jpg")
# The room voting, from the same series. An audience doing something is better
# proof than an audience sitting.
PHOTO_VOTE = os.path.join(PANELS,
                          "Agree to disagree Nice Doesnt Scale Venture Cafe "
                          "Warsaw 25.09.2026", "Audience voting.jpg")
# Phnom Penh, December 2025. The programme is not only Warsaw.
PHOTO_ASC = os.path.join(PANELS,
                         "Agree to disagree ASEAN Startup Connect 7th "
                         "December 2025 Phnom Penh", "ASC Panel finance.jpg")

# (file, vertical focus 0 top .. 1 bottom)
#
# The Infoshare stage shot is out. G, 2 November: "the big stage one is too
# broad". It is a wide room photographed from the back, so at banner size the
# person in it is a few pixels tall and the proof does not land.
#
# The brand page leads with the room, because that is the programme. His own
# profile leads with him, because it is his profile.
# G, 2 November: "smiling people and participants happy with what's going on.
# they need to be agreeing, we have some photos of the thumbs up". The ASC
# panel is out: a line-up of seated panellists is a programme, not a vision.
PHOTO_GROUP = os.path.join(PANELS,
                           "Agree to disagree Building Community Venture Cafe "
                           "Warsaw February 2026", "February 12 Group photo panel.jpg")

# THE KEYNOTE. G, 2 November: "can we take one of the ones from Infoshare
# where I'm in the green sweater? it's directly from a keynote on the 5
# spheres." It is, and these are the professional frames rather than the
# 1200x799 wide shot that was in the repo, where he is a few pixels tall on a
# far stage. That one was dropped as "too broad" and this is what it should
# have been. Credit and the originals: images/keynote/CREDIT.md
KEY = os.path.join(SITE, "images", "keynote")
# G, 2 November: "there's a much more flattering one ... kind of a side
# profile and I'm speaking out". That is frame 0769: three-quarter
# profile, mid-sentence, both hands open, clean dark backdrop. 0768 is
# the truer side profile and is kept as the alternate, but his hand sits
# across his mouth in it.
PHOTO_KEYNOTE = os.path.join(KEY, "infoshare-keynote-profile.jpg")
PHOTO_KEYNOTE_ALT = os.path.join(KEY, "infoshare-keynote-profile-alt.jpg")
PHOTO_KEYNOTE_OPEN = os.path.join(KEY, "infoshare-keynote-open.jpg")
PHOTO_KEYNOTE_WALK = os.path.join(KEY, "infoshare-keynote-walk.jpg")
# G, 2 November: "one of the audience seats shows empty seats so definitely
# not that one, let's get another audience one that's much more full."
# Frame 0783 has empty chairs along the front. 0761 is packed wall to
# wall with no gap anywhere in frame, which also makes it robust to the
# crop: a 172px column taken from any part of it is still a full room.
# G, 2 November: "that image is worse, it shows empty seats first!" He was
# right, and so was the first complaint. 0761 is packed across its width
# but carries a row of empty blue chairs along the BOTTOM, and that band
# cannot be cropped away at build time: a 172x191 tile cut from a
# 1600x1066 frame is scaled by height, nh lands exactly on 191, and there
# is no vertical freedom left. So the band is cut from the SOURCE, giving
# a 1600x767 frame that is three rows of lit faces with no empty seat in
# it anywhere.
#
# He also asked whether an Agree to Disagree audience would do. Those
# folders hold almost only panel shots. The two real audience frames are
# "Audience voting", already carrying the Facebook cover, and the Feb 12
# breathing shot, which is the room from behind with every face in
# silhouette. Neither beats this one for a 172px tile.
# G, 2 November: "the blue disappears into the dark picture as well, I'd
# just swap the pic". Both Infoshare audience frames are a dark
# auditorium, so the tile and the blue panel beside it are the same
# value and the join vanishes. This one is the Venture Cafe room in
# daylight: warm, bright, thumbs up, faces visible, no empty seat. It
# separates from the panel because it is a different VALUE, not just a
# different picture. From the A2D leadership night, 13 September 2026.
# G, 2 November: "the image shows a thumbs down". It does, and so does
# every other voting frame in that folder, because thumbs up AND down is
# literally what Agree to Disagree is. A vote shot cannot be cropped free
# of dissent; the dissent is the event.
#
# The long shot from the same night is the way out: raised arms, no
# thumbs in either direction, brick and window light so it still carries
# a different VALUE from the panel beside it, and full to the edges.
# G, 2 November: "we need one where the audience is doing thumbs up."
# Agree to Disagree is a vote, so every wide frame of it carries both
# directions and no crop of a whole frame is free of dissent. The answer
# was to cut the SOURCE to the agreeing half: the right 38% of the 13
# September vote holds two clear thumbs up and no downturned thumb.
#
# The tile could not reach that band by itself. At 172x191 from 2048x1365
# the crop window is already clamped against the right edge, so focus
# 0.78, 0.84 and 0.90 all produced one identical tile with the
# thumbs-down arm still in it. Three settings, one output, which looks
# exactly like the setting having no effect.
PHOTO_AUDIENCE = os.path.join(KEY, "a2d-audience-thumbsup.jpg")
PHOTO_AUDIENCE_HANDS = os.path.join(KEY, "a2d-audience-hands.jpg")
PHOTO_AUDIENCE_THUMBS = os.path.join(KEY, "a2d-audience-thumbs.jpg")
PHOTO_AUDIENCE_DARK = os.path.join(KEY, "infoshare-audience-packed.jpg")
PHOTO_AUDIENCE_UNCUT = os.path.join(KEY, "infoshare-audience-full.jpg")
PHOTO_AUDIENCE_SPARSE = os.path.join(KEY, "infoshare-audience.jpg")

# THE SCALE PROGRESSION. G, 2 November: "let's use a webinar one or even two
# or three webinar ones so it looks like G, then in-person pic with lots of
# people, then lots of pics with even more people". Read top to bottom the
# three bands grow: a call, a room, a hall. All three are already in the repo.
PHOTO_WEBINAR = os.path.join(SITE, "images", "field-notes", "sensing-drill-room.jpg")
PHOTO_WEBINAR_B = os.path.join(SITE, "images", "field-notes",
                               "public-speaking-drill-room.jpg")
PHOTO_COLOMBIA = os.path.join(SITE, "images", "colombia-delegation.jpg")

# THE GRID. G, 2 November: "keep the pic of me speaking mid-sentence, that was
# good, now find another layout so we can get the other images in ... maybe in a
# grid format so it's not so ... sporadic? It's currently quite chaotic."
#
# Four equal cells, uniform gutters. The keynote leads, then the three scales of
# the programme: a call, a room, a hall. A hero plus a ragged stack reads as a
# collage; equal cells read as a contact sheet, which is what social proof
# should look like.
# TWO PHOTOGRAPHS, NOT FOUR. G's wife, 2 November, relayed by G: "one photo
# of lots of people because we can't seem to get the social proof of images
# right, and keep one of me speaking on another part of the banner."
#
# She is right about why the grids kept failing. Four cells at cover size
# means four small pictures, and a small picture of a crowd is a texture
# rather than a crowd. One large room reads as a room. G beside it, narrower,
# is the other half of the proof: the person and the audience.
SET_TWO = [(PHOTO_AUDIENCE_DARK, 0.45, 0.50),
           (PHOTO_KEYNOTE, 0.30, 0.34)]
TWO_WEIGHTS = [0.64, 0.36]

SET_GRID = [(PHOTO_KEYNOTE, 0.30, 0.30),
            (PHOTO_WEBINAR, 0.14, 0.50),
            (PHOTO_COLOMBIA, 0.45, 0.50),
            (PHOTO_AUDIENCE_DARK, 0.45, 0.50)]

# The strip cannot carry the webinar. At 191px tall a 2x2 cell is 92px and a
# Meet grid in a 130px column is two faces; both were rendered and neither
# reads. Three equal columns instead, same order with the call left out.
SET_GRID_STRIP = [(PHOTO_KEYNOTE, 0.30, 0.30),
                  (PHOTO_COLOMBIA, 0.45, 0.50),
                  (PHOTO_AUDIENCE_DARK, 0.45, 0.50)]

SET_SCALE = [(PHOTO_WEBINAR, 0.14, 0.50),
             (PHOTO_COLOMBIA, 0.45, 0.50),
             (PHOTO_AUDIENCE_DARK, 0.45, 0.50)]
# The webinar band is the tallest because its source is the widest: a 2.2:1
# grid squeezed into an equal third loses its outer rows and stops reading as
# a call.
SCALE_WEIGHTS = [0.42, 0.29, 0.29]

# (file, vertical focus, horizontal focus). The horizontal one is only needed
# where a tile is narrow enough to crop sideways, which is the strip.
SET_BRAND = [(PHOTO_KEYNOTE, 0.34, 0.30), (PHOTO_GROUP, 0.42),
             (PHOTO_VOTE, 0.40)]

# THREE EQUAL COLUMNS, because the strip is 191px tall and a stacked tile
# there is 94px. G, 2 November: "the linkedin one doersn't have enough
# pictues". Every tile is about 172px wide, cut from frames up to 1600px, so
# the horizontal focus is doing real work on all three.
SET_STRIP = [(PHOTO_KEYNOTE, 0.30, 0.30), (PHOTO_GROUP, 0.42, 0.46),
             (PHOTO_AUDIENCE, 0.50, 0.50)]


# ------------------------------------------------------------------ fonts ---
# THE BRAND'S OWN SPEC, NOT A DISPLAY SERIF.
#
# G, 2 November: the first pass "is not classic Claude production and it's an
# AI tell". He is right, and Fraunces was my choice rather than his. The brand
# guide asks for ACME GOTHIC COMPRESSED in caps for headers and Helvetica for
# body at -10 kern. Neither ships on Windows, so:
#
#   wordmark  Arial Narrow Bold, capitalised and tracked, which is the nearest
#             thing on this machine to a compressed gothic
#   tagline   Arial Bold, which IS the Helvetica the guide asks for, and is
#             already what the ministry figures and both consoles are set in
#
# That makes the covers, the slides and the two consoles one typographic
# system instead of three.
# THE SITE'S OWN FACES, and the .ttf copies rather than the .woff2 ones,
# because PIL cannot read woff2 and the repo happens to carry both.
#
# SELECTED BY COVERAGE, NEVER BY SIZE. fonts/fraunces-c1338e05.woff2 is the
# LARGEST Fraunces in the repo at 70KB and carries 2 of the 56 Latin
# characters this cover needs; it is a Cyrillic subset. Picking the biggest
# file once shipped a wordmark rendered entirely in tofu boxes.
WINF = r"C:\Windows\Fonts"
BOOKF = os.path.join(SITE, "5 Spheres of Empathy Books", "_build", "fonts")
FRAUNCES = os.path.join(BOOKF, "Fraunces-700.ttf")
FRAUNCES_R = os.path.join(BOOKF, "Fraunces-400.ttf")
FRAUNCES_I = os.path.join(BOOKF, "Fraunces-Italic.ttf")
SS = os.path.join(BOOKF, "SourceSans3-400.ttf")
SS_SB = os.path.join(BOOKF, "SourceSans3-600.ttf")
SS_B = os.path.join(BOOKF, "SourceSans3-700.ttf")

ARIAL = SS
ARIAL_B = SS_SB
ARIAL_NB = SS_B
ARIAL_I = FRAUNCES_I
ARIAL_BI = FRAUNCES_I
ARIAL_NBI = FRAUNCES_I

for _f in (FRAUNCES, FRAUNCES_R, FRAUNCES_I, SS, SS_SB, SS_B):
    assert os.path.exists(_f), "missing font: %s" % _f


def font(path, size):
    return PIL.ImageFont.truetype(path, size)


def measure(draw, text, f):
    box = draw.textbbox((0, 0), text, font=f)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, f, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if measure(draw, trial, f)[0] <= width:
            line = trial
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


# --------------------------------------------------------- the headline ---
# G, 2 November: "You _already_ know *Empathy Matters*. Now learn _how to use
# it_." The underscores and the asterisks are his, and they are a typographic
# instruction rather than punctuation: size on the middle phrase, emphasis on
# the two outer ones.
#
# WHY THREE TIERS AND NOT ONE SENTENCE. Set flat it is 48 characters of one
# weight and the eye has nowhere to land, which is the "flat" he objected to.
# Set as three it reads in the order it argues: the reader is granted what
# they already think, the category is named at scale, and the new information
# arrives last in the accent colour. The compressed face is what lets the
# middle tier be large enough to carry the cover at the width available.
#
# "already" and "how to use it" carry the same markup and do NOT get the same
# treatment. "already" is a nod to the reader, so it takes italic. "how to
# use it" is the promise and the only new information on the image, so it
# takes the accent colour, which is louder and stays crisp at banner size
# where italic goes mushy.
#
# THE ACCENT IS THE SOFT RED, NOT THE BRAND RED. #e20000 on #002c45 is 3.1:1
# and the contrast assertion below refuses it. #ff6b6b is 5.2:1.
ACCENT = (255, 107, 107)

LAYOUTS = {
    # The original. The belief is the hero, which is the part the reader
    # already holds. Kept so the two can be compared rather than argued about.
    "belief": [
        ("small", [("You ", "b", INK), ("already", "bi", INK),
                   (" know", "b", INK)]),
        ("hero", [["EMPATHY MATTERS"], ["EMPATHY", "MATTERS"]]),
        ("small", [("Now learn ", "b", INK),
                   ("how to use it.", "b", ACCENT)]),
    ],
    # G, 2 November: "EMPATHY MATTERS is important, but isn't 'how to use it'
    # the big thing here?" It is. The premise is granted in one quiet line and
    # the method, the only thing on the image the reader does not already
    # have, takes the size.
    "promise": [
        ("small", [("You already know ", "b", INK),
                   ("empathy matters.", "bi", INK)]),
        ("small", [("Now learn", "b", INK)]),
        ("hero", [["HOW TO USE IT"], ["HOW TO", "USE IT"]]),
    ],
    # "Now learn" dangling on its own small line above the hero reads as an
    # orphan. Folding it INTO the hero gives two lines that are each a real
    # phrase, and the fitter still sizes on the longer of the two.
    "promise-fold": [
        ("small", [("You already know ", "b", INK),
                   ("empathy matters.", "bi", INK)]),
        ("hero", [["NOW LEARN HOW TO USE IT"],
                  ["NOW LEARN", "HOW TO USE IT"]]),
    ],
    # The shortest verb-led form. Drops "now", which carries no meaning here,
    # and lets the hero run bigger because the longest line is shorter.
    "promise-short": [
        ("small", [("You already know empathy matters.", "fr4", QUIET)]),
        ("hero", [["LEARN HOW TO USE IT"],
                  ["LEARN HOW", "TO USE IT"]], None),
    ],
    # The same with the hero in the accent, to test whether the colour belongs
    # on the promise rather than on a four-word tail.
    "promise-red": [
        ("small", [("You already know ", "b", INK),
                   ("empathy matters.", "bi", INK)]),
        ("small", [("Now learn", "b", INK)]),
        ("hero", [["HOW TO USE IT"], ["HOW TO", "USE IT"]], ACCENT),
    ],
}

# RENDERED AND COMPARED, not argued. "promise" leaves "Now learn" orphaned
# on its own small line above the hero. "promise-fold" folds it into the
# hero and the longer line drags the hero down to 77pt, taking the small
# line with it. "promise-short" drops "now", which carries no meaning
# here, and the shorter hero runs at 114pt on Facebook and 68pt on the
# strip, the largest of the three, with the premise still readable above
# it. Set COVER_LAYOUT to render any of the others.
LAYOUT = os.environ.get("COVER_LAYOUT", "promise-short")


# G, 2 November: the italic is "too cursive and doesn't drive the sale".
# It was the site's accent treatment, which is right for one phrase inside
# a paragraph of headline and wrong for a headline that IS the message.
HERO_ROLE = os.environ.get("COVER_HERO", "nb")   # Source Sans 3 Bold


def hero_runs(line):
    # INK, NOT EMBER, AND THE REASON IS MEASURED. The site sets its closing
    # phrase in ember italic on paper, which is 2.47:1. That fails 4.5:1 for
    # body text and fails the 3:1 allowance for display text too, so the
    # contrast assertion refused it on the first render. On the site it is one
    # line of a four-line navy headline; on a cover it would be the whole
    # message. Ink is 12.95:1 and the italic keeps the site's signature.
    # Ember stays, as a rule rather than as type.
    return [(line, HERO_ROLE, HERO_INK)]


def hero_fit_w(lines, size, track):
    """The width a stacked hero needs is its WIDEST LINE, not the whole
    phrase. Measuring the join gave the two-line arrangement the width of
    one line, so stacking never won and the Facebook hero stayed at 63pt
    in a field with room for twice that."""
    return max(runs_w(hero_runs(ln), size, track) for ln in lines)

ROLE = {"n": SS, "b": SS_SB, "i": FRAUNCES_I, "bi": FRAUNCES_I,
        "nb": SS_B, "nbi": FRAUNCES_I,
        "fr": FRAUNCES, "fr4": FRAUNCES_R, "fri": FRAUNCES_I}


def hero_track(size):
    """No tracking on the serif hero. Tracking existed for the compressed
    gothic caps, which set solid read as a wall. Fraunces in sentence case is
    already spaced by its own metrics, and adding to it makes it look broken.
    """
    return 0


def runs_w(runs, size, track=0):
    """Advance width of a run list. getlength, NOT textbbox: a space has no
    ink, so textbbox reports zero for it and every word gap closes up."""
    total = 0.0
    for text, role, _col in runs:
        f = font(ROLE[role], size)
        total += f.getlength(text)
        if track:
            total += track * len(text)
    return total


def draw_runs(d, x, y, runs, size, track=0):
    """Draw inline runs sharing one top edge. Returns (end_x, drawn bottom).

    The bottom is the REAL drawn bottom from textbbox, not y + size: PIL draws
    from the ascender, and a box built off the nominal size sits above the
    baseline, which is how a rule once ran straight through the wordmark.
    """
    bottom = y
    for text, role, col in runs:
        f = font(ROLE[role], size)
        if track:
            for ch in text:
                d.text((x, y), ch, font=f, fill=col)
                x += f.getlength(ch) + track
        else:
            d.text((x, y), text, font=f, fill=col)
            x += f.getlength(text)
        if text.strip():
            bottom = max(bottom, d.textbbox((0, y), text, font=f)[3])
    return x, bottom

# ----------------------------------------------------------------- colour ---
def luminance(c):
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2])


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# ------------------------------------------------------------------ photo ---
def fill(path, w, h, focus_y=0.5, mode="fill", focus_x=0.5):
    """Fit a photograph to exactly w x h without distorting it.

    "fill" crops to cover, which is right for a scene. "fit" letterboxes on the
    brand blue, which is right for the drill grid: cropping that one cuts
    through a named participant, and G is in the last tile.
    """
    im = PIL.Image.open(path).convert("RGB")
    if mode == "fit":
        scale = min(w / im.width, h / im.height)
        nw, nh = int(round(im.width * scale)), int(round(im.height * scale))
        card = PIL.Image.new("RGB", (w, h), GROUND)
        card.paste(im.resize((nw, nh), PIL.Image.LANCZOS),
                   ((w - nw) // 2, (h - nh) // 2))
        return card
    scale = max(w / im.width, h / im.height)
    nw, nh = int(round(im.width * scale)), int(round(im.height * scale))
    im = im.resize((nw, nh), PIL.Image.LANCZOS)
    # focus_x IS THE POINT IN THE PHOTOGRAPH TO CENTRE ON, 0 left to 1 right.
    # It is deliberately NOT the same kind of number as focus_y, which places
    # the crop window instead. Window position is not scale invariant: the
    # value that centres a subject in a 462px hero tile puts him off the edge
    # of a 172px column cut from the same frame, because the window is a
    # different fraction of the scaled image each time. Subject position holds
    # across every tile size, so one value per photograph is correct
    # everywhere. focus_y keeps the old meaning because the existing vertical
    # framing is tuned and these sources are landscape, so the vertical crop
    # is small.
    left = int(round(focus_x * nw - w / 2.0))
    left = max(0, min(left, nw - w))
    top = int(round((nh - h) * focus_y))
    top = max(0, min(top, nh - h))
    return im.crop((left, top, left + w, top + h))


GUTTER = 6


def grain(card, opacity=0.040):
    """The site's own texture, so a flat panel does not read as a flat panel.

    styles.css lays fractal noise over every page at 3.5% opacity. G, 2
    November: "the blue bits are a bit flat". This is the same idea done in
    pixels: monochrome noise, multiplied in, heavy enough to break the
    flatness and light enough that nobody names it.
    """
    import random
    rnd = random.Random(5)          # fixed, so two runs give the same file
    w, h = card.size
    small = PIL.Image.new("L", (w // 2, h // 2))
    small.putdata([rnd.randrange(256) for _ in range(small.width * small.height)])
    noise = small.resize((w, h), PIL.Image.BILINEAR)
    veil = PIL.Image.merge("RGB", (noise, noise, noise))
    return PIL.Image.blend(card, PIL.ImageChops.multiply(card, veil), opacity)


def _tile(t):
    """(path, focus_y) or (path, focus_y, focus_x)."""
    return (t[0], t[1], t[2] if len(t) > 2 else 0.5)


def collage(tiles, w, h, layout="hero", weights=None):
    """One hero and a stack beside it, or equal columns, on the brand ground.

    EQUAL COLUMNS EXIST FOR THE 191px LINKEDIN STRIP. The hero layout gives the
    two stacked tiles half the banner height each, which is 94px there, and a
    face 94px tall in a 20-person group shot is not social proof, it is noise.
    Three equal columns give every tile the full height instead.

    G, 2 November: "let's have more social proof, as there are more screenshots
    and stage shots than that." One photograph shows one room. Three show a
    programme that happens repeatedly, in more than one country.

    Kept to a hero plus two, because a four-up at banner height makes every
    face too small to read at the size these are actually seen.
    """
    card = PIL.Image.new("RGB", (w, h), GROUND)
    tiles = [_tile(t) for t in tiles]

    if layout == "grid":
        # EQUAL CELLS, UNIFORM GUTTERS. G, 2 November: "maybe in a grid format
        # so it's not so ... sporadic? It's currently quite chaotic." A hero
        # plus a ragged stack reads as a collage; a grid reads as a contact
        # sheet, which is what social proof should look like. `weights` is the
        # column count here.
        cols = int(weights or 2)
        rows_n = (len(tiles) + cols - 1) // cols
        cw = (w - GUTTER * (cols - 1)) // cols
        ch = (h - GUTTER * (rows_n - 1)) // rows_n
        for i, (path, fy, fx) in enumerate(tiles):
            cx = (i % cols) * (cw + GUTTER)
            cy = (i // cols) * (ch + GUTTER)
            tw = (w - cx) if (i % cols) == cols - 1 else cw
            th = (h - cy) if (i // cols) == rows_n - 1 else ch
            card.paste(fill(path, tw, th, fy, "fill", fx), (cx, cy))
        return card

    if layout == "rows":
        # STACKED BANDS, FOR WIDE SOURCES. A Google Meet grid is 2.2:1 and a
        # column tile is 0.9:1, so cutting a grid into a column shows two faces
        # and reads as a portrait, not as a room full of people on a call.
        # Bands keep the grid's shape. Weights let the webinar band be taller
        # than the two crowd bands under it.
        wts = weights or [1.0] * len(tiles)
        tot = sum(wts)
        gaps = GUTTER * (len(tiles) - 1)
        y = 0
        for i, (path, fy, fx) in enumerate(tiles):
            th = (h - y) if i == len(tiles) - 1 else int((h - gaps) * wts[i] / tot)
            card.paste(fill(path, w, th, fy, "fill", fx), (0, y))
            y += th + GUTTER
        return card

    if layout == "columns":
        # WEIGHTED, because the columns are not interchangeable. A Meet grid
        # needs roughly twice the width of a crowd shot before it reads as a
        # call rather than as a portrait of two people. Equal thirds on the
        # 191px strip sliced every face in the grid.
        n = len(tiles)
        wts = weights or [1.0] * n
        tot = sum(wts)
        gaps = GUTTER * (n - 1)
        x = 0
        for i, (path, fy, fx) in enumerate(tiles):
            tw = (w - x) if i == n - 1 else int((w - gaps) * wts[i] / tot)
            card.paste(fill(path, tw, h, fy, "fill", fx), (x, 0))
            x += tw + GUTTER
        return card

    hero_w = int(w * 0.60) if len(tiles) > 1 else w
    hp, hfy, hfx = tiles[0]
    card.paste(fill(hp, hero_w, h, hfy, "fill", hfx), (0, 0))
    rest = tiles[1:]
    if not rest:
        return card
    col_x = hero_w + GUTTER
    col_w = w - col_x
    each = (h - GUTTER * (len(rest) - 1)) // len(rest)
    y = 0
    for path, fy, fx in rest:
        card.paste(fill(path, col_w, each, fy, "fill", fx), (col_x, y))
        y += each + GUTTER
    return card


def build(name, W, H, photo, focus_y, photo_frac, safe,
          avatar=None, mode="fill", mobile_band=None, layout="hero",
          layout_name=None, weights=None):
    layout_name = layout_name or LAYOUT
    """One cover. `safe` is (x0, y0, x1, y1) that all text must sit inside."""
    card = PIL.Image.new("RGB", (W, H), GROUND)
    # FULL BLEED WHERE THE SHAPES AGREE. The drill grid is 2.24:1 against a
    # 2.63:1 cover, so covering the whole board trims a little off the top and
    # bottom and keeps every face. Letterboxing it into half the width left a
    # third of the board empty and made the photograph look like a thumbnail.
    split = W if mode == "bleed" else int(W * photo_frac)

    if isinstance(photo, (list, tuple)) and photo and isinstance(photo[0], tuple):
        pic = collage(photo, split, H, layout, weights)
    else:
        pic = fill(photo, split, H, focus_y, "fill" if mode == "bleed" else mode)
    card.paste(pic, (0, 0))

    # A blue veil over the photograph, heaviest where it meets the panel, so
    # the join reads as one surface rather than two images butted together.
    # NO VEIL UNDER A GRID. The ramp exists to blend ONE photograph into
    # the panel. A grid already ends on a hard edge, and ramping the ground
    # across it washed the right-hand cells orange and muddied every face
    # in them, which on the blue ground had merely looked like shading.
    if layout != "grid":
        veil = PIL.Image.new("RGBA", (split, H), GROUND + (0,))
        vd = PIL.ImageDraw.Draw(veil)
        # On a full bleed the veil has to be FULLY opaque by the time the text
        # starts, not merely dark. Ramping it across the whole width left the
        # tagline at 4.4:1 against the faces behind it, which the contrast check
        # refused. So it ramps from the panel edge and completes at the safe box.
        if mode == "bleed":
            start, done = int(W * photo_frac), safe[0] - 16
        else:
            # Only the JOIN needs veiling. Ramping across the whole photo area
            # turned three photographs blue and lost the warmth that makes a room
            # look like a room; the collage is the social proof, so it has to read.
            start, done = int(split * 0.80), split
        for x in range(split):
            if x < start:
                a = 12
            elif x >= done:
                a = 255
            else:
                t = (x - start) / float(max(1, done - start))
                a = int(12 + 243 * t ** 1.25)
            vd.line([(x, 0), (x, H)], fill=GROUND + (min(255, a),))
        card.paste(PIL.Image.alpha_composite(
            card.crop((0, 0, split, H)).convert("RGBA"), veil).convert("RGB"), (0, 0))

    d = PIL.ImageDraw.Draw(card)
    sx0, sy0, sx1, sy1 = safe
    text_w = sx1 - sx0

    # ---- the footer bar ---------------------------------------------------
    # G, 2 November: "I would find somewhere else to put the name and website".
    # They were competing with the headline for the panel, and the fix is not a
    # smaller wordmark, it is a different place. A bar across the FULL width
    # carries both, ties the photo side to the type side, and hands the panel
    # entirely to the headline, which is also what cures the proportion.
    bar_h = max(26, int(H * 0.105))
    bar_y = H - bar_h
    d.rectangle([(0, bar_y), (W, H)], fill=BAR)
    f_mark = font(ARIAL_NB, max(11, int(bar_h * 0.40)))
    f_url = font(ARIAL, max(10, int(bar_h * 0.34)))
    pad = max(12, int(W * 0.013))

    track = max(1, int(f_mark.size * 0.14))
    mw = int(sum(f_mark.getlength(c) + track for c in WORDMARK))
    mh = d.textbbox((0, 0), WORDMARK, font=f_mark)[3]
    my = bar_y + (bar_h - mh) // 2
    mx = pad
    for chcode in WORDMARK:
        d.text((mx, my), chcode, font=f_mark, fill=BAR_INK)
        mx += f_mark.getlength(chcode) + track
    bar_boxes = [("wordmark", BAR_INK, (pad, my, int(mx), my + mh))]

    uw = int(f_url.getlength(URL))
    uh = d.textbbox((0, 0), URL, font=f_url)[3]
    ux = W - pad - uw
    uy = bar_y + (bar_h - uh) // 2
    d.text((ux, uy), URL, font=f_url, fill=BAR_INK)
    bar_boxes.append(("url", BAR_INK, (ux, uy, ux + uw, uy + uh)))
    assert ux > pad + mw + 20,         "%s: the wordmark and the url collide in the bar" % name

    # ---- the tiers, auto-fitted ------------------------------------------
    # A LAYOUT IS AN ORDERED LIST OF TIERS WITH EXACTLY ONE HERO. Which tier
    # is the hero is the whole argument on this cover, so it is data rather
    # than structure: the reader already believes empathy matters, so setting
    # that at 120pt shouts the agreed half and whispers the offer.
    tiers = LAYOUTS[layout_name]
    hero_i = [i for i, t in enumerate(tiers) if t[0] == "hero"]
    assert len(hero_i) == 1, "%s: a layout needs exactly one hero" % layout_name
    hero_i = hero_i[0]
    hero_splits = tiers[hero_i][1]
    # The fallback is INK, not OFFWHITE. On the blue ground off-white was
    # right and the default was invisible; on orange it is 2.4:1 and the
    # contrast assertion caught it on the first render.
    hero_col = (tiers[hero_i][2] if len(tiers[hero_i]) > 2 else None) or HERO_INK

    # The small tiers are sized off the SINGLE-LINE hero, never off the hero
    # actually drawn. A stacked hero grows past it and would drag them up with
    # it until the lead-in competes with the thing it introduces.
    ref = int(H * 0.215)
    while ref > 14 and hero_fit_w(hero_splits[0], ref, hero_track(ref)) > text_w:
        ref -= 1
    small_sz = []
    for kind, content in ((t[0], t[1]) for t in tiers):
        if kind == "hero":
            small_sz.append(None); continue
        s = max(11, int(ref * 0.56))
        while s > 11 and runs_w(content, s) > text_w:
            s -= 1
        small_sz.append(s)

    mark_h = measure(d, WORDMARK, f_mark)[1]
    url_h = measure(d, URL, f_url)[1]
    gap = int(H * 0.085)

    def tiers_h(lines, size):
        h = 0
        for i, s in enumerate(small_sz):
            h += int(size * 1.04) * len(lines) + int(size * 0.16) if s is None \
                 else int(s * 1.26)
        return h

    def block_h(lines, size, mark, url):
        h = tiers_h(lines, size)
        if mark:
            h += mark_h + gap
        if url:
            h += int(H * 0.055) + url_h
        return h

    # Stack the hero wherever stacking makes it bigger. Every split is tried
    # and the largest that still fits wins, so a 396px banner and a 191px
    # strip fall back to one line on their own geometry, not on an exception.
    avail = sy1 - sy0
    best = None
    for split in hero_splits:
        size = int(H * 0.46)
        while size > 14 and (
                hero_fit_w(split, size, hero_track(size)) > text_w
                or block_h(split, size, True, True) > avail):
            size -= 1
        if size > 14 and (best is None or size > best[1]):
            best = (split, size)
    assert best, "%s: no hero arrangement fits the safe box" % name
    hero_lines, hero_sz = best

    bh = block_h(hero_lines, hero_sz, False, False)
    assert bh <= avail,         "%s: the text block is %dpx in a %dpx safe box" % (name, bh, avail)

    y = sy0 + max(0, (avail - bh) // 2)
    boxes = []

    for i, t in enumerate(tiers):
        if small_sz[i] is None:
            for j, ln in enumerate(hero_lines):
                # hero_runs(), NOT a hardcoded role. This line read
                # [(ln, "nb", hero_col)], so the fitter measured one face and
                # the renderer drew another: every width was computed in
                # Fraunces Italic and painted in Source Sans Bold. It fit by
                # luck, and the safe-box assert cannot see the difference
                # because it only ever measures what was drawn.
                runs = [(t, r, hero_col) for t, r, _c in hero_runs(ln)]
                hx, h_bot = draw_runs(d, sx0, y, runs,
                                      hero_sz, hero_track(hero_sz))
                boxes.append(("hero" if j == 0 else "hero %d" % (j + 1),
                              hero_col, (sx0, y, int(hx), h_bot)))
                y += int(hero_sz * 1.04)
            y += int(hero_sz * 0.16)
        else:
            ex, bot = draw_runs(d, sx0, y, t[1], small_sz[i])
            boxes.append(("tier %d" % (i + 1), t[1][0][2],
                          (sx0, y, int(ex), bot)))
            y += int(small_sz[i] * 1.26)


    # ---- checks -----------------------------------------------------------
    for label, _col, (bx0, by0, bx1, by1) in boxes:
        assert bx0 >= sx0 - 1 and bx1 <= sx1 + 1,             "%s: %s runs outside the safe box horizontally (%d..%d vs %d..%d)"             % (name, label, bx0, bx1, sx0, sx1)
        assert by0 >= sy0 - 1 and by1 <= sy1 + 1,             "%s: %s runs outside the safe box vertically (%d..%d vs %d..%d)"             % (name, label, by0, by1, sy0, sy1)
        if avatar:
            ax0, ay0, ax1, ay1 = avatar
            overlap = not (bx1 < ax0 or bx0 > ax1 or by1 < ay0 or by0 > ay1)
            assert not overlap,                 "%s: %s sits under the profile photo" % (name, label)
        # THE PHONE CROP IS A SEPARATE AND NARROWER BOX. Every check above
        # measures the desktop image, so a hero can sit perfectly inside the
        # safe box and still lose its last letter on a phone, which is exactly
        # what happened at a safe box ending on 1470. The margin is 34px so
        # that a crop a little off centre still holds.
        if mobile_band:
            mb0, mb1 = mobile_band
            pad = 34
            assert bx0 >= mb0 + pad and bx1 <= mb1 - pad,                 "%s: %s is outside the phone crop (%d..%d vs %d..%d)"                 % (name, label, bx0, bx1, mb0 + pad, mb1 - pad)

    # NO TIER MAY TOUCH THE NEXT. Three tiers at three sizes is exactly the
    # arrangement where a deep descender or a grown hero lands on its
    # neighbour, and the safe-box check above passes happily while it does.
    for i in range(len(boxes) - 1):
        la, _ca, a = boxes[i]
        lb, _cb, b = boxes[i + 1]
        assert a[3] <= b[1] + 1,             "%s: %s overlaps %s (bottom %d vs top %d)"             % (name, la, lb, a[3], b[1])

    # the bar sits OUTSIDE the safe box by design, so it joins only here
    boxes = boxes + bar_boxes

    # every tier clears 4.5:1 against the ground it is actually on. Sample the
    # GROUND beside the text, never the text box itself: averaging glyphs with
    # their background and comparing ink to that blend is not a contrast ratio
    # of anything, and it failed a URL that is 6.9:1 on the real ground.
    for label, col, (bx0, by0, bx1, by1) in boxes:
        gy0, gy1 = by0, max(by0 + 2, by1)
        gx0 = min(bx1 + 6, card.width - 8)
        gx1 = min(gx0 + 24, card.width)
        patch = card.crop((gx0, gy0, gx1, gy1)).resize(
            (1, 1), PIL.Image.BOX).getpixel((0, 0))
        r = contrast(col, patch)
        assert r >= 4.5, "%s: %s is %.1f:1 on its ground" % (name, label, r)

    card = grain(card)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name + ".png")
    # WRITE A NEW FILE AND SWAP IT IN, never truncate in place. This repo lives
    # in Documents, which Google Drive mirrors, and Drive's filter driver
    # refuses the truncating open that Image.save uses on an existing file:
    # opening "r+b" succeeds while "w+b" fails with EINVAL, which reads as a
    # corrupt argument rather than as a sync client. os.replace is atomic, so a
    # failed render also cannot leave a half-written cover behind.
    # UNLINK, THEN WRITE FRESH. This repo lives in Documents, which Google
    # Drive mirrors, and Drive's filter driver rejects every ordinary way of
    # overwriting a file it is watching:
    #
    #   Image.save over an existing file  EINVAL   (truncating "w+b"; plain
    #                                               "r+b" on the same path is
    #                                               fine, so it reads as a bad
    #                                               argument, not as a locked
    #                                               file)
    #   os.replace onto an existing name  WinError 5
    #   os.rename from a fresh temp file  WinError 32, because Drive opens the
    #                                     new file to upload it within
    #                                     milliseconds of its creation
    #
    # Deleting the target first and writing straight to the final name is the
    # one sequence it permits, and it avoids a temp file for Drive to grab.
    # The retry covers the case where Drive still holds the old handle.
    #
    # This is the same mirrored-folder hazard that destroyed the Desktop repo,
    # surfacing as a build error rather than as corruption. The real fix is
    # moving this repo to C:\dev.
    for attempt in range(6):
        try:
            if os.path.exists(path):
                os.remove(path)
            card.save(path)
            break
        except (PermissionError, OSError) as exc:
            if attempt == 5:
                raise RuntimeError(
                    "%s: could not write %s after 6 tries (%s). This folder is "
                    "mirrored by Google Drive; close anything viewing the file "
                    "or move the repo to C:/dev." % (name, path, exc))
            time.sleep(0.4 * (attempt + 1))

    assert card.size == (W, H)
    kb = os.path.getsize(path) / 1024.0
    print("  %-26s %4dx%-4d  %5.0f KB  %-11s hero %dpt on %d line(s)"
          % (name + ".png", W, H, kb, layout_name, hero_sz, len(hero_lines)))
    return path


print("covers: palette %s, hero %s, on the website's type system"
      % (PALETTE, HERO_ROLE))

# Facebook: 1640x624 is 2x the 820x312 desktop cover. Mobile crops the SIDES,
# so the safe box stops well short of both edges.
# THE MOBILE BAND IS NARROWER THAN THE IMAGE AND IT IS DERIVABLE, not a
# guess: Facebook publishes the cover as 820x312 on desktop and 640x360
# on mobile, which is 2.63:1 cropped to 1.78:1. A centre crop therefore
# keeps 1.78/2.63 = 67.7% of the width, so only x 264..1376 of 1640
# survives both views. The safe box used to end at 1470 and both hero
# lines ran to about 1460, so on a phone they lost their last letters
# while every check passed, because every check measured the desktop
# image. The panel moves left rather than the type getting smaller.
build("facebook-cover-v1", 1640, 624, SET_TWO, 0.5,
      0.42, safe=(752, 46, 1340, 520), mobile_band=(265, 1374),
      layout="columns", weights=TWO_WEIGHTS)
# The safe box stops at 1340 rather than at the band edge, because the
# fitter sizes the hero against the safe box and the phone assertion is
# checked after it. Leaving them equal makes the hero exactly one pad too
# wide every time and the build fails on its own geometry.

# LinkedIn personal banner. The profile photo covers the bottom left, so the
# avatar box is declared and asserted against.
# NO PERSONAL BANNER FOR THIS BRAND. G, 2 November: "For linkedIn, it's
# just the page banner, not for my profile, my profile will be for
# Optomize.io and for our Crossleaf product."
#
# A 1584x396 was built and is deleted. It was a profile asset in both of
# the ways that matter and neither is reusable on a page: it led with G
# rather than with the room, and it reserved a carve-out at bottom-left
# for a personal avatar. An Optomize or Crossleaf banner is a separate
# build on the Optomize brand guide, not a recolour of this one.
#
# The page cover is 1128x191, which is the size LinkedIn documents for a
# company page. A 1584x396 uploaded to a page is cropped to that aspect
# and loses the middle of the type, so the page asset is built at the
# page ratio rather than scaled into it.

# LinkedIn company page banner, much thinner, so the short line and no rule.
# THE STRIP CANNOT TAKE BANDS. At 191px tall three of them are about 60px
# each and every face is sliced; it reads as noise, not as a progression.
# Same three photographs, same order, as weighted columns instead, with
# the webinar given nearly half the width so its grid survives.
build("linkedin-company-v1", 1128, 191, SET_TWO, 0.42,
      0.44, safe=(530, 10, 1092, 148), layout="columns",
      weights=TWO_WEIGHTS)

print("checks passed")
