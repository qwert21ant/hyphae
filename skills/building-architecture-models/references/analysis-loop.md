# Generic analysis loop & archetypes

No per-language cheatsheets. For any unit of code run the same loop and let the archetype hint *where the architecture lives*.

1. **Read the manifest** — `package.json`, `go.mod`, `pyproject.toml`/`setup.cfg`, `pom.xml`/`build.gradle`, `Cargo.toml`, `*.csproj`, `Gemfile`, etc. → technology, dependencies, declared entrypoint.
2. **Find the entrypoint** — from the manifest (`main`/`bin`/`scripts`/`module`/packaging config) or convention (`main.*`, `index.*`, `cmd/`, `src/main/...`).
3. **Classify into an archetype** from manifest + entrypoint + directory signals. The archetype is a hint, not a fixed procedure — adapt.

| Archetype | Where the architecture lives |
|-----------|------------------------------|
| web service | routers / controllers / middleware / request handlers |
| CLI | command / subcommand definitions |
| frontend / UI | routes / pages, stores, top-level component tree |
| library | the public export surface |
| worker / job | queue consumers / scheduled handlers |
| desktop | windows / panels / actions |
| infra / config | model as a single node; do not drill |

4. **Extract** components, their responsibilities, and outbound dependencies from the archetype-relevant files.

Phase 0 runs steps 1–3 only (cheap). Phase 2 subagents run all four to full depth.

## Choosing what to ref / make a member

The same judgment picks a Component's `codeRefs` and a Pattern's members: model what carries
architectural meaning, skip the noise.

- **Include** an element when it: realizes a documented responsibility, is a public entrypoint
  (an exported/registered surface others call), has high fan-in (an importance signal — gitnexus
  `impact` surfaces it), or participates in a documented flow.
- **Exclude** utilities, generated code, and tests — they inflate the model without adding shape.
- **Prefer one directory or glob ref** that captures a cohesive area (`src/views/cctv/`,
  `src/pipeline/**`) over an enumerated list of files — it says more and stays readable in a diff.

This is selectivity, not completeness: a Component with three meaningful refs beats one with thirty.

## gitnexus (cross-cutting accelerator — any phase)

If the `gitnexus` MCP is connected AND its index is current for this repo, you MAY use it in ANY
phase to go faster and deeper — it is never required (every phase must also succeed by reading the
filesystem):

- **Freshness first.** Confirm the index matches the working tree (re-index if the repo changed
  since indexing). Stale graph data is worse than none — fall back to reading files if unsure.
- **Discovery:** `query` (concept → execution flows), `context` (360° of one symbol), `cypher`
  (structural queries), `route_map`/`group_list` (entrypoints/packages).
- **Edges & importance:** `impact` (blast radius / fan-in — high fan-in marks an important element),
  graph relations `CALLS`/`IMPORTS`/`IMPLEMENTS`/`EXTENDS` → a hyphae connection's `verb` + `object`.
- **codeRefs:** every symbol carries a `filePath`; record `path#SymbolName` as the node's `codeRefs`.
  gitnexus reports `filePath` **repo-relative**, but refs are stored **relative to the owning
  Container's `root`** — strip the container's root prefix before writing
  (`apps/server/src/routes.ts` under `root: "apps/server/"` becomes `src/routes.ts`). See SKILL.md →
  *Refs and roots*.
