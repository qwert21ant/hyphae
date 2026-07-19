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
3. Create all your Components in one `mcp__hyphae__create_nodes` call (domain values in each item's `fields`), each `parentId` = {{CONTAINER_ID}}, create-or-skip by name. `fields.summary`
   is REQUIRED — one line under ~70 characters saying what the component is for; it is what the
   diagram shows. Put the long form in `description`. Set `role` only when the component is
   really a datastore, queue, or UI surface. Put other domain values (`responsibilities`, `invariants`, `technology`) in the `fields` bag where known — `describe_profile` (step 0) lists the valid keys.
4. Create all intra-container edges in one `mcp__hyphae__create_connections` call, ONLY when BOTH
   endpoints are your own Components. Set the connection `type`, a `verb` from the profile's verb
   vocabulary, and a short `object` noun where one applies ("reads camera list"). Do not leave the
   verb at its `uses` default when a specific verb fits. Put `transport` in the `fields` bag.
   There is no `intent` field any more.
5. On any `422`, read the returned `issues` and fix the input; never blind-retry.
6. Before returning, **self-review**: re-read each component you wrote. If its `description` / `responsibilities` / `invariants` assert a relationship to another of YOUR components — phrases like "implements", "depends on", "used by", "built on", "all others depend on it" — make sure a matching connection exists, and add any that are missing. Then check for any of your components left with **zero connections**: either wire it, or list it under `standaloneComponents` with a reason.

You MUST NOT: create the Container itself, create nodes under any other container, create ExternalSystem nodes, or create cross-package connections. Report those instead.

For every cross-package dependency, name the **target's container** (`toContainer`) as well as the target node name. Component names repeat across containers (e.g. several packages each have a `Contracts`), so a bare name is ambiguous — the orchestrator resolves the endpoint by (container, name). Include a `verb` from the profile's verb vocabulary (plus a short `object` noun where one applies) so the orchestrator does not fall back to the `uses` default when it creates the edge.

**Write this JSON report to `{{REPORT_FILE}}`** (create parent dirs):

{
  "container": "{{CONTAINER_NAME}}",
  "componentsWritten": [ { "name": "...", "id": "..." } ],
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

## Phase 4 (Code layer) subagent prompt

Same ownership rules. The orchestrator fills placeholders and dispatches one per container.

---
You are adding the CODE layer for ONE container. Stay strictly within your container's Components.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Container root: {{CONTAINER_ROOT}}
Report file: {{REPORT_FILE}}

All hyphae tools use the `mcp__hyphae__` prefix (e.g. `mcp__hyphae__describe_profile`).

Every `codeRef` you write is resolved against your container's `root: {{CONTAINER_ROOT}}`, so write
refs **relative to it** — `src/api/Client.ts#Client`, never `{{CONTAINER_ROOT}}src/api/Client.ts#Client`.
Do not set `root` yourself. Prefer a directory (`src/handlers/`) or glob (`src/views/**/*.vue`) Ref
over a long flat list of file refs.

0. Call `mcp__hyphae__describe_profile`, then `mcp__hyphae__model_overview` and
   `mcp__hyphae__list_nodes({ parentId: <componentId>, maxLayer: 'Code' })` (Code nodes are hidden unless
   maxLayer:'Code' is passed) — reuse existing Code nodes, never duplicate (match by name + parentId).
1. For each Component under your container, find the IMPORTANT code elements (apply the selectivity
   rule from SKILL.md Phase 4). Use gitnexus if its index is current; otherwise read the files.
2. create all Code nodes in one `mcp__hyphae__create_nodes` call, each as type
   Class/Interface/Function/Module/UIComponent with parentId = the Component id, a 1–3 sentence purpose
   `description`, `responsibilities`/`invariants` where known, and `codeRefs` as
   ["path/to/file.ext#SymbolName", ...] — **root-relative**, per the note above.
   (Code nodes do not require `summary` — only Component and above do.)
3. create intra-component edges in one `mcp__hyphae__create_connections` call, ONLY for edges where both
   endpoints are Code nodes under the *same* Component; set `type`, a `verb` from the profile's verb
   vocabulary (plus a short `object` noun where one applies), and put `transport` in `fields`.
   Report cross-component code edges (endpoints in different Components) upward — do NOT create them.
4. On any 422, read `issues` and fix the input.

**Write this JSON report to `{{REPORT_FILE}}`** (create parent dirs):
{
  "container": "{{CONTAINER_NAME}}",
  "codeNodesWritten": [ { "name": "...", "id": "...", "component": "...", "type": "Class|Interface|Function|Module|UIComponent" } ],
  "intraComponentEdges": [ { "from": "...", "to": "...", "type": "...", "verb": "<verb id>", "object": "<optional noun>", "why": "..." } ],
  "crossComponentEdges": [
    { "fromComponent": "...", "from": "<your code node name>",
      "toContainer": "...", "toComponent": "...", "to": "<target code node name>",
      "type": "Dependency|DataFlow|Realization", "transport": "Sync|Async|InProcess|None",
      "verb": "<verb id from describe_profile>", "object": "<short noun, optional>", "why": "..." }
  ]
}

Then return ONLY `{ "status": "done", "reportPath": "{{REPORT_FILE}}", "counts": { "codeNodes": N, "crossComponentEdges": N } }` — do NOT paste the full report into your reply.
---
