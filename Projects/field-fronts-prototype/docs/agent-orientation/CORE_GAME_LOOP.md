# Field Fronts Core Loop Slice

This slice turns the mapshop into a tiny playable command-field prototype without replacing the map editor.

## Map placement

The exported map lives at:

```text
data/maps/field-fronts-map.json
```

The browser loads this file on first boot. If local autosave already exists, launch with `?seed=1` or use `run-game.cmd` to force the seeded map. Runtime game state is saved separately from this map data.

## Starting game state

- Player outpost: seeded near the western playable landmass.
- Enemy outpost: seeded near the south-eastern playable landmass, far enough away to create a first front.
- Neutral contest node: `Signal Knoll`, seeded between the two leader anchors.
- Each outpost spawns one equal leader unit.
- Each leader has a command graph made from presence, morale cohesion, terrain logistics, outpost anchor, initiative clarity, and logistical discipline.
- The command score creates an influence radius, objective projection, and derived command fields.
- Player and enemy behaviour are now separate: the player picks pressure orders, while the enemy AI picks its own stance on ticks.

## Current loop

1. Load terrain map.
2. Seed player, enemy, and neutral contestable outposts.
3. Spawn one leader per outpost.
4. Derive terrain fields.
5. Derive command influence fields.
6. Project each leader's pressure toward Signal Knoll.
7. Apply player order: Hold, Probe, or Commit.
8. Let enemy AI choose Hold, Probe, or Commit based on objective control and pressure gap.
9. Display player/enemy/control/front-pressure/objective-pressure overlays.
10. Step ticks to resolve contest pressure into the neutral node's control meter.

This is intentionally not a full battle sim yet. It is the smallest loop for proving command influence, outpost anchoring, and front pressure over the authored map.

## Player vs enemy behaviour

- Player behaviour is explicit and UI-driven through `Player Pressure Order`.
- Enemy behaviour is AI-driven in `advanceGameTick()` and can counter-commit, probe, or hold.
- Pressure order changes objective projection immediately, but contest ownership only moves on ticks.
- This is the first real game decision layer: player choices alter the pressure race instead of both sides remaining mirrored simulation emitters.


## Runtime contract pass

- `src/game/contracts.js` defines the current MapData/GameState/Entity/Outpost/Leader/CommandGraph contracts.
- `GameState` now carries `contract: field-fronts.game-state.v1`, `version`, `mapRef`, tick, phase, selected entity, outposts, and leaders.
- Derived influence fields are not saved; they are rebuilt from map + game state.
- Contest control is mutable runtime state, but projected pressure and objective-pressure fields are derived.
- The Core Game Loop panel can export/import runtime state separately from terrain map export/import.
- Local browser autosave now uses separate map and game-state keys to avoid muddying the map maker export format.
