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

## Optional code depth (Phase 4 only)

If the `gitnexus` MCP is connected and the repo is indexed, use it to go below component level: `group_list` (packages), `route_map` (entrypoints), `query`/`cypher` (dependency edges), `impact` (blast radius). Never required for phases 0–3 — package- and container-level work must succeed without gitnexus.
