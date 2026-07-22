# UI Backend Drift

Last updated: 2026-07-21

This file is an operational drift note for ACE work.
Treat it as audit context, not canonical truth.

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
