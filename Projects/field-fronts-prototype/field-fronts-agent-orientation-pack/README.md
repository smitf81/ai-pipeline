# Field Fronts Agent Visual Orientation Pack

Purpose: give any agent a fast, shared orientation before touching the Field Fronts prototype.

This pack is docs-only. It does not define new runtime truth. It explains how the current prototype is shaped, where truth lives, and which tests should protect each seam.

## Visual quick start

Open `visual-atlas.html` in a browser for a fast human-readable orientation view. Use `visual-index.md` to find the exported SVG diagrams. The Markdown files remain the canonical agent-readable layer.

## Read order

| Order | File | Use it for |
|---:|---|---|
| 1 | `agent-rules.md` | Behaviour rules before any patch. Tiny but important. |
| 2 | `system-topology.md` | Which modules own which responsibilities. |
| 3 | `truth-ownership-map.md` | Canonical vs runtime vs derived vs visual-only state. |
| 4 | `runtime-cadence-map.md` | What may run every frame vs on sim tick vs on player events. |
| 5 | `construction-flow.md` | Full button -> placement -> job -> builder -> completed structure path. |
| 6 | `qa-suite-map.md` | What to run and what each test failure means. |
| 7 | `performance-risk-map.md` | Where agents are most likely to tank FPS. |
| 8 | `visual-index.md` | Offline HTML/SVG visual companion index. |

## Agent-specific shortcuts

| Agent | First files |
|---|---|
| ChatGPT / Ada | `agent-rules.md`, `current-next-slices.md`, `qa-suite-map.md` |
| Codex | `agent-rules.md`, `system-topology.md`, `runtime-cadence-map.md`, then target-specific file |
| Antigravity | `truth-ownership-map.md`, `field-derivation-map.md`, `performance-risk-map.md` |
| AXIOM / local agents | `system-topology.md`, `truth-ownership-map.md`, `qa-suite-map.md` |

## What this pack protects

- MapData and GameState stay separate.
- Derived fields are rebuilt from source truth, not persisted casually.
- Rendering draws state but does not own it.
- UI emits commands; it does not become the game model.
- Construction uses explicit jobs and builders, not instant magic pop-ins.
- Heavy computation is cadenced and testable.
- QA reports are evidence, not automatic authority.

## Current project shape assumed by this pack

- Static no-build browser prototype.
- `npm.cmd start` serves the game on port 4184.
- `npm.cmd test` runs in-process tests.
- `npm.cmd run test:browser` runs the browser smoke client when Playwright is available.
- Runtime code lives under `src/`.
- Main docs live under `docs/`.
- Performance evidence may appear under `output/runtime-performance-qa/report.json`.

## Do not be dim about this bit

If a future patch changes runtime behaviour, this pack should help choose the right files and tests. It is not permission to make broad rewrites. Read the rules, touch the smallest seam, then prove it.
