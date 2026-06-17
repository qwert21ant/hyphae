# Hyphae

Local visual editor for a C4-style architecture model, readable **and writable** by LLM agents over MCP.
See `docs/MODEL_RU.md` for the model concept and `docs/SPEC_RU.md` for the product spec.

## Develop

    pnpm install
    pnpm --filter @hyphae/server dev   # API + SSE on :5173, owns ./hyphae.json
    pnpm --filter @hyphae/web dev      # editor on :3000, proxies the API

The server is the single source of truth: it holds the model in memory, validates every write,
persists `hyphae.json` atomically (debounced), and broadcasts changes over SSE so an open editor
refreshes live. Set `HYPHAE_FILE=/abs/path/hyphae.json` to choose the model file.

## Editor

- Layer is a dropdown filter (Context / Container / Component), not zoom drill-down.
- Nodes and connections: create / edit / delete / drag. The side panel edits all node fields
  (including the LLM semantics — `responsibilities`, `invariants`, `assumptions`, `failureModes`)
  and, for a selected edge, the connection's `relationCategory` / `transport` / `direction` /
  `intent` / `description`.
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

Read tools: `get_text_context`, `get_node`, `list_nodes`, `search_nodes`, `find_connections`, `get_subgraph`.
Write tools: `create_node`, `update_node`, `delete_node`, `create_connection`, `update_connection`, `delete_connection`.

For Claude Code, `.mcp.json` registers this server (project scope) — approve it on session start,
then check `/mcp`. A ready-made "analyze this repo and build its model" prompt lives in
`docs/prompts/analyze-and-model.md`.

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
