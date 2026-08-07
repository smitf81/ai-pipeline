# Start Here

This project is a focused first-playable prototype for **Black Sky Bound**.

## Fast boot

On Windows, double-click:

```txt
LAUNCH_BSB.bat
```

The launcher starts a small local Node server and normally opens the game at:

```txt
http://127.0.0.1:5177
```

If that port belongs to another checkout or local process, the launcher automatically selects the next free port and opens this Desktop checkout. If this exact checkout is already running, it safely reuses it. No Git worktree selection is required for normal playtesting.

Stop it with `Ctrl+C` in the launcher window.

## Current reality

The project has moved beyond the old 2026-06-15 handover. The live runtime is now a WebGL-only, asset-light, projected-primitive young-dragon action prototype.

The important production decision after the 2026-07-03 visual pass is:

> Do not expand into 2.5D renderer work, asset-generation tooling, RTS systems, or editor complexity for this first game. Tighten the playable loop and UX first.

## Read in this order

1. `docs/HANDOVER_2026-07-03.md` — current state, risks, and next week start plan.
2. `docs/NEXT_SLICES.md` — the active implementation path.
3. `docs/FIRST_PLAYABLE_SPEC.md` — what the first playable must prove.
4. `docs/TECH_BOUNDARIES.md` — allowed, parked, and explicitly out of scope.
5. `docs/VISUAL_SCOPE_AND_ART_DIRECTION.md` — visual doctrine and asset-light constraints.
6. `docs/PLAYABLE_LOOP_AND_UX_LOCK.md` — UX/game-loop completion target.
7. `GCD.md` — concept anchor and tone.
8. `progress.md` — detailed development history.

## First action in a fresh session

Launch the game and play it once before changing code.

Write down the first three things that make it feel unfinished as a game, not as an engine. Fix those before adding any new rendering or tool systems.
