# UI Backend Drift

Last updated: 2026-08-17

This file is an operational drift note for ACE work.
Treat it as audit context, not canonical truth.

## 2026-08-17 - Map Forge completion drift repaired

- `axiom.map-forge-spatial-scorecard.v1` now owns route monotony, route treatment, pacing-zone family/landmark coverage, integrity and next action. The server verifies gate/action consistency and no longer trusts model confidence.
- Pacing beats now change route geometry through direction, topology, lateral offset, openness, pressure and landmark intent; the old target-length lawnmower builder is gone.
- Boundary UI claims are grounded in `axiom.runtime-traversal-audit.v1`, compiled through Black Sky Bound's runtime map loader, terrain collision, scene-object collision and canonical young-dragon radius. Decorative forest is never treated as an invisible wall.
- Boundary projections that expose a shortcut are not committed. The agent tightens the corridor and retries visibly; only a passing audit creates a boundary receipt and `runtime_verified` readback.
- Browser proof on runtime `v5-semantic-route-boundaries-r3` produced a 146×104 Ash Road semantic route and 761 visible ridge tiles, retained 75% shortest legal traversal against the 68% `prevent` threshold, preserved source hashes and reported zero unexpected browser issues.
- Remaining product limit: the generated route is a truthful, contained semantic skeleton, not proof of aesthetic excellence or ten-minute runtime duration. Those claims require later game playtesting and environmental/encounter iteration.

## 2026-08-17 - Map Forge level-design completion truth audit

Active audit target: `AXIOM/apps/launcher`, specifically whether the live Map Forge goal session's visible completion state is grounded in useful level-design evidence.

### Confirmed wired relationship: the agent is applying real reversible Map Forge work

- Exact files involved: `AXIOM/apps/launcher/public/map-intent-preflight.js`, `AXIOM/apps/launcher/public/bsb-v2-map-authoring.js`, `AXIOM/apps/launcher/public/level-design-session.js`, `AXIOM/apps/launcher/server/level-design-session.js`.
- Evidence: the latest persisted Ash Road session binds `ash_road_threshold`, prepares a revision-bound `146x104` document with an 893-tile route target, records three canonical brush receipts, advances revisions 225 to 229, reads back 35 created objects and retains session undo lineage.
- Confidence: high.
- Boundary: this proves transport, authority, mutation and receipting. It does not prove composition, pacing or playability.

### Frontend with weak backend grounding: `COMPLETED` means mechanically valid, not well designed

- Exact files involved: `AXIOM/apps/launcher/public/level-design-session.js`, `AXIOM/apps/launcher/server/level-design-session.js`.
- Evidence: the backend success contract requires only tree, undergrowth and geology, at least 12 created records, canonical readback and zero path-clearance violations. The client immediately publishes goal completion when those checks pass. The latest session therefore completed on iteration 3 with 35 objects despite the visibly repetitive route and sparse, undifferentiated treatment.
- Confidence: high.
- Recommended action: preserve these checks as an integrity gate and add a separate spatial-quality gate before completion can be published.

### Backend data with no evaluating consumer: pacing beats are labels, not constraints

- Exact files involved: `AXIOM/apps/launcher/public/map-intent-preflight.js`, `AXIOM/apps/launcher/public/level-design-session.js`.
- Evidence: the preflight stores arrival, encounter, climax and exit fractions, but session evaluation does not measure coverage, density, landmark differentiation or staging in those zones.
- Confidence: high.
- Recommended action: segment the canonical route by pacing fractions and report per-zone spatial metrics to both the goal card and planner.

### Heuristic carrying accidental authority: duration becomes a lawnmower route

- Exact files involved: `AXIOM/apps/launcher/public/map-intent-preflight.js`, `AXIOM/apps/launcher/public/bsb-v2-map-authoring.js`.
- Evidence: requested minutes are converted to uninterrupted traversal seconds and raw target route tiles. `buildPlayableRoute()` then fills that length using alternating edge-to-edge rows. The planning estimate is labelled honestly, but the deterministic serpentine is applied as authored scene geometry without any route-quality review.
- Confidence: high.
- Recommended action: add route monotony and topology checks now; permit completion only after a later semantic route planner replaces or approves the route.

### Heuristic carrying accidental authority: iteration is fixed family enumeration

- Exact files involved: `AXIOM/apps/launcher/public/level-design-session.js`.
- Evidence: `nextFamily()` selects the first missing family, while the model is allowed to choose only one family's band, radius, density, falloff and variant. Two successful plans repeated the schema's literal placeholder summary and rationale. The loop cannot choose the weakest spatial zone, revise the route, remove bad work or decide which design problem matters next.
- Confidence: high.
- Recommended action: feed the model a compact canonical scorecard and restrict its next action to the evaluator's weakest failed zone.

### High-risk drift area: a model-authored critique could become another fake success surface

- Risk: natural-language self-assessment is persuasive but cannot be the source of truth for spatial quality.
- Confidence: high.
- Recommended action: deterministic Map Forge metrics must own pass/fail; the local model may interpret those metrics and propose bounded actions, but may not certify completion.

### Current uncertainty

- It is not yet proven that the installed local text model can reliably improve a semantic spatial scorecard without a vision model. The first proof should use canonical grid-derived metrics and fixtures; visual critique can remain a later advisory layer.
- Recommended next validation step: replay the persisted screenshot-class Ash Road session and require it to pass integrity, fail design quality with explicit reasons, target the weakest zone or request route revision, and never display `COMPLETED`.

## 2026-08-03 - AXIOM/BSB entity authoring and animation audit

Active audit target: `_A_Projects/BLACK_SKY_BOUND_V2`, specifically whether the existing AXIOM animation/entity surfaces can truthfully become a recipe and physical-motion editor.

### Confirmed wired relationship: BSB already has a real live creature-tuning loop

- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/tuning/tuningOverlay.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/tuning/tuningRuntime.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/creatures/creatureTuning.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/humanoids/humanoidTuningFields.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/tuning/creatureTuningClient.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/tools/tuningApi.mjs`
  `_A_Projects/BLACK_SKY_BOUND_V2/tuning/creature-overrides.json`
- Evidence:
  Backtick toggles an in-game tuning mode that pauses simulation, selects actors by their projected visual bounds, exposes validated numeric fields, refreshes the wyvern/raider rig immediately, and saves normalized overrides through `PUT /api/tuning/creature-overrides`. The current raider override record exists under `raider_top_down_stick_v0`.
- Boundary:
  The humanoid manifest currently exposes scale, torso/head/limb dimensions, gait stride/arm swing, and torch geometry only. It does not expose recipe assembly, equipment selection, material roles, light response, planted-contact tuning, centre-of-mass transfer, attention, frozen-impact prediction, recoil, or attack phase timing.
- Confidence:
  high
- Recommended next validation step:
  Preserve this resolver, validation, immediate-refresh, and file-receipt path as the BSB backend for a new AXIOM Raider Motion Studio; expand only fields with real runtime consumers.

### Frontend with missing backend grounding: AXIOM Animation Graph is an obscured local projection toy

- Exact files involved:
  `AXIOM/apps/launcher/public/axiom-editor.html`
- Evidence:
  `AnimationStateMachineRuntime` uses the preview-only contract `axiom.animation-state-machine-preview.v0`, hardcoded variables and thresholds, and CSS transforms on a generic stick figure. Sampling only assigns `selected.animationProjection` in browser memory. Repository search found no server tool, persistence adapter, BSB runtime command, or test referencing this contract outside `axiom-editor.html`. Its packet honestly states that it cannot emit combat truth.
- Visibility cause:
  `.anim-machine-panel` uses z-index 32 while `.project-preview-panel` uses z-index 35, so loading the BSB project preview covers the panel. It is not a deliberately integrated BSB editor surface.
- Confidence:
  high
- Recommended action:
  Reuse only the compact panel/disclosure shell and projection-versus-truth language. Remove the hardcoded state inference and CSS preview rather than promoting them to canonical entity authoring.

### Frontend with missing backend grounding: legacy BSB runtime panels do not bind Black Sky Bound V2

- Exact files involved:
  `AXIOM/apps/launcher/public/axiom-editor.html`
  `_A_Projects/BLACK_SKY_BOUND_V2/.axiom/project.json`
- Evidence:
  The V2 manifest identifies the project as `black-sky-bound-v2-demo`, but `BlackSkyBoundAxiomPanels.isBlackSkyBoundLoaded()` accepts only `black-sky-bound`. AXIOM contains consumers for `bsb.axiom.snapshot.v1`, `black-sky-bound.entity-render-packet.v0`, and `black-sky-bound.motion-render-telemetry.v0`; repository search found no V2 producer or command receiver for those contracts. The visible Runtime Layers controls therefore cannot currently prove V2 entity or motion truth.
- Confidence:
  high
- Recommended action:
  Do not extend the legacy packet assumptions. Add one versioned V2 bridge around actual recipe, pose, and render projections, then make the AXIOM module fail loudly when that bridge is unavailable.

### Likely placeholder: focus-packet animation/file heuristics are stale for V2

- Exact files involved:
  `AXIOM/apps/launcher/public/axiom-editor.html`
- Evidence:
  Focus packets report `animation_owner: not_connected` and `current_animation: not_connected`. Related-file inference recognizes the old `black_sky_bound_ffp` root and suggests obsolete paths such as `src/game/movementSystem.js`, `src/game/combatSystem.js`, and `src/rendering/canvasRenderer.js` rather than the V2 recipe, physical-motion, projection, and Three renderer owners.
- Confidence:
  high
- Recommended action:
  Cull the path-guessing branch for BSB entity work. Populate focus packets only from FileManager-verified V2 paths and live runtime provenance.

### High-risk drift area: tuning profile ownership stops before recipe and physical intention

- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/creatures/raiderCreatureRecipe.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/components/raiderPhysicalMotionComponents.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/humanoids/humanoidTuningFields.js`
- Evidence:
  The canonical raider recipe owns the body plan, mesh assembly, material roles, equipment, locomotion, attack bindings, behaviour, audio, lighting, and death profile. The persisted tuning overlay still targets the legacy-named humanoid profile `raider_top_down_stick_v0`, while physical motion is a separate ECS component whose rendered pose remains disabled by default. Treating the old tuning overlay or Animation Graph as recipe truth would create another split owner.
- Confidence:
  high
- Recommended action:
  Define a narrow authoring contract that resolves against the canonical recipe and physical-motion field manifests. Keep gameplay balance and visual/motion tuning separated, preview changes as candidates, and persist only after validation and an explicit apply receipt.

Active audit target: `_A_Projects/BLACK_SKY_BOUND_V2`, procedural scene-object truth flow plus smoke-instinct transition and first/repeat-playthrough surfaces.

## 1. Confirmed wired relationships

### Geology controls, semantic APIs, runtime definitions, and rendered diagnostics share authored intent

- Why it was checked:
  A Geology DNA inspector or local-agent operation would be misleading if BSB still rendered a fixed boulder or if cluster controls bypassed the canonical authoring document.
- Exact files involved:
  `AXIOM/apps/launcher/public/bsb-v2-geology-authoring.js`
  `AXIOM/apps/launcher/public/bsb-v2-map-authoring.js`
  `AXIOM/apps/launcher/server.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/proceduralGeology.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/world/proceduralGeologyGenerator.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/render/backends/webgl/scenery/geologyGeometry.js`
- Evidence:
  Real Chromium routed a basalt request through `geology_action` and `axiom_geology_apply`, returned `EDITOR.procedural.geology` receipts, generated a five-record collision-aware cluster in one revision, and displayed the selected Weathered Outcrop DNA. BSB rendered all three recipe definitions through `procedural_geology`; world-depth diagnostics reported 35 hull points, 26 strata segments, 28 crack segments, and 10 moss patches. Source inspection and tests prove `buildBoulder` is absent.
- Confidence:
  high
- Recommended next validation step:
  Keep brush preview candidates revision-bound and geometry-free when the shared procedural scene brush is added; verify visual footprints and 2x2 collision footprints separately.

### Smoke availability, pause controls, tutorial state, and gameplay emission share canonical progression truth

- Why it was checked:
  Level 1 must not advertise or execute smoke, while the completed awakening must persist radial smoke without exposing the later directional form.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/abilities.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/game/playerAbilities.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/game/playerProfile.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/projection/tutorialProjection.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/inputSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/combatSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/smokeSystem.js`
- Evidence:
  Fresh Chromium state contains melee, lunge, dodge, and charge but neither smoke ability. The Level 1 pause projection contains no smoke control, and locked RMB creates no dragon-smoke source. The third authored exhale consumes `instinct_smoke_awakened`, persists `smoke_burst`, keeps `smoke_spit` locked, and emits eight `radial_soft_disc_burst` sources. A later gameplay RMB starts `smoke_burst`; the canonical smoke system emits at the action profile's exhale phase.
- Confidence:
  high
- Recommended next validation step:
  Re-run `artifacts/smoke-instinct-debug-v1/proof.mjs` whenever progression, pause-control filtering, action timing, or smoke source shapes change.

### AXIOM-authored arrival metadata now owns whether the awakening scene is eligible to start

- Why it was checked:
  The previous app path inferred the story beat from “any transition while smoke is locked,” which would silently attach the vignette to future unrelated regions.
- Exact files involved:
  `AXIOM/apps/launcher/data/bsb-v2/maps/first_escape.authoring.json`
  `AXIOM/apps/launcher/public/bsb-v2-map-authoring.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-first-escape.runtime-map.json`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/world/runtimeMapLoader.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/scenarioSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/app.js`
- Evidence:
  Canonical AXIOM authoring revision 2523 declares `arrivalSequenceId: smoke_instinct_awakening`. The regenerated runtime bake, immutable runtime loader result, scenario transition request, and transition load receipt preserve that identity. `app.js` requires both this sequence id and a locked radial-smoke ability before enabling the scene.
- Confidence:
  high
- Recommended next validation step:
  Require an authored arrival sequence for each future transition vignette rather than branching on target-map ids or current ability state alone.

### Vignette projection and WebGL lifecycle are renderer-neutral and clear after release

- Why it was checked:
  The audit specifically targeted stale projected elements and presentation that outlives runtime ownership.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/projection/smokeAwakeningProjection.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/render/backends/webgl/layers/WebGLSmokeAwakeningLayer.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/projection/renderProjection.js`
- Evidence:
  The WebGL layer reads only the renderer-neutral projection, clears all primitive arrays at every update, and reports `status: inactive` plus `objectCount: 0` on fresh Level 1, after scene release, and on the remembered-playthrough skip. Browser screenshots show no surviving vignette overlay after handoff.
- Confidence:
  high
- Recommended next validation step:
  Keep inactive/released primitive-count assertions in the browser proof when modifying layer ordering or post-processing.

## 2. Frontend with weak or missing backend grounding

### No confirmed product-facing gap remains in the audited smoke slice

- Why it was checked:
  Pause controls, tutorial prompts, vignette claims, and smoke visuals were compared against runtime actor, progression, transition, action, and smoke-source state.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/debug/runtimeText.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/debug/smokeAwakeningText.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/smoke-instinct-debug-v1/proof-state.json`
- Evidence:
  Every asserted UI claim has a canonical producer or explicit presentation classification. The audit removed the stale undefined `actor.kind` projection/debug field; `actor.type` remains the sole runtime actor identity field.
- Confidence:
  high
- Recommended next validation step:
  Re-audit if a menu, journal, or ability tree starts displaying undiscovered smoke variants.

## 3. Backend with no clear frontend surface

### Directional smoke remains implemented but intentionally absent from first-playthrough UI

- Why it was checked:
  A backend action with no UI can indicate drift, but here absence is an explicit progression constraint rather than a missing surface.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/abilities.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/inputSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/combatSystem.js`
- Evidence:
  `smoke_spit` remains later-locked and input resolution prefers it only after a future canonical grant. Fresh and awakened first-playthrough profiles omit it from pause controls and runtime unlocked abilities.
- Confidence:
  high
- Recommended next validation step:
  Add its discovery scene and receipt before exposing it; do not unlock it by changing pause/UI projection alone.

## 4. Likely placeholders or heuristic bridges

### Repaired: inactive awakening state previously masqueraded as completed work

- Why it was flagged:
  Fresh Level 1 reported three accepted inputs, a 0.52 clear-air pocket, `unlockApplied: true`, `radialSmokeEmitted: true`, release count one, and phase `released` although the scene had never run.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/game/smokeAwakening.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/data/smokeAwakening.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/projection/smokeAwakeningProjection.js`
- Evidence:
  Inactive state now uses phase `inactive`, zero accepted inputs, zero pocket, false effect flags, null release time, and zero release count. First-run and remembered browser assertions prove the corrected values.
- Confidence:
  high
- Recommended next validation step:
  Preserve the distinction between `inactive`, active authored phases, and historically completed `released` state in any save/journal projection.

### Repaired: four raider silhouettes were previously unconditional presentation constants

- Why it was flagged:
  The vignette could display four fleeing raiders even if the destination runtime map contained no living raider actors.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/projection/smokeAwakeningProjection.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/debug/smokeAwakeningText.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/tests/smokeAwakening.test.mjs`
- Evidence:
  Screen positions remain deliberate presentation staging, but each projected silhouette is now allocated only to a unique, living, nearest runtime raider and carries `sourceActorId`, `sourceType`, `sourceTeam`, and torch provenance. A no-raider test now produces zero silhouettes; the live six-raider map produces the bounded four-silhouette maximum.
- Confidence:
  high
- Recommended next validation step:
  If the scene later needs a specific authored squad, add explicit actor tags in AXIOM rather than reintroducing count or position guesses.

### Repaired: remembered-playthrough transition used a stale default camera origin

- Why it was flagged:
  The first-run blocking scene continuously snapped the camera, masking that a skipped scene left the new map's default camera active for the arrival frame.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/app.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/smoke-instinct-debug-v1/12-remembered-playthrough-skip.png`
- Evidence:
  Runtime-map application now establishes the scene/player camera immediately for both active and skipped arrivals. The final remembered-playthrough screenshot and camera-distance assertions show the hatchling correctly framed with no stale vignette primitives.
- Confidence:
  high
- Recommended next validation step:
  Apply the same immediate camera-owner rule to future optional arrival sequences.

## 5. High-risk drift areas

### Tutorial acceptance and physical smoke emission occur at different authored moments

- Why it was flagged:
  `PLAYER_ACTION_ACCEPTED` fires when the radial action starts, while smoke sources appear later at the profile's exhale phase. A future UI could incorrectly label acceptance as “smoke emitted.”
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/combatSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/proceduralActionState.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/systems/smokeSystem.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/game/tutorialRuntime.js`
- Evidence:
  Browser proof separately asserts action start and emission roughly 300 ms later. Current tutorial language asks for the input and is therefore correctly grounded in accepted action, not cloud creation.
- Confidence:
  medium
- Recommended next validation step:
  If objectives later require smoke contact, enemy concealment, or cloud creation, dismiss them from smoke-system evidence rather than `PLAYER_ACTION_ACCEPTED`.

### Existing atmospheric overlay readability baseline remains red outside this slice

- Why it was flagged:
  The complete test runner still stops at a known screen-overlay alpha assertion, although all 80 other test modules pass independently.
- Exact files involved:
  `_A_Projects/BLACK_SKY_BOUND_V2/tests/atmosphericCameraOverlay.test.mjs`
- Evidence:
  `npm test` fails only at `screen-space overlay alpha should stay low for readability`; the failure predates and is unrelated to the smoke-transition changes.
- Confidence:
  high
- Recommended next validation step:
  Reconcile the atmospheric overlay tuning and its readability baseline in a separate visual slice.

## 6. Uncertain findings needing manual validation

### Shared web-game client cannot capture this WebGL canvas faithfully from its backing store

- Why it was flagged:
  The mandated shared client succeeds at interaction and `render_game_to_text`, but its canvas `toDataURL` path returns an opaque black image because the WebGL backing store is not preserved.
- Exact files involved:
  `C:/Users/felix/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/smoke-instinct-debug-v1/shared-client-final/shot-0.png`
  `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/smoke-instinct-debug-v1/proof.mjs`
- Evidence:
  The exact project-local copy of the shared client produces valid runtime JSON but a black PNG. Full-page Playwright screenshots from the dedicated proof show the live WebGL scene correctly and were visually inspected at desktop and compact sizes.
- Confidence:
  high for the harness limitation; no product-render failure observed
- Recommended next validation step:
  Update the shared client to prefer element/page screenshots for WebGL canvases unless `preserveDrawingBuffer` is known to be enabled.

## 7. Repaired: AXIOM Entity Studio is now grounded in canonical BSB and Map Forge owners

- Why it was flagged:
  The prior hidden creature-tuning panel and AXIOM's old animation-facing surfaces could imply authoring capability without one shared persistence/readback path. The first Entity Studio UI pass also let a 43-row Outliner hide Details and candidate actions while a stale runtime reload could appear successful from cached parent state.
- Exact files involved:
  `AXIOM/apps/launcher/public/entity-studio.js`
  `AXIOM/apps/launcher/public/entity-studio.css`
  `AXIOM/apps/launcher/public/axiom-editor.html`
  `AXIOM/apps/launcher/server.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/tuning/entityAuthoringRuntime.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/src/tuning/entityTuningTargets.js`
  `_A_Projects/BLACK_SKY_BOUND_V2/tools/launch.mjs`
- Evidence:
  Provider manifests now decide which controls exist; candidates do not write before Apply; apply returns persistence and readback evidence; iframe reload proof requires a new bridge response and restored focus; werewolf remains visibly `manifest_missing`; geology delegates to Map Forge; protected files are restored by the browser proof. Visual assertions bound the Outliner, keep Details/candidate actions visible, and require the viewport to remain dominant.
- Confidence:
  high
- Recommended next validation step:
  Add the production raider body/motion provider fields only as each acquires a real BSB consumer. Do not reintroduce browser-local animation heuristics or let agent proposals bypass candidate review.
