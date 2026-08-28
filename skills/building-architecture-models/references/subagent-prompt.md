# Phase 2 subagent prompt template

The orchestrator fills the `{{...}}` placeholders and dispatches one subagent per "drill" container (general-purpose agent, in parallel). The subagent has the `hyphae` MCP tools. The orchestrator passes a `{{REPORT_FILE}}` path under `.hyphae/reports/`. Paste everything between the rules as the subagent prompt.

---
You are modeling ONE package of a larger repo into the Hyphae model. Stay strictly within your container.

**This prompt is complete.** Do not read the `building-architecture-models` skill or any other skill
file — everything you need is below, plus what `describe_profile` tells you at runtime. The skill
describes the orchestrator's whole-repo workflow, which is not your job and will pull you out of scope.

Container: {{CONTAINER_NAME}}  (id: {{CONTAINER_ID}})
Package path: {{PACKAGE_PATH}}
Container root: {{CONTAINER_ROOT}}
Detected archetype: {{ARCHETYPE}}
Report file: {{REPORT_FILE}}

Your container declares `root: {{CONTAINER_ROOT}}`. Every `codeRef` / `docRef` you write is resolved
against it, so write refs **relative to that root** — `src/api/Client.ts`, never
`{{CONTAINER_ROOT}}src/api/Client.ts`. Do not set `root` yourself; the orchestrator owns it —
**omit the `root` key entirely** on everything you create.

All hyphae tools use the `mcp__hyphae__` prefix (e.g. `mcp__hyphae__describe_profile`).

Steps:
0. Call `mcp__hyphae__describe_profile` first to learn the current node kinds, roles, pattern kinds, fields, and enum values.
1. Call `mcp__hyphae__model_overview` and `mcp__hyphae__list_nodes` first. Note which Components already exist under your container (match by name + parentId) — reuse them, never duplicate.
2. Analyze {{PACKAGE_PATH}} to full depth using the analysis loop for a {{ARCHETYPE}}: find its key modules/components, their responsibilities, and their dependencies.
3. **Components.** Create all your Components in one `mcp__hyphae__create_nodes` call (domain values
   in each item's `fields`), each `parentId` = {{CONTAINER_ID}}, create-or-skip by name.
   `fields.summary` is REQUIRED — one line under ~70 characters saying what the component is for; it
   is what the diagram shows. Put the long form in `description`. Set `role` only when the component
   is really a datastore, queue, or UI surface. Put other domain values (`responsibilities`,
   `rules`, `technology`) in the `fields` bag where known — `describe_profile` (step 0) lists the
   valid keys.

   **Prose names the responsibility; refs name the code.** Everything you write must stay true
   after a refactor that renames every symbol inside the component. A method name, a lock, a
   private field or a line number in a `description` is a code comment — put the code in
   `codeRefs` (step 3a) and say what the component is *for* instead.

   The four slots divide the work and **never repeat each other**:
     summary          what it is for, one line, on canvas
     responsibilities what it is accountable for — "The system relies on <name> to ___"
     rules            what always holds — a promise that survives a rename, never a lock
                      protocol, call ordering or null check
     description      ONLY what a list cannot carry: why it exists, the trade-off it embodies,
                      how it participates in the system's stories

       responsibilities  BAD  "Runs the per-tick state machine: advance, fail-over, or start a calc"
                         GOOD "Keeps exactly one path being walked at a time, and replaces it
                               before it runs out"
       rules             BAD  "findPathInNewThread() must only be called while holding pathCalcLock"
                         GOOD "Never hands out a path computed from a position the player has
                               already left"

   If a fact is enumerable it goes in a list and is NOT repeated in `description`.

   `description`, `responsibilities` and `rules` take two inline marks: `**bold**` and `` `code` ``.
   A code span is for a name that is part of the system's contract — a config key, an environment
   variable, a wire-protocol field. Never an internal class or method.

   `fields.technology` is ONE canonical name ("Vue", "PostgreSQL", "Go") — no
   version numbers, no dependency lists; the canvas ellipsizes a long value. Stack detail goes in
   `description`. Omit `root` (the orchestrator owns it) and omit any field you do not know rather
   than passing an empty string.
   The call returns `{created:[{id,name},...]}` in input order — that is your name→id map for
   steps 3b and 4. Do not call `list_nodes` again to recover ids you just wrote.
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
   endpoints are your own Components. Each edge carries a free-text `label` — the only text drawn
   on the diagram. There is NO verb vocabulary; the label alone carries the meaning.
   **An edge earns its place by saying something a reader cannot infer from the two node names.**
   The test is mechanical: read the sentence *"`<from name>` `<label>` `<to name>`"* and ask what a
   reader learns beyond "these two are connected". If the answer is nothing, **do not create the
   edge.**

       BAD   Process Contracts  uses           Pathing Goals   <- asserts only that a dep exists
       BAD   PathingBehavior    reads settings Settings        <- true of nearly every component
       GOOD  A* Search Engine   hands the node chain to        Path Result Assembler

   Containment already implies that things inside a container depend on each other. Prefer twenty
   edges that say something to two hundred that do not.
5. On any `422`, read the returned `issues` and fix the input; never blind-retry.
6. Before returning, **self-review**: re-read each component you wrote. If its `description` / `responsibilities` / `rules` assert a relationship to another of YOUR components — phrases like "implements", "depends on", "used by", "built on", "all others depend on it" — make sure a matching connection exists, and add any that are missing. Then check for any of your components left with **zero connections**: either wire it, or list it under `standaloneComponents` with a reason.
   Also check each component for the two prose faults: a `description` that names methods or locks,
   and a `description` sentence that restates a `responsibilities` item. Fix both before returning.

You MUST NOT: create the Container itself, create nodes under any other container, create ExternalSystem nodes, or create cross-package connections. Report those instead.

For every cross-package dependency, name the **target's container** (`toContainer`) as well as the target node name. Component names repeat across containers (e.g. several packages each have a `Contracts`), so a bare name is ambiguous — the orchestrator resolves the endpoint by (container, name). Include a `label` that passes the step-4 test, so the orchestrator creates an edge that says something rather than one that merely asserts a dependency.

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
      "label": "<free text: what this edge does, passing the test in step 4>", "why": "..." }
  ],
  "upwardFindings": {
    "ownContainer": [ "new responsibility / rule / tech correction for this container" ],
    "system": [ "amendment to the System node" ],
    "siblingContainers": [ { "container": "<name>", "amendment": "..." } ],
    "newExternalSystems": [ { "name": "...", "description": "...", "interaction": "..." } ]
  }
}

Then return ONLY `{ "status": "done", "reportPath": "{{REPORT_FILE}}", "counts": { "components": N, "crossPackageDeps": N } }` — do NOT paste the full report into your reply.
---
