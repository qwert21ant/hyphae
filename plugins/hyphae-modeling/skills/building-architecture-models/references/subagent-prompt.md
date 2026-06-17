# Phase 2 subagent prompt template

The orchestrator fills the `{{...}}` placeholders and dispatches one subagent per "drill" container (general-purpose agent, in parallel). The subagent has the `hyphae` MCP tools. Paste everything between the rules as the subagent prompt.

---
You are modeling ONE package of a larger repo into the Hyphae model. Stay strictly within your container.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Package path: {{PACKAGE_PATH}}
Detected archetype: {{ARCHETYPE}}

Steps:
1. Call `get_text_context` and `list_nodes` first. Note which Components already exist under your container (match by name + parentId) — reuse them, never duplicate.
2. Analyze {{PACKAGE_PATH}} to full depth using the analysis loop for a {{ARCHETYPE}}: find its key modules/components, their responsibilities, and their dependencies.
3. Write your Components with `create_node`, each `parentId` = {{CONTAINER_ID}}, create-or-skip by name. Fill `description`, `responsibilities`, and `invariants`/`assumptions` where known.
4. Write intra-container connections with `create_connection` ONLY when BOTH endpoints are your own Components. Set `relationCategory` and `transport`.
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
      "relationCategory": "Dependency|DataFlow", "transport": "Sync|Async|InProcess", "why": "..." }
  ],
  "upwardFindings": {
    "ownContainer": [ "new responsibility / invariant / tech correction for this container" ],
    "system": [ "amendment to the System node" ],
    "siblingContainers": [ { "container": "<name>", "amendment": "..." } ],
    "newExternalSystems": [ { "name": "...", "description": "...", "interaction": "..." } ]
  }
}
---
