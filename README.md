# Runway

Think of Runway as a spatial to-do board. Areas of your life are **buckets** — cards with a colour
*and* a texture — arranged freely on a canvas that grows as you push things
outward. Tasks live inside buckets and can be dragged between them, taking on
the new bucket's identity. Buckets and individual tasks can be **connected**,
and connections are typed: depends on, blocks, either/or, conflicts, do
together, waiting on, informs.

The same board reads as a month calendar, where each day is a stack of textured
bars rather than a wall of text.

## Running it

The app uses ES modules, so it needs to be served over HTTP — opening
`index.html` from the filesystem will fail on CORS.

```bash
npm start          # serve on http://localhost:5173
# or, with no Node at all:
python3 -m http.server 5173
```

No build step, no bundler, no dependencies.

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
```

## How it works

**Geometry is computed, never measured.** Card rectangles derive from bucket
position and item count (`core/geometry.js`), using metrics that mirror the CSS
custom properties in `tokens.css`. That means edges re-route during a drag
without a single forced layout — one style write and one SVG rebuild per frame.
The tradeoff: if you change `--row-h` in CSS you must change `METRICS.row` in
`config/palette.js` to match.

**Connections use two layers.** The cards sit between two SVG elements. A
connection set to *pass behind* is drawn on the under-layer as a soft curve at
half opacity — recorded but not narrated. Everything else is drawn on the
over-layer as an orthogonal route that tests each segment against every bucket
rectangle it isn't attached to, sliding its lane outward in alternating
increments until it finds a clear channel. If nothing clears, it draws the
direct lane anyway: a slightly crossed line beats a missing one.

**Lines and buckets live in different visual registers.** Buckets are textured
fills in mid-saturation. Connections are darker, wire-like hues where dash
pattern and terminator carry as much signal as colour, drawn with a pale casing
stroke so they stay legible crossing a patterned header. Without that
separation a magenta bucket and a magenta line read as the same system.

**Change events are typed.** `store.js` emits `structure`, `geometry`, `edges`,
or `view`, and `main.js` decides what to redraw. Moving a card doesn't rebuild
forty DOM nodes.

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

## Data

The board autosaves to `localStorage` on a 500ms debounce. **Export** writes a
JSON file in the same shape as `data/seed.js`, so a board can be committed to
version control or hand-edited in a text editor. **Import** replaces the
current board.

## Known gaps

- Items can't be dragged directly onto a calendar day yet — dates are set from
  the item menu.
- No connection routing between items in *collapsed* buckets beyond folding
  them into the bucket's own anchor point.
- Undo covers structure and connections, not zoom or scroll position.
- No multi-select, no grouping, no search.
- Nothing is shared. This is single-player, one browser, one device.

## Seed data

The starting board uses real dates from the Dance & Music Academy 2026–27
company calendar, with an ordinary autumn built around them. Seeding with a
real season means the interesting cases surface on their own: a work deadline
landing on a rehearsal night, two optional competitions you can only pick one
of.

## Tests

```bash
npm test          # geometry and routing — no dependencies
npm install && npm run test:smoke   # boots the app in jsdom
```

See `test/README.md` for why the routing test matters.
