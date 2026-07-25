# Phase 2 subagent prompt template

The orchestrator fills the `{{...}}` placeholders and dispatches one subagent per "drill" container (general-purpose agent, in parallel). The subagent has the `hyphae` MCP tools. The orchestrator passes a `{{REPORT_FILE}}` path under `.hyphae/reports/`. Paste everything between the rules as the subagent prompt.

---
You are modeling ONE package of a larger repo into the Hyphae model. Stay strictly within your container.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Package path: {{PACKAGE_PATH}}
Container root: {{CONTAINER_ROOT}}
Detected archetype: {{ARCHETYPE}}
Report file: {{REPORT_FILE}}

Your container declares `root: {{CONTAINER_ROOT}}`. Every `codeRef` / `docRef` you write is resolved
against it, so write refs **relative to that root** — `src/api/Client.ts`, never
`{{CONTAINER_ROOT}}src/api/Client.ts`. Do not set `root` yourself; the orchestrator owns it.

All hyphae tools use the `mcp__hyphae__` prefix (e.g. `mcp__hyphae__describe_profile`).

Steps:
0. Call `mcp__hyphae__describe_profile` first to learn the current node kinds, connection kinds, fields, and enum values.
1. Call `mcp__hyphae__model_overview` and `mcp__hyphae__list_nodes` first. Note which Components already exist under your container (match by name + parentId) — reuse them, never duplicate.
2. Analyze {{PACKAGE_PATH}} to full depth using the analysis loop for a {{ARCHETYPE}}: find its key modules/components, their responsibilities, and their dependencies.
3. **Components.** Create all your Components in one `mcp__hyphae__create_nodes` call (domain values
   in each item's `fields`), each `parentId` = {{CONTAINER_ID}}, create-or-skip by name.
   `fields.summary` is REQUIRED — one line under ~70 characters saying what the component is for; it
   is what the diagram shows. Put the long form in `description`. Set `role` only when the component
   is really a datastore, queue, or UI surface. Put other domain values (`responsibilities`,
   `invariants`, `technology`) in the `fields` bag where known — `describe_profile` (step 0) lists
   the valid keys.
3a. **codeRefs.** In that SAME `create_nodes` call, give each Component its `codeRefs` — source
   locations relative to the container's `root`. Choose them with the selectivity heuristics in
   `analysis-loop.md` ("Choosing what to ref / make a member"): ref what realizes a responsibility /
   is a public entrypoint / has high fan-in / is in a flow; skip utils, generated, tests. Prefer one
   directory or glob ref (`src/views/cctv/`, `src/views/**/*.vue`) over a long list of file refs.
   Write refs relative to the root — `src/api/Client.ts`, never `{{CONTAINER_ROOT}}src/api/Client.ts`.
3b. **Patterns (opportunistic — only if a shape already surfaced).** If, while analyzing, you saw a
   Component whose internals have a recognizable shape — a multi-stage pipeline, a request/interceptor
   chain, a state machine — author it with `mcp__hyphae__create_patterns` AFTER that Component exists.
   Do NOT go hunting for patterns; a package with none is fine. Rules (match `describe_profile` +
   the tool description): `kind` from `describe_profile.patternKinds`; each member is
   `{ name, and either nodeId OR ref OR neither }`; for `pipeline`/`middleware` the member ARRAY ORDER
   is the stage order (no order field); set `anchor` to the Component when any member uses a relative
   `ref` (the ref resolves against the anchor's root); member names must be UNIQUE within the pattern;
   for `state-machine`, members are the states (pure names) and `transitions:[{from,to,trigger?}]`
   connect them by member name. Ordered kinds render as a row; state-machine as a chart; `layered`/
   `event-bus` render as a plain member list (no bespoke shape yet), so reach for `pipeline`/
   `state-machine` when one genuinely fits.
4. Create all intra-container edges in one `mcp__hyphae__create_connections` call, ONLY when BOTH
   endpoints are your own Components. Set the connection `type`, a `verb` from the profile's verb
   vocabulary, and a short `object` noun where one applies ("reads camera list"). Do not leave the
   verb at its `uses` default when a specific verb fits. Put `transport` in the `fields` bag.
5. On any `422`, read the returned `issues` and fix the input; never blind-retry.
6. Before returning, **self-review**: re-read each component you wrote. If its `description` / `responsibilities` / `invariants` assert a relationship to another of YOUR components — phrases like "implements", "depends on", "used by", "built on", "all others depend on it" — make sure a matching connection exists, and add any that are missing. Then check for any of your components left with **zero connections**: either wire it, or list it under `standaloneComponents` with a reason.

You MUST NOT: create the Container itself, create nodes under any other container, create ExternalSystem nodes, or create cross-package connections. Report those instead.

For every cross-package dependency, name the **target's container** (`toContainer`) as well as the target node name. Component names repeat across containers (e.g. several packages each have a `Contracts`), so a bare name is ambiguous — the orchestrator resolves the endpoint by (container, name). Include a `verb` from the profile's verb vocabulary (plus a short `object` noun where one applies) so the orchestrator does not fall back to the `uses` default when it creates the edge.

**Write this JSON report to `{{REPORT_FILE}}`** (create parent dirs):

{
  "container": "{{CONTAINER_NAME}}",
  "componentsWritten": [ { "name": "...", "id": "..." } ],
  "patternsWritten": [ { "name": "...", "kind": "...", "anchor": "<component name>" } ],
  "standaloneComponents": [ { "name": "...", "why": "deliberately has no connections because ..." } ],
  "crossPackageDeps": [
    { "from": "<your component name>",
      "toContainer": "<the container/package that owns the target, or \"external\" for an external system>",
      "to": "<target node name within that container (or the external system name)>",
      "type": "Dependency|DataFlow|Realization|Trace", "transport": "Sync|Async|InProcess|None",
      "verb": "<verb id from describe_profile, e.g. reads|writes|invokes|publishes>", "object": "<short noun, optional>", "why": "..." }
  ],
  "upwardFindings": {
    "ownContainer": [ "new responsibility / invariant / tech correction for this container" ],
    "system": [ "amendment to the System node" ],
    "siblingContainers": [ { "container": "<name>", "amendment": "..." } ],
    "newExternalSystems": [ { "name": "...", "description": "...", "interaction": "..." } ]
  }
}

Then return ONLY `{ "status": "done", "reportPath": "{{REPORT_FILE}}", "counts": { "components": N, "crossPackageDeps": N } }` — do NOT paste the full report into your reply.
---
