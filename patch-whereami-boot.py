#!/usr/bin/env python3
"""
patch-whereami-boot.py — fix a live, silent breakage in whereami.trilumi.xyz

`coordinate-thinking-game/index.html` has one <script> block. The game sits in
an IIFE that closes around line 1783; the brand / share-card / beacon modules
(`TRILUMI`, `TRICARD`, `TRISHARE`, `TRI`) are declared *after* it, from ~1801.

The "Sign the work" commit (5b59e2fd, 2026-09-28) inserted this at the end of
the game IIFE:

    TRI.configure({ game: 'whereami', ... });

`var TRI` is hoisted but still undefined at that point, so the call throws a
TypeError, which aborts top-level execution of the whole script block. Nothing
after it ever runs. Live consequences, silent because nothing reports them:

  * the share button is never wired — pressing it does nothing
  * TRI.ready() never fires, so this game reports no beacon at all
  * TRILUMI / TRICARD / TRISHARE never finish defining, so shareCard() would
    throw even if it were reachable

Fix: wait for DOMContentLoaded, by which time the parser has reached the
module declarations at the bottom of the same block. The boot stays inside the
game IIFE so it keeps its closure over `shareCard` and `LANG`.

Run:  python patch-whereami-boot.py
"""

import pathlib

WS = pathlib.Path(__file__).resolve().parent.parent
TARGET = WS / "_gh" / "coordinate-thinking-game" / "index.html"

OLD = """  TRI.configure({ game: 'whereami', lang: function () { return LANG; } });
  (function(){
    function wire(){
      var b=document.getElementById("sharebtn");
      if(!b){ return false; }
      b.addEventListener("click",shareCard);
      TRI.ready();
      return true;
    }
    if(!wire()){ document.addEventListener("DOMContentLoaded",wire); }
  })();
"""

NEW = """  /* The brand, card and beacon modules are declared further down this same
     <script>, after this IIFE closes. `var TRI` is hoisted but still
     undefined here, so calling TRI.configure() at parse time threw, and the
     throw aborted the rest of the block: the share button was never wired,
     the beacon never fired, and the modules below never finished defining.
     Wait for the parser to reach the bottom of the block instead. */
  function triBoot(){
    TRI.configure({ game: 'whereami', lang: function () { return LANG; } });
    function wire(){
      var b=document.getElementById("sharebtn");
      if(!b){ return false; }
      b.addEventListener("click",shareCard);
      TRI.ready();
      return true;
    }
    if(!wire()){ document.addEventListener("DOMContentLoaded",wire); }
  }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded",triBoot); }
  else { triBoot(); }
"""

MARKER = "function triBoot()"


def main():
    text = TARGET.read_text(encoding="utf-8")     # universal newlines: CRLF -> LF

    if MARKER in text:
        print("already applied, nothing to do")
        return

    n = text.count(OLD)
    if n != 1:
        raise SystemExit(f"anchor found {n} times, expected 1")

    text = text.replace(OLD, NEW, 1)

    # CRLF in the repo; keep the file's existing convention exactly
    raw = TARGET.read_bytes()
    crlf = raw.count(b"\r\n") > 0
    data = text.encode("utf-8")
    if crlf:
        data = data.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    TARGET.write_bytes(data)

    print(f"ok  deferred the boot; line endings preserved ({'CRLF' if crlf else 'LF'})")
    print(f"    {len(raw):,} -> {len(data):,} bytes")


if __name__ == "__main__":
    main()
