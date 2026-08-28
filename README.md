# Runway

A spatial task board.

Areas of your life are **buckets** — cards with a colour *and* a texture —
arranged freely on a canvas that grows as you push things outward. Tasks live
inside buckets and can be dragged between them, taking on the new bucket's
identity as they land. Buckets and individual tasks can be **connected**, and
connections carry meaning: depends on, blocks, either/or, conflicts, do
together, waiting on, informs.

The same board reads as a month calendar, where each day is a stack of textured
bars rather than a wall of text.

## Running it

Runway uses ES modules, so it needs to be served over HTTP — opening
`index.html` from the filesystem will fail on CORS.

```bash
npm start          # http://localhost:5173
# or, with no Node at all:
python3 -m http.server 5173
```

No build step, no bundler, no runtime dependencies.

## Controls

| | |
|---|---|
| Drag a bucket header | move the card |
| Double-click a header | collapse / expand |
| Right-click a header or row | rename, recolour, retexture, delete |
| Drag a row onto another bucket | move the task; it takes the new colour |
| Click a row | mark done |
| Drag a **○** onto any card or row | make a connection, then pick its type |
| Click a connection | retype, reroute, reverse, or cut it |
| Drag empty canvas | pan |
| ⌘/Ctrl + scroll | zoom |
| ⌘/Ctrl + Z | undo |
| `c` / `b` | switch to calendar / board |

## Connection types

| Type | Reads as | Directed |
|---|---|---|
| Depends on | can't start until the other is done | yes |
| Blocks | a hard stop until it clears | yes |
| Either / or | pick one, not both | no |
| Conflicts | same slot, can't do both | no |
| Do together | one trip, one sitting | no |
| Waiting on | needs another person first | yes |
| Informs | changes how you'd do the other | yes |

Each connection can either **route around** the cards or **pass behind** them.
Behind is for a link you want recorded but not narrated — it draws as a soft
curve at half opacity under the cards instead of an orthogonal line over them.

## Layout

```
index.html            markup and layer scaffolding only
css/
  tokens.css          every colour and metric in the app
  base.css            reset and shared primitives
  chrome.css          toolbar, legend, hint
  canvas.css          scroller, world, SVG layers
  bucket.css          cards, rows, knobs
  popover.css         menus
  calendar.css        month view
js/
  main.js             boot and orchestration; nothing else touches the toolbar
  config/
    types.js          connection types — colour, dash, terminator, direction
    palette.js        bucket palette, patterns, card metrics
  core/
    store.js          state, typed change events, undo stack
    geometry.js       rects, anchors, obstacle-aware routing, path building
    persist.js        localStorage autosave, JSON import/export
  ui/
    canvas.js         pan, zoom, canvas growth
    buckets.js        card rendering, header drag, item drag
    edges.js          SVG connection rendering across both layers
    wiring.js         connection-drag interaction
    popover.js        context menus
    calendar.js       month view
    legend.js         connection key
  util/
    dom.js            element helpers
    patterns.js       pattern fill generator
    dates.js          ISO date handling and formatting
data/
  seed.js             starting board, same shape as an export
test/
  geometry.test.mjs   routing and rect math, no dependencies
  smoke.test.mjs      full boot in jsdom
```

## How it works

**Colour is never the only signal.** Every bucket carries a colour *and* a
texture — diagonal, dots, crosshatch, rules, weave. Colour alone fails at a
glance, fails in print, and fails for anyone with a colour vision deficiency.
Texture survives all three, which is what lets the calendar drop event text
entirely and still be readable.

**Geometry is computed, never measured.** Card rectangles derive from bucket
position and item count (`core/geometry.js`), using metrics that mirror the CSS
custom properties in `tokens.css`. That means connections re-route during a
drag without a single forced layout — one style write and one SVG rebuild per
frame. The tradeoff: change `--row-h` in CSS and you must change `METRICS.row`
in `config/palette.js` to match.

**Connections use two layers.** The cards sit between two SVG elements, so a
connection can be drawn over them or under them without reordering anything.
The over-layer route is orthogonal and obstacle-aware: it tests each segment
against every bucket rectangle it isn't attached to and slides its lane until
it finds a clear channel. If nothing clears, it draws the direct lane anyway —
a slightly crossed line beats a missing one.

The lane search is the part worth knowing about. The obvious approach, sliding
the channel outward in fixed increments, scores **36%** on the 15-card routing
test: the increment rarely lands *inside* the gap between two cards, and it
can't fix a blocked horizontal run at all. Deriving candidate lanes from the
obstacle field itself — just outside each card edge, plus the centre of every
gap wide enough to hold a line — and alternating between a vertical-lane family
and an over/under detour family scores **100%**. See `laneCandidates()`.

**Lines and buckets live in different visual registers.** Buckets are textured
fills in mid-saturation. Connections are darker, wire-like hues where dash
pattern and terminator carry as much signal as colour, drawn with a pale casing
stroke so they stay legible crossing a patterned header. Without that
separation a magenta bucket and a magenta line read as the same system.

**Change events are typed.** `store.js` emits `structure`, `geometry`, `edges`,
or `view`, and `main.js` decides what to redraw. Moving a card doesn't rebuild
forty DOM nodes.

## Data

The board autosaves to `localStorage` under `runway.board.v1` on a 500ms
debounce. **Export** writes a JSON file in the same shape as `data/seed.js`, so
a board can be committed to version control or hand-edited in a text editor.
**Import** replaces the current board.

`data/seed.js` is a generic demo — a week of work, home, and life that exercises
every connection type. Its dates are computed relative to today, so the
calendar always opens on a month with something in it. Delete it and start
empty, or drop in an export.

## Tests

```bash
npm test                              # geometry and routing, no dependencies
npm install && npm run test:smoke     # boots the app in jsdom
```

`geometry.test.mjs` runs on bare Node because the routing math never touches
the DOM. Its last case lays out a 15-card grid with 78px gutters, routes a
connection between all 105 pairs, and asserts each path clears every card it
isn't attached to. That test is what caught the 36% router.

`smoke.test.mjs` boots the whole app in jsdom and checks that cards, rows,
connections, the legend, and the calendar render, and that clicking a
connection opens its menu. jsdom doesn't execute `<script type="module">`, so
the harness bundles the module graph with esbuild first and injects it as a
classic script. That's a test detail only — Runway itself ships unbundled.

## Known gaps

- Tasks can't be dragged directly onto a calendar day yet; dates are set from
  the item menu.
- Connections to items inside a *collapsed* bucket fold to the bucket's own
  anchor rather than remembering where the row was.
- Undo covers structure and connections, not zoom or scroll position.
- No multi-select, no grouping, no search.
- Nothing is shared. Single-player, one browser, one device.

## Licence

MIT.
