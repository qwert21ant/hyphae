# Design: `building-architecture-models` skill

> A process skill that drives an agent to build — and incrementally deepen — a Hyphae
> architecture model of an arbitrarily large repository, via the `hyphae` MCP tools.
> Date: 2026-06-14. Status: approved design, ready for implementation planning.

---

## 1. Purpose & shape

Today a Hyphae model is built from a single hand-written prompt
(`docs/prompts/analyze-and-model.md`). That works on a small repo modeled in one shot. It does
not scale: a large repo has too much detail for one context window, the order of writes is fragile
(the server rejects dangling endpoints and bad containment), and there is no story for resuming or
deepening an existing model.

This skill replaces that prompt with a **rigid, resumable, top-down breadth-first pipeline**:

- The **main agent orchestrates**: it owns all shared/top-level nodes (System, Containers,
  ExternalSystems) and all cross-package connections.
- **Subagents do parallel per-container work**: each explores one package deeply, writes *its own*
  Components and intra-container connections, and reports findings back up.
- The model is the single source of truth (the running Hyphae server); the skill never edits
  `hyphae.json` directly — it goes through the MCP tools, exactly like the human editor.

It is an **orchestration / process skill**, not a code generator. The end goal is maximal coverage,
reached through repeatable incremental passes rather than one exhaustive run.

### Operating constraints (from the Hyphae server) that shape the whole design

- **Single writer, strict validation.** Every write is validated; a write that references a
  missing parent or a missing connection endpoint, or that violates containment, is rejected with
  `422` and a list of `issues`. There is no whole-model write endpoint — only granular create /
  update / delete.
- **Containment rules (`c4-backend` profile).** A Container's parent is a System; a Component's
  parent is a Container. Layers (Context / Container / Component) are derived from node `type`.
- **Connections are first-class** with `relationCategory` (Dependency | DataFlow | Realization |
  Trace), `transport` (Sync | Async | InProcess | None), and optional `intent`.

These constraints force the ordering used throughout: **parents before children, both endpoints
before their connection.**

---

## 2. Sensing engine (how structure is derived)

1. **Docs are the starting hypothesis, never ground truth.** If a doc claims a repo layout or a
   package boundary, the skill must verify it against the actual filesystem and manifests and
   **record any drift** (doc says X, repo shows Y). Drift is reported, never silently "fixed."
2. **gitnexus is an optional accelerator, used only for code-level analysis** (entrypoints,
   call/dependency edges, impact). Everything at the docs/package/container level MUST work without
   it. If gitnexus is present and the repo is indexed, the skill uses it to go deeper into code
   (Phase 4).

---

## 3. The generic analysis loop (no per-technology cheatsheets)

For any unit of code, the agent runs the same loop. There are no language-specific recipe files;
instead the agent reasons from a few common concepts plus a short list of archetypes that hint
*where the architecture lives*.

1. **Read the manifest** — `package.json`, `go.mod`, `pyproject.toml` / `setup.cfg`, `pom.xml` /
   `build.gradle`, `Cargo.toml`, `*.csproj`, `Gemfile`, etc. → technology, declared dependencies,
   declared entrypoint.
2. **Find the entrypoint** — from the manifest (`main` / `bin` / `scripts` / `module` / packaging
   config) or convention (`main.*`, `index.*`, `cmd/`, `src/main/...`).
3. **Classify into an archetype** from manifest + entrypoint + directory signals. The archetype is
   a *hint about where to look*, not a fixed procedure — the agent adapts:
   - **web service** → routers / controllers / middleware / request handlers
   - **CLI** → command / subcommand definitions
   - **frontend / UI** → routes / pages, stores, the top-level component tree
   - **library** → the public export surface
   - **worker / job** → queue consumers / scheduled handlers
   - **desktop** → windows / panels / actions
   - **infra / config** → modeled as a single node, not drilled
4. **Extract** components, their responsibilities, and outbound dependencies from the
   archetype-relevant files.

Phase 0 runs only steps 1–3 (cheap). Phase 2 subagents run the loop to full depth including step 4.

---

## 4. Phases

### Phase 0 — Discover & verify

- Read existing docs / README / ADRs and form a hypothesis of the structure.
- Verify the hypothesis against the real filesystem + manifests; record drift.
- Detect the package set: workspace globs (pnpm / yarn / npm workspaces), monorepo tools
  (turbo / nx / lerna / go modules / cargo workspace), or, failing those, top-level source dirs.
- For each package, run analysis-loop steps 1–3 (manifest, entrypoint, archetype). No deep reading
  yet.

### Phase 1 — Map + GATE 1

- Orchestrator does an idempotent read first (`get_text_context`), then writes:
  - the **System** node (description, responsibilities, an invariant), and
  - one **Container** per verified package (technology, responsibilities, invariants).
- Orchestrator emits the **plan artifact** at `docs/hyphae/model-plan.md` in the target repo: the
  container map, the drift notes, and a per-container **drill / skip** decision.
- **GATE 1 — pause for your approval/edits of the map.** This is where a wrong package boundary is
  cheapest to fix, before any component work fans out.

### Phase 2 — Parallel components

- One subagent per container marked "drill". Each subagent:
  - runs the analysis loop to full depth on its package,
  - **writes its own Components** (the parent Container already exists),
  - **writes intra-container connections** (both endpoints are its own Components), and
  - **returns a structured report** (see §5).
- Subagents run in parallel safely: each touches only its own subtree and references no other
  package's nodes, so there are no write races against the single-writer server.

### Phase 3 — Reconcile + connections + GATE 2

- Orchestrator aggregates all subagent reports and builds one **review bundle**:
  - (a) **cross-package connections** (resolved name→id, deduped),
  - (b) **proposed model amendments** — `update_node` edits to the System or to Containers
    (new responsibility / invariant / corrected technology) surfaced by subagents, and
  - (c) **new ExternalSystem / neighbour-system nodes** inferred from code (e.g. Stripe, an
    internal service, a database) plus the edges to them.
- **GATE 2 — you approve/trim the bundle.** This is where hallucinated edges and over-eager
  "new responsibility" claims get caught. Conflicting amendments from two subagents (e.g. both
  rephrase the System description) are surfaced for you to resolve, not auto-merged last-write-wins.
- Orchestrator applies the approved bundle in dependency order: `update_node` for amendments,
  `create_node` for ExternalSystems (parent = System, Context layer), then `create_connection` for
  all cross-package and external edges **last**.

### Phase 4 — Deepen (later passes, optional)

Each item is an independent, re-runnable pass over the existing model:

- **Code-level nodes** via gitnexus where the repo is indexed.
- **Flows** for key scenarios (deferred from the first build).
- Data / Intent axes (DataType, Requirement, Decision) when the editor supports them.

---

## 5. Subagent contract

- **Input:** the container's id and name, the package path, the detected archetype, and the
  idempotency rules (§6).
- **Allowed writes:** ONLY `create_node` for Components under its own container, and
  `create_connection` for intra-container edges (both endpoints are its own Components). A subagent
  **never** creates its container, another package's nodes, ExternalSystems, or cross-package edges.
- **Output (machine-readable report):**
  - `componentsWritten` — list of `{ name, id }` it created (or reused, if already present).
  - `crossPackageDeps` — observed dependencies on other packages, expressed as `from`/`to` by
    stable node **name** (orchestrator resolves names→ids in Phase 3).
  - `upwardFindings` — things that belong above this container:
    - amendments to its **own Container** (new responsibility / invariant / corrected tech),
    - amendments to the **System** or a **sibling Container**,
    - **new ExternalSystem / neighbour-system** nodes inferred from code, each with the interaction
      described.

Subagents are read-mostly except within their own subtree, which is what makes Phase 2 safe to
parallelize.

---

## 6. Idempotency / resume contract

Applies to every run and every agent (orchestrator and subagents):

- **Always read first** (`get_text_context` / `list_nodes`). Never assume an empty model.
- **Create-or-skip by identity (`name` + `parentId`).** If a node with that identity already
  exists, reuse its id instead of creating a duplicate.
- **On `422`, read the returned `issues` and correct the input** (almost always a missing
  parent/endpoint or a containment violation). Do not blindly retry the same write.
- The **plan artifact** records per-container progress, so a re-run resumes at the first incomplete
  container and is a no-op when the model is already complete.

---

## 7. Error handling

- Validation rejections are expected signal, not failure: surface the `issues`, fix the input,
  continue.
- A subagent that fails leaves the model consistent — its container still stands; its components are
  simply absent. Re-running the skill re-drills only that container.
- Doc↔reality drift is reported in the plan artifact, never silently reconciled.

---

## 8. Plan artifact

- Location: `docs/hyphae/model-plan.md` inside the **target** repo.
- Role: human approval surface at GATE 1 and the resume checkpoint across runs. It is a working
  file; committing it to the target repo is the user's choice, not forced by the skill.
- Contents: verified container map, drift notes (doc vs reality), per-container drill/skip decision,
  and progress markers.

---

## 9. Verifying the skill itself

- **Dry-run on this repo (Hyphae).** A known-good model already exists. The skill should reproduce
  an equivalent map and be a **no-op on a second run** — this proves the idempotency contract.
- **Then validate on one genuinely large repo** to exercise Phase 0 detection, parallel Phase 2,
  and the Phase 3 reconciliation bundle.

---

## 10. Out of scope (this design)

- Writing the Phase 4 passes in detail (Code binding, Flows, Data/Intent) — only their hooks are
  defined here.
- Any change to the Hyphae server, schema, or MCP tools — the skill is purely a consumer of the
  existing read/write MCP surface.
- Profiles other than `c4-backend`.
