"""Point every game's brand link at academy.trilumi.xyz.

trilumi.xyz/games/ was a hub I built without noticing that academy.trilumi.xyz
already existed and already lists all four games. It is retired, so every link
that pointed at it has to point at the real front door instead:

  * the lockup in the page footer
  * TRILUMI.HREF inside the embedded brand module
  * the address printed under the lockup on a share card
  * the plain-text fallback a card can be copied as

Idempotent, and safe to run twice: absence of an anchor counts as already done
so long as the replacement is present.

    python brand/patch-academy.py [--check]
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

GAMES = [
    ("thor-hammer", ROOT / "thor-hammer" / "index.html"),
    ("hetu-luoshu", ROOT / "_gh" / "hetu-luoshu" / "index.html"),
    ("whereami", ROOT / "_gh" / "coordinate-thinking-game" / "index.html"),
]

OLD_HREF = "https://trilumi.xyz/games/"
NEW_HREF = "https://academy.trilumi.xyz/"

OLD_STAMP = "c.fillText('trilumi.xyz/games', x, y + bs + ws * 1.16);"
NEW_STAMP = "c.fillText(opts.addr || 'academy.trilumi.xyz', x, y + bs + ws * 1.16);"

OLD_ADDR = "trilumi.xyz/games"
NEW_ADDR = "academy.trilumi.xyz"


class PatchError(Exception):
    pass


def swap(text, old, new, label, counts):
    """Replace every occurrence. Absent anchor + present replacement = done."""
    if old not in text:
        if new in text:
            counts.append((label, 0))
            return text
        raise PatchError("anchor not found: " + label)
    n = text.count(old)
    counts.append((label, n))
    return text.replace(old, new)


def patch(text):
    counts = []
    # order matters: the full URL first, or the bare-address rule below would
    # rewrite it into https://academy.trilumi.xyz// with a double slash
    text = swap(text, OLD_HREF, NEW_HREF, "href", counts)
    text = swap(text, OLD_STAMP, NEW_STAMP, "stamp", counts)
    text = swap(text, OLD_ADDR, NEW_ADDR, "address", counts)
    return text, counts


def main():
    check = "--check" in sys.argv
    failed = 0
    for slug, path in GAMES:
        if not path.exists():
            print("  !!  %-12s missing %s" % (slug, path))
            failed += 1
            continue
        before = path.read_text(encoding="utf-8")
        try:
            after, counts = patch(before)
        except PatchError as e:
            print("  !!  %-12s %s" % (slug, e))
            failed += 1
            continue
        total = sum(c for _, c in counts)
        if after == before:
            print("  =   %-12s already points at the academy" % slug)
            continue
        if check:
            print("  ok  %-12s would patch (%d edits)" % (slug, total))
        else:
            # newline="\n": read_text() uses universal newlines so `after` is
            # LF-only, and write_text() with the default newline=None would
            # translate every \n to os.linesep — CRLF on Windows. The result
            # still runs, but the working tree stops matching the git blob
            # (`.gitattributes` normalises on commit, so `git status` says
            # nothing) and the live byte count stops matching the repo.
            path.write_text(after, encoding="utf-8", newline="\n")
            detail = " ".join("%s=%d" % (l, c) for l, c in counts if c)
            print("  ok  %-12s patched (%s)" % (slug, detail))

    if failed:
        print("\n%d game(s) failed." % failed)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
