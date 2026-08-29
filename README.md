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
way Jira settled on: the current sprint sits at the top as columns, and the
backlog runs full width beneath it as a dense list of rows.
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

### Columns

Four by default — **To do**, **Blocked**, **In progress**, **Done** — and the
*Columns* button adds, renames, reorders, and removes them. The four defaults
can be renamed and reordered but not removed: the rest of the app reasons about
them, `done` decides sprint progress and what survives closing a sprint, and
`todo` is where returned and restored work lands. Their delete controls are
absent rather than disabled, since a button that exists only to refuse you is
worse than no button. Removing a custom column returns its tasks to To do.

**Blocked is computed, not a place you file things.** Runway already knows what
is blocked — it's in the connection graph — so a task with unfinished
prerequisites appears there on its own, and leaves on its own when they're done.
Each card says what it's waiting on, because being told something is blocked
without being told by what is the least useful thing a board can say.

Making Blocked a purely manual lane would have created two contradictory answers
to one question: a card parked in Blocked with every prerequisite finished, or a
card in To do with a red dot on it. That's the `done`-boolean-beside-`status`
mistake in a new costume. So the column is computed first and manual second —
drag a card in to record a blocker Runway can't see (a vendor, an approval, a
person), and it asks what for. Dragging a card *out* of derived Blocked is
refused with the reason, rather than silently snapping back: the way out is to
finish the thing it's waiting on.

Derived blocking only applies to work not yet started. If you're actively on
something you aren't blocked on it, whatever the graph says.

A task has a bucket *and* a sprint. The bucket is which part of your life it
belongs to and doesn't change when the fortnight does; the sprint is a time
box. They're orthogonal, so a card keeps its colour and texture wherever it
lands on the board.

**Canvas** is the spatial view: buckets placed freely, connections drawn
between them. **Month** is the calendar.

### How the views hold together

The three views are one product rather than three apps because they share one
model of time, and each is honest about which part of it they show.

**Three fields, three different claims.** `date` is when a thing happens — a
fact about the world. `sprintId` is when you promised to deal with it — a fact
about your plan. `status` is whether it's finished. They can disagree, and when
they do that's information, not corruption. A task dated three weeks out sitting
in this fortnight's sprint gets flagged; it is never silently rewritten.

**Committing to a task respects its connections.** Pull something into a sprint
and Runway walks the graph first. Prerequisites and do-together partners come
along — transitively, so a chain arrives whole. Same-slot conflicts are
reported. If any of that applies you get a dialog; if none of it applies the
task just moves. Sending a task back to the backlog runs the mirror check:
anything still committed that was counting on it gets named, so you can send it
back too.

**Either/or is an oxygen choice.** It does not mean "these collide on Tuesday" —
that's *Conflicts*. It means only one of these is getting done. So committing to
one arm **is** the decision, and the other arms are **dropped**: kept with their
notes, dates and connections, taken out of the backlog, reversible. Finishing an
arm settles it the same way, from the sprint board or from the canvas
right-click menu. Restoring a dropped arm re-opens the choice and drops whatever
won.

Drops are not a checkbox in that dialog. Prerequisites are — you may knowingly
commit to something without its dependencies — but there is no version of an
oxygen choice where you pick one and leave the rest sitting in the backlog. That
would make the connection decorative.

Exclusivity is transitive, so the group is the connected component over
either/or edges: only one of A, B, or C. That falls out of the graph without
storing anything new. If a rival is already *finished*, nothing can resolve
that — you made the choice already — so it's reported rather than silently
undone.

An out-of-window date deliberately does *not* open that dialog. Most backlog
tasks are dated beyond any two-week horizon, so it would fire on nearly every
commit and teach you to dismiss the dialog unread — the exact habit that makes
it useless on the day it has something real to say. It shows as a passive flag
instead.

**Sprint work is visible everywhere.** On the canvas, tasks in the running
sprint carry a rail and unfinished prerequisites carry a red dot. On the
calendar, the sprint is drawn as a band across the days it covers and its tasks
are ringed, so "this happens on the 12th" stays distinguishable from "I signed
up to deal with this by the 14th".

**Completing a task takes it off the calendar without touching its date.** The
date is history; reopen the task and it reappears on the same day. A *Show
completed* toggle brings them back, dimmed. Committed work with no date has
nowhere to sit in a month grid, so it's listed beneath it under *Committed, no
date* — which makes the calendar the place you go to schedule it.

**Connections are editable from either side.** The canvas draws them; the task
detail panel lists them with a type selector, a direction flip, and a cut, plus
a picker to add new ones. Same data, two ways in.

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
| Drag a card grip | move between columns or to the backlog |
| **↑** on a backlog row | send it to the current sprint |
| Click a points chip | cycle the estimate |
| Click any task, anywhere | open the detail panel |
| Right-click a task on the canvas | complete, commit, drop, delete |
| Esc | close the panel or dialog |
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
| Either / or | only one of these is getting done | no |
| Conflicts | same slot — both, but not at once | no |
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
  detail.css          task detail panel
  resolve.css         resolution dialog
js/
  main.js             boot and orchestration; nothing else touches the toolbar
  config/
    types.js          connection types — colour, dash, terminator, direction
    palette.js        bucket palette, patterns, card metrics
    schemes.js        colour scheme registry
  core/
    store.js          state, typed change events, undo stack, sprints
    geometry.js       rects, anchors, obstacle-aware routing, path building
    relations.js      what a sprint move implies across the connection graph
    persist.js        localStorage autosave, JSON import/export, migration
    theme.js          scheme and mode, stored per device
  ui/
    sprints.js        backlog and sprint board
    detail.js         task detail panel — fields, connections, comments
    resolve.js        the "bring related work along?" dialog
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
  relations.test.mjs  sprint moves against the connection graph
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

**A docked panel, not a popover.** Task details used to open as a floating menu
anchored to the click. It grew until it was taller than the screen, and a
fixed-position element can't be scrolled back into view — so it opened half off
the bottom with no way to reach the rest. A panel with its own scroll fixes that
by construction, and can stay open while you work in the view behind it. The
popover that remains, for canvas connection and bucket menus, now measures
itself after insertion and flips above the cursor when there's more room there.

**A task has one completion field.** `status` is `todo | doing | done |
dropped` — there is no separate `done` boolean, because two fields meaning the
same thing are two fields that can disagree. `dropped` exists because the losing
arms of an oxygen choice need somewhere honest to go: `done` would be a lie,
deleting destroys the task and the connection that explains it, and leaving them
in the backlog means rediscovering them in three months as mystery work nobody
can account for. Dropped work is out of the backlog by default and reachable
behind a toggle, because "what did we decide against, and why" is a question
worth being able to answer. Boards saved before sprints existed are migrated
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
- Tasks committed to a *future* sprint don't appear in the sprint view until you
  select that sprint — they're neither in the backlog nor in the current lanes.
  Jira solves this with per-sprint sections above the backlog; worth copying.
- Column layout is per board, not per sprint — you can't run one sprint with a
  review stage and another without.
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
