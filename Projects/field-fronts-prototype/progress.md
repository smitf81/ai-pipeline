# 2026-05-27 - First Night Shelter-Chain Truth Pass v0

Mouse can now proceed beyond the opening shelter without claiming sight it does not possess or repeating a completed target.

### Landed

- Replaced the shelter option's asserted `visible` state with a commander-known contract that reports knowledge source and leaves direct visibility unasserted.
- Ranked in-reach active objective shelter options first and removed completed objective shelters from follow-on choices, while preserving nearby route-support stops needed between objectives.
- Kept execution on the existing `orders:survival-intent` authority path; the browser QA bridge issues legal commands and only gameplay ticks advance scenario progress.
- Made the Mouse local-model example derive from the current active offered shelter, and reject non-listed follow-on targets before they reach gameplay validation.
- Added `npm.cmd run test:shelter-route`, which waits for objective milestones and completes all five First Night objectives through six legal shelter orders, including two route-support moves.
- Extended `npm.cmd run test:mouse:live` to require two accepted, honoured model actions: `light tree cover`, then `dense canopy` after the first objective completes.

### Validation

- `node --check` passed for the changed runtime, Mouse service and browser-runner modules.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:mouse` passed.
- `npm.cmd run test:shelter-route` passed: `5/5` objectives complete at tick `304`, with active-objective receipts for tree cover, canopy, riverbank hollow and final cave.
- `npm.cmd run test:mouse:live` passed against Ollama `qwen2.5-coder:1.5b`: `seek_shelter -> light tree cover`, followed by `seek_shelter -> dense canopy`, both `accepted/executed/accepted` and target-honoured.
- `npm.cmd run test:browser` passed using the web-game Playwright client.
- `npm.cmd run test:validation` passed: cadence audit `0` findings; sim frame-budget QA `7.26ms` average / `41.429ms` p95.
- Inspected `output/shelter-chain-qa/shelter-chain-complete.png` and `output/mouse-playtest/mouse-live.png`; the completion state and follow-on Mouse command are readable with no browser console errors reported by the QA runs.

### Residual

- Route-support stops are now truthful and provable, but their player-facing distinction from objective shelters is still subtle. A narrow consequence/readability pass can build on this contract without adding a parallel objective path.

# 2026-05-26 - Shelter Intent Contract v1: Mouse's First Finding

Mouse's first live playtest finding is now resolved: a legal `seek_shelter -> light tree cover` command no longer degrades into vague escape movement when the target is valid.

### Landed

- Added a canonical command-wheel shelter target contract carrying target id, label, shelter type, rating, position, visibility/reachability, tags, suitability and fallback reason.
- Preserved the selected shelter target through Mouse validation, `orders:survival-intent`, command-wheel intent args, AI behaviour packet metadata and unit behaviour response.
- Updated shelter behaviour context so explicit legal shelter targets are honoured before falling back to local field searches.
- Light tree cover remains valid partial shelter for the Chapter 1 tutorial instead of being filtered out by a hidden “strong shelter” expectation.
- Replaced vague shelter degradation with grounded reasons such as `target_below_shelter_threshold`, `target_not_reachable`, `target_not_visible_to_commander`, `no_anchor_position`, or `no_shelter_candidate_near_unit`.
- Extended Mouse action reporting with target honouring, shelter rating and degradation reason fields.

### Validation

- `node --check` passed for changed runtime/service/test modules.
- `npm test` passed.
- `npm run test:mouse` passed.
- `npm run test:validation` completed; cadence audit passed with 0 findings, runtime performance QA passed, sim frame-budget QA reported WARN at 13.201ms average / 68.676ms p95 in this container.
- `npm run test:browser` started the local server and skipped browser smoke because the Codex Playwright client path is not present in this container.
- `npm run test:mouse:live` could not run in this container because Playwright is not installed under `/mnt/data/node_modules/playwright`.
- Direct local proof: `seek_shelter -> shelter_first_trees` now returns `accepted`, `targetHonoured: true`, `shelterTargetId: shelter_first_trees`, and chosen target `{ x: 18, y: 19 }` for seven band entities.

### Residual

- Live Ollama/Playwright verification still needs to be rerun in Felix's normal Windows project environment where the local model and Playwright client are available.
- This slice fixes the command contract; it does not yet tune richer shelter offsets, role-specific positioning around the selected shelter, or visual shelter readability.

# 2026-05-26 - Mouse the Playtester v1: Command Wheel Player

Mouse now plays The First Night through the existing commander command-wheel intent path.

### Landed

- Added a thin command-wheel adapter that exposes existing legal wheel actions and only commander-local visible target candidates to Mouse.
- Changed the local-model loop from commentary-only output to structured thought plus action decisions, with invalid JSON, invented targets, settled-world vocabulary, and incorrect shelter/direction claims rejected before execution.
- Routed validated Mouse decisions through `orders:survival-intent` with the tribal leader as command source and the band as audience; there is no direct movement or objective mutation path.
- Extended reports with `actions.jsonl`, `snapshots.jsonl`, latest/recent action receipts, and command response status.
- Extended the Mouse panel and in-world marker with the current command, target line/bubble, and accepted/executed/degraded outcome visibility.

### Validation

- `npm.cmd test`, `npm.cmd run test:mouse`, `npm.cmd run test:browser`, and `npm.cmd run test:validation` passed.
- `npm.cmd run test:mouse:live` passed against Ollama at `http://127.0.0.1:11434/api/generate` using `qwen2.5-coder:1.5b`.
- Live decision: `seek_shelter -> light tree cover`; seven band entities received the intent through the existing command contract while the game continued advancing.
- Playwright screenshot inspection confirmed the optional panel and in-world action bubble are readable. The in-app browser pane was unavailable during this pass, so the scripted browser capture supplied the visual evidence.

### Residual

- The live `seek_shelter` order is accepted and dispatched, but the current behaviour appraisal reports it as `degraded` with fallback movement for the first light tree cover. This is now surfaced plainly by Mouse and is a candidate for the next gameplay tuning slice.

# 2026-05-26 - Mouse the Playtester v0

Added an opt-in embodied local-model playtester for Chapter 1.

### Landed

- Added `?mouse=1` playtest mode, which launches The First Night with a compact Mouse panel and an in-world marker/thought bubble beside the commander.
- Added an asynchronous server-owned Mouse service that accepts small cached state snapshots, reuses the workspace Ollama adapter, and never awaits model output inside gameplay/render ticks.
- Added readable Mouse reports under `playtests/mouse/`, including latest JSON/Markdown status and per-run snapshot/thought logs.
- Added honest unavailable-model handling, a request retry backoff, prompt limits, and protection against provisional startup FPS becoming a false performance report.
- Added focused Mouse contract tests and a real local-model browser check through `npm run test:mouse:live`.

### Validation

- `npm.cmd test` passed, including the Mouse contract test.
- `npm.cmd run test:browser` passed.
- `npm.cmd run test:validation` passed; cadence audit reported 0 findings and sim frame-budget QA passed.
- `npm.cmd run test:mouse` passed.
- `npm.cmd run test:mouse:live` passed against Ollama at `http://127.0.0.1:11434/api/generate` with `qwen2.5-coder:1.5b`.
- In-app browser inspection confirmed the Mouse panel, in-world marker/thought bubble, and no console errors.

### Residual

- The fast 1.5B local model can still embellish details outside the compact snapshot; reports keep the snapshot and thought together so those slips are inspectable during playtest tuning.

# 2026-05-25 - Cadence Regression Recovery v0

Recovered the previous runtime cadence machinery instead of starting a fresh optimisation pass from scratch.

### Landed

- Confirmed the old movement/pathfinding blocker explosion had not returned. Hard blocker checks stayed low.
- Fixed `weatherFields` so generic field dirtiness no longer forces every-tick weather recomputation.
- Fixed `aiAppraisal` so ordinary spawn/movement/structure churn no longer wakes appraisal outside its cadence.
- Fixed `enemyAI` so decision logic is cadence/bootstrap driven rather than waking from every logistics/combat/economy version bump.
- Fixed diagnostic `fieldOverlay` ownership so it no longer subscribes to generic `fields` dirtiness.
- Added cadence diagnostics to the sim frame-budget QA report: dirty states, scheduler run deltas, cadence warnings and weather cadence proof.
- Added runtime-event regressions locking the restored cadence ownership.

### Validation

- `node --check src/game/runtimeEvents.js` passed.
- `node --check tools/run-sim-frame-budget-qa.mjs` passed.
- `node --check tests/runtimeEvents.test.mjs` passed.
- `node tests/runInProcessTests.mjs` passed.
- `npm run test:validation` passed with WARN status in the sim report.

### Current state

- Average sim frame proxy is back under the 22ms budget.
- Weather and AI appraisal no longer run from ordinary world churn during the QA scenario.
- Remaining performance concern is p95 stress-frame jank, not the previous cadence leak.

### Next

- Add a Cadence Obligation Guard so future slices must declare and prove their update cadence.
- Then smooth the remaining p95 stress frames around blueprint validation/placement and tick staging.

# Progress

Original prompt: "can you do a pass at the structure joinery and connectors please, the basis is there but it feels very clunky and nowhere near finished let alone polished, we want the relationships between walls, towers etc nice and fluid. we can paint the blueprinnts across the map but they are not fluid or seamless at all."

## 2026-05-21 - Enemy Needs Loop v0

Added a logistics gate to the existing enemy AI director so attacks wait behind basic food, wood, and storage needs.

### Landed

- Added `evaluateEnemyNeeds()` style decision logic inside the enemy director path without replacing the existing state chain.
- Enemy squads with food demand now queue a Hunting Tent when no food production exists.
- Enemy construction blocked by Wood now queues a Wood Post when no wood production exists.
- Enemy storage pressure can queue a Storage Tent before further expansion.
- Enemy attack orders now require enough fighters that are not all starving; starving attack groups regroup near base using existing AI movement orders.
- Logistics jobs reuse `placeStructureBuildOrder()` and guard against duplicate in-progress/completed structures.
- Added enemy-director regressions for food need, wood-blocked construction, duplicate prevention, starving-force attack gating, and eventual attack when logistics blockers are absent.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.

## 2026-05-21 - Right-Click Orders + Order Wheel

In progress: adding a right-click movement order path alongside the existing drag-drawn path intent.

### Landed

- Right-click with a selected friendly leader or squad now issues a two-point player-intended MoveTo order through the existing canonical movement command path.
- Holding right-click opens a hidden-by-default contextual order wheel with MoveTo in the north slot and subdued empty placeholders for future contextual abilities.
- Right-click hold over structures now labels the wheel with structure context while leaving extra structure actions unimplemented.

### Validation

- `node --check` passed for the touched runtime/UI/test files.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright right-click probe passed: quick right-click issued a two-point `player-intended` route, held right-click showed the MoveTo wheel, release hid the wheel and preserved the canonical movement order.
- Reviewed `output/web-game-mapshop/right-click-order-wheel-probe.png`; the contextual wheel is readable and unobtrusive over the map.

## 2026-05-21 - Navigation Arrival Stability Fix

Fixed final-node arrival for movement targets that land inside a tile rather than exactly on the tile centre.

### Landed

- Preserved exact fractional movement targets as the final materialised route node instead of ending paths at the rounded target tile centre.
- Leaders and squads now snap to the canonical target and report `arrived` with zero remaining distance when the final step enters arrival range.
- Added a regression for fractional squad targets so units cannot get stranded as `blocked` at the final route node while still short of the true target.

### Validation

- `node --check` passed for changed runtime/test files.
- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright fractional-arrival probe passed with selected squad `arrived`, distance `0`, and screenshot `output/web-game-mapshop/navigation-arrival-stability-probe.png`.

## 2026-05-21 - Selection UI + Orders Pass

Added a calmer command/selection HUD pass for units and structures.

### Landed

- Reworked the bottom-left Build control into a tabbed command tray with Build and Orders tabs.
- Restored whole-army Hold / Probe / Commit controls in the Orders tab using the existing canonical army stance path.
- Added a selected unit/structure bottom dossier with shared resource strip, health/integrity, morale/cohesion, food, combat/arrow readiness, occupancy, and emergency chips.
- Added per-selection Hold / Probe / Commit override buttons for friendly leaders and squads.
- Added canonical `setPlayerEntityPressureStance()` so local overrides mutate runtime unit state instead of becoming UI-only truth.
- Kept the compact economy readout available while also surfacing Supplies/Food/Wood/Storage in the selection/base banner.

### Validation

- `node --check` passed for changed JS/test files.
- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright orders probe passed: army Commit updated the player leader while selected-squad Hold remained local, with screenshot `output/web-game-mapshop/selection-orders-ui-probe.png`.
- Narrow viewport probe passed at 390x720 with screenshot `output/web-game-mapshop/selection-orders-mobile-probe.png`.

## 2026-05-21 - Supply Comfort + Day Night Pass

Softened the first logistics balance pass and made squad supply state visible.

### Landed

- Added canonical `GameState.time` with one real hour per in-game day, including day number, clock label, and dawn/day/dusk/night phase.
- Added a subtle night/dusk canvas tint and compact day/time HUD badge.
- Spawned infantry now deploy fully rationed instead of arriving already hungry.
- Squad food drain now uses a per-game-day rate rather than a harsh per-tick amount.
- Starvation retreat has a longer grace period, so units are not immediately panic-routing the moment food hits zero.
- Added a selected-squad ration meter in the bottom action panel showing Food, capacity, and supply condition.
- Expanded storage/supply-line tests to cover full spawn rations, slow food drain, and one-hour day clocking.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright selected-squad probe passed with `Ready - Food 12.0/12.0`, `D1 06:00`, and screenshot `output/web-game-mapshop/squad-supply-ui-probe.png`.

## 2026-05-20 - Storage + Supply Lines Foundation

Added the first simple storage cap and field logistics loop.

### Landed

- Added a shared Storage capacity per faction; completed outposts provide the initial allowance.
- Added a buildable Storage Tent that expands shared storage and contributes a transport slot.
- Added runtime Transport dots sourced from storage-capable structures.
- Transports now move Wood from stockpile to construction jobs before builders can advance timber-requiring blueprints.
- Transports now move Food to hungry squads, including squads posted inside occupied structures.
- Squads consume Food over time; squads without Food stop contributing volleys and return to their outpost after a short starvation grace period.
- Surfaced Storage usage in the economy drawer and rendered transport dots/cargo on the playfield.
- Added focused in-process coverage for storage capacity, Storage Tent capacity, no-Wood blueprint blocking, Wood delivery, Food delivery, and starvation retreat.

### Validation

- `node tests/runInProcessTests.mjs` passed.

## 2026-05-20 - Combat Projectiles and Health Foundation

Original combat prompt: "can you make a thorough and fundmentally well thought out, well designed pass at finally implementing our combat mechanic, please"

### Landed

- Added shared health/combat components for leaders and infantry squads.
- Added deterministic arrow projectiles with capped active counts and a small runtime reuse pool.
- Combat now checks range, faction, LoS, rate of fire, occupied firing platforms, target cover, armour, and target death.
- Garrisoned squads fire from their hosting structure position and inherit structure range/accuracy modifiers.
- Added death events with an `onDeath` action marker so future destruction behavior can hook into more than deletion.
- Rendered arrows as lightweight foreground strokes and exposed combat state through `render_game_to_text()`.
- Added focused combat coverage for visible volleys, range gating, garrison origins, death events, and mass-volley projectile bounds.
- Reconciled live storage/supply-line drift by making delivered construction resources opt-in, preserving the established construction loop.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright combat probe produced `output/web-game-mapshop/combat-arrows-probe.png` with 8 active projectiles at tick 1.

### Next

- Add explicit attack orders and target selection UI.
- Add projectile interception against projectile-blocking wall/structure bodies.
- Add subtle health/morale feedback once the base damage loop has more playtest time.

## 2026-05-20 - Structure Joinery Polish Pass

### Landed

- Added richer path segment orientation metadata and join junction hints for sketched walls/trenches.
- Added a canvas structure-network underlay so walls, gates, trenches, towers, and forts draw as connected systems before individual glyph details.
- Reworked path placement preview into a continuous dashed blueprint ribbon with connector/anchor hints instead of only separate tile footprints.
- Added focused joinery test assertions for junction degree/socket-role metadata.
- Removed duplicate supply-line function declarations in `gameModel.js` that prevented the module from loading.

### Validation

- `node --check` passed for `src/game/structureJoinery.js`, `src/game/structureRegistry.js`, `src/rendering/canvasRenderer.js`, and `src/game/gameModel.js`.
- Targeted structure tests passed: `structureJoinery`, `structureRegistry`, and `structureTopology`.
- `npm.cmd run test:browser` passed and refreshed the web-game smoke artefacts.
- Browser QA opened `http://127.0.0.1:4184/?seed=1`, entered Skirmish, opened Build, selected Wall Segment, and confirmed the new continuous blueprint ribbon renders without console errors.
- `npm.cmd test` now runs, with the structure-focused tests passing; remaining failures are in construction/supply completion paths (`construction jobs`, `navigation + construction regression lock`, `player control + enemy director`).

### Next

- Repair the construction/supply completion regressions before treating full `npm.cmd test` as green again.
- Add a small deterministic visual fixture with completed wall/tower/gate networks so future polish can compare joined structures without relying on live game economy timing.

## 2026-05-20 - Resource Gathering Buildings Foundation

Added old-school RTS resource gathering fundamentals.

### Landed

- Added Food and Wood as canonical economy resources alongside Supplies.
- Added Hunting Tent and Wood Post structure definitions to the normal build/construction registry.
- Added runtime resource workers assigned from completed gathering structures.
- Hunting Tent workers now gather Food from a derived terrain food-resource field.
- Wood Post workers now route to nearest forest tiles, harvest Wood, return to the post, and deposit into the player stockpile.
- Added derived food/wood resource fields without persisting them into MapData.
- Surfaced Food/Wood in the compact economy drawer and rendered gathering workers on the playfield.
- Added focused in-process coverage for resource fields, worker assignment, Food income, Wood hauling, and snapshot persistence.

### Validation

- `node --check` passed for changed runtime/UI/test files.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Targeted Playwright probe opened Skirmish, opened the Build panel, confirmed Hunting Tent and Wood Post buttons are visible, confirmed Food/Wood are present in `render_game_to_text()`, and found no browser errors.
- Reviewed `output/web-game-mapshop/shot-1.png` and `output/web-game-mapshop/resource-ui-probe.png`; the game view and build panel remain readable.

## 2026-05-20 - Player Control Boundary + Enemy AI Director v0

Added the first playable faction-control boundary and autonomous enemy director.

### Landed

- Player move commands now route through `issuePlayerMoveCommand()` and reject non-player-controlled units.
- Play-mode selection uses a player-control-aware helper, so enemy units cannot be selected into the normal command flow.
- Added `probeMapAt()` as a read-only diagnostic path that does not mutate movement orders.
- Added deterministic enemy AI state with boot, survey, build-base, gather-force, expand, attack, and rebuild placeholders.
- Enemy AI can muster infantry, queue enemy construction jobs through the existing construction system, and issue `ai-director` attack routes toward completed friendly structures.
- Explicit movement orders are now honoured for non-player AI routes without re-opening global player command behaviour.
- HUD now reports current mode, enemy AI state, and friendly supplies.
- Added focused in-process coverage for player command filtering, probe immutability, friendly-only player placement, enemy AI construction, enemy builder completion, and enemy attack targeting.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.
- Reviewed `output/web-game-mapshop/shot-1.png`; gameplay canvas remains visible and readable after the HUD/control updates.

### Regression fix

- Stopped enemy attack orders from being rewritten every tick; the AI now maintains existing attack orders until the target changes or a real retarget is needed.
- Added cooldown after blocked enemy expansion attempts so failed watchtower placement probes cannot run every tick.
- Changed movement interpolation tick starts back to canonical sim positions instead of feeding the previous visual interpolated position into the next segment.
- Added tests for idempotent enemy attack orders and canonical tick-start interpolation.
- A 9-second browser runtime probe held at 60 FPS after the fix.
- Stabilised construction builder work points so placing player/enemy blueprints does not rerun candidate route previews or wobble builder targets every tick.
- A browser construction probe with player and enemy blueprints active held at 60 FPS with both builders travelling to stable work points.

## 2026-05-20 - Navigation + Construction Regression Lock

Locked the current movement/construction milestone with explicit regression coverage.

### Landed

- Added a dedicated regression-lock test suite for sea-wall gap routing, coast sliding, builder job progress, blocked builder release, one-time resource spend, and completed structure blocker/nav activation.
- Browser smoke now fails if it does not produce a usable gameplay screenshot and readable `render_game_to_text` state.
- Reviewed the latest gameplay screenshot after the browser smoke; the map, units, paths, and HUD render correctly.

### Validation

- `node tests/runInProcessTests.mjs` passed.
- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed.

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

## 2026-05-21 - Combat Performance and Projectile Smoothness v0

Implemented the next combat stability pass without increasing the 750 ms simulation tick.

### Landed

- Projectile advancement now receives a per-combat-tick `targetById` map instead of rebuilding/scanning damageable targets for every arrow.
- Projectile blocker checks now use a bucketed spatial index built once per combat tick, with rare rebuilds only when a projectile destroys a structure mid-pass.
- Combat target selection now shares the same blocker index and uses a per-tick line-of-sight cache keyed by source/target geometry.
- Runtime frame state now exposes `state.renderClock.alpha` and mirrors it to `state.runtimeStats.interpolationAlpha`.
- Canvas projectile rendering now lerps the visual arrow endpoint from `previousPosition` to `position` every frame; authoritative projectile positions still update only on sim ticks.
- Impact flashes now fade inside the frame interval instead of being purely tick-stepped.
- Runtime QA now guards indexed projectile lookup, blocker spatial indexing, LoS cache presence, and projectile visual interpolation.

### Validation

- `node --check src/game/combatSystem.js`, `src/main.js`, `src/rendering/canvasRenderer.js`, and `tests/runtimePerformanceQa.test.mjs` passed.
- Focused `combatMechanics.test.mjs` passed.
- Focused `runtimePerformanceQa.test.mjs` passed.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:browser` passed.
- Targeted browser projectile probe passed with 4 active projectiles and finite `interpolationAlpha`; screenshot written to `output/web-game-mapshop/combat-arrows-interpolation-probe.png`.
- Reviewed `output/web-game-mapshop/shot-1.png` and `output/web-game-mapshop/combat-arrows-interpolation-probe.png`; the canvas is nonblank, overlays remain off by default, and projectiles render on the live canvas path.

### Known Risk

- Runtime QA still reports the existing medium horde tick warning: 520-squad tick cost remains projected above comfort in the synthetic horde sample. This pass removes the projectile scan multipliers and tick-quantized visuals, but broad recompute/collision/field cost is still the next performance frontier.

## 2026-05-21 - Tick Demotion and Event-Driven Runtime v0

Moved the first expensive runtime decisions behind a small event/dirty/version/scheduler substrate without changing gameplay balance or UI design.

### Landed

- Added runtime coordination state to game state: bounded event queue, dirty flags, version counters, and scheduled system metadata.
- Build orders now emit economy-spent and construction-job-created events, and completed jobs emit construction-completed plus nav-changed events when blocker topology changes.
- Enemy AI decisions now run through scheduler/version gates after bootstrap, preserving the opening two-tick behaviour while avoiding per-tick strategic decisions afterward.
- Idle logistics demand assignment now runs on a scheduled/dirty cadence; active transports still move and deliver on the normal simulation tick.
- Resource field derivation now uses a map-version/signature cache for recompute and gathering paths.
- Construction reachability cache keys now include map/nav versions so blueprint access checks are invalidated by topology changes.
- `summarizeGame()` now exposes runtime dirty/version/scheduler/event state for browser QA and diagnostics.
- Economy stockpile normalization now rounds aggregate amounts consistently after component recomposition.

### Validation

- `node --check src/game/gameModel.js`, `src/game/economy.js`, `src/qa/runtimePerformanceQa.js`, `tests/runtimePerformanceQa.test.mjs`, and `tests/constructionJobs.test.mjs` passed.
- Focused construction, runtime QA, enemy director, and navigation construction regression tests passed.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:browser` passed through the web-game client at `http://127.0.0.1:4194/`.
- Reviewed `output/web-game-mapshop/shot-1.png`; the canvas remains nonblank and readable with overlays off by default.

### Known Risk

- This is the coordination layer and first demotion pass, not a full event-driven rewrite. Movement, collision, combat cadence, and broad recompute paths still need additional budgeted/indexed follow-up slices.

### Follow-up hardening

- Centralized structure navigation signature-change emission so construction completion, replacement-style build orders, and combat blocker-state changes all invalidate nav caches and emit `structure:nav_changed`.
- Added a combat regression where an in-flight projectile ruins a fragile wall and must emit the nav-change event while bumping nav dirty/version state.
- Re-ran `npm.cmd test` and `npm.cmd run test:browser`; both passed, and `output/web-game-mapshop/shot-1.png` remained nonblank/readable.

## 2026-05-21 - Logistics / Construction Extraction v0

Extracted the construction and logistics runtime detail out of `gameModel.js` without changing gameplay balance, timings, movement, UI, combat, or structure definitions.

### Landed

- Added `src/game/constructionSystem.js` for construction job normalization, builder assignment/progress, construction reachability cache keys, work-point selection, material consumption, job completion events, and construction summaries.
- Moved single-structure and path build-order execution behind `constructionSystem.js`, leaving `gameModel.js` with public API wrappers.
- Added `src/game/logisticsSystem.js` for transport normalization, storage transport syncing, dirty-gated idle demand assignment, active transport ticking, construction wood delivery, squad food delivery, field-food consumption, and supply-line summaries.
- Kept `gameModel.js` as the owner of initial state, tick orchestration, recompute orchestration, runtime coordinator state, enemy AI call sites, and public API wrappers used by UI/tests.
- Preserved the Tick Demotion runtime coordinator through dependency-injected system calls: job-created, economy-spent, job-completed, nav-changed, logistics scheduler, dirty flags, and map/nav-version construction reachability invalidation remain wired.
- Updated runtime QA static checks so they inspect the extracted construction/logistics modules instead of assuming every runtime detail lives in `gameModel.js`.

### Validation

- `node --check src/game/gameModel.js`, `src/game/constructionSystem.js`, `src/game/logisticsSystem.js`, and `src/game/economy.js` passed.
- Focused tests passed: construction jobs, storage supply lines, resource gathering, game model, enemy director, and navigation construction regression.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:browser` passed.
- Reviewed `output/web-game-mapshop/shot-1.png`; the game canvas remains nonblank/readable with overlays off by default.

### Known Remaining Bloat

- Placement validation and structure joinery helpers still live in `gameModel.js`; they are related to construction but also share editor/structure-network concerns and should move in a separate, smaller placement extraction.
- Resource gathering remains in `gameModel.js`; it shares worker movement and supply-adjacent concepts but was deliberately left untouched for this refactor-only slice.
- Movement/pathfinding helpers remain in `gameModel.js` by design for this pass, because moving them would violate the no-navigation-refactor constraint.

## 2026-05-22 - Movement & Orders Extraction v0

Extracted shared movement/order execution primitives out of `gameModel.js` without changing pathfinding rules, movement speeds, UI, combat, construction, logistics, or enemy AI decisions.

### Landed

- Added `src/game/movementSystem.js` for movement model constants, order/path normalization, player/faction movement order issuing, path cursor advancement, navigable target fallback, low-level terrain/structure blocking checks, slide-step resolution, arrived/blocked mutation, and movement-path summaries.
- Rewired `gameModel.js` so leader/squad advancement still owns objective/occupancy orchestration, but delegates route-following and arrived/blocked state transitions to `movementSystem.js`.
- Kept route generation functions (`buildNavigationFlowField()` and `materialiseFlowRoute()`) in `gameModel.js` for this pass to avoid broad pathfinding/navigation churn.
- Preserved construction/logistics movement dependencies through the existing dependency-injected wrappers, so builders, workers, and transports continue using the same shared movement helpers.
- Restored `entityPathMapSignature()` in `gameModel.js` because command/field cadences still use the map-only signature outside movement.

### Validation

- `node --check src/game/gameModel.js`, `src/game/movementSystem.js`, `src/game/constructionSystem.js`, and `src/game/logisticsSystem.js` passed.
- Focused tests passed: navigation construction regression, enemy director, construction jobs, storage supply lines, game model, and collision authority.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:browser` passed.
- Reviewed `output/web-game-mapshop/shot-1.png`; the game canvas remains nonblank/readable with normal routes and unit positions.

### Known Remaining Bloat

- Pathfinding/flow-field generation still lives in `gameModel.js`; a later pathfinding/navigation extraction should move that into a dedicated route module.
- Objective pressure, resource gathering, structure placement validation, and occupancy orchestration remain in `gameModel.js`.
- Leader/squad movement orchestration still starts in `gameModel.js` because it depends on objective, stance, and occupancy state; the low-level movement legwork is now extracted.

## 2026-05-25 - Battlefield Evolution Visual Layer

Added a bounded, persisted battlefield trace pass so the ground visually records movement and violence without changing gameplay authority.

### Landed

- Added `src/game/battlefieldTrace.js` to accumulate footprint stamps, worked-ground churn, blood spatter from damaging impacts, and larger pools from unit deaths.
- Added bounded `impactEvents` to combat so ranged and melee damage both produce visual evidence from real combat outcomes.
- Persisted and summarized trace history through game snapshot/import state; old saves normalize to an empty trace.
- Added a ground render pass below units and structures with low-contrast mud, directional footprints, dark spatter, and irregular settling blood pools.
- Added focused trace coverage plus combat and save/load regression assertions.

### Validation

- `npm.cmd test` passed.
- `npm.cmd run test:browser` passed after making its action burst advance at least one full simulation tick.
- The required web-game Playwright client completed a 1,400-frame gameplay capture in `output/battlefield-trace-qa/`; reviewed `shot-0.png`, with `80` footprints, `16` churn tiles, and `13` visibly muddy tiles.
- In-app browser live-play inspection reached tick `139` with no console errors and confirmed the toned-down churn styling in a developed battlefield.
- Fixed the browser smoke action cadence so it deterministically advances beyond one 750 ms simulation tick before checking state.
- Fixed the simulation frame-budget output path on Windows by converting its module URL through `fileURLToPath()`.
- `npm.cmd run test:validation` now executes its simulation gate and fails on existing construction/tick budget pressure (`31.908ms` average frame proxy; blueprint validation `61.62ms` p95), outside this visual-history slice.
## 2026-05-25 - Blank Scenario Authoring And Segmented Command Wheel

- Added persistent `sceneEntity` ownership for per-scenario presentation settings and authored placements. Existing generated Chapter 1 keeps the full current play surface; `New Blank Scene` starts with HUD/build/resources/playtest/cloud visuals hidden.
- Added scenario maker controls to toggle those surfaces back on and place player/enemy starts, outposts, infantry seeds, cover, beats, triggers and spawner markers on the map.
- Authored-only scenes now seed runtime actors from placed scene entities, so a blank scene begins with no silently injected bases, commanders or units. Map JSON save/load retains the scene profile and placements.
- Rebuilt the context command wheel as a fixed eight-segment ring with labelled actionable spokes, muted unused segments and whole-spoke highlighting; a held northeast gesture now clearly highlights `Shelter`.
- Validation: `npm.cmd test` passed, including new blank scene persistence/runtime tests; `npm.cmd run test:browser` passed; local rendered QA confirmed blank controls off by default, placements present, play HUD hidden, command wheel `Shelter` spoke highlighted, and no console errors. Screenshots are under `output/scenario-authoring-qa/`.

## 2026-05-25 - Stone Distraction And Sensing Debug Slice

- Converted `Distract` into a physical, zero-damage `stone` projectile that uses the existing projectile travel/impact loop and creates attention only when it lands.
- Added bounded `soundEvents` with tuned hearing profiles for footsteps, stone impacts, arrow impacts and melee strikes; sound attention now paints from explicit audible radius falloff rather than a generic marker radius.
- Added enemy hearing response: enemies inside a player sound's audible range enter `investigating` perception and receive a `sound-investigation` movement order toward the heard position.
- Added Sim / Debug toggles for sound/hearing pings and unit field-of-view cones. Stones render as compact pebbles; audible rings and facing cones expose stealth cause-and-effect without cluttering normal play.
- Persisted sound events through save/load and exposed unit AI/sound summary evidence for QA.

### Validation

- `npm.cmd test` passed; the command-wheel regression now checks stone flight, impact-generated sound and an enemy investigation order inside hearing distance.
- `npm.cmd run test:browser` passed.
- Live rendered QA verified the segmented `Distract` release, stone impact/hearing ring and field-of-view cones with no console errors; captures are in `output/stealth-perception-qa/`.
- In the default Chapter 1 battlefield, commanders begin far outside stone audibility and terrain can intercept a throw; investigation therefore requires approaching or authoring a close stealth setup, as intended by the attenuation model.

## 2026-05-25 - Physical Cover, Visibility, and Audit Round-Up

### Physical cover / visibility landed

- Added canonical field-unit cover state through `src/game/coverSystem.js`.
- Forest/tall grass, completed cover structures, authored cover placements, garrisoning, and corpse stacks/body walls now feed one stealth state per unit.
- Quiet Move now maps to crouched mobility with lower speed and lower movement noise.
- Combat target acquisition now respects hidden targets through the detection dependency hook.
- Renderer now draws physical cover cues: forest/tall-grass silhouettes, authored low barricades, corpse piles/body walls, and unit hidden/in-cover cues.
- Enemy hidden units are not drawn for the player unless debug visuals are enabled.
- Selection HUD exposes Hidden / Cover / Crouched state with a cover meter and source label.

### Audit / organisation pass

- Ran a file-level regression comparison against the previous uploaded package; only intended cover/visibility files, test wiring, and generated QA reports changed.
- Added extra regression coverage for authored cover, corpse cover, and hidden ranged-target filtering.
- Moved historical root `APPLY_*.md` files into `docs/apply-history/`.
- Moved the agent orientation pack into `docs/agent-orientation/` and archived the old zip under `docs/archives/`.
- Moved historical QA screenshots/reports into `artifacts/qa-output/` and logs into `artifacts/logs/`.
- Added `docs/INDEX.md`, `docs/PROJECT_ORGANISATION.md`, and `docs/verification/FULL_DEBUG_SWEEP_2026-05-25.md`.
- Updated `README.md` to describe the current prototype instead of the old early-command-field-only state.

### Validation

- `node --check` over `src`, `tests`, and `tools` passed.
- `npm.cmd test` passed all in-process tests.
- Focused isolated regression groups passed for structure, construction, resources, logistics, combat, navigation, enemy director, game model, progression, cover, runtime QA, opening commander/supply, and HUD.
- `npm.cmd run test:browser` was attempted in the sandbox and skipped because the Codex Playwright client path is unavailable here.
- `npm.cmd run test:validation` still fails the sim frame-budget proxy: runtime static QA passes, but average frame proxy and p95 jank breach thresholds.

### Known next blocker

- The performance gate is still the next serious target. The failure predates the cover pass and the current report is somewhat improved versus the previous stored report, but it is still a fail. Do not add another heavy simulation layer before a focused tick/frame-budget optimisation pass.

## 2026-05-25 — Cadence Obligation Guard v0

Added a lightweight cadence registry at `src/game/cadenceRegistry.js`, modelled after the truth-registry discipline: scheduled/heavy runtime systems now declare owner, cadence, allowed dirty/version wakes, forbidden generic wakes, budget risk, and proof expectations. Scheduler defaults now derive from this registry, runtime summaries expose the cadence registry, and `npm run test:validation` now includes `npm run test:cadence`.

Validation passed: `npm test`, `npm run test:cadence`, and `npm run test:validation`. Remaining known risk is p95 stress-frame jank, not an active cadence-registry violation.

## 2026-05-26 - Permanent Environmental Footprints And Corpse Piles

- Replaced FIFO/fading footprint stamps with persistent half-tile ground impressions: repeat traversal reuses and deepens an existing impression rather than appending temporary decals.
- Reduced footprint scale to sit below unit-dot scale and shifted the render tone to muddy brown.
- Replaced the corpse record cutoff with tile-site compaction: each occupied site stores a durable count and accumulated horror value, retaining body walls after long engagements while stack rendering and collision remain site-based.
- Saturated corpse-derived field radii once a pile is already substantial so very large persistent body piles do not broaden field-paint work indefinitely.
- Added regression coverage for durable compact footprints and a 140-body compact persistent corpse pile.

### Validation

- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:browser` passed through the required Playwright web-game client.
- Long deterministic capture in `output/permanent-footprints-qa/` reached tick 35 with 37 persistent footprint impressions, 16 churn tiles, and 13 muddy tiles; reviewed `shot-1.png`.
- In-app browser live run opened Chapter 1 without console errors; its canvas screenshot transport timed out, so visual QA relied on the successful Playwright capture artifact.
- `npm.cmd run test:validation` passed, including the cadence obligation audit and sim frame-budget QA (`7.215ms` average, `40.469ms` p95).

## 2026-05-26 - World Asset Lifecycle And Commander Authority v1

- Added an audit-facing world asset lifecycle contract covering static visual terrain/detail, static gameplay objects, dormant/active structures, dynamic units/threats/effects and optional diagnostics.
- Declared `commander_follow_tactical_leash` for `The First Night`, with commander-centred follow, limited middle-drag tactical pan, local command radius and near/far detail budgets.
- Restricted opening orders to the tribal leader's local calling reach, while leaving later RTS scenario order reach unchanged.
- Kept the opening's hidden structure/economy layer genuinely dormant: no enemy director, gathering, supply-line, construction, occupancy or structure-income updates run for its nomadic survival profile.
- Changed dense terrain/canopy decoration rendering to iterate visible tiles and omit rich detail outside the commander relevance radius without removing authored world data.
- Fixed outpostless `The First Night` save restoration and added regression coverage for camera metadata, lifecycle counts, dormancy, local command authority and save/load.

### Validation

- `node --check` passed for the changed runtime, world, render, input and test modules.
- `npm.cmd test` passed all in-process tests.
- `npm.cmd run test:validation` passed when run uncontended: cadence audit `0` findings; simulation QA `7.350ms` average / `39.054ms` p95.
- `npm.cmd run test:browser` passed; its runtime snapshot shows nomadic dormancy active, enemy/logistics scheduler run counts at `0`, and bounded terrain detail rendering with `42,738` cull skips.
- Live in-app browser QA reloaded an older persisted opening map through the camera-authority migration, confirmed the commander-focused view and distant-detail reduction, and found no console errors.
