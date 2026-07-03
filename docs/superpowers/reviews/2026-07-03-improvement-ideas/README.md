# Hyphae improvement review — 2026-07-03

A structured ideation pass across four axes plus cross-pollination from a sibling
project. Each axis is researched independently (parallel subagents) and written to
its own file below; this index tracks status and the synthesized roadmap lands in
`ROADMAP.md`.

## Axes & status

| # | Axis | File | Status |
|---|------|------|--------|
| 1 | Model completeness / usefulness (detail level for user & LLM) | `01-model-completeness.md` | ✅ done |
| 2 | Skill efficiency (flow/phases, subagent task split) | `02-skill-efficiency.md` | ✅ done |
| 3 | UI/UX clarity / simplicity (overloaded views, expandable externals) | `03-ui-ux.md` | ✅ done |
| 4 | MCP tools usage / completeness / redundancy | `04-mcp-tools.md` | ✅ done |
| 5 | Cross-pollination (Understand-Anything + GitHub peers) | `05-cross-pollination.md` | ✅ done |
| 6 | Materialize higher-layer connections (author, don't derive) | `06-materialized-rollups.md` | ✅ done |
| — | Synthesis / prioritized roadmap | `ROADMAP.md` | ✅ done |

**Start here:** `ROADMAP.md` — synthesized, de-duplicated, sequenced into three waves.

## Method
- Each idea file: concrete ideas, each with **rationale**, **rough effort (S/M/L)**,
  **tradeoffs/risks**, and pointers to specific files/functions. Ranked most-valuable first.
- No source code is changed in this pass — output is ideas only.
- Roadmap synthesizes, de-duplicates, and sequences the strongest ideas.

## Context snapshot (for reviewers)
- Hyphae = local visual editor for a C4-style architecture model. pnpm monorepo:
  `apps/web` (Vite+React+Zustand+React Flow focus-view editor), `apps/server`
  (Hono API + SSE + **MCP server** in `apps/server/src/mcp.ts`), `packages/schema`
  (Zod schemas, `c4-backend` profile, rollups).
- Profile `c4-backend` layers: Context → Container → Component → Code. Node kinds and
  fields in `packages/schema/src/profiles/c4-backend.ts`.
- Modeling skill: `plugins/hyphae-modeling/skills/building-architecture-models/SKILL.md`.
- Realistic model for testing: `apps/server/hyphae-cctv-new.json` (567 connections).
