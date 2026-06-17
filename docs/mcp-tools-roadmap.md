# MCP tools roadmap

Planned additions to the `hyphae` MCP surface, prioritized by impact for an LLM consuming a large
model vs. implementation cost. **Update the Status column as tools land.**

Architectural note: the MCP **read** tools run entirely client-side over `api.getModel()` (each call
fetches the whole model, then filters in `buildTools` in `apps/server/src/mcp.ts`). So new *read*
tools need **no server/route/schema changes** — just a `buildTools` handler + a `server.tool(...)`
registration. **Write** tools go through the existing routes → `ModelStore` → `validate` path.

Status legend: ✅ done · 🚧 in progress · ⬜ planned.

## Existing tools
`get_text_context`, `get_node`, `list_nodes`, `search_nodes`, `find_connections`, `get_subgraph` (read);
`create_node`, `update_node`, `delete_node`, `create_connection`, `update_connection`, `delete_connection` (write).

## Tier 1 — highest impact, low cost

| Status | Tool | What it does | LLM impact | Complexity |
|:------:|------|--------------|-----------|------------|
| ✅ | `search_nodes(query, {type?, parentId?, fields?, limit})` | Text match across name/description/responsibilities/etc. | Very high — the missing entry point; locate a node without dumping everything | Low — pure filter over `getModel()`, no route change |
| ✅ | `get_subgraph(nodeId, {depth, direction?, relationCategory?})` | BFS neighborhood to N hops; returns local nodes + edges | Very high — core "explore around X" primitive | Low–Med — BFS over `connections`, client-side |
| ✅ | `list_nodes` + filters/pagination (`{parentId?, type?, limit, offset}`) | Scoped enumeration ("components of container X") | High — avoids the full node dump | Trivial–Low — extend existing handler |
| ✅ | `get_text_context` summary/scope mode (`{mode:'summary'\|'full', layer?, root?:nodeId, fields?}`) | Compact render and/or subtree scope; default summary, full when `root` set | Very high — fixes the >100 KB problem | Low–Med — extend `getContext()` in `context.ts` |
| ✅ | `update_connection(id, patch)` | Edit an edge's category/transport/intent/description/direction | Medium — today you must delete+recreate | Trivial — store + `PATCH /connections/:id` already exist; only the MCP wrapper is missing |

## Tier 2 — high impact, a bit more work

| Status | Tool | What it does | LLM impact | Complexity |
|:------:|------|--------------|-----------|------------|
| ⬜ | `list_connections({relationCategory?, transport?, containerId?, crossingBoundary?, involvingExternal?})` | Query edges, incl. boundary-crossing | High — dependency analysis + feeds roll-up | Low–Med — filter; `crossingBoundary` needs parent lookup |
| ⬜ | `get_rollup_connections(layer)` | Derives Component↔Component-across-containers ⇒ Container↔Container (and →External at context) | High — makes higher layers meaningful (B6) | Med — aggregation; shared with the UI roll-up feature |
| ⬜ | `model_stats()` | Counts per type/layer/container, edge-category histogram, orphan count | Medium — cheap orientation before drilling | Low — reductions over the model |

## Tier 3 — useful, lower priority

| Status | Tool | What it does | LLM impact | Complexity |
|:------:|------|--------------|-----------|------------|
| ⬜ | `find_orphans()` / consistency report | Zero-connection nodes, dangling refs, "hub claims dependence but has no edges" | Medium — powers the skill's Phase 5 Verify + model QA | Low–Med — overlaps `validate.ts` |
| ⬜ | `get_path(fromId, toId, {maxDepth})` | Does A reach B, and how | Medium — impact tracing | Med — BFS pathfinding |
| ⬜ | `create_nodes([...])` / `create_connections([...])` (batch) | One call instead of N | Medium — fewer round-trips, speeds the skill | Med — batch route or client loop; partial-failure semantics |
| ⬜ | `get_ancestors(nodeId)` / breadcrumb | Parent chain to System | Low — situational | Trivial — or fold into `get_node` |

## Notes
- These assume the MCP keeps fetching the full model per call (fine locally). To scale to a much
  bigger model, filtering could move server-side behind query endpoints — a later optimization.
- `get_rollup_connections` aggregation should be written once and reused by the UI cross-layer view.
