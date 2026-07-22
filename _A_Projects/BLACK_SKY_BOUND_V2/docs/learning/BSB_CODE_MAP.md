# BSB Code Map For Learning

This is the shortest useful map of the project for learning purposes.

## Runtime chain

```txt
index.html
  ↓
src/app.js
  ↓
createInitialGameState(...)
  ↓
fixed-step loop
  ↓
ACTION_SYSTEMS in src/game/systemOrder.js
  ↓
buildRenderProjection(...)
  ↓
WebGLGameRenderer layer registry
```

When lost, come back to that chain.

## What each folder means

| Folder | Plain English meaning | Beginner-safe? |
|---|---|---|
| `src/data` | Design/tuning tables | Yes |
| `src/constants` | Enum-style names | Yes, read first |
| `src/components` | Component factory functions | Yes, after data |
| `src/ecs` | Entity/component storage and query helpers | Read carefully, edit rarely |
| `src/systems` | Gameplay behaviour | Edit after Phase 2 |
| `src/projection` | Turns game state into render packets | Edit after systems |
| `src/render` | Renderer orchestration and WebGL | Edit later |
| `src/world` | Map and terrain truth | Safe with tests |
| `src/terrain` | Tile/blob/spline rules | Safe once you understand arrays/grids |
| `tests` | Proof contracts | Yes, always |

## The three questions to ask before changing any file

1. Is this **data**, **behaviour**, **projection**, or **rendering**?
2. What test or visual result will prove the change worked?
3. Am I adding a new truth source by accident?

If the answer to question 3 is “maybe”, stop and ask me. That is where goblins live.

## Safe first edit targets

### `src/data/actors.js`

Use for:

- HP
- speed
- radius
- actor labels
- simple AI tuning

Do not use for:

- movement logic
- attack collision logic
- renderer rules

### `src/data/abilities.js`

Use for:

- cooldowns
- damage
- smoke radius/duration
- ability reach

Do not use for:

- deciding when input fires
- deciding what gets hit

### `src/data/napalmDribble.js`

Use for:

- drip interval
- droplet size
- pool size
- light radius/intensity
- scorch opacity

Do not use for:

- spawning logic
- renderer draw order

### `src/config.js`

Use for:

- FPS target
- fixed step setting
- camera tuning
- file size thresholds

Do not casually edit `fixedStepMs` unless you understand fixed-step loops.

## Files to respect

### `src/game/systemOrder.js`

This is the gameplay update order. Moving items here can cause subtle bugs. Treat it as a contract.

### `src/render/backends/webgl/WebGLGameRenderer.js`

This owns the WebGL layer order. Changing this can affect everything visible.

### `src/game/state.js`

This is a compatibility facade. Keep it thin. Do not turn it into the new `gameModel.js` swamp.

## How to read a system

Take `src/systems/napalmDripSystem.js` as the pattern:

1. Import component names and helpers.
2. Update existing live objects.
3. Query entities with required components.
4. Read the component data.
5. Apply small logic.
6. Write to render layer state.

That is a good mental model for most systems.

## How to read a test

Take `tests/napalmDribble.test.mjs` as the pattern:

1. Build a map.
2. Build game state.
3. Pull a component from the ECS.
4. Run one or more systems.
5. Assert the resulting state/projection is true.

That is how we prove a gameplay slice without needing to stare at the screen for ten minutes wondering if a pixel blinked.
