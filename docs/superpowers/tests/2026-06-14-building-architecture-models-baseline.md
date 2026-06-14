# building-architecture-models — test notes

Verification log for the skill, per the implementation plan
(`docs/superpowers/plans/2026-06-14-building-architecture-models.md`).
The live Hyphae server (`:5173`) and the `hyphae` MCP are the fixture.

## Before (Task 1, Step 1) — model snapshot

12 nodes. These ids are the known-good fixture; any node NOT in this list after a
baseline run is a duplicate to delete during restore.

| id | name | type |
|----|------|------|
| ae2e2ed9-f454-4494-b172-82070295cf8d | Hyphae | System |
| 53395812-2c3c-4fee-9ae4-89233ece0f29 | @hyphae/schema | Container |
| d771a4ef-c672-4e15-be1f-72ef786d6479 | @hyphae/server | Container |
| b78d6e40-1164-4176-bfc9-bcbaea990814 | @hyphae/web | Container |
| 3a430cf7-00d6-463b-bb4e-bc97234ccc45 | ModelStore | Component |
| 55312afb-5bbe-4519-8b97-6e9a462eeacc | routes | Component |
| 2b097288-3713-4c6b-ad0f-e8159f302933 | mcp tools | Component |
| 004bb60f-4cde-4bda-9e2b-e00358d2fd22 | store | Component |
| 21d6670f-6c2f-4bd2-870e-8ddf716cca5d | Canvas | Component |
| 92de09b6-e27a-42b6-a8fb-669c8518aa20 | SidePanel | Component |
| a7765595-f9b7-435d-878e-edb5b16c668a | validate | Component |
| ab5819d1-d41a-4b56-8bb0-c1ba514e27f0 | context | Component |

## Baseline behavior (RED) — Task 1, Step 3

Ran a fresh subagent told to model `C:/projects/hyphae` following the old one-shot prompt
(`docs/prompts/analyze-and-model.md`) against the already-filled model.

**Result: the baseline did NOT fail.** The subagent called `get_text_context` first, saw the 12
nodes + 6 connections already present, created nothing, and reported "no rejections, model already
populated." Node count after: 12 (unchanged) — no restore needed.

**Why no failure, and what it tells us.** The old prompt's step 1 is literally "Call
`get_text_context` first to see the current model", so a capable agent reads-then-skips on a *small,
already-complete* repo. The idempotency-on-a-finished-small-repo scenario therefore does not
discriminate between the old prompt and the new skill — both pass it.

**Consequence for verification.** The skill's value is NOT small-repo idempotency; it is the
large-repo flow: generic discovery + drift verification, top-down breadth-first decomposition, the
two approval gates, parallel per-container subagents that stay in scope, the cross-package
reconciliation bundle, and resumability across partial runs. None of those are exercised by a
finished 12-node model. **The discriminating test is the deferred end-to-end run on a real
multi-package repo (plan Task 7).** Task 6 below is kept as a positive technique check (does the
skill make an agent read-first and stop at GATE 1), not as a RED→GREEN differentiator.
