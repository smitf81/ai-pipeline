# Field Fronts Missing Export Hotfix

Replace this file in your working copy:

- `src/game/gameModel.js`

## Fix

Restores the missing named export expected by `src/input/pointerController.js`:

- `setPlayerMovementIntent(gameOrState, tile, options)`

The function is intentionally small and contract-safe:

- accepts either `state` or `state.game`
- targets the currently selected player leader/unit, falling back to the first player movable entity
- records a `movementIntent` with `targetTile`, `issuedAtTick`, and `source`
- does not yet introduce automatic pathfinding or sim creep

## Validation run

```text
node --check src/game/gameModel.js
node --input-type=module -e "import { selectGameEntityAtTile, setPlayerMovementIntent } from './src/game/gameModel.js'; console.log(typeof selectGameEntityAtTile, typeof setPlayerMovementIntent);"
npm test
```
