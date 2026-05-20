# Field Fronts Runtime Contract Patch

Apply these files over the previous `field-fronts-core-loop-files` slice.

## What this patch does

- Adds `src/game/contracts.js` as the lightweight contract layer.
- Keeps `data/maps/field-fronts-map.json` as authored MapData, not runtime state.
- Adds `field-fronts.game-state.v1` snapshot/export/import helpers.
- Adds separate browser autosave for runtime game state.
- Adds Core Game Loop buttons for `Export State` and `Import State`.
- Updates tests and docs.

## Run

```powershell
.\run-game.cmd
```

## Validate

```powershell
npm.cmd test
```

## Notes

Launch with `?seed=1` to force-load the authored map and reseed runtime state from the map.
Without `?seed=1`, the browser will try to restore the separately autosaved map and game state.
