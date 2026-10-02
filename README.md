# trilumi · games

The shared layer under the games, listed at [academy.trilumi.xyz](https://academy.trilumi.xyz/).

Each game is a single HTML file with no dependencies, living in its own repo.
That is the right shape for a game, but it means several codebases that drift.
This repo holds the parts that must *not* drift: the brand signature, the share
card renderer, the beacon, and the tools that keep them in sync.

```
tribrand.js       the lockup — three-polygon mark + TRILUMI wordmark
tricard.js        one share-card renderer for the whole family
trishare.js       the share sheet (preview → save / copy / native share)
tribeacon.js      first-party beacon, off except on *.trilumi.xyz
memes/            fifteen ending memes, one per ending per language
beacon/p.gif      the 42-byte 1x1 GIF the beacon reports to
apply.py          inlines the modules into each game, with assertions
check-layout.js   renders every card headlessly and checks the geometry
deploy-family.sh  pushes the games and the beacon
patch-academy.py  repoints every brand link at the academy
patch-ao-card.py  the Art of War share card: reachable, visible, memed
make-meme-data.py packs memes/ into the base64 the games embed
render-card.py    replays a recorded card onto a real image, for eyeballing
family-funnel.sh  reads the beacon back out of the server logs
make-hub-og.py    renders games/og.png
```

## The family

| Game | Repo | Live | Card | Beacon |
|---|---|---|---|---|
| Everyone Got Thor's Hammer | `thor-hammer` | [aihammer.trilumi.xyz](https://aihammer.trilumi.xyz/) | own | yes |
| 「发明」河图洛书 | `hetu-luoshu` | [hetu.trilumi.xyz](https://hetu.trilumi.xyz/) | TRICARD | own |
| 「发明」孙子兵法 | `sunzi-13` | [artofwar.trilumi.xyz](https://artofwar.trilumi.xyz/) | own + meme | yes |
| 你在哪一格 | `coordinate-thinking-game` | [whereami.trilumi.xyz](https://whereami.trilumi.xyz/) | TRICARD | yes |
| 再建美国 · 1861 | `rebuild-america` | [rebuild.trilumi.xyz](https://rebuild.trilumi.xyz/) | TRICARD | yes |
| 再造政府 · 1933 | `rebuild-america` | [rebuild2.trilumi.xyz](https://rebuild2.trilumi.xyz/) | TRICARD | yes |

Two of the games grew their own share-card code before this layer existed.
They keep it — rewriting a card that already works to prove a point is not
worth the risk. New cards use `TRICARD`. Both paths carry the same stamp.

`hetu-luoshu` runs its own tracker, written before this one and slightly
richer. It is deliberately **not** given a second beacon: two trackers on one
page double-count every event in the log.

## The diptych

**Two games, one repo** — deliberately. 再建美国与再造政府 argue a single thing
between them: Lincoln rebuilt the country, Roosevelt rebuilt its government.
Split across two repositories they stop arguing it.

They are also the only pair in the family that carries **all three languages**,
English by default. That is worth noting here because it changes what the
beacon means: `l` is now a real dimension for them, not a constant, and a link
can pin one with `?lang=en` / `?lang=hant` / `?lang=hans`.

Their build chain lives with them, in
[`rebuild-america/tools/`](https://github.com/oscaro-o/rebuild-america/tree/main/tools)
— `brand.py` → `card.py` → `i18n.py`, three stages, reproducing both files byte
for byte from the original commit. `apply.py` here does not know about them, on
purpose: its anchors are per-game and per-palette, and folding a pair that
already builds cleanly into it would mean rewriting patch functions that work.
What this repo owns for them is `tribrand.js`, `tricard.js`, `trishare.js` and
`tribeacon.js`; `rebuild-america/tools/modules/` holds a copy of the two it
inlines, so a change here has to be re-copied there.

One thing the pair does **not** have: a line in `deploy-family.sh`. It is not a
row that was forgotten, and it is not a gap either — the pair carries its own
deployer, `rebuild-america/tools/deploy.sh`. `deploy_game` here handles one
domain per game and this pair has four addresses, two of them subpaths that live
**outside** `public_html` on purpose so a site restore cannot wipe them — which
`push()` refuses to write to, since it only accepts `/home/*/public_html*`.
Giving the pair a row here would mean widening that guard on a script that
writes to a live server, so the deployer went where the games are instead.

## The lockup

Copied from the header of `trilumi.xyz`, which is the authority:

```
mark   three polygons in a 100 x 106 box, painted in one colour (#004AAD)
word   "TRILUMI", uppercase, letter-spacing .22em, padding-left .11em
```

Canvas has no letter-spacing, so `TRILUMI` goes down one glyph at a time with
a manual advance. Nothing in the lockup is translated — a mark that changes
with the interface language is not a mark.

Two forms, on purpose:

- **badge** — blue rounded square, white cut-outs. Used on share cards, which
  get forwarded into chat apps and shown as thumbnails. It has to survive
  being scaled down and re-compressed.
- **bare** — blue polygons on the page's own background. Used in the in-game
  footer, where it sits next to the game's own type and should not shout.

## Working on it

```bash
# apply the brand layer to every game, in place
python brand/apply.py --check      # report only
python brand/apply.py              # write

# verify the cards without a browser
node brand/check-layout.js

# ship it
bash brand/deploy-family.sh --check
bash brand/deploy-family.sh

# read the numbers back
ssh hetu 'bash -s' < brand/family-funnel.sh
```

`apply.py` asserts every anchor and is idempotent, so a second run is a no-op
rather than a mess. If a game's markup changes under it, it fails loudly and
writes nothing for that game.

`check-layout.js` exists because there is no browser automation here. It stubs
a canvas 2D context, measures text with a width table (CJK full width, Latin
roughly half), and renders every card in every language. It catches overflow
and collision, not kerning — which is enough: it has already caught a title
that ran 1,367px off the edge of a 1,080px card in English only.

## Deploying

tar over ssh, because neither end has rsync. Ownership is taken from the
parent directory so OpenLiteSpeed can read what lands.

The server runs **OpenLiteSpeed**, not LiteSpeed Enterprise and not nginx.
`.htaccess` is accepted and silently ignored — rewrite rules have to go in the
vhost config. The beacon is a plain file, so it needs no rewrite rule, but any
future redirect does.

## The beacon

Events ride in the query string of a 1×1 GIF; the web server writes them to
its access log. No cookie, no external script, no third party, no personal
data, nothing that executes. Swapping the backend means changing `send()`.

```
e   event      load | start | done | share | click | lang
s   session    random, kept in sessionStorage
g   game       the slug, so one report can read the whole family
l   language
r   referrer host, on load only
n   1 if this browser has never been seen
u   utm_source, if present
```

Off everywhere except `*.trilumi.xyz`, so a local copy, a `file://` open, or a
GitHub Pages mirror reports nothing.

Because the beacon needs JavaScript to fire, crawlers never enter the numbers.
