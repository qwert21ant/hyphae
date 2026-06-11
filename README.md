# Hyphae

Local visual editor for a C4-style architecture model, readable by LLM agents over MCP.
See `docs/MVP_RU.md` for the thin-slice scope, `docs/MODEL_RU.md` for the model concept.

## Develop

    pnpm install
    pnpm --filter @hyphae/server dev   # API on :5173, writes ./hyphae.json
    pnpm --filter @hyphae/web dev      # UI on :3000, proxies /model

## Test

    pnpm -r test

## MCP (read-only, for an agent)

    HYPHAE_FILE=/abs/path/to/hyphae.json pnpm --filter @hyphae/server mcp

Tools: `get_text_context`, `get_node`, `list_nodes`, `find_connections`.

## Production

    pnpm --filter @hyphae/web build
    PORT=5173 pnpm --filter @hyphae/server start   # serves API + built SPA
