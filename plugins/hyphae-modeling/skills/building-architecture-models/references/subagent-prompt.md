# Phase 2 subagent prompt template

The orchestrator fills the `{{...}}` placeholders and dispatches one subagent per "drill" container (general-purpose agent, in parallel). The subagent has the `hyphae` MCP tools. Paste everything between the rules as the subagent prompt.

---
You are modeling ONE package of a larger repo into the Hyphae model. Stay strictly within your container.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Package path: {{PACKAGE_PATH}}
Detected archetype: {{ARCHETYPE}}

Steps:
0. Call `describe_profile` first to learn the current node kinds, connection kinds, fields, and enum values.
1. Call `get_text_context` and `list_nodes` first. Note which Components already exist under your container (match by name + parentId) — reuse them, never duplicate.
2. Analyze {{PACKAGE_PATH}} to full depth using the analysis loop for a {{ARCHETYPE}}: find its key modules/components, their responsibilities, and their dependencies.
3. Write your Components with `create_node`, each `parentId` = {{CONTAINER_ID}}, create-or-skip by name. Fill `description`, and put domain values (`responsibilities`, `invariants`, `technology`) in the `fields` bag where known — `describe_profile` (step 0) lists the valid keys.
4. Write intra-container connections with `create_connection` ONLY when BOTH endpoints are your own Components. Set the connection `type` (a profile connection kind id) and put `transport`/`intent` in the `fields` bag.
5. On any `422`, read the returned `issues` and fix the input; never blind-retry.
6. Before returning, **self-review**: re-read each component you wrote. If its `description` / `responsibilities` / `invariants` assert a relationship to another of YOUR components — phrases like "implements", "depends on", "used by", "built on", "all others depend on it" — make sure a matching `create_connection` exists, and add any that are missing. Then check for any of your components left with **zero connections**: either wire it, or list it under `standaloneComponents` with a reason.

You MUST NOT: create the Container itself, create nodes under any other container, create ExternalSystem nodes, or create cross-package connections. Report those instead.

For every cross-package dependency, name the **target's container** (`toContainer`) as well as the target node name. Component names repeat across containers (e.g. several packages each have a `Contracts`), so a bare name is ambiguous — the orchestrator resolves the endpoint by (container, name).

Return ONLY this JSON report (no surrounding prose):

{
  "container": "{{CONTAINER_NAME}}",
  "componentsWritten": [ { "name": "...", "id": "..." } ],
  "standaloneComponents": [ { "name": "...", "why": "deliberately has no connections because ..." } ],
  "crossPackageDeps": [
    { "from": "<your component name>",
      "toContainer": "<the container/package that owns the target, or \"external\" for an external system>",
      "to": "<target node name within that container (or the external system name)>",
      "type": "Dependency|DataFlow|Realization|Trace", "transport": "Sync|Async|InProcess|None", "why": "..." }
  ],
  "upwardFindings": {
    "ownContainer": [ "new responsibility / invariant / tech correction for this container" ],
    "system": [ "amendment to the System node" ],
    "siblingContainers": [ { "container": "<name>", "amendment": "..." } ],
    "newExternalSystems": [ { "name": "...", "description": "...", "interaction": "..." } ]
  }
}
---

## Phase 4 (Code layer) subagent prompt

Same ownership rules. The orchestrator fills placeholders and dispatches one per container.

---
You are adding the CODE layer for ONE container. Stay strictly within your container's Components.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})

0. Call `describe_profile`, then `get_text_context` and `list_nodes` (parentId per Component) — reuse
   existing Code nodes, never duplicate (match by name + parentId).
1. For each Component under your container, find the IMPORTANT code elements (apply the selectivity
   rule from SKILL.md Phase 4). Use gitnexus if its index is current; otherwise read the files.
2. `create_node` each as type Class/Interface/Function/Module/UIComponent with parentId = the Component
   id, a 1–3 sentence purpose `description`, `responsibilities`/`invariants` where known, and `codeRefs`
   as ["path/to/file.ext#SymbolName", ...].
3. `create_connection` ONLY intra-component code edges (both endpoints are Code nodes under the *same*
   Component); set `type` and put `transport` in `fields`. Report cross-component code edges (endpoints
   in different Components) upward — do NOT create them.
4. On any 422, read `issues` and fix the input.

Return ONLY this JSON:
{
  "container": "{{CONTAINER_NAME}}",
  "codeNodesWritten": [ { "name": "...", "id": "...", "component": "...", "type": "Class|Interface|Function|Module|UIComponent" } ],
  "intraComponentEdges": [ { "from": "...", "to": "...", "type": "...", "why": "..." } ],
  "crossComponentEdges": [
    { "fromComponent": "...", "from": "<your code node name>",
      "toContainer": "...", "toComponent": "...", "to": "<target code node name>",
      "type": "Dependency|DataFlow|Realization", "transport": "Sync|Async|InProcess|None", "why": "..." }
  ]
}
---
