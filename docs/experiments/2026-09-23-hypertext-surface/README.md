# Experiment — a hypertext reading surface for a Hyphae model

**Date:** 2026-09-23 · **Status:** probe (throwaway output, kept for the record)

## Why

The canvas viewer has three complaints against it, all confirmed by the user:

1. **No overview.** The canvas shows one focus at a time, so the whole system is never on
   screen — the reader assembles it across many drills.
2. **The drawing is hard to read.** Node-link at 124 edges over 49 nodes spends a lot of
   visual work per unit of understanding.
3. **It is a diagram where a document would serve better** — but *not* a flat top-to-bottom
   text document. What is wanted is **hypertext**: a mixed set of representations chosen per
   thing (a small table where a table fits, a small scoped diagram where one fits, a list
   where a list fits), with entities as first-class linkable things — cross-links, tags,
   shape, colour, hover highlight, jump-to-definition.

Portability was explicitly *not* a complaint; this is about the reading experience.

## The probe

Three agents, run in parallel, each given **only** the model JSON and the schema — no repo
access. Same shared brief, three different structural stances, so the disagreement between
them is itself signal:

| Stance | Prompt | Output |
|---|---|---|
| **A — Reference** | [prompt-a-reference.md](prompt-a-reference.md) | `results/a-reference.html` |
| **B — Narrative** | [prompt-b-narrative.md](prompt-b-narrative.md) | `results/b-narrative.html` |
| **C — Explorer** | [prompt-c-explorer.md](prompt-c-explorer.md) | `results/c-explorer.html` |

The shared half of every prompt is [brief-shared.md](brief-shared.md).

Withholding repo access is deliberate. If a page comes out thin, that says the **model** is
thin, not the surface — a separate and useful finding.

## Viewing the results

Each result is a single self-contained HTML file. Open it directly in a browser:

    start docs/experiments/2026-09-23-hypertext-surface/results/a-reference.html

Each agent also left a short rationale beside its page (`results/<x>-notes.md`).

## What happens next

Whatever reads best becomes the spec for either a deterministic exporter (model → static
HTML) or a new viewer mode. The pages themselves are **throwaway** — they embed a snapshot
of the Continuo model taken on 2026-09-23 and do not update with it.
