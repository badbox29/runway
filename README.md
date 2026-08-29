# Runway

A personal planner with three ways to look at the same tasks: a **sprint
board**, a **canvas**, and a **month**.

Areas of your life are **buckets** — cards with a colour *and* a texture —
arranged freely on a canvas that grows as you push things outward. Tasks live
inside buckets and can be dragged between them, taking on the new bucket's
identity as they land. Buckets and individual tasks can be **connected**, and
connections carry meaning: depends on, blocks, either/or, conflicts, do
together, waiting on, informs.

The same tasks read as a lightweight agile board — backlog, sprints, points,
progress — and as a month calendar where each day is a stack of textured bars
rather than a wall of text. Three schemes, each with a light and dark mode.

## Running it

Runway uses ES modules, so it needs to be served over HTTP — opening
`index.html` from the filesystem will fail on CORS.

```bash
npm start          # http://localhost:5173
# or, with no Node at all:
python3 -m http.server 5173
```

No build step, no bundler, no runtime dependencies.

## Views

**Sprints** (the landing view) is a light personal agile tracker, laid out the
way Jira settled on: the current sprint sits at the top as to-do / in-progress /
done lanes, and the backlog runs full width beneath it as a dense list of rows.
That split matches how the two are used — the sprint is a board you work *on*,
the backlog is an inventory you scan *down*, and cards and rows are the right
shapes for those two jobs.

Drag by the textured grip to move a task between lanes or back to the backlog;
the view auto-scrolls when you drag near an edge. Since the backlog is below the
fold, each row also has a **↑** button that sends it straight to the current
sprint. Click the points chip to estimate. The backlog header carries a filter —
by text, by bucket, and show/hide done — because at any real size that list is
long, and a wall of rows with no way to narrow it is a haystack, not an
inventory. The sprint header stays sticky while you scroll, so the progress
figures are still in view while you decide what to pull up.

Create a sprint, start it, and close it — closing returns unfinished work to the
backlog rather than dragging it along silently, because carrying work over
invisibly is how a sprint stops meaning anything.

A task has a bucket *and* a sprint. The bucket is which part of your life it
belongs to and doesn't change when the fortnight does; the sprint is a time
box. They're orthogonal, so a card keeps its colour and texture wherever it
lands on the board.

**Canvas** is the spatial view: buckets placed freely, connections drawn
between them. **Month** is the calendar.

The three views are one product rather than three apps because of one link: a
dependency you draw on the canvas shows up as a warning dot on the sprint
board. If a card's prerequisites aren't done, you see it where you're deciding
what to work on.

## Themes

Three schemes — **Paper** (cool slate, quiet and printerly), **Clay** (warm
stone, low contrast for long sessions), and **Signal** (high contrast for a
dense board) — each with a light and dark mode. Mode follows your OS until you
pick one explicitly.

A scheme themes the *paper*: ground, surface, ink, rules. It deliberately does
not touch bucket or connection colours, because those are identity — a bucket
is magenta because you made it magenta, and it shouldn't change meaning when
you dim the lights. Dark mode instead lifts those stored hues toward the light
at render time, so a board stays portable between modes, between schemes, and
between machines.

## Controls

| | |
|---|---|
| `s` / `b` / `c` | sprints / board / calendar |
| `d` | toggle dark mode |
| Drag a card grip | move between lanes or to the backlog |
| **↑** on a backlog row | send it to the current sprint |
| Click a points chip | cycle the estimate |
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
| Reset button, or `?reset` | reload the demo board |

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
  tokens.css          three schemes × two modes, plus shared metrics
  base.css            reset and shared primitives
  chrome.css          toolbar, legend, hint
  canvas.css          scroller, world, SVG layers
  bucket.css          cards, rows, knobs
  popover.css         menus
  calendar.css        month view
  sprints.css         backlog and sprint board
js/
  main.js             boot and orchestration; nothing else touches the toolbar
  config/
    types.js          connection types — colour, dash, terminator, direction
    palette.js        bucket palette, patterns, card metrics
    schemes.js        colour scheme registry
  core/
    store.js          state, typed change events, undo stack, sprints
    geometry.js       rects, anchors, obstacle-aware routing, path building
    persist.js        localStorage autosave, JSON import/export, migration
    theme.js          scheme and mode, stored per device
  ui/
    sprints.js        backlog and sprint board
    canvas.js         pan, zoom, canvas growth
    buckets.js        card rendering, header drag, item drag
    edges.js          SVG connection rendering across both layers
    wiring.js         connection-drag interaction
    popover.js        context menus
    calendar.js       month view
    legend.js         connection key
  util/
    dom.js            element helpers
    patterns.js       pattern fills and dark-mode colour adaptation
    dates.js          ISO date handling and formatting
data/
  seed.js             starting board, same shape as an export
test/
  geometry.test.mjs   routing and rect math, no dependencies
  store.test.mjs      sprint lifecycle, blockers, board migration
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

**A task has one completion field.** `status` is `todo | doing | done` — there
is no separate `done` boolean, because two fields meaning the same thing are
two fields that can disagree. Boards saved before sprints existed are migrated
on load, so an upgrade never costs you a board.

**Change events are typed.** `store.js` emits `structure`, `geometry`, `edges`,
or `view`, and `main.js` decides what to redraw. Moving a card doesn't rebuild
forty DOM nodes.

## Data

The board autosaves to `localStorage` under `runway.board.v2` on a 500ms
debounce; a `v1` board is read and migrated automatically.

**A saved board wins over the bundled demo**, which is the point of autosave —
but it means editing `data/seed.js` has no visible effect for anyone who has
opened Runway before. So a board records where it came from: `fromSeed` is true
until the first edit, and `seedVersion` stamps which generation of the demo it
is. On boot, an *untouched* demo from an older generation is replaced; a board
anyone has actually worked on never is. Bump `seedVersion` in `data/seed.js`
whenever you change the demo.

Boards saved before this mechanism existed carry no stamp, so they're treated
as edited and kept. To force the demo back: the **Reset** button, or load
`index.html?reset`. Theme choice is
stored separately under `runway.theme.v1`, because a theme belongs to a device
and a pair of eyes, not to the data — importing someone else's board shouldn't
repaint your screen. **Export** writes a JSON file in the same shape as `data/seed.js`, so
a board can be committed to version control or hand-edited in a text editor.
**Import** replaces the current board.

`data/seed.js` is a generic demo — a week of work, home, and life that exercises
every connection type. Its dates are computed relative to today, so the
calendar always opens on a month with something in it. Delete it and start
empty, or drop in an export.

## Tests

```bash
npm test                              # geometry, routing, and store — no dependencies
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

- The backlog filter isn't remembered between sessions, on purpose — reopening
  to a list that is quietly missing rows is worse than re-typing a filter.
- No burndown chart. Progress is a point total, not a history — nothing records
  daily snapshots, so there's no line to draw yet.
- Sprints have no velocity memory, so a new sprint can't suggest a capacity.
- Tasks can't be dragged directly onto a calendar day yet; dates are set from
  the task menu.
- Connections to items inside a *collapsed* bucket fold to the bucket's own
  anchor rather than remembering where the row was.
- Undo covers structure and connections, not zoom or scroll position.
- No multi-select, no grouping, no search.
- Nothing is shared. Single-player, one browser, one device.

## Licence

MIT.
