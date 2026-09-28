# trilumi · games

The shared layer under the four games at [trilumi.xyz/games](https://trilumi.xyz/games/).

Each game is a single HTML file with no dependencies, living in its own repo.
That is the right shape for a game, but it means four codebases that drift.
This repo holds the parts that must *not* drift: the brand signature, the share
card renderer, the beacon, the hub page, and the tools that keep them in sync.

```
tribrand.js       the lockup — three-polygon mark + TRILUMI wordmark
tricard.js        one share-card renderer for the whole family
trishare.js       the share sheet (preview → save / copy / native share)
tribeacon.js      first-party beacon, off except on *.trilumi.xyz
games/            the hub page served at trilumi.xyz/games/
beacon/p.gif      the 42-byte 1x1 GIF the beacon reports to
apply.py          inlines the modules into each game, with assertions
check-layout.js   renders every card headlessly and checks the geometry
deploy-family.sh  pushes the hub, the games and the beacon
family-funnel.sh  reads the beacon back out of the server logs
make-hub-og.py    renders games/og.png
```

## The family

| Game | Repo | Live | Card | Beacon |
|---|---|---|---|---|
| Everyone Got Thor's Hammer | `thor-hammer` | [aihammer.trilumi.xyz](https://aihammer.trilumi.xyz/) | own | yes |
| 「发明」河图洛书 | `hetu-luoshu` | [hetu.trilumi.xyz](https://hetu.trilumi.xyz/) | TRICARD | own |
| 「发明」孙子兵法 | `sunzi-13` | [artofwar.trilumi.xyz](https://artofwar.trilumi.xyz/) | own | yes |
| 你在哪一格 | `coordinate-thinking-game` | [whereami.trilumi.xyz](https://whereami.trilumi.xyz/) | TRICARD | yes |

Two of the games grew their own share-card code before this layer existed.
They keep it — rewriting a card that already works to prove a point is not
worth the risk. New cards use `TRICARD`. Both paths carry the same stamp.

`hetu-luoshu` runs its own tracker, written before this one and slightly
richer. It is deliberately **not** given a second beacon: two trackers on one
page double-count every event in the log.

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
