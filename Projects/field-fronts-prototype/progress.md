# Progress

## 2026-05-20 - Linear Unit Movement Interpolation

Removed per-tick eased interpolation from continuous unit movement.

### Landed

- Unit render motion now interpolates with linear progress instead of `smoothstep(progress)`.
- Kept visual interpolation detached from authoritative leader/squad/builder positions.
- Added runtime QA coverage to assert movement interpolation remains linear.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.

## 2026-05-20 - Navigation Authority + Coast Sliding Fix

Fixed authoritative movement routes and builder blocked-job handling.

### Landed

- Split runtime movement path normalisation from order/intent path smoothing.
- Runtime navigation nodes are now preserved without smoothing drift into sea or blocker tiles.
- Added a runtime path-node invariant at movement path build time.
- Added shared movement step resolution for leaders, squads, and builders: full step, x-only slide, y-only slide, then blocked.
- Builders now track blocked retries and release jobs instead of holding claims forever.
- Construction work-point selection now considers multiple footprint/access candidates and chooses a reachable point.
- Added deterministic tests for sea-wall gap routing, sea-node prevention, coast sliding, builder progress across a coastline gap, and unreachable work-point release.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.

## 2026-05-20 - Building Placement + Construction Jobs v0

Connected the structure foundation to in-game placement and construction.

### Landed

- Build buttons now select structure placement mode instead of spending immediately.
- Placement preview tracks hover validity, cost, builder-base availability, terrain buildability, and structure overlap.
- Valid placement spends supplies once, creates a blueprint structure, and creates an explicit construction job.
- Added autonomous builder crews sourced from completed friendly outposts.
- Builder crews claim nearby jobs, move to structure work/entry points, contribute work over ticks, and release on completion.
- Completed structures activate existing structure topology/nav blockers; trenches complete as movement modifiers rather than blockers.
- Added grounded blueprint/construction rendering with stakes, dashed outlines, foundation fill, scaffold posts, and progress arcs.
- Extended runtime summaries/QA with construction counters.
- Added construction job tests covering placement, spending, job creation, claiming, progress, completion, nav signature change, and trench non-blocking behaviour.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Local static server verified at `http://127.0.0.1:4184/`.

Original prompt: in our projects/fields fronts prototype can we implement delta time/tick interval so we don't have to manually step through our sim mode anymore please, lets maybe demote any existing sim controls to a hidden panel now in our ui as we're trying to make a game here, not a sim.

## 2026-05-18 — Core Loop Seed

Implemented the first playable Field Fronts loop on top of the mapshop foundation.

### Landed

- Moved the exported map into `data/maps/field-fronts-map.json`.
- Added `src/game/gameModel.js` for leader units, outposts, command graphs, command scoring, influence radius, control, and front pressure.
- Added Play/Edit mode separation so selecting command entities does not accidentally paint the map.
- Added game overlays for player command, enemy command, control balance, and front pressure.
- Added a leader command graph panel for inspecting subinfluences.
- Added `run-game.cmd` as the base launcher.
- Added in-process tests for the game model.

### Deliberately deferred

- Movement orders.
- Combat resolution.
- Unit squads beneath leaders.
- Build menu/economy.
- Supply-line routing.

This slice is intentionally focused on proving the smallest command-field loop before deeper simulation work.


## 2026-05-18 — Runtime Contract Separation

Added a light runtime contract layer before adding movement/contestation.

### Landed

- Added `src/game/contracts.js` for MapData, GameState, Entity, Outpost, Leader, and CommandGraph boundaries.
- Added `field-fronts.game-state.v1` snapshots with map references.
- Added game-state serialise/deserialise helpers that deliberately omit derived fields.
- Added separate browser autosave keys for authored map data and runtime game state.
- Added Core Game Loop buttons for exporting/importing game state separately from map data.
- Added tests for snapshot round-trip and derived-field regeneration.

### Next

- Add one neutral/contestable outpost objective.
- Give leaders pressure/intention to move command influence towards that node.
- Let contestation resolve until one side breaks or loses the node.

## 2026-05-18 — Neutral Contest Node

Added the first neutral objective slice.

### Landed

- Added neutral faction styling and one contestable outpost node, `Signal Knoll`.
- Both leaders now derive an `objectiveProjection` towards the neutral node.
- Added an `objectivePressure` overlay to show projected pressure corridors.
- Added contest state to outposts: owner, control split, projected pressure, and status.
- Step ticks now resolve contest pressure; plain recompute/import/export only refreshes derived pressure.
- The Core Game Loop panel now reports objective status, player/enemy pressure, and control split.
- The renderer shows the neutral node as a diamond with a small contest meter.
- Extended game model tests for the contest node and objective pressure field.

### Validation

- `node --check src/game/gameModel.js src/editor/editorState.js src/main.js` via individual checks.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the required web-game client.
- Reviewed latest canvas screenshot: `output/web-game-mapshop/shot-1.png`.
- Reviewed objective full-page screenshot: `output/web-game-mapshop/objective-full-page.png`.
- Reviewed mobile screenshot: `output/web-game-mapshop/objective-mobile.png`.

### Next

- Add movement intent/order previews for leaders or subordinate squads before combat.
- Keep logistics/supply as pressure modifiers rather than instant capture rules.

## 2026-05-18 — Player vs Enemy Behaviour Split

Separated player choice from enemy automation so the prototype has an actual game decision layer.

### Landed

- Added leader `behavior` state with `controller`, `stance`, `intent`, and `lastDecision`.
- Added player pressure orders: Hold, Probe, Commit.
- Added enemy AI stance selection on ticks: it probes, holds, or counter-commits based on objective control and pressure gap.
- Player order changes objective projection immediately; contest control still moves only on ticks.
- Added behaviour state to game-state export/import.
- Updated the Core Game Loop panel with pressure-order buttons and player/enemy behaviour readouts.
- Updated browser smoke to click the player Commit order instead of only exercising terrain paint.
- Extended model tests to prove manual player order and autonomous enemy response are distinct.

### Validation

- `node --check src/game/gameModel.js` and `node --check src/ui/components.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: canvas still shows leaders, command radii, objective, and control.
- Reviewed `output/web-game-mapshop/player-enemy-behaviour-full-page.png`: Commit order and enemy AI Commit readouts render cleanly.
- Reviewed `output/web-game-mapshop/player-enemy-behaviour-mobile.png`: mobile layout still fits with the new controls.

### Next

- Add movement/order previews so player pressure can become spatial commitment rather than a pure stance multiplier.
- Consider enemy behaviour telegraphing, so the player can read what the enemy is about to do before committing.

## 2026-05-18 - Ground Foot Movement

Added the first grounded movement slice for leader units.

### Landed

- Added a foot movement model: one tick is one minute, one tile is 100m, and clear-foot movement stays under walking pace.
- Leaders now carry fractional `position` alongside coarse integer `tile` coordinates.
- Player and enemy stances now choose movement targets: Hold returns to anchor, Probe stages toward the objective, Commit moves at the objective.
- Terrain passability/logistics now slows movement; sea is treated as blocked for ground units.
- Added a small terrain-aware waypoint step so foot units route around sea instead of walking a straight blocked line.
- Command fields, objective pressure, selection, and rendering now use fractional leader positions.
- Leader markers were resized down to proportional map dots with subtle rings instead of oversized unit badges.
- Added movement intent lines and target dots for moving or blocked leaders.
- UI summaries now report movement status and km/h.
- Extended in-process tests to prove leaders move gradually, remain on foot, and do not teleport to the objective.

### Validation

- `node --check src/game/gameModel.js`, `src/rendering/canvasRenderer.js`, `src/ui/components.js`, and `tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: leaders render at map scale with visible movement intent lines.
- Reviewed `output/web-game-mapshop/movement-full-page.png` and `output/web-game-mapshop/movement-mobile.png`: movement metrics fit the side panel and mobile stack.

### Next

- Expand the waypoint step into explicit road/supply/pathfinding rules when logistics becomes a real system.
- Add subordinate squad footprints once leader movement feels right.

## 2026-05-18 - Influence Frontline Visualisation

Added the first explicit field-relationship/frontline visual layer.

### Landed

- Added derived `game.frontline` runtime data from the command-control balance field.
- Frontline extraction uses linear interpolation at the 0.5 control crossing, with a weighted projected-front fallback before command fields overlap.
- Added an `Influence Frontline` command overlay option.
- Reworked control/frontline rendering into a softer sampled influence wash instead of square-only tile overlays.
- Added radial command influence sphere rendering around leaders.
- Added a glowing frontline stroke weighted by contested pressure.
- Added a Core Game Loop summary metric for frontline segment count.
- Extended tests to prove frontline data is derived, serialisation omits it, and import recomputes it.

### Validation

- `node --check src/game/gameModel.js`, `src/rendering/canvasRenderer.js`, and `src/ui/components.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: control overlay now shows blended influence fields and a clean frontline.
- Reviewed `output/web-game-mapshop/frontline-full-page.png` and `output/web-game-mapshop/frontline-mobile.png`: overlay selector, frontline metric, and responsive layout render cleanly.

### Next

- Replace the projected-front fallback with a logistic/morale-driven tension field once supply and subordinate squads exist.
- Consider adding a subtle animated shimmer tied to pressure volatility rather than tick count alone.

## 2026-05-18 - Player Movement Intent Injection

Added direct player path-order input and stabilized line rendering.

### Landed

- Play-mode click still selects units.
- Click-drag from the selected player leader now injects a `path-hold` movement order.
- Player path orders persist in game-state snapshots and summarised debug state.
- Movement now follows the next meaningful point in the injected path before falling back to terrain routing.
- Drag preview renders while the pointer is held, then the applied path remains visible while the unit moves.
- Path storage now preserves hand-drawn route shape while smoothing close-point jitter.
- Frontline and intent lines now draw through shared stabilized path rendering with pixel snapping and smoothed curves.
- Added model tests for injected path orders and movement towards the ordered hold point.

### Validation

- `node --check src/game/gameModel.js`, `src/input/pointerController.js`, `src/rendering/canvasRenderer.js`, and `src/editor/editorState.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/drag-intent-preview.png`: drag preview line and target marker render cleanly.
- Reviewed `output/web-game-mapshop/drag-intent-applied.png`: stored path order remains visible and the player leader moves along it.

### Next

- Add explicit cancel/replace order affordances so path orders are more legible and reversible.
- Add terrain legality feedback while dragging, especially for water and mountain crossings.

## 2026-05-18 - Stabilised Spatial Influence Lines

Extended the stabilised line renderer across command-field visuals.

### Landed

- Added command-field contour extraction in the canvas renderer for player and enemy command fields.
- Player Command and Enemy Command overlays now show smoothed iso-line bands over their tile wash.
- Control and Influence Frontline overlays now include both factions' command contours alongside the frontline.
- Static command-radius rings now draw through the same stabilised path renderer rather than raw canvas arcs.
- Radial command influence spheres now include subtle stabilised internal contour rings.
- Reused the existing dedupe, smoothing, pixel snapping, and curved path drawing pipeline for spatial field lines.

### Validation

- `node --check src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: combined control/frontline view now includes smoother command contours and radius rings.
- Reviewed `output/web-game-mapshop/player-command-contours.png` and `enemy-command-contours.png`: individual spatial influence overlays render cleanly.
- Reviewed `output/web-game-mapshop/field-contours-mobile.png`: mobile view still fits and remains readable.

### Next

- Consider exposing contour density/intensity as a debug/render setting once the UI has a proper display-options panel.

## 2026-05-18 - Resisted Frontline Fields

Corrected frontline semantics so opposing command fields resist rather than freely overlap.

### Landed

- `deriveCommandInfluenceFields` now keeps raw command fields separately from resisted visible command fields.
- Player/enemy command fields resolve through a resistance membrane: dominant-side influence remains, contested intersection suppresses overlap, and a small bleed survives across the line.
- `frontPressure` now represents resistance/contact pressure instead of simple overlap.
- Frontline extraction now prefers the raw-field equal-pressure contour where enough command mass exists.
- The projected-front fallback now bends through the contest objective instead of drawing a ruler-straight bisector.
- Reworked command glow rendering to use resisted resolved fields, so the visible command spheres deform against opposition.
- Deformed command-radius contours now come from resolved field contours rather than static circles when possible.
- Added tests that raw command influence remains available and resisted command influence is suppressed at contested contact.

### Validation

- `node --check src/game/gameModel.js` and `src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: opposing fields now push into a visible resistance membrane rather than visually overlapping.
- Reviewed `output/web-game-mapshop/resisted-frontline-full-page.png` and `resisted-frontline-mobile.png`: responsive layout remains readable.

### Next

- Let terrain/supply/logistics locally bend resistance strength once those systems become first-class.

## 2026-05-19 - Auto Tick Game Runtime

Moved Field Fronts away from manual sim stepping and into a running game loop.

### Landed

- Added a real-time tick accumulator in `src/main.js`; the battle advances while the in-game screen is active, unpaused, and in play mode.
- `window.advanceTime(ms)` now consumes elapsed milliseconds deterministically instead of always stepping exactly one tick.
- Added a configurable `simTickIntervalMs` runtime setting, defaulting to 750ms.
- Kept the player pressure order controls visible as the primary game action.
- Collapsed manual tick stepping, reset, state import/export, overlay selection, command radii, and expanded debug metrics into an `Advanced simulation` panel.
- Added runtime timing state to `render_game_to_text()` for browser checks.

### Validation

- `node --check src/main.js`, `src/ui/components.js`, and `src/editor/editorState.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/auto-tick-ui-full-page.png`: the game reached tick 2 automatically, player Commit remains visible, and sim controls are collapsed.

### Next

- Consider replacing the right-side prototype control stack with a thinner in-match command drawer once more game actions move into the HUD.

## 2026-05-19 - Smooth Leader Movement Interpolation

Smoothed visible unit movement without changing canonical tick resolution.

### Landed

- Added a render-only leader motion buffer keyed by leader id.
- Each tick captures the currently displayed leader positions, advances canonical game state, then eases the visual dots toward the new tick positions.
- The animation loop now redraws active gameplay frames while movement interpolation is running.
- Movement intent lines and command radii read from the same visual position helper, so overlays stay attached to the smoothed unit location.
- `render_game_to_text()` now reports whether motion smoothing is active and its current progress.

### Validation

- `node --check src/main.js`, `src/rendering/canvasRenderer.js`, `src/editor/editorState.js`, and `src/ui/components.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Playwright probe confirmed `runtime.motionSmoothing.active === true` mid-tick with progress around 0.15.
- Reviewed `output/web-game-mapshop/smooth-motion-full-page.png`: command UI remains stable while the game is running.

## 2026-05-19 - Visual Smoothing Slice v0

Beautified the canvas renderer without changing map data, simulation rules, or entity positions.

### Landed

- Added a renderer-only `renderScale` / `visualTileResolution` option, defaulting to a higher-resolution visual pass.
- Moved terrain painting into a cached high-resolution offscreen buffer.
- Added bilinear terrain colour sampling so biome edges blend softly instead of reading as hard tile blocks.
- Kept terrain debug/identity marks on top of the smoothed buffer so map legibility survives the polish pass.
- Switched command, influence, and terrain-field washes to interpolated scalar-field sampling.
- Rebuilt frontline drawing from marching-squares control contours when available, then smoothed the contour with Chaikin curve passes.
- Smoothed movement order and drag-preview paths with Catmull-Rom interpolation while keeping canonical path data untouched.

### Validation

- `node --check src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: terrain transitions, field wash, command contours, frontline, entities, and objective marker render cleanly.

### Next

- Consider a small display-options drawer later for render scale, contour density, and dither intensity once display tuning becomes player-facing.

## 2026-05-19 - Economy Resource Foundation

Added the first economy data slice without rendering new UI.

### Landed

- Added `src/game/economy.js` as the resource definition and economy-state owner.
- Added `RESOURCE_IDS.supplies` and `RESOURCE_DEFINITIONS` so the economy can expand beyond one resource later.
- Modelled `supplies` as an aggregate resource with `provisions`, `materiel`, and `transit` component buckets.
- Added per-faction economy stockpiles for player and enemy to `GameState`.
- Persisted economy state through game-state export/import and exposed it through `summarizeGame()`.
- Updated runtime contract docs to describe the new economy state shape.

### Validation

- Added game-model tests for resource definition, initial stockpiles, component keys, snapshot persistence, and import restoration.
- `node --check src/game/economy.js`, `src/game/gameModel.js`, `src/game/contracts.js`, and `tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Verified `output/web-game-mapshop/state-1.json` includes hidden `game.economy.resources.supplies` and player/enemy stockpiles; reviewed `shot-1.png` to confirm no economy UI was rendered.

## 2026-05-19 - Supply Income Gradient

Added the first economy tick rule without rendering new economy UI.

### Landed

- Base/home outposts now add Supplies to their owning faction every game tick.
- Contestable neutral outposts now pay Supplies on a control gradient, so both factions earn partial Supply while the node is still contested.
- Signal Knoll's existing `supply: 0.62` now means it contributes up to 6.2 Supply per tick, split by live control.
- Supply income is split evenly across `provisions`, `materiel`, and `transit` component buckets.
- Per-faction `lastIncome.supplies` records source rows for base outposts and contest-gradient outposts.

### Validation

- Added tests for opening income, post-tick stockpile growth, player-favoured gradient income, income source rows, and component totals.
- `node --check src/game/economy.js`, `src/game/gameModel.js`, and `tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Verified `output/web-game-mapshop/state-1.json`: at tick 3, player Supplies reached 39.653 with base + contest-gradient income, enemy Supplies reached 38.947 with its own gradient share.
- Reviewed `output/web-game-mapshop/shot-1.png`: no new economy UI is rendered.

## 2026-05-19 - Bicubic Terrain Sampling Pass

Upgraded the terrain smoothing kernel without changing map data, simulation rules, or entity positions.

### Landed

- Replaced the first-pass bilinear terrain colour blend with a 4x4 Catmull-Rom bicubic sampler.
- Kept the high-resolution offscreen terrain buffer and render cache from Visual Smoothing Slice v0.
- Clamped bicubic colour channel output to avoid visible overshoot/halo artefacts at sharp biome transitions.

### Validation

- `node --check src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: bicubic biome transitions render smoothly without obvious colour ringing, and the text state still reports unchanged terrain counts and canonical game state.

## 2026-05-19 - Terrain Buffer Source-Rect Fix

Fixed a render-only coordinate regression introduced by the high-resolution terrain buffer.

### Landed

- Corrected `drawImage()` to sample the full offscreen terrain buffer instead of `terrainBuffer.width / renderScale`.
- Kept map export/import data untouched; the problem was source-rectangle scaling during presentation, not authored tile coordinates.

### Validation

- `node --check src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: terrain, terrain marks, leaders, objective marker, contours, and pointer-selected tile align again.

## 2026-05-19 - Terrain Material Mask Pass

Replaced smeary whole-map terrain colour interpolation with a render-only terrain material pass.

### Landed

- Corrected terrain buffer sampling to use pixel-centre world coordinates instead of a half-tile shifted sample.
- Replaced bicubic colour interpolation across flat terrain IDs with sharpened terrain membership masks sampled from tile centres.
- Added per-terrain procedural material variation for land, forest, river, sea, and mountains.
- Kept biome interiors readable while allowing borders to soften across tile corners.
- Preserved map JSON, authored terrain IDs, mechanics, entity positions, overlays, and pointer/tile mapping.

### Validation

- `node --check src/rendering/canvasRenderer.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: terrain now reads as material surfaces with softer borders instead of smeared flat-colour bicubic blur; text state still reports unchanged terrain counts and canonical game state.

## 2026-05-19 - Heightmap Terrain Fields

Added canonical per-tile elevation and routed it through rendering and tactical fields.

### Landed

- Added `map.elevation[y][x]` as a backward-compatible MapData layer.
- Generated elevation for legacy maps that only contain terrain IDs, and preserved elevation through map export/import.
- Added elevation summaries to `render_game_to_text()` and elevation signatures to map references.
- Derived terrain fields now use per-tile elevation and slope: height is no longer only the static terrain-type value.
- Movement, pathfinding cost, command-field carry, resistance/front pressure, command scoring, and objective projection now account for elevation/defensible ground where relevant.
- Terrain rendering now shades procedural materials with sampled elevation relief while keeping map tile IDs canonical.
- Tuned terrain buffer resolution so material generation no longer blocks browser startup.

### Validation

- `node --check src/world/mapModel.js src/world/fields.js src/editor/editorState.js src/editor/brush.js src/game/contracts.js src/game/gameModel.js src/rendering/canvasRenderer.js tests/editorModel.test.mjs tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: relief shading is visible, terrain remains aligned, and entities/overlays still read cleanly.
- Verified `output/web-game-mapshop/state-1.json` includes elevation min/max/average and an elevation signature in `game.mapRef`.

## 2026-05-19 - Supplies UI Fronting

Surfaced the first economy resource in the playable UI now that the economy model and income tick rules are landed.

### Landed

- Replaced the old fake economy sliders with a live Supplies readout bound to `game.economy`.
- The collapsed bottom-right HUD button now shows the current player Supplies amount.
- The opened economy drawer shows Supplies, per-tick income, component buckets, and source rows for base outpost and neutral objective gradient income.
- The right command summary now reports player Supplies and latest income instead of the older player-order metric.
- Kept the economy surface compact and collapsed by default so it reads as game HUD, not simulation tooling.

### Validation

- `node --check src/ui/gameUI.js` passed.
- `node --check src/ui/components.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Targeted Playwright probe opened Skirmish, selected Commit, waited for live ticks, opened the Economy drawer, and found no browser errors.
- Reviewed `output/web-game-mapshop/supplies-ui-full-page.png`: Supplies count, income, component buckets, and income source rows render cleanly over the game.

## 2026-05-19 - Build Purchase Supply Spend

Hooked the build and unit HUD buttons into the Supplies economy.

### Landed

- Added `src/game/buildCatalog.js` as the shared source for building/unit labels, glyphs, and Supply costs.
- Added economy helpers for `canAffordSupplies()` and `spendSupplies()`.
- Build and unit buttons now request a purchase; successful purchases deduct the cost from the player Supplies stockpile.
- Unaffordable build/unit buttons are disabled and visually subdued until enough Supplies are available.
- Successful purchase state is reflected in the active build tile and HUD status.

### Validation

- `node --check src/game/economy.js`, `src/game/buildCatalog.js`, `src/main.js`, `src/ui/gameUI.js`, and `tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Targeted Playwright probe confirmed an Outpost purchase reduced player Supplies by exactly 80 synchronously and produced no browser errors.
- Reviewed `output/web-game-mapshop/build-purchase-supplies-sync.png`: purchased/affordable/unaffordable build tiles and the live Supplies drawer render cleanly.

## 2026-05-19 - Infantry Squad and LoS Foundation

Promoted the Infantry button into the first deployable squad unit.

### Landed

- Buying Infantry now spends Supplies and deploys a `squad` entity from the player outpost/barracks.
- Infantry squads contain four member records and render as four smaller dots rather than a commander-sized marker.
- Added squad attributes: cohesion, morale, firepower, discipline, scouting, influence radius, sight radius, and speed multiplier.
- Squads contribute to battlefield influence fields and objective pressure as they move closer to the fight.
- Added first-pass line-of-sight fields: `playerLoS` and `enemyLoS`, derived from leaders and squads with terrain attenuation.
- Hold/Probe/Commit now apply to player squads as overarching behaviour, while direct click-drag path intent works for selected squads.
- Selection now chooses the nearest unit when commander and squad markers cluster near the outpost.
- Squad state persists through game-state snapshots and appears in `render_game_to_text()`.
- The command graph panel now shows squad attributes when an infantry squad is selected.

### Validation

- `node --check` passed for `src/game/gameModel.js`, `src/game/contracts.js`, `src/main.js`, `src/input/pointerController.js`, `src/rendering/canvasRenderer.js`, `src/ui/components.js`, and `tests/gameModel.test.mjs`.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Targeted Playwright probe bought Infantry, selected the squad, drag-issued a path-hold order, confirmed one squad with four members, confirmed LoS tile counts, and found no browser errors.
- Reviewed `output/web-game-mapshop/infantry-squad-path.png`: four infantry dots render smaller than the commander, selection/attribute UI works, and the build panel remains usable.

### Next

- Consider adding a dedicated LoS overlay toggle to the normal HUD rather than leaving it only in advanced simulation.
- Add collision/formation spacing so newly deployed squads do not start too close to the commander marker.

## 2026-05-19 - Runtime Performance First Wins

Reduced the main-thread work that made movement interpolation feel jittery after squads and LoS landed.

### Landed

- Game autosave no longer runs every auto tick; runtime game-state persistence is now throttled to 60 seconds by default.
- Added a Pause -> Settings autosave slider from 15 seconds to 3 minutes.
- Autosave snapshots now use the current normalised runtime state and skip field/frontline/LoS recomputation.
- LoS derivation now paints only inside each entity's sight radius instead of scanning every map tile against every entity.
- `render_game_to_text()` now exposes the active game autosave interval under runtime metadata.

### Validation

- `node --check` passed for `src/editor/editorState.js`, `src/game/gameModel.js`, `src/main.js`, and `src/ui/gameUI.js`.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Targeted Playwright probe confirmed the Settings panel exposes `Autosave 1m` and produced no browser errors.

### Notes

- "Game persistence" means saving runtime battle state to localStorage for reload/restore.
- Important player actions are purchases, direct movement/path orders, stance changes, reset/import, and similar intentful state changes. Auto ticks now mark state dirty but do not force immediate storage.
- Remaining performance work should measure render cost separately from simulation cost, then consider moving field/LoS recompute to a worker or amortising field updates across ticks.

## 2026-05-19 - Intended Path Cache Foundation

Made pathfinding respect player-authored intent routes while reducing repeated route solving during live ticks.

### Landed

- Player drag paths now carry `routeMode: player-intended`, meaning the drawn line is treated as route anchors/objective intent rather than permission to pass through blocked ground.
- Leaders and squads now cache compiled `movementPath` data with route kind, target, map signature, source signature, cursor, blocked state, and terrain-aware nodes.
- Player-intended paths compile each hand-drawn segment through the terrain-aware pathfinder, so slow/flanking terrain choices can be preserved without walking through water.
- AI/stance movement now compiles and caches `auto` routes separately, making the player/enemy controller split clearer in state and tests.
- Movement path cursors advance as units reach nodes, so cached paths are reused across ticks until the order, target, or map signature changes.
- Movement-intent rendering now prefers the compiled cached route, falling back to raw order paths only when no compiled route exists yet.

### Validation

- `node --check src/game/gameModel.js`, `src/rendering/canvasRenderer.js`, and `tests/gameModel.test.mjs` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Reviewed `output/web-game-mapshop/shot-1.png`: canvas remains nonblank and readable with terrain, LoS/influence overlays, frontline, objective, units, and route strokes visible.

### Next

- Replace the current sorted-frontier A* implementation with a real priority queue if pathfinding still shows up in profiling.
- Add collision/zone-of-control costs so intended paths can bend around enemy bodies and threat rather than only terrain.
- Add route legality/terrain feedback while dragging so the player can see when an intended line needs a long detour.

## 2026-05-19 - Tactical Render and LoS Cache Pass

Focused on the visible jitter/performance problem after infantry, LoS, and pathfinding made the frame loop heavier.

### Landed

- Added a cached offscreen tactical layer for field washes, command contours, command radii, and frontline strokes.
- Movement interpolation frames now redraw the terrain, cached tactical bitmap, moving intent lines, entities, and selection, instead of rebuilding contour/field visuals every animation frame.
- Canvas resize now invalidates caches only when the viewport/device pixel ratio actually changes.
- Auto ticks no longer force an immediate extra render through the event bus; the animation loop renders once after any tick catch-up.
- Added renderer counters to `render_game_to_text()` so browser probes can inspect render count, tactical cache builds, and tactical cache hits.
- Added a runtime LoS cache keyed by map geometry plus unit tile/sight/scouting signatures, so fractional movement within a tile does not repaint visibility fields.

### Validation

- `node --check src/rendering/canvasRenderer.js`, `src/main.js`, and `src/game/gameModel.js` passed.
- `npm.cmd test` passed: editor model and game model.
- `npm.cmd run test:browser` passed through the web-game client.
- Browser state after the smoke reported `renderCount: 43`, `tacticalLayerBuilds: 4`, and `tacticalLayerHits: 39`, confirming interpolation frames are using the cached tactical layer.
- Reviewed `output/web-game-mapshop/shot-1.png`: canvas remains nonblank and readable with terrain, fields, frontline, units, and movement strokes visible.

### Next

- Profile simulation tick cost separately from render cost now that the render loop is less noisy.
- If tick cost is still high, cache command influence/entity falloff per tile or stagger full command-field rebuilds across ticks.
- If visual movement still jitters perceptually, tune interpolation duration/easing after confirming frame rate is stable.

## 2026-05-20 - Runtime Spike Reduction

Reduced the mass-unit tick spikes that were causing visible FPS drops.

### Landed

- Added a compact FPS HUD badge beside the tick counter.
- Added dirty/cadenced caches for command fields, line of sight, and frontline diagnostics.
- Reworked command/objective pressure painting to bounded entity/corridor passes instead of full tile-by-entity scans.
- Added terrain runtime grids so command and LoS passes reuse terrain carry/clarity values.
- Fixed `getTerrainField()`/`getElevationSlope()` so elevation reads no longer normalize the whole map on every sample.
- Kept the shared reverse flow-field routing model intact and replaced its priority frontier with a binary heap.
- Added renderer culling gates for offscreen squads, leaders, and movement intent paths.

### Validation

- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Actual 520-squad chokepoint tick probe: first tick ~56ms, steady ticks ~13-32ms in-process.
- Runtime QA horde projection dropped from ~14131ms to ~263ms, with chokepoint sample at ~15.9ms.

### Next

- If horde-scale cold ticks still hitch on Felix's machine, prewarm shared flow fields when issuing an order or budget route-field builds across frames.
- Consider replacing the projection-based horde warning with an actual 520-entity probe now that the path is fast enough to run directly.
