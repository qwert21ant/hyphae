# Hyphae

Local visual **viewer** for a C4-style architecture model, written by LLM agents over MCP.
See `docs/MODEL.md` for the model concept and `docs/SPEC.md` for the product spec.

## Develop

    pnpm install
    pnpm dev      # both of the below, in parallel
    pnpm server   # API + SSE on :5173, owns ./hyphae.json
    pnpm web      # viewer on :3000, proxies the API

The server is the single source of truth: it holds the model in memory, validates every write,
persists `hyphae.json` atomically (debounced), and broadcasts changes over SSE so an open viewer
refreshes live. Set `HYPHAE_FILE=/abs/path/hyphae.json` to choose the model file. The browser is a
read-only client: it loads the model over HTTP and follows SSE. Every write comes from an MCP tool
call or a direct edit of the JSON file.

## Viewer

**Navigation.** The canvas shows one **focus** at a time: the focused node as a labeled region with
its direct children inside, and everything else it connects to as dashed **ghost externals** beside
it. Double-click any node to drill into it (a childless one included — you get a "what touches
this?" view); the breadcrumbs walk back up. The breadcrumb is an **altimeter**: each crumb sits in a
band tinted with its own C4 layer's altitude step and only the deepest is lit, so how deep you are
in the model — Context, Container, or Component — reads before you read the names. Each band also
tags its crumb with the node's kind (`SYS`, `ACT`, `EXT`, `CON`, `COM`; the root band is `ALL`), and
every band is the same height, so the toolbar does not resize as you navigate. An external that
stands in for a deeper node can be **expanded** to reveal the child actually taking part. The left
**outline** panel lists the whole model — nodes by containment above, then Flows and Patterns in
their own pane below, each scrolling independently — and is collapsible; a click reveals a node in
context, a double-click drills in. The whole row is the target — indent, twisty column and the space
past a short name included — except the twisty itself, which only opens the branch. Both side panels
and the outline's internal split are **drag-resizable** (arrow keys resize a focused handle, Enter
toggles collapse, double-click resets it), and the sizes persist per browser. Dragging the outline's
handle to the edge collapses it exactly like the « button, and expanding — by either route —
restores its previous width. Search jumps to a node by name. A toolbar toggle switches between the
dark theme (the default) and a light one; the choice persists per browser. Brightness carries
meaning throughout: altitude, selection and focus are all expressed as light level, not just the
altimeter — see `docs/SPEC.md` §9 for the rule the whole design follows.

**Reading the diagram.** A node draws as its profile **role archetype** (actor, service, datastore,
queue, external system, UI surface) in SVG, tinted by C4 layer, showing name + a two-line summary +
a technology chip. A connection is labeled with its **verb + object** ("reads camera list") and
colored by verb class; several connections between the same pair fan apart instead of stacking.
**Derived cross-layer edges** — component connections rolled up to the altitude you are viewing —
are dashed violet and carry a count, unless an authored higher-level connection claims them via
`realizedBy`. Selecting or hovering a node/edge highlights its neighborhood and dims the rest,
labels included. The **audience toggle** (stakeholder / full) hides derived edges for a clean
read; the connection filter panel (verb class + profile fields) and the legend are generated from
the profile.

**Flows and Patterns.** Selecting a **Flow** in the outline jumps to its first step and lights its
steps in order, numbered along the edges they run on. Steps are clickable — each navigates to a view
where its endpoints are visible. A step with no authored connection behind it is drawn as a dotted
**ephemeral edge** rather than vanishing; a step this view genuinely cannot draw is marked ↗ in the
outline. Selecting a **Pattern** replaces the canvas with the pattern's own diagram (an ordered
pipeline row, a state machine laid out by its transitions, or a stacked member list); any member
bound to a real node links back into the model. A pattern's row carries its **kind** as a chip and
its `anchor` — the node it describes — as a link beside the name, so both read without opening it.

**The inspector.** Selecting a node or a connection shows its detail in the right-hand panel, as
text — the browser does not write the model. A node shows its name, type, role, the fields the
canvas draws (`summary`, `technology`), description, `root`, `codeRefs`/`docRefs`, the remaining
**profile-defined fields** for its kind (`responsibilities`, `invariants`, …), its parent, and its
incoming/outgoing connections. A field with no value renders no row at all, so a short panel means a
thinly described node — use the `model_gaps` MCP tool to audit that properly. The parent, and any
`ref`-typed field, are clickable and reveal their target. A connection's meaning is its **verb** +
**object** ("reads camera list"), and its verb's *class* (`dataAccess` / `messaging` / `control` /
`user` / `traceability`) decides the edge colour. Layout is automatic (dagre) and stable — the
connection filter, the audience toggle, and expanding an external never reflow the graph.

**Density.** A large container focus is mostly one node's fan-in, so **quiet hubs** is on by
default: a node with at least *N* drawn edges (default 10, set in the Connections panel) keeps its
box but drops its lines, and each line reappears as a `↳ Name` badge on the node at the other end,
carrying the same verb-class hue it had. The quieted node stays where it is, dimmed, with a
`hub ×N` chip — click the chip to bring its edges back. Nothing is hidden without a way back: the
inspector lists every connection regardless. Changing the toggle or the threshold *does* reflow,
because it changes what is drawn rather than what is shown.

**Dragging.** Drag any node to untangle a view; edges re-anchor as it moves and the container box
resizes when it lands. Positions are session-only and reset when the focus changes — **reset
layout** in the Connections panel clears them for the current view.

**Deep links.** The current view lives in the URL hash — `#node/<id>`, `#flow/<id>`,
`#pattern/<id>` — so a view survives refresh, is shareable, and the browser Back button walks the
history. A hash naming something that no longer exists rewrites to the root view.

## API (granular, validated)

`GET /model` · `POST /nodes` · `PATCH /nodes/:id` · `DELETE /nodes/:id` ·
`POST /connections` · `PATCH /connections/:id` · `DELETE /connections/:id` ·
`POST /flows` · `PATCH /flows/:id` · `DELETE /flows/:id` ·
`POST /patterns` · `PATCH /patterns/:id` · `DELETE /patterns/:id` ·
`PUT /views/:layer/positions/:nodeId` · `GET /events` (SSE).

A write that would break the model (unknown type, bad containment, dangling endpoint, a flow step or
pattern member pointing at nothing) is rejected with `422` and the specific issues. There is no
whole-model write endpoint.

## Test

    pnpm -r test

## MCP (read + write, for an agent)

The MCP server is an HTTP client of the running Hyphae server, so the server must be up:

    pnpm server                                      # terminal A — owns hyphae.json on :5173
    HYPHAE_SERVER=http://localhost:5173 pnpm mcp     # terminal B

Read tools: `describe_profile` (the active profile's node/pattern kinds, roles, verbs (with their
classes), and their documented fields — call it first), `model_overview`, `get_node`, `list_nodes`
(with an optional text `query`), `list_connections` (filters incl. `nodeId`, `verb`, and
`verbClass`), `rollup_connections` (derived higher-layer edges), `get_subgraph`, `list_flows` /
`get_flow`, `list_patterns` / `get_pattern`, `resolve_refs` (resolve a node's refs against its
anchoring `root`), `validate_model` (structural/field issues), `model_gaps` (coverage/quality gaps
— orphan components, thin/name-echoing descriptions).

Write tools: `create_nodes`, `update_nodes`, `delete_nodes`, `create_connections`,
`update_connections`, `delete_connections`, `create_flows`, `update_flows`, `delete_flows`,
`create_patterns`, `update_patterns`, `delete_patterns`.

Domain values go in a `fields` bag validated against the profile; the write tools' params are built
from the active profile. Creates take an array and **echo identity** — `{created:[{id,name},…]}` in
input order — so nothing needs a follow-up `list_nodes` to map names back to ids.

For Claude Code, `.mcp.json` registers this server (project scope) — approve it on session start,
then check `/mcp`. To build a model of a large repo top-down and resumably, use the
`building-architecture-models` skill at `skills/building-architecture-models/` (see below).

## Claude Code plugin / agent skill

The `building-architecture-models` skill lives at `skills/building-architecture-models/`, so it is
discoverable both as a standalone agent skill (`skills/<name>/SKILL.md`) and as a Claude Code plugin —
this repo is itself a plugin marketplace (`.claude-plugin/marketplace.json`) and a root plugin
(`.claude-plugin/plugin.json`).

    # add the marketplace (git URL or a local clone path), then install the plugin
    /plugin marketplace add <git-url-or-local-path-to-this-repo>
    /plugin install hyphae-modeling@hyphae

The skill drives a resumable, top-down, breadth-first build: Phase 0 discover → 1 map + GATE 1 →
2 components (Components, `codeRefs`, opportunistic Patterns, connections) → 3 reconcile,
cross-container connections, and one authored Container↔Container edge per crossing pair whose
`realizedBy` claims the component edges below it (so the container view reads as solid authored
edges, not dashed rollup counts) + GATE 2 → 4 Flows → 5 Verify. It requires a running Hyphae server
with the `hyphae` MCP connected (it checks by calling `model_overview`).

**Not yet bundled:** the `hyphae` MCP server still runs from this workspace
(`pnpm --filter @hyphae/server mcp`), not a published binary, so it is not wired into the plugin. Once
Hyphae is published, the plugin can add a `.mcp.json` that launches the server via `npx`.

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
