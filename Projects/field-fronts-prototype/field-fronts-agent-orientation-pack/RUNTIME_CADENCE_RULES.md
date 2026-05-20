# Field Fronts Runtime Cadence Rules

This document defines what is allowed to run every render frame, what must run only on simulation ticks, and what should be hidden or cadenced as diagnostic tooling.

The goal is simple: the player should see smooth motion while the game avoids rebuilding expensive battlefield truth every frame.

## Runtime lanes

| Lane | Cadence | Belongs here | Must not do |
|---|---:|---|---|
| Render frame | Every `requestAnimationFrame` | canvas clear/draw, camera/view sizing, input hover preview, visual interpolation | advance game tick, recompute command fields, autosave, path rebuild, economy income |
| Visual interpolation | Every frame while active | lerping units from previous sim position to latest sim position | change authoritative unit position |
| Simulation tick | `state.simTickIntervalMs`, default 750 ms | enemy stance decision, leader/squad movement step, contest resolution, derived command fields, supply income | run more than one tick per frame, rebuild purely diagnostic layers |
| Diagnostic tactical layer | only when visible, cached per sim state | command wash, command contours, command radii, frontline rendering | draw while overlay is hidden, force default player view to pay diagnostic cost |
| Player event | immediate | purchase, player stance change, movement order, map paint, manual step | autosave synchronously every time |
| Persistence | debounced, default 60 s | game autosave after dirty runtime events | write localStorage every frame/tick |
| Map persistence | explicit/map edit only | authored terrain/map data | save derived runtime fields |

## Absolutely must be computed every render frame

Only these are allowed by default:

- clamp current frame delta
- accumulate time toward the next sim tick
- update active visual interpolation
- render current canvas state
- process pending debounced autosave check

Everything else needs a stronger reason.

## Must be computed on simulation tick only

These are authoritative game-state changes and should occur once per sim tick:

- `game.tick += 1`
- enemy behaviour choice
- leader movement step
- squad movement step
- contest/outpost control update
- command-field recompute
- frontline data derivation
- supply income tick
- game dirty flagging

These are allowed to be expensive compared with drawing, but they must not run every frame.

## Player moments that matter for state and persistence

These moments should mark runtime state dirty:

- player changes pressure stance
- player issues a movement/path order
- player purchases or deploys a unit/building
- manual tick advances the game
- auto tick advances the game
- game state import/reset

These moments should mark map state dirty:

- terrain painted
- map imported/replaced/reset
- undo/redo changes authored terrain

Derived fields, command overlays, front lines, and render interpolation are not persisted as authoritative state. They are regenerated from map plus game state.

## Frontline rule

The battlefront/frontline visual is diagnostic by default.

Default player view:

- `gameOverlay: none`
- `showCommandRadii: false`

The player should not pay the rendering cost or visual clutter cost unless the overlay is explicitly enabled. Later, this can become a diegetic/unlockable overlay: scouts, signal intelligence, command-table technology, map-room upgrades, magical/AI battlefield sight, etc.

## Current implementation notes

- Automatic simulation is capped to one game tick per render frame to prevent catch-up bursts from restarting interpolation several times in one frame.
- Frame delta is clamped to 100 ms so tab hitches and Windows nonsense do not create giant timing spikes.
- Movement interpolation uses cloned start/end positions and smoothstep easing so rendered units do not mutate or inherit stale references.
- Manual UI stepping routes through the same tick/interpolation path as auto stepping.
- Tactical overlays are skipped entirely while hidden.

## Rejection rule for future agents

Reject any patch that:

- advances `advanceGameTick()` inside the render loop without cadence control
- recomputes command fields every frame
- draws diagnostic frontlines by default
- rebuilds contour/tactical layers while hidden
- writes game state every frame
- updates authoritative entity position inside visual interpolation
- runs multiple catch-up ticks in one frame unless explicitly justified by a deterministic fixed-step replay mode
