# Field Fronts Project Index

## Current source of truth

- `README.md` — run instructions, current prototype status, validation commands.
- `progress.md` — chronological development log and current known risks.
- `docs/PROJECT_ORGANISATION.md` — folder ownership and what belongs where.
- `docs/verification/FULL_DEBUG_SWEEP_2026-05-25.md` — full debug/folder/documentation audit pass.
- `docs/verification/CADENCE_REGRESSION_RECOVERY_V0_2026-05-25.md` — cadence/performance recovery pass.
- `docs/verification/CADENCE_OBLIGATION_GUARD_V0_2026-05-25.md` — latest cadence registry/validation guard pass.
- `docs/agent-orientation/CADENCE_OBLIGATION_REGISTRY.md` — agent-facing cadence contract rules.
- `docs/agent-orientation/README.md` — agent-facing architecture and QA orientation pack.

## Source folders

- `src/core/` — app modes and event bus.
- `src/world/` — map, fields, scenarios, authored scene entities, weather fields.
- `src/game/` — simulation authority: combat, movement, construction, logistics, cover, corpses, economy, progression.
- `src/rendering/` — canvas rendering and visual-only presentation.
- `src/ui/` — DOM UI and HUD composition.
- `src/input/` — pointer and command input control.
- `src/qa/` — runtime/static QA helpers.
- `tests/` — in-process and isolated regression coverage.
- `tools/` — local static server and browser/frame-budget QA runners.

## Documentation folders

- `docs/apply-history/` — historical slice handovers. Useful context, not runtime authority.
- `docs/agent-orientation/` — compact architecture/QA/performance guidance for future agents.
- `docs/verification/` — current audit and validation reports.
- `docs/archives/` — archived generated bundles.

## Artifact folders

- `artifacts/qa-output/` — historical generated QA screenshots/reports moved out of the root project surface.
- `artifacts/logs/` — historical local browser/server logs.
- `assets/` — game assets and static reference images.

## Current top risks

1. `npm run test:validation` now includes cadence-registry validation and exits successfully, but the sim frame-budget report remains `WARN` on p95 stress-frame jank. Average frame proxy is back under budget; p95 is the next optimisation target.
2. Browser smoke is environment-dependent because the Codex Playwright client path is not present in this sandbox. Local Felix/Codex runs should still use `npm run test:browser`.
3. `gameModel.js` remains large. The current extractions are movement, construction, logistics, combat, cover, corpses, scenario, and QA seams; route/flow-field generation and some placement validation still need later extraction.

## Rule of thumb

If it changes simulation truth, it belongs under `src/game` or `src/world` with tests. If it only draws truth, it belongs under `src/rendering` or `src/ui`. If it merely records a past slice, keep it in `docs/apply-history` rather than root.
