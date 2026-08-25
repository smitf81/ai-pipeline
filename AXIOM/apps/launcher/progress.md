Original prompt: Proceed with Pass 1 for a spatially self-assessing Map Forge level designer, then decide whether semantic route planning and playable-boundary / anti-shortcut constraints belong in Pass 2 or Pass 3.

## 2026-08-17 - Pass 1 start

- Objective: add a deterministic Map Forge spatial-quality scorecard, separate integrity from design completion, feed the weakest failed zone into the local-model planning loop, and expose concise live evidence.
- Preserve: canonical Map Forge mutation/readback, receipts, undo, pause/stop/intervention behavior, no automatic save or bake.
- Explicitly deferred until Pass 1 evidence: semantic route generation and runtime/player collision boundary enforcement.
- Known proof fixture: the persisted Ash Road session at 146x104, 893 target route tiles, three brush families and 35 created objects currently reports completion despite the full-map serpentine route and sparse treatment.

## 2026-08-17 - Pass 1 implemented and browser-proven

- Added `axiom.map-forge-spatial-scorecard.v1`, separating canonical integrity from design-quality completion.
- Added ordered-route monotony, environmental coverage, untreated-span, pacing-zone family balance, landmark and staging measurements.
- Replaced fixed family enumeration with evaluator-owned family + pacing-zone targets; exact target fractions now constrain real brush-centre selection.
- The server rejects inconsistent gate/completion payloads and visibly returns `route_revision_required` before environmental planning when the route is structurally bad.
- The live goal card now shows a compact design score, top failed reasons and the next bounded action; the full scorecard remains collapsed.
- Focused contract/client/brush/UX tests pass. The full launcher suite still stops at the pre-existing First Flightless Night authoring/runtime bake mismatch (source revision 2599 versus runtime revision 2528).
- Real Chromium proof on `axiom.launcher-runtime.v4-spatial-critic-r1`: exact Ash Road prompt scored 14/100, blocked the 893-tile lawnmower route, produced zero brush batches and zero environmental model calls, preserved both source hashes, restored 52x34 through Undo, and recorded zero unexpected browser issues.
- Proof: `output/playwright/level-design-spatial-critic/level-design-spatial-critic-proof.json`; screenshot: `output/playwright/level-design-spatial-critic/01-route-quality-blocked.png`.

## Next audit

- Runtime audit found that map edges and `rock` terrain block movement, while forest/grass/dirt/scorched/water remain traversable; trees and geology block only their visible small bases and undergrowth does not block.

## 2026-08-17 - Pass 2 semantic playable-space composition

- Expanded the local map-intent contract with direction, topology, shortcut policy, boundary style, per-beat lateral offset, openness, pressure and landmark intent.
- Replaced the target-length lawnmower compiler with an ordered semantic route through authored pacing beats. The duration remains explicitly a planning estimate until runtime playtesting measures it.
- Added a playable-envelope intent to Map Forge metadata and made pending collision enforcement visible in the live preflight card.
- Axiom no longer decorates a structurally repetitive route: the spatial critic owns route acceptance before the local environmental model is called.

## 2026-08-17 - Pass 3 natural boundary and shortcut enforcement

- Added a visible natural-ridge boundary projection around the semantic playable envelope. The projection is non-canonical until audited and committed.
- Added `axiom.runtime-traversal-audit.v1`, which builds a runtime map and uses Black Sky Bound's canonical terrain, scene-object collision, runtime loader and young-dragon radius to pathfind spawn to escape.
- `prevent` shortcut policy requires the shortest legal runtime route to retain at least 68% of the authored route. Failed projections are not committed; the live loop tightens the corridor and retries up to four visible attempts.
- Only a passing audit may create `axiom.playable-boundary-receipt.v1` and set boundary enforcement to `runtime_verified`.
- Closed a Pause race: stale model/phase work is cancelled client-side and the session service rejects evidence writes while paused or awaiting user input.
- Focused route, critic, session, brush, UX and activity tests pass. The full suite remains blocked only by the known pre-existing First Flightless Night authoring/runtime bake mismatch.
- Desktop launcher replaced the stale runtime with `axiom.launcher-runtime.v5-semantic-route-boundaries-r3` from the canonical launcher root.
- Real Chromium proof: Ash Road resolved at 146x104; a northbound meander passed route quality with no long parallel repetition; 761 visible ridge tiles passed the canonical collision audit with a 0.750 shortcut ratio against the 0.680 minimum; source hashes were preserved; zero unexpected browser issues.
- Proof: `output/playwright/semantic-route-boundary/semantic-route-boundary-proof.json`; screenshots: `01-semantic-playable-route.png` and `02-runtime-verified-natural-boundary.png`.

## Honest remaining limit

- This slice gives Axiom a semantic route skeleton, iterative spatial criticism and collision-verified containment. It does not yet make the resulting route aesthetically excellent or prove the requested ten-minute duration. Runtime playtest feedback, encounter composition and richer natural-boundary art remain later game-facing work.

---

Original prompt: Proceed with the next recommended pass: remove the legacy handwritten natural-language interception/fallback layer so the local model can select and exercise registered Map Forge capabilities, while failures remain visible rather than quietly becoming conversation.

## 2026-08-17 - Natural-language kernel + Map Forge terrain ownership pass

- Ordinary Chat and Journal prose now reaches `axiom.agent-intent.v1` before any semantic executor. Regex remains only for explicit `/skill` and `/mcp` control syntax.
- Ollama receives a capability-derived JSON response schema, deterministic sampling, a 16k context window, exact live capability operations and exact Map Forge component/region ids.
- Invalid output receives one visible repair attempt. A second invalid result becomes `BLOCKED · intent_contract_invalid`; there is no conversation fallback and no mutation claim.
- Added generic revision-bound Map Forge terrain context, preview, apply/readback receipt and undo contracts. Projections are visible before Apply and never mutate canonical authoring early.
- Added the reusable `mapforge.enclosure.relocate` domain capability: replace one obsolete disconnected enclosure with adjacent floor, then trace a larger live region using the original boundary material.
- Chat/Journal activity now exposes the accepted model intent, selected capability, exact preview, execution error, activation receipt and canonical revision.
- Desktop runtime identity is `axiom.launcher-runtime.v6-natural-language-kernel-r1`; health and launcher asset checks require `axiom.agent-intent.v1` and `natural-language-agent.js`.
- Unit proofs pass for schema repair/fail-loud behavior and Map Forge preview/apply/stale-revision/undo semantics.
- Real qwen3.5:9b Chromium proof used the exact previously failing boundary wording. The model selected `mapforge.enclosure.relocate`, surfaced an 800-tile projection without changing revision 232, then applied/read back revision 233 with 748 rock boundary tiles and 52 obsolete rock tiles replaced by forest. A forced malformed model response showed both repair attempts and blocked without conversation. Source hash remained unchanged; zero unexpected browser issues.
- Proof: `output/playwright/natural-language-kernel/natural-language-kernel-proof.json`; screenshots: `01-natural-language-terrain-proposal.png`, `02-natural-language-terrain-applied.png`, `03-malformed-intent-blocked.png`.

## Deferred next pass

- Self-capability acquisition remains separate: a model-selected `system.capability_gap` should be able to propose/build/validate/register/activate one bounded plugin and then resume the original goal. This pass intentionally does not pretend existing MSOL/plugin graph mutations already provide executable runtime code.

---

Original prompt: Proceed with the next recommended pass: let AXIOM acquire one missing executable capability, visibly validate and activate it, then re-observe and resume the original request without regex fallback or fake MSOL status.

## 2026-08-17 - Bounded self-capability acquisition pass

- Added `axiom.capability-acquisition.v1`: inventory one deterministic plugin id, build/validate/package/register through Plugin Builder, stop for explicit activation, verify the declared runtime tool is callable, then run a fresh model pass over the original request.
- The local model now authors a small semantic tool specification. Plugin Builder compiles the lifecycle, MCP registration, runtime-API guard and self-contained test from canonical code instead of asking the model to reproduce fragile host boilerplate.
- Added a real browser runtime plugin host with declared-API verification, dynamic callable tool registration, rollback on activation failure, runtime receipts and tool projection into the normal Co-Pilot capability list.
- Removed two quiet integration failures: the launcher now verifies and restarts the exact Plugin Builder root/contract, and the launcher MCP proxy schemas/response shape now match Plugin Builder's real lifecycle contracts.
- Acquisition is visible as one compact card with plugin/tool identity, inventory/build/inspect/activate/resume stages, explicit `Activate plugin & resume` and `Stop`; the action remains inactive before approval.
- Browser-hosted Map Forge status is compact and separates a successful read from an observed degraded workspace warning, avoiding tile-matrix receipt noise.
- Desktop runtime identity is `axiom.launcher-runtime.v7-capability-acquisition-r7`; Plugin Builder is `axiom.plugin-builder-runtime.v2-bounded-acquisition-r6`, both from the canonical desktop checkout.
- Real qwen3.5:9b Chromium proof built and registered `acquired-mapforge-browser-proof-context-report`, remained inactive until approval, activated `mapforge_active_context_report`, re-observed 47 tools, resumed the original request with `mcp.call`, returned `axiom.runtime-plugin-tool-receipt.v1` for Ash Road revision 231, claimed no mutation, preserved the Map Forge source hash and recorded zero unexpected browser issues.
- Proof: `output/playwright/capability-acquisition/capability-acquisition-proof.json`; screenshots: `01-registered-awaiting-activation.png`, `02-active-resumed-with-tool-proposal.png`, `03-acquired-tool-completed.png`.

## Honest remaining limit

- This slice acquires one bounded tool over APIs the runtime already exposes. It does not yet let a plugin invent a new core host primitive, apply arbitrary source patches, or recursively acquire multiple tools; those cases fail visibly after the one permitted attempt.
- The full launcher suite still stops at the pre-existing First Flightless Night authoring/runtime bake mismatch (source revision 2599 versus runtime revision 2528). Focused acquisition, natural-language, UX, activity, Plugin Builder and real-browser proofs pass.

---

Original prompt: Add a persistent region lifecycle to the live Desktop Map Forge: create and immediately save regions from `+`, keep Map title and dropdown title identical, recover The winding path, expose player-spawn and escape-transition attributes, preview the selected region without replaying the opening egg scene, let AI creation use the same path, and drag-save region order.

## 2026-08-21 - Region lifecycle and recovered map implementation in progress

- Confirmed the earlier screenshots were the planar authoring projection, not the acceptance surface. The recovered `axiom_ash_road_threshold_2` source remains intact at revision 6310 and renders through the live `webgl3d` backend.
- Root cause of its apparent loss: the authoring source title is `The winding path`, while the ordered runtime manifest still labelled the same stable map id `Ash Road Threshold`.
- Added one canonical `bsb_region_authoring` truth domain: authoring documents own editable content; the runtime manifest owns stable catalogue identity, publication paths, title projection and order; runtime maps remain explicit derived bakes.
- Implemented shared region registration, blank draft, rename, marker, escape-target and reorder contracts. Manual `+` and level-design-agent preflight now converge on the same registration/save path.
- Added the custom draggable region menu, immediate title persistence, player facing/coordinates, escape rectangle/target/departure/arrival controls, and selected-non-default `skipHatch` preview intent.
- First syntax, JSON, level-design client/service and canonical-truth checks pass. The broad Map Forge test still reaches the known unrelated First Flightless Night authoring/runtime bake drift; focused browser proof remains next.

## 2026-08-21 - Region lifecycle and recovered map complete

- Corrected the recovery diagnosis after exercising the real save path. The stale manifest title explained why the map disappeared from the catalogue, but a completed historical `create_new` AI session was also replaying its revision-1 prepared draft into live authoring memory. The next explicit save could therefore overwrite the newer revision-6310 source. Terminal session receipts are now history-only and never restore or switch canonical Map Forge authoring state.
- Reconstructed `ash_road_threshold_2.authoring.json` from its intact explicit runtime bake while preserving the original AXIOM playable-space metadata. The recovered source is `The winding path`, revision 6310, 160×114, with 18,240 tiles, 483 scene objects, 23 units and one spawner; rebuilding it produces the runtime map exactly, and the freshness inspection is `current` with no mismatches.
- Manual and AI-created regions now use stable catalogue ids, immediate source/catalogue persistence and the same registration contract. `Map title` auto-saves both source title and dropdown projection. The custom region menu provides `+` creation and drag/drop ordering whose manifest write is read back before reporting success.
- Player spawn owns X/Y/facing fields. Escape zone owns X/Y/width/height, a target from the ordered region catalogue, an authoring-owned departure sequence and a workspace-declared arrival scene. The baked runtime receives the same spawn, zone and transition contract.
- Bake & Preview passes the selected runtime-map path. Only non-default regions receive `skipHatch=1`, so the opening egg remains owned by the default first region instead of replaying for every map.
- The focused lifecycle Playwright gate creates, saves, renames, reloads, edits, reorders, bakes and previews a temporary region, verifies the selected runtime map and `webgl3d`, verifies the opening is inactive via `debug_query_skip_hatch`, verifies zero relevant browser issues, then restores the manifest and removes its temporary files. It also byte-compares the recovered source before/after so historical AI session replay cannot regress silently.
- The established two-region Map Forge Playwright gate passes with WebGL3D for both maps and `skipHatch=1` on the second region. Syntax, JSON, level-design client/service and canonical-truth checks pass. The broad unit file still stops only at the inherited First Flightless Night source/runtime exact-bake drift (source revision 2848 versus runtime revision 2528); the assertion remains intact.
- User-facing proof is retained in `C:/Users/felix/Documents/Codex/2026-08-21/s/outputs/region-lifecycle-proof.json`, `region-lifecycle-authoring.png`, `region-lifecycle-webgl3d.png`, `recovered-winding-path-3d.json` and `recovered-winding-path-3d.png`.
