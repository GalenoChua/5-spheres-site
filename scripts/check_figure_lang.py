"""Report which drawn strings have no translation, per language.

A MISSING TRANSLATION IS A LEGAL STRING. Nothing in the geometry checks can
find one: the figure renders, the margins hold, and the only symptom is a
board that is half in the wrong language. This walks the data the builder
actually draws and compares it with the language file.
"""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
LANG_DIR = os.path.join(SITE, "lang")

en = json.load(io.open(os.path.join(LANG_DIR, "figures.en.json"), encoding="utf-8"))
codes = [f.split(".")[1] for f in os.listdir(LANG_DIR)
         if f.startswith("figures.") and f.endswith(".json")
         and f.split(".")[1] not in ("en", "keys")]

bad = 0
for code in sorted(codes):
    got = json.load(io.open(os.path.join(LANG_DIR, "figures.%s.json" % code),
                            encoding="utf-8"))
    got = dict((k, v) for k, v in got.items() if not k.startswith("_"))
    missing = [k for k in en if k not in got]
    same = [k for k, v in got.items() if v == k and len(k) > 3]
    extra = [k for k in got if k not in en]
    print("%s: %d/%d translated" % (code, len(en) - len(missing), len(en)))
    for k in missing:
        print("   MISSING   %s" % k); bad += 1
    for k in same:
        print("   UNCHANGED %s   (same as English, probably not translated)" % k)
    for k in extra:
        print("   UNUSED    %s   (not a key the builder draws)" % k); bad += 1
sys.exit(1 if bad else 0)
