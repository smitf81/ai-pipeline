# Field Fronts Core Loop Prototype

A no-build browser prototype for the first Field Fronts loop: authored terrain, derived spatial fields, two outposts, and two equal leader units projecting command influence over the map.

## Run

```powershell
cd C:\Users\felix\Desktop\Automated_AI_Pipeline\Projects\field-fronts-prototype
.\run-game.cmd
```

Or manually:

```powershell
npm.cmd start
```

Open `http://127.0.0.1:4184/?seed=1` to force-load the exported map from `data/maps/field-fronts-map.json` and reseed runtime state.

## Current Slice

- Loads the first map-maker export from `data/maps/field-fronts-map.json`.
- Seeds a player outpost and enemy outpost at reasonable separated land positions.
- Spawns one equal leader unit at each outpost.
- Gives each leader a command graph of subinfluences.
- Derives command score, influence radius, control balance, and front-pressure fields.
- Keeps terrain painting/editing available, but defaults to Play Loop mode.
- Exposes `window.render_game_to_text()` and `window.advanceTime()` for automated browser checks.
- Separates authored map data from runtime game state through `field-fronts.game-state.v1`.
- Adds game-state export/import and separate browser autosave for runtime state.

## Tests

```powershell
npm.cmd test
```

Browser smoke, where the Codex web-game Playwright client is available:

```powershell
npm.cmd run test:browser
```
