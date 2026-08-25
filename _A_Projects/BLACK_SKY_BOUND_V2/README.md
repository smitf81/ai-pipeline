# Black Sky Bound v2 Demo

Focused first-playable prototype for **Black Sky Bound**: a top-down young-dragon action-survival game set in a hostile night forest.

The project is anchored to `GCD.md`, but the current production lock is stricter than the dream version:

- ship one short playable scenario;
- prove movement, close combat, smoke, enemy pressure, death/retry, and escape;
- keep the visual language asset-light and WebGL primitive/projection driven;
- do not build an art pipeline, editor system, RTS layer, full 2.5D renderer, or AI asset factory for this first release candidate.

## Fast launch on Windows

Double-click:

```txt
LAUNCH_BSB.bat
```

That starts a small local Node server and opens the game in your browser.

Optional PowerShell version:

```powershell
.\LAUNCH_BSB.ps1
```

## Terminal launch

```bash
npm test
npm start
```

Open `http://127.0.0.1:5177` if the browser does not open automatically.

## Current controls

- WASD / arrows: move independently of mouse-facing
- Hold Shift: sprint while stamina lasts
- Space: dodge in the held move direction; without movement, retreat away from the cursor
- Space during a dodge: reserve one second dodge after a 60ms landing beat
- LMB during the dodge window: commit a cursor-directed 1.75m Pounce Counter; otherwise LMB attacks normally
- Left click or J: tooth/claw attack
- Q: body lunge
- Right click: radial smoke burst after the Level 1-to-2 instinct awakening (directional smoke remains a later locked refinement)
- Mouse wheel: zoom

## Current state — 2026-07-10

The runtime is now WebGL-only. Canvas 2D runtime fallback is gone; the HTML canvas remains only as the WebGL drawing surface.

Recent project work established:

- AXIOM-baked First Escape / First Flightless Night map publication into standalone BSB;
- an 80x60 authored runtime map loaded through the manifest default without fallback;
- grounded wyvern projection continuity and action/dodge recovery;
- stamina, sprint, and dodge for player plus bounded enemy evasion;
- raider, husk, and werewolf pressure/combat profiles;
- WebGL atmosphere, lights, smoke, napalm pools, SDF scene-object shadows, and post-process ownership;
- Actor Light-Silhouette Readability v0, which passed technically but is visually too subtle to count as a meaningful player-facing improvement yet.
- Mama Wyvern World Event v0: distant-roar warnings, player-derived shadow flyovers, optional faction-neutral inferno barriers, enemy avoidance pressure, residual light/smoke burnout, and manual lightning-sync validation controls.

## Current production priority

Next week should be **game loop and UX tightening**, not more rendering ambition.

Immediate focus:

1. main menu / start flow;
2. pause/resume clarity;
3. death, retry, and win handling;
4. objective and control hints;
5. scenario readability and tuning;
6. one bounded atmosphere pass only after the loop is playable.

## Documentation entry points

Read in this order:

1. `docs/START_HERE.md`
2. `docs/HANDOVER_2026-07-03.md`
3. `docs/NEXT_SLICES.md`
4. `docs/FIRST_PLAYABLE_SPEC.md`
5. `docs/TECH_BOUNDARIES.md`
6. `docs/VISUAL_SCOPE_AND_ART_DIRECTION.md`
7. `docs/PLAYABLE_LOOP_AND_UX_LOCK.md`
8. `progress.md`
9. `docs/MAMA_WYVERN_WORLD_EVENT_V0.md`

## Boundary

Build the first playable. Prioritise creature feel, readable visuals, enemy pressure, smoke usefulness, death/retry, and escape flow.

Parked systems belong in `docs/TECH_BOUNDARIES.md`, not in the active design path.
