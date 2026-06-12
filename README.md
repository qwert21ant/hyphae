# Hyphae

Local visual editor for a C4-style architecture model, readable by LLM agents over MCP.
See `docs/MVP_RU.md` for the thin-slice scope, `docs/MODEL_RU.md` for the model concept.

## Develop

    pnpm install
    pnpm --filter @hyphae/server dev   # API on :5173, writes ./hyphae.json
    pnpm --filter @hyphae/web dev      # UI on :3000, proxies /model

## Test

    pnpm -r test

## MCP (read + write, for an agent)

The MCP server is an HTTP client of the running Hyphae server, so the server must be up:

    pnpm --filter @hyphae/server dev          # terminal A — owns hyphae.json on :5173
    HYPHAE_SERVER=http://localhost:5173 pnpm --filter @hyphae/server mcp   # terminal B

Read tools: `get_text_context`, `get_node`, `list_nodes`, `find_connections`.
Write tools: `create_node`, `update_node`, `delete_node`, `create_connection`, `delete_connection`.

All edits go through the server's granular, validated endpoints (strict — a write that would
break the model is rejected with the specific issues). The web editor subscribes to `/events`
(SSE) and shows the agent's changes live.

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
