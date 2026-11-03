# Translation worksheet — the AI speed figures

Every string drawn on the eight figures, in the order a reader meets them.
Two sizes are generated from these: 2400x1350 wide, and 1080x1080 square.

**How to fill it in.** Replace the cell. Where a phrase needs two lines, write
`
` where it should break — the figure will not guess, and an English break
is usually wrong in another language. Leave a cell blank and that string stays
English, which is deliberate: a half-finished file renders as an obviously
mixed board rather than failing.

**Polish** is drafted below and **has not been reviewed**. It was written by
Claude on 3 November 2026 as a starting point, not for presentation.

**Khmer** is deliberately empty. The rendering is built and proven — reportlab
cannot shape Khmer and drew the coeng as a loose mark, so the figures now shape
with HarfBuzz and draw glyph outlines — but the words need a Khmer speaker.

| English | Where it appears | Note | Polish (DRAFT, unreviewed) |
|---|---|---|---|
| BUILDING A PRODUCT | eyebrow, top left, set in caps |  | BUDOWANIE PRODUKTU |
| DELIVERING A PUBLIC SERVICE | eyebrow, top left, set in caps |  | REALIZACJA USŁUGI PUBLICZNEJ |
| Before AI | row name, large bold, left column |  | Przed AI |
| With AI | row name, large bold, left column |  | Z AI |
| what people think | qualifier under a row name, small |  | jak się wydaje |
| in reality | qualifier under a row name, small |  | w rzeczywistości |
| Your idea | stage name, product timeline | short: it sits over a narrow bar | Twój pomysł |
| Validation | stage name, product timeline | short: it sits over a narrow bar | Walidacja |
| Design | stage name, product timeline | short: it sits over a narrow bar | Projekt |
| Build | stage name, product timeline | short: it sits over a narrow bar | Budowa |
| Sell | stage name, product timeline | short: it sits over a narrow bar | Sprzedaż |
| Iteration | stage name, product timeline | short: it sits over a narrow bar | Iteracja |
| Adopt | stage name, product timeline | short: it sits over a narrow bar | Wdrożenie |
| Trigger | stage name, public service timeline | short: it sits over a narrow bar | Impuls |
| Consultation | stage name, public service timeline | short: it sits over a narrow bar | Konsultacje |
| Approval | stage name, public service timeline | short: it sits over a narrow bar | Zatwierdzenie |
| Pilot | stage name, public service timeline | short: it sits over a narrow bar | Pilotaż |
| Redesign | stage name, public service timeline | short: it sits over a narrow bar | Przeprojektowanie |
| Adoption | stage name, public service timeline | short: it sits over a narrow bar | Wdrożenie |
| Awareness | human skill, under the product timeline | use 
 for a line break | Świadomość |
| Deep curiosity | human skill, under the product timeline | use 
 for a line break | Głęboka ciekawość |
| Creativity | human skill, under the product timeline | use 
 for a line break | Kreatywność |
| Judgement on tools and imagination | human skill, under the product timeline | use 
 for a line break | Ocena narzędzi / i wyobraźnia |
| Strong relationships | human skill, under the product timeline | use 
 for a line break | Silne relacje |
| Judgement of quality | human skill, under the product timeline | use 
 for a line break | Ocena / jakości |
| Adaptability to pivot and change | human skill, under the product timeline | use 
 for a line break | Gotowość do / zmiany kierunku |
| Trust across agencies | human skill, under the public service timeline | use 
 for a line break | Zaufanie między / instytucjami |
| Judgement of what works | human skill, under the public service timeline | use 
 for a line break | Ocena tego, / co działa |
| Courage to change it | human skill, under the public service timeline | use 
 for a line break | Odwaga, by / to zmienić |
| Adaptive thinking and relationships | human skill, under the public service timeline | use 
 for a line break | Elastyczne myślenie / i relacje |
| AI does it | legend, bottom left |  | Robi to AI |
| AI does part of it | legend, bottom left |  | AI robi część |
| A person does it | legend, bottom left |  | Robi to człowiek |
| Serves the public | outcome line at the end of a row (currently off) |  | Służy obywatelom |
| Serves the public really well | outcome line at the end of a row (currently off) |  | Służy obywatelom bardzo dobrze |
| Solves their problem | outcome line at the end of a row (currently off) |  | Rozwiązuje ich problem |
| Solves their problem really well | outcome line at the end of a row (currently off) |  | Rozwiązuje ich problem bardzo dobrze |
| Sooner, and better | outcome line at the end of a row (currently off) |  | Szybciej i lepiej |
| Perceived public value | value label (currently off) | use 
 for a line break | Postrzegana / wartość publiczna |
| Perceived value | value label (currently off) | use 
 for a line break | Postrzegana / wartość |
| Where it finished before AI | label on the comparison bracket, right side |  | Gdzie kończyło się przed AI |
| all of these are human skills | handwritten pencil note on the skills slide |  | to wszystko są ludzkie umiejętności |
| Human intelligence AI can’t replace | tagline under the website, set in caps |  | Ludzka inteligencja, której AI nie zastąpi |
| What everyone expects | headline on the SQUARE version only | two short lines is ideal | Czego wszyscy / oczekują |
| What actually happens | headline on the SQUARE version only | two short lines is ideal | Co dzieje się / naprawdę |
| Where the time goes | headline on the SQUARE version only | two short lines is ideal | Gdzie ucieka / czas |
| All of these are human skills | headline on the SQUARE version only | two short lines is ideal | To wszystko / ludzkie umiejętności |

## Running it

    FIG_LANG=pl python scripts/build_ai_figures.py
    FIG_LANG=km python scripts/build_ai_figures.py
    python scripts/check_figure_lang.py     # what is missing, per language

Output lands beside the English set with a language suffix, for example
`images/ai-before-after-product-skills-v5-pl.png`.
