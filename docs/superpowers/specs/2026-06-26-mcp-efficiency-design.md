# MCP efficiency + skill cost reduction — design

A token-cost transcript analysis of a full `building-architecture-models` run (gccp-cctv) showed the
orchestrator session billed ~71M tokens, ~98% of it **context-carrying** (cache read+write), driven by
hundreds of one-at-a-time write round-trips at a context that grew to ~370k and never reset. This spec
attacks that at the tool layer (batch writes, trimmed responses, a bounded overview read) and at the
skill layer (use the new tools, reset context between phases, persist reports to files).

## Goals

- Collapse many single-write round-trips into a few batch calls.
- Stop write tools from echoing full DTOs back into the model context.
- Replace the unbounded `get_text_context` with a small, size-independent orientation read.
- Update the skill to use all of the above, reset/compact context between phases, and hand off
  subagent reports via files rather than carrying them in context.

## Non-goals

- A transactional (all-or-nothing) batch endpoint — batch is best-effort (see below).
- New HTTP server endpoints — batch MCP tools loop the existing single-item HTTP API.
- Changing the web editor (it uses the HTTP API directly; MCP response shape doesn't affect it).
- Maintaining `docs/HANDOFF.md` or `docs/mcp-tools-roadmap.md` — no longer updated (left untouched).

## MCP tool changes (`apps/server/src/mcp.ts`, `buildTools`)

### Write tools — all batch, no singles
Remove the six single write tools (`create_node`, `create_connection`, `update_node`,
`update_connection`, `delete_node`, `delete_connection`). Replace with six batch tools. Each loops the
existing HTTP API (`/nodes`, `/connections`, …) once per item — **one LLM round-trip, N cheap server
calls, no new server endpoints** — and is **best-effort**: it processes items in input order, continues
past a failed item, and preserves index alignment.

| Tool | Input | Full-success result | Any-failure result |
|------|-------|---------------------|--------------------|
| `create_nodes` | `{ nodes: [ {name, type, parentId?, description?, codeRefs?, docRefs?, fields?}, … ] }` | `{ ids: [id, …] }` (input order) | `{ results: [ {id} \| {issues}, … ] }` |
| `create_connections` | `{ connections: [ {from, to, type, description?, direction?, realizedBy?, fields?}, … ] }` | `{ ids: [id, …] }` | `{ results: [ {id} \| {issues}, … ] }` |
| `update_nodes` | `{ updates: [ {id, …patch}, … ] }` | `{ ok: true }` | `{ results: [ {ok} \| {issues}, … ] }` |
| `update_connections` | `{ updates: [ {id, …patch}, … ] }` | `{ ok: true }` | `{ results: [ {ok} \| {issues}, … ] }` |
| `delete_nodes` | `{ ids: [id, …] }` | `{ ok: true }` | `{ results: [ {ok} \| {issues\|error}, … ] }` |
| `delete_connections` | `{ ids: [id, …] }` | `{ ok: true }` | `{ results: [ {ok} \| {issues\|error}, … ] }` |

- A one-off write is a one-element array.
- Per-item `{issues}` is the server's `422` issues body for that item; `{error}` is a not-found on delete.
- **`version` is never returned** (the MCP client doesn't use it; the web tracks version via SSE).
- Item field schemas reuse the current per-kind generation (`fieldsShape`, the dynamic `type` enum, the
  `realizedBy` field, the core node/connection fields).

### Reads — replace `get_text_context` with `model_overview`
- **Remove** the `get_text_context` MCP tool, the `getContext` renderer, `packages/schema/src/context.ts`,
  and `packages/schema/test/context.test.ts` (all become dead once the tool is gone; the web does not use
  `getContext`).
- **Add `model_overview`** (no inputs). Renderer lives in schema (replace `context.ts` with a
  `modelOverview(model): string`, unit-tested there). Output is **bounded regardless of model size**:
  - model name + description,
  - **counts per layer** and **per node kind**, and total connection count,
  - the **System and Container nodes only** (id, name, one-line description).
  Everything below Container is reached with the existing bounded readers (`list_nodes` by `parentId`,
  `get_subgraph`, `list_connections`, `search_nodes`, `get_node`, `describe_profile`).
- Unchanged read tools: `get_node`, `list_nodes`, `search_nodes`, `find_connections`,
  `list_connections`, `get_subgraph`, `describe_profile`.

### Net tool delta
Removed (8): `get_text_context`, `create_node`, `create_connection`, `update_node`,
`update_connection`, `delete_node`, `delete_connection`. Added (7): `model_overview`, `create_nodes`,
`create_connections`, `update_nodes`, `update_connections`, `delete_nodes`, `delete_connections`.

## Skill changes (`plugins/hyphae-modeling/...` + installed `~/.claude/skills/` copy)

### Working directory → `.hyphae/`
All skill process files move from `docs/hyphae/` to **`.hyphae/`** in the target repo:
- plan artifact: `.hyphae/model-plan.md`
- subagent reports: `.hyphae/reports/phase2-<container>.json`, `.hyphae/reports/phase4-<container>.json`
Update `plan-artifact-template.md` and every path reference.

### Use the new tools
- **Orientation:** "call `model_overview` first, then drill with `list_nodes`/`get_subgraph`" — replaces
  every `get_text_context` reference (Overview, Prerequisites, Phase 1/3/4 reads, Phase 5 sweep,
  idempotency contract, both subagent prompts).
- **Batch writes:** multi-write steps use the batch tools. A Phase 2 subagent creates all its Components
  in one `create_nodes`, then all intra-container edges in one `create_connections`. GATE 3 applies
  cross-edges with `create_connections` and binding with `update_connections`. Phase 1 creates System +
  all Containers with one `create_nodes`.
- **Tool-name prefix:** state that hyphae tools are invoked as `mcp__hyphae__<name>` (e.g.
  `mcp__hyphae__describe_profile`) — fixes subagents calling bare `describe_profile`.

### Lean orchestrator + inter-phase context reset
- Add explicit guidance: the orchestrator **compacts/clears context between phases** and re-reads state
  via `model_overview` (+ scoped reads). The skill is already resumable (server is the source of truth),
  so nothing is lost. Rationale captured: cost ≈ turns × context size; a 300k+ context carried across
  ~150 turns dominated the measured cost.
- Orchestrator applies GATE-3 writes as batches, never one call per edge.

### Reports to files (not returned inline)
- Subagents **write their JSON report to the file path the orchestrator provides** (`.hyphae/reports/…`)
  and return only a short status + the path (not the full report).
- The orchestrator **reads reports from files at the GATEs**; because they live on disk they survive an
  inter-phase context reset.
- Update both templates in `subagent-prompt.md` (Phase 2 and Phase 4): replace "Return ONLY this JSON
  report" with "write this JSON to `<REPORT_FILE>` and return only `{status, reportPath, counts}`".

## Tests

- **schema:** `modelOverview(model)` — counts per layer/kind, System/Container listing, bounded output;
  remove `context.test.ts`.
- **server (`apps/server/test/mcp.test.ts`):** for each batch tool, full-success shape (`{ids}` /
  `{ok}`) and partial-failure shape (`{results}` with an aligned `{issues}` item); best-effort ordering
  (a failing item does not stop later items); a one-element array returns the same shapes (no `version`
  leakage). Update/remove fixtures that called the removed single tools / `get_text_context`.
- Full monorepo `pnpm -r test` green; `tsc` clean for schema/server/web; web build OK.

## Risks / notes

- Removing single tools is a breaking change to the MCP surface, but the only consumer is the LLM via the
  skill, which is updated in lockstep. The web is unaffected (HTTP API unchanged).
- Best-effort batch means a partial failure returns `results`; callers must check per-index, exactly as
  they do for a single `422` today.
- `model_overview` assumes the System/Container count stays small (it does — one System, one Container
  per package). Components/Code are never dumped by it.
