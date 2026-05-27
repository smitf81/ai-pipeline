# Field Fronts Prototype

A no-build browser prototype for the first **Black Sky Bound / Field Fronts** tactical loop: authored terrain, command influence, construction/logistics, autonomous enemy pressure, melee/ranged combat, weather fields, scenario authoring, battlefield trace, sound distraction, and physical cover/visibility.

The current prototype is still deliberately rough, but it is now organised around one rule:

> Simulation owns truth. Rendering and UI only display it.

## Run

```powershell
cd C:\Users\felix\Desktop\Automated_AI_Pipeline\Projects\field-fronts-prototype
.\run-game.cmd
```

Or manually:

```powershell
npm.cmd start
```

Open:

```txt
http://127.0.0.1:4184/?seed=1
```

## Current capabilities

- Play Loop and scenario/map authoring modes.
- Seeded map loading from `data/maps/`.
- Player/enemy outposts, commanders, squads, builders, construction jobs, supply/logistics, and progression locks.
- Autonomous enemy state machine that builds, gathers, expands, attacks, and rebuilds.
- Movement/pathing with coastal slide handling, path intent feedback, interpolation, and stuck recovery.
- Melee/ranged combat, projectile travel, line-of-sight blockers, death events, corpse stacks, and battlefield trace marks.
- Weather spatial fields for heat/humidity/storm cloud overlays, now restored to explicit cadence ownership.
- Command wheel with physical stone distraction, hearing events, investigation orders, and debug FOV/hearing visuals.
- Physical cover/visibility state from forest/tall grass, structures, authored barricades, and corpse piles/body walls.
- Cover/hidden status is displayed through rendered cover objects, unit cues, selection HUD chips, and combat target filtering.

## Project organisation

Start here:

- `docs/INDEX.md` — project file index.
- `docs/PROJECT_ORGANISATION.md` — folder ownership and cleanup rules.
- `docs/verification/FULL_DEBUG_SWEEP_2026-05-25.md` — full audit and validation pass.
- `docs/verification/CADENCE_REGRESSION_RECOVERY_V0_2026-05-25.md` — cadence/performance recovery pass.
- `docs/verification/CADENCE_OBLIGATION_GUARD_V0_2026-05-25.md` — latest cadence-registry guard pass.
- `docs/agent-orientation/CADENCE_OBLIGATION_REGISTRY.md` — runtime cadence contract rules.
- `docs/agent-orientation/README.md` — agent-facing architecture and QA pack.
- `docs/apply-history/` — historical slice notes and handovers.

Generated screenshots/reports are now kept out of root under `artifacts/qa-output/` when archived. New QA runs may recreate `output/` temporarily.

## Tests

Main in-process regression suite:

```powershell
npm.cmd test
```

Isolated regression runner:

```powershell
node tests/runIsolatedTests.mjs --timeout=60000
```

Browser smoke, where the Codex web-game Playwright client is available:

```powershell
npm.cmd run test:browser
```

Cadence guard validation:

```powershell
npm.cmd run test:cadence
```

Runtime/performance validation:

```powershell
npm.cmd run test:validation
```

First Night shelter-chain browser proof:

```powershell
npm.cmd run test:shelter-route
```

Live local-model Mouse proof:

```powershell
npm.cmd run test:mouse:live
```

## Latest completed pass

**First Night Shelter-Chain Truth Pass v0** grounds Mouse shelter choices in commander-known command options rather than asserted visibility. Completed shelters are removed from the next-choice set, active objective shelters outrank support stops, and the browser proof completes all five First Night objectives through real `orders:survival-intent` commands and gameplay ticks.

The live Mouse proof now requires an accepted first shelter action followed by an accepted dense-canopy action after objective progress advances.

## Current next pass

Use the truthful shelter chain as the base for a narrow **First Night consequence/readability v0** pass: make the crossing or regroup choice feel consequential and readable without adding a second objective system or bypassing commander authority.
