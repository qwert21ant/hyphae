# hyphae-modeling

A Claude Code plugin that bundles the **`building-architecture-models`** skill: a resumable,
top-down breadth-first flow for building (and incrementally deepening) a Hyphae C4 architecture
model of a large repository through the `hyphae` MCP tools.

What the skill does (summary — the skill body is authoritative):

- **Phase 0** — discover packages, verify docs against the real filesystem, record drift.
- **Phase 1** — write the System + one Container per package, emit `docs/hyphae/model-plan.md`, **GATE 1**.
- **Phase 2** — one subagent per container writes its own Components + intra-container edges, in parallel.
- **Phase 3** — reconcile cross-package connections + upward findings into one bundle, **GATE 2**, then apply.
- **Phase 4** — optional deepening passes (code-level via gitnexus, Flows, …).

## Requirements

- A running Hyphae server with the `hyphae` MCP connected (read + write tools). The skill checks
  this by calling `get_text_context`. See the Hyphae repo README for how to start the server.

## Install (Claude Code plugin marketplace)

This repository is itself a marketplace (`.claude-plugin/marketplace.json` at the repo root).

```
# add the marketplace (git host, or a local clone path)
/plugin marketplace add <git-url-or-local-path-to-this-repo>

# install the plugin
/plugin install hyphae-modeling@hyphae
```

After install, the `building-architecture-models` skill is available in any project; invoke it when
modeling a large or unfamiliar repo.

## Local development

The skill's canonical source lives here under
`plugins/hyphae-modeling/skills/building-architecture-models/`. A working copy may also be installed
directly at `~/.claude/skills/building-architecture-models/` for iteration; keep the two in sync.

## Not yet bundled

- **The `hyphae` MCP server.** It currently runs from the Hyphae workspace
  (`pnpm --filter @hyphae/server mcp`), not a published binary, so it is not wired into this plugin.
  Once Hyphae is published (e.g. to npm), this plugin can add a `.mcp.json` that launches the server
  via `npx`, making `/plugin install` a one-step setup.
