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

- Layer is a dropdown filter (Context / Container / Component). Double-click a node to drill into
  the layer of its children; each layer keeps its own pan/zoom (persisted).
- Nodes and connections: create / edit / delete / drag. The side panel renders the core fields plus
  the **profile-defined fields** for that node/connection kind generically (a node's
  `responsibilities`/`invariants`/`technology`, an edge's `transport`/`intent`, …). A connection's
  kind is its `type` (`Dependency` / `DataFlow` / `Realization` / `Trace`).
- Edges attach to the nearest point on each node (floating edges). Selecting a node/edge highlights
  it and its neighbors. The connection filter panel (kind + transport) is generated from the profile.
- Higher layers show **derived cross-layer edges** (rolled up from component connections, drawn
  dashed) and drop in higher-layer endpoints (e.g. an external system) as ghost nodes.
- Containment (`parentId`) is drawn as labeled regions; drag a region's title bar to move its
  contents together, or set a node's parent from the side panel.

## API (granular, validated)

`GET /model` · `POST /nodes` · `PATCH /nodes/:id` · `DELETE /nodes/:id` ·
`POST /connections` · `PATCH /connections/:id` · `DELETE /connections/:id` ·
`PUT /views/:layer/positions/:nodeId` · `GET /events` (SSE).

A write that would break the model (unknown type, bad containment, dangling endpoint) is rejected
with `422` and the specific issues. There is no whole-model write endpoint.

## Test

    pnpm -r test

## MCP (read + write, for an agent)

The MCP server is an HTTP client of the running Hyphae server, so the server must be up:

    pnpm --filter @hyphae/server dev          # terminal A — owns hyphae.json on :5173
    HYPHAE_SERVER=http://localhost:5173 pnpm --filter @hyphae/server mcp   # terminal B

Read tools: `describe_profile` (the active profile's node/connection kinds and their documented
fields — call it first), `model_overview`, `get_node`, `list_nodes` (with an optional text `query`),
`list_connections` (incl. a `nodeId` filter for one node's edges), `rollup_connections` (derived
higher-layer edges), `get_subgraph`, `validate_model` (structural/field issues), `model_gaps`
(coverage/quality gaps — orphan components, unbound code edges, thin/name-echoing descriptions).
Write tools: `create_nodes`, `update_nodes`, `delete_nodes`, `create_connections`, `update_connections`, `delete_connections`.
Domain values go in a `fields` bag validated against the profile; the write tools' params are built
from the active profile.

For Claude Code, `.mcp.json` registers this server (project scope) — approve it on session start,
then check `/mcp`. To build a model of a large repo top-down and resumably, use the
`building-architecture-models` skill bundled in the `hyphae-modeling` plugin
(`plugins/hyphae-modeling/`).

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
