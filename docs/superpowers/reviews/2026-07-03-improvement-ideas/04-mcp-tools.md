# Axis 4 — MCP tools

Scope: the tool surface in `apps/server/src/mcp.ts` (`buildTools` handlers + registrations), backed by
`packages/schema` (`overview.ts`, `rollup.ts`, `validate.ts`, `profile.ts`, `profiles/c4-backend.ts`),
the HTTP routes (`apps/server/src/routes.ts`, `errors.ts`), and how the skill
(`plugins/hyphae-modeling/skills/building-architecture-models/`) tells the LLM which tool to use when.

Read surface (8): `model_overview`, `get_node`, `list_nodes`, `search_nodes`, `find_connections`,
`list_connections`, `get_subgraph`, `describe_profile`.
Write surface (6): `create_nodes`, `create_connections`, `update_nodes`, `update_connections`,
`delete_nodes`, `delete_connections`.

The batch/best-effort write design (from the 2026-06-26 efficiency work) is sound and out of scope for
change here — the `{ids}` / `{ok}` / `{results:[{id}|{issues}|{error}]}` contract is consistent and the
"read grew to 370k, never reset" cost problem it targeted is a real driver. This axis is about the
**read** surface's clarity and redundancy, plus completeness gaps the Verify/idempotency phases pay for
in tokens today.

---

## Tool overlap matrix

| Pair / trio | What actually overlaps | What is distinct | Verdict |
|---|---|---|---|
| **`find_connections` vs `list_connections`** | Both return "connections touching X". `find_connections({nodeId})` = `connections.filter(c => c.from===id \|\| c.to===id)`. `list_connections` has no single-node filter — the nearest is `containerId` (whole subtree). | `find_connections` returns the **raw** connection objects (all fields incl. `realizedBy`, `codeRefs`). `list_connections` returns an **enriched projection** (`fromName/toName/fromContainer/toContainer`, drops `realizedBy`/`codeRefs`) plus 7 filters, pagination, and a `rollup` mode. Neither is a strict subset — `list_connections` simply lacks a per-node filter. | **Merge:** add a `nodeId` filter to `list_connections`, drop `find_connections`. The only thing the skill uses `find_connections` for ("inspect a single node's edges", SKILL.md L107) becomes `list_connections({nodeId})`. Low effort. |
| **`search_nodes` vs `list_nodes`** | Both take `type` + `parentId` and return node summaries with `id/name/type/parentId`. | `search_nodes` **requires** a `query` (substring over name/description/technology/responsibilities/invariants), returns extra `parent` name + `description`, has `limit` (default 25) but **no `offset`**. `list_nodes` is the cheap enumerate/paginate primitive (leaner rows, `offset`+`limit`), no text query. | **Keep both** (fuzzy but justified): `list_nodes` = enumerate/paginate children of one parent; `search_nodes` = text finder with disambiguating parent name. Optional consolidation noted below. |
| **`get_subgraph` vs `list_nodes` / `find_connections`** | `get_subgraph({nodeId, containment:'down', depth:1})` on a Container returns its child Components (like `list_nodes({parentId})`) plus the edges among reached nodes (like `find_connections`). | `get_subgraph` is the **only** tool that returns nodes **and** edges together, and the only one that does multi-hop BFS mixing connection edges and containment. It **cannot** be reduced to a pure "list children" — there is no way to disable connection traversal (`containment:'none'` exists but there is no connection `'none'`; `direction` defaults to `both`). | **Keep** `get_subgraph`. The overlap is acceptable: `list_nodes`/`find_connections` are cheaper single-purpose primitives; `get_subgraph` is the neighborhood explorer. |

Bottom line on the three flagged items: one real redundancy (`find_connections`), one fuzzy-but-keep
pair (`search_nodes`/`list_nodes`), one non-redundant general tool (`get_subgraph`).

---

## Ideas — Consolidate / remove

### 1. Fold `find_connections` into `list_connections` as a `nodeId` filter
- **What:** Add `nodeId?: string` to `list_connections` (keep only edges where `from===nodeId || to===nodeId`,
  AND-combined with the other filters). Remove the `find_connections` tool. Update SKILL.md L107 from "Use
  `find_connections` only to inspect a single node's edges" to `list_connections({nodeId})`.
- **Why:** `find_connections` is a one-line filter that the enriched `list_connections` already almost
  subsumes; the surface currently needs a *skill rule* to tell the two apart, which is itself evidence they
  read as interchangeable. One fewer tool, one fewer disambiguation rule, and single-node queries gain the
  `fromName/toName/fromContainer/toContainer` enrichment for free.
- **Effort:** S.
- **Tradeoffs/risks:** The enriched projection drops `realizedBy` and `codeRefs`, which `find_connections`
  currently returns raw. If any caller needs those for a single node (e.g. inspecting bindings), either add
  them to the projection or expose a `raw:true` flag. Low risk — the skill's single-node use is inspection,
  not binding.
- **Where:** `find_connections` handler `mcp.ts:80`; `list_connections` handler `mcp.ts:82-153`; filter
  block `mcp.ts:132-142`; registration `mcp.ts:292`.

### 2. Split `rollup` out of `list_connections` into its own tool
- **What:** Extract a `rollup_connections({ layer:'Container'|'Context', limit?, offset? })` tool from the
  `if (rollup) {…}` branch (`mcp.ts:85-99`). Leave `list_connections` as pure raw-edge querying.
- **Why:** `rollup` is a **mode flag that silently disables every other filter** — the description has to
  warn "(the other filters do not apply in rollup mode)" / "Other filters are ignored in this mode"
  (`mcp.ts:296,303`). That is exactly the "excess rule / a param changes the tool's meaning" smell the user
  flagged. An LLM will plausibly pass `containerId` + `rollup` expecting a scoped rollup and get an
  unfiltered result. Two tools with disjoint params are each self-explanatory. Return shapes already differ
  completely (`{from,to,fromName,toName,realizedBy[]}` vs the raw enriched edge), so they were never really
  "the same" call.
- **Effort:** S–M (new registration + move the branch; `rollupConnections` in `rollup.ts` is untouched).
- **Tradeoffs/risks:** One more tool in the surface (mild). Net cognitive load drops because each tool's
  params are now all meaningful together.
- **Where:** `list_connections` rollup branch `mcp.ts:85-99`; the two caveat strings `mcp.ts:296` and
  `mcp.ts:303`.

### 3. (Optional) Merge `search_nodes` into `list_nodes` by making `query` optional
- **What:** Make `query` optional on `search_nodes` (no query ⇒ pure filter+paginate), add `offset`, and
  retire `list_nodes`; or equivalently add `query?`/`fields?`/`verbose?` to `list_nodes`. One `find_nodes`
  primitive.
- **Why:** They share `type`+`parentId` and both return summaries; the only hard differences are "query
  required" and "leaner vs richer rows". A single tool removes a genuine which-one decision.
- **Effort:** S.
- **Tradeoffs/risks:** Weakest of the consolidations — I lean **keep both**. `list_nodes` returns
  deliberately leaner rows (cheaper tokens on large enumerations like "all 192 Class nodes") and has
  `offset`; `search_nodes` adds `parent`+`description` for disambiguation. Merging forces one return shape
  and one param set to serve both the "enumerate 200 children cheaply" and "find by text with context"
  jobs. Only do this if the surface-count reduction is valued over per-call token leanness.
- **Where:** `list_nodes` `mcp.ts:55-62`; `search_nodes` `mcp.ts:63-79`.

---

## Ideas — Add

### 4. `create_nodes` / `create_connections` create-or-skip (upsert) to kill mandatory read-before-write
- **What:** Add an `onConflict?: 'skip' | 'error'` (default keep current `'error'`) to the batch create
  tools, keyed by node identity **(`name` + `parentId`)** and connection identity **(`from`+`to`+`type`)**.
  On `'skip'`, the handler resolves an existing match to its id and returns it in the `ids`/`results`
  array instead of failing. The handler already re-reads the whole model per call (`api.getModel()`), so
  the dedupe happens **inside `mcp.ts`** — no new HTTP endpoint.
- **Why:** This is the single biggest efficiency gap. The skill's idempotency contract mandates
  "**Read first** … **Create-or-skip by (`name` + `parentId`)**" (SKILL.md L110-112) and every Phase 2/4
  subagent must `list_nodes` then dedupe by name+parentId **by hand** before every `create_nodes`
  (subagent-prompt.md L17, L63). That read-and-reason-then-write loop is pure overhead the tool could
  absorb. It directly attacks the same "read-before-write cost" the 2026-06-26 spec set out to reduce but
  didn't finish for creates.
- **Effort:** M (identity matching + result plumbing in `runCreate`; the whole-model read is already there).
- **Tradeoffs/risks:** Identity key must match the skill's contract exactly or you get silent duplicates /
  silent skips. `'error'` stays default so nothing changes for callers who don't opt in. Connection
  identity by (from,to,type) may over-merge legitimately parallel edges — document it and keep it opt-in.
- **Where:** `runCreate` `mcp.ts:21-35`; `create_nodes`/`create_connections` handlers `mcp.ts:194-195`;
  registrations `mcp.ts:333-349`.

### 5. `validate_model` read tool (structural issues, for Phase 5 Verify)
- **What:** Expose `validateModel(model, profile)` — already implemented and exported from
  `packages/schema/src/validate.ts:57` — as a no-input read tool returning `Issue[]`
  (`{kind, ref, message}`), the same shape writes already surface as `{issues}`.
- **Why:** The Verify phase (SKILL.md Phase 5) and the "check the whole model is consistent" job have **no
  read tool** today — the LLM has to dump nodes+connections and re-derive validity in-context, or discover
  problems only when a write 422s. The logic (bad-parent, dangling-endpoint, bad-endpoint, bad-field-type,
  bad-enum-value, missing-required-field, bad-ref, …) is done and unit-testable; wiring it is trivial and
  the store already calls `newIssues`/`validateModel` on every mutation (`store.ts:95`).
- **Effort:** S.
- **Tradeoffs/risks:** `validateModel` covers **structural/field** issues, **not** the semantic "orphan /
  unbound edge" checks Phase 5 also wants (see idea 6) — name it so the LLM doesn't assume it finds
  orphans. Bounded output on a healthy model (empty array); could be large on a broken one (fine, it's the
  point).
- **Where:** new handler in `buildTools`; import `validateModel` + `resolveProfile` from `@hyphae/schema`;
  register alongside the other reads near `mcp.ts:373`.

### 6. `coverage` / `find_orphans` read tool for the Phase 5 sweep
- **What:** A read tool that returns, server-side: Components with **zero connections** (orphans), and
  cross-component code edges whose id is in **no** Component↔Component `realizedBy` (unbound edges) — the
  exact two things SKILL.md Phase 5 step 1 computes by hand.
- **Why:** Today the sweep pulls "every edge with endpoint/container names, plus `list_nodes`" and the LLM
  reasons over the whole set to find orphans/unbound edges (SKILL.md L100-102). On the 404-node / 567-edge
  cctv model that is a large read + a lot of in-context reasoning every Verify run. A dozen-line
  server-side computation returns just the flags.
- **Effort:** M (small pure function in schema, unit-tested; one handler).
- **Tradeoffs/risks:** Encodes a c4-specific policy (what counts as an orphan) — keep it profile-aware and
  simple; the skill already has to hand-separate "real gap" from "legitimately standalone", so the tool
  should flag candidates, not auto-fix. Related to the configurable-profiles goal (don't hardcode
  'Component').
- **Where:** new schema helper + handler; feeds SKILL.md Phase 5 step 1.

### 7. `get_node({ id, withConnections?: true })` — node body **with** its edges in one call
- **What:** Let `get_node` optionally include the node's touching connections (enriched, like idea 1's
  projection). Currently `get_node` returns just the node (`mcp.ts:53`) and `get_subgraph` returns neighbor
  **summaries** but *not the root's full body* (it `.map`s everything to `{id,name,type,parentId}`,
  `mcp.ts:190`).
- **Why:** "Give me this node's full description/fields **and** what it connects to" is a common
  single-intent question with **no** one-call answer today (get_node = body only; find_connections = edges
  only; get_subgraph = summaries only, root body lost). It's a round-trip the LLM pays constantly.
- **Effort:** S.
- **Tradeoffs/risks:** Minor shape growth; keep it opt-in so plain `get_node` stays lean.
- **Where:** `get_node` handler `mcp.ts:53`, registration `mcp.ts:275`.

### 8. (Lower) `path_between({from, to, maxDepth?})`
- **What:** Return a shortest connection/containment path between two nodes.
- **Why:** "How does A reach B?" currently means iterated `get_subgraph` calls and manual stitching. Nice
  for tracing flows during Verify/analysis.
- **Effort:** M. **Tradeoffs:** lowest demand of the adds; skip unless flow-tracing becomes a real use.
- **Where:** new handler reusing the BFS in `get_subgraph` `mcp.ts:170-184`.

---

## Ideas — Clarify descriptions & consistency

### 9. Make read tools return errors consistently for a missing node
- **What:** Unify "node not found" handling. Today: `get_node` returns **`null`** (`mcp.ts:53`),
  `get_subgraph` returns **`{error: 'node X not found'}`** (`mcp.ts:156`), and `find_connections` returns
  **`[]`** silently for a nonexistent id (`mcp.ts:80`, no existence check). Three different signals for the
  same condition.
- **Why:** An LLM can't tell "node has no edges" from "node doesn't exist" on `find_connections`, and has to
  special-case each tool. Pick one (e.g. `{error}` for a bad id everywhere; `[]`/`null` only for genuinely
  empty results).
- **Effort:** S. **Where:** `mcp.ts:53, 80, 156`.

### 10. Tighten `get_node` / `find_connections` descriptions to say what they *exclude*
- **What:** `get_node` "Get one node by id." → note it returns the node body **only** (no edges; use
  `get_subgraph`/`list_connections({nodeId})` for wiring). If ideas 1/7 land, this resolves itself.
- **Why:** Terse descriptions invite the LLM to expect edges from `get_node` or a node body from
  `find_connections`. The richer tools (`model_overview`, `list_connections`, `get_subgraph`) already model
  good "use me when…" descriptions; the two one-liners are the weak spots.
- **Effort:** S. **Where:** `mcp.ts:275, 292`.

### 11. Expose `describe_profile` as an MCP **resource** (in addition to / instead of a tool)
- **What:** Register the active profile as an MCP resource (e.g. `hyphae://profile`). `describe_profile`
  returns the **static** `c4Backend` object verbatim (`mcp.ts:202`) — it never changes during a session,
  yet SKILL.md and both subagent prompts instruct **every** agent to call it first (SKILL.md L52,
  subagent-prompt.md L16, L63).
- **Why:** A resource is fetched/cached by the client once instead of re-issued as a tool round-trip per
  subagent, reducing chatter for content that is constant. Fits the efficiency spec's spirit.
- **Effort:** M (SDK `registerResource`; keep the tool too for clients with weak resource support).
- **Tradeoffs/risks:** MCP resource support is uneven across clients, and Claude Code subagents may not
  auto-load resources — keep `describe_profile` as a tool fallback. `model_overview` is **not** a good
  resource candidate (it's dynamic; it must reflect writes). **Where:** `describe_profile` `mcp.ts:202,373`.

### 12. Note the `list_connections` filter cluster in its description
- **What:** `crossingBoundary`, `involvingExternal`, and `containerId` are all boundary/scope concepts and
  read as overlapping. The description is already long; a one-line "pick `containerId` to scope,
  `crossingBoundary`/`involvingExternal` to classify" would cut mis-selection. (If idea 2 lands, this stays
  in the slimmed `list_connections`.)
- **Effort:** S. **Where:** `mcp.ts:296-302`.

---

## Keep as-is

- **The 6 batch write tools + `{ids}`/`{ok}`/`{results}` contract** — consistent, best-effort ordering is
  correct, `version` omission is deliberate and right (`mcp.ts:194-201, 333-371`). Only add-on is idea 4
  (upsert), not a rewrite.
- **`model_overview`** — bounded, size-independent, "call FIRST" description with an explicit drill-down
  list; exactly the orientation read the efficiency spec wanted (`overview.ts`, `mcp.ts:267-274`).
- **`get_subgraph`** — non-redundant; the only nodes+edges traversal. Params (`depth/direction/type/
  containment`) each carry distinct meaning; description gives concrete "Container ⇒ its Components"
  guidance (`mcp.ts:154-193, 310-323`).
- **`list_nodes`** — the cheap enumerate/paginate primitive; keep even if `search_nodes` stays
  (`mcp.ts:55-62, 276-283`).
- **`rollupConnections` core** in `rollup.ts` — clean, pure, `realizedBy`-aware (bound edges excluded);
  idea 2 only relocates its *tool wrapper*, not this logic.
- **`describe_profile`'s content** — the right payload; idea 11 only changes the transport, not the data.
