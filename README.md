# Hyphae

Local visual editor for a C4-style architecture model, readable **and writable** by LLM agents over MCP.
See `docs/MODEL.md` for the model concept and `docs/SPEC.md` for the product spec.

## Develop

    pnpm install
    pnpm --filter @hyphae/server dev   # API + SSE on :5173, owns ./hyphae.json
    pnpm --filter @hyphae/web dev      # editor on :3000, proxies the API

The server is the single source of truth: it holds the model in memory, validates every write,
persists `hyphae.json` atomically (debounced), and broadcasts changes over SSE so an open editor
refreshes live. Set `HYPHAE_FILE=/abs/path/hyphae.json` to choose the model file.

## Editor

**Navigation.** The canvas shows one **focus** at a time: the focused node as a labeled region with
its direct children inside, and everything else it connects to as dashed **ghost externals** beside
it. Double-click any node to drill into it (a childless one included — you get a "what touches
this?" view); the breadcrumbs walk back up. An external that stands in for a deeper node can be
**expanded** to reveal the child actually taking part. The left **outline** panel lists the whole
model — nodes by containment, then Flows and Patterns — and is collapsible; a click reveals a node
in context, a double-click drills in. Search jumps to a node by name.

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
pipeline row, a state machine laid out by its transitions, or a stacked member list); its `anchor`
and any member bound to a real node link back into the model.

**Editing.** Create / edit / delete nodes and connections. The side panel renders the core fields
plus the **profile-defined fields** for that kind generically (a node's
`responsibilities`/`invariants`/`technology`, …), a parent selector, and the
node's incoming/outgoing connections. A connection's meaning is its **verb** + **object** ("reads
camera list"), and its verb's *class* (`dataAccess` / `messaging` / `control` / `user` /
`traceability`) decides the edge colour. Layout is automatic (dagre) and stable — the connection
filter, the audience toggle, and expanding an external never reflow the graph.

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

    pnpm --filter @hyphae/server dev          # terminal A — owns hyphae.json on :5173
    HYPHAE_SERVER=http://localhost:5173 pnpm --filter @hyphae/server mcp   # terminal B

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
