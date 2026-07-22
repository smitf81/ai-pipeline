# Changelog

## 2026-07-21

- Added Procedural Geology DNA v1 across Axiom and Black Sky Bound: compact fieldstone, fractured-basalt, and weathered-outcrop intent now deterministically generates hulls, facets, strata, crack polylines, moss patches, and wet edges at runtime.
- Deleted BSB's fixed lit-detail `buildBoulder` geometry path while preserving legacy `type: boulder` loading, the 2x2 blocking footprint, stone material profile, occlusion ownership, authored ids, and byte-identical canonical maps.
- Added Map Forge Geology DNA controls, `EDITOR.procedural.geology`, collision-aware one-revision cluster creation, `axiom_geology_apply`, and a natural-language `geology_action` lane for create/recipe/scale/randomise/erode/fracture/moss/weather/patch operations.
- Added renderer diagnostics and focused deterministic coverage; real Chromium proved three formations as 3 procedural rocks, 35 hull points, 26 strata segments, 28 crack segments, and 10 moss patches with zero browser issues.
- Proved Axiom's local AI could create a basalt boulder through MCP, apply direct semantic weathering operations, create a five-rock outcrop cluster, display authored Geology DNA, and reload the untouched canonical source. Queued a shared procedural scene-painting UX as the next slice.
- Added Human scene painting UX v1 to Map Forge and `EDITOR.procedural.undergrowth.brush`: radius, falloff, density, weighted species mix, deterministic seed, hover/drag/API preview, collision diagnostics, exact batch commit, and receipt-guarded one-step undo.
- Kept brush previews non-canonical and revision-bound; one real six-center stroke previewed 14 placements and 10 blocked tiles at revision 2523, committed exactly 14 DNA records at revision 2524, and removed the exact batch at revision 2525.
- Added focused deterministic coverage and a reusable Playwright gate for desktop/narrow editor interaction, with zero app console issues, page errors, unclassified request failures, panel overflow, or protected-map mutations.
- Expanded Axiom's procedural scene-object pattern from trees to the 124-record undergrowth family with compact Fern/Shrub/Ember Bramble DNA, deterministic frond/stem/vine splines, seeded leaves and ground cover, seasonal/health/age response, and burn/char ember generation.
- Replaced four fixed BSB fern/shrub/smouldering geometry builders with one renderer-neutral procedural path while preserving existing smouldering emitter, smoke, lighting, material, and nonblocking collision ownership.
- Added Map Forge Undergrowth DNA controls, `EDITOR.procedural.undergrowth`, `axiom_undergrowth_apply`, and a natural-language `undergrowth_action` lane with create/species/height/spread/density/randomise/age/damage/regrow/make-wild operations and revision receipts.
- Proved all three recipes in real WebGL and proved local-agent-to-MCP-to-editor authoring in real Chromium with zero browser issues and byte-identical protected maps; queued Human scene painting UX v1 as the next slice.
- Replaced BSB's fixed rectangle-trunk/triangle-canopy tree path with deterministic Tree DNA, three species recipes, spline-grown trunks/roots/branches, seeded foliage clusters, seasonal response, ageing, health, damage, regrowth, moss, and runtime generation diagnostics.
- Added `EDITOR.procedural.trees` and `axiom_tree_apply` so Codex and Axiom's local-agent lane manipulate tree intent through create/species/height/foliage/randomise/age/damage/regrow/ancient operations and revision receipts instead of editing mesh primitives.
- Migrated legacy `tree` and `birch_tree` authoring records at the AXIOM/BSB boundaries, retaining old maps as compatible inputs while making new/edited trees canonical `axiom.tree-dna.v1` records.
- Added Tree DNA controls and species-aware markers to Map Forge, deleted the stale duplicate tree geometry implementation, and proved the slice in real Chromium through both the BSB WebGL renderer and Axiom's natural-language-to-MCP-to-editor path without changing canonical map files.

## 2026-07-16

- Deepened Black Sky Bound's core survival loop with `Smoke Veil v1`: dense dragon smoke cancels committed attacks, breaks target locks, forces bounded last-known-position search, and allows honest reacquisition after a reposition window.
- Added canonical smoke-search AI state, semantic pursuit-break evidence, one-time player instruction, runtime observability, restrained WebGL feedback, focused tests, real-input browser proof, and short WebM footage; visual playtest also replaced an opaque legacy smoke rectangle with a soft particulate bloom.

- Authored the Black Sky Bound “First Flightless Night” opening through live AXIOM Map Forge operations, translating the Blender reference into a quiet nest basin, S-route, two-raider choke, eastern werewolf bypass, and northern release.
- Repositioned opening actors and collision blockers so the main route stays low-pressure until the choke while the eastern shortcut remains traversable and owns a separate predator risk.
- Replaced generic Map Forge `O/U/S` dots with type-specific marker shapes/colours/glyphs and replaced the newest-24 outliner truncation with complete searchable, kind-filtered records.
- Made the launcher bridge and SSE client follow the current browser origin so `localhost` and `127.0.0.1` work equivalently.
- Grounded map-layout Diary requests in the FileManager-declared AXIOM authoring source, filtered unrelated accepted constraints, and taught the local model to prefer actionable local handling over manufactured clarification.
- Made the live author/save/bake Playwright proof restore both authoring sources and runtime bakes in `finally`, preventing validation fixtures from mutating canonical maps.
- Proved the authored revision in standalone BSB, the named main/bypass encounter timings, full outliner search, live local-model interpretation, loopback origin behavior, protected hashes, and zero unclassified browser issues.

## 2026-07-15

- Added a capture-first Project Diary as the BSB workspace front door, with preserved source, compact project-linked retrieval, visible derived interpretation, attachment references, Codex handover preview, and completion-report reconciliation.
- Made Diary, Map Forge, and viewport input ownership explicit: Diary clicks create non-mutating spatial pins, Forge handoff restores the pinned map context for authoring, and unfinished Diary drafts survive the round trip.
- Added a durable FileManager-keyed Diary store and bounded event-only steward with deterministic metadata refresh, debounce, provenance, observable budgets, zero timers, and zero idle model calls.
- Proved the full live workflow against real BSB files, including grounded owner/constraint retrieval, protected authoring/runtime hashes, completion discrepancy detection, governed documentation proposal/apply/verify/reverse, real authoring events, and browser screenshots.
- Made BSB V2 projects open directly into a focused Forge / Project / Code / Debug shell with the map dominant, a single category palette, and one explicit authoring-source to runtime-bake lifecycle.
- Fixed project loading so a typed non-root path cannot be silently overridden by a stale project selector, and declared BSB workspaces activate Map Forge automatically.
- Grounded chat and MSOL automatically in FileManager's canonical `axiom.workspace-context.v0` projection, including active project/root, region/selection, freshness, connections, and governed capability context.
- Routed exact chat edit syntax through FileManager before the generic agentic file lane and returned deterministic chat results/receipts to callers.
- Added a reversible browser acceptance proof for project load, selection, chat read/search, governed edit proposal/apply, source save, bake, reload, standalone BSB consumption, screenshots, and exact SHA-256 restoration.

## 2026-07-10

- Declared `axiom_workspace_context` as the read-only FileManager-owned active project/workspace projection.
- Routed Project Preview and BSB V2 Map Forge through `axiom.workspace-context.v0` and the selected project's `axiom.project-workspace.v0` declaration.
- Scoped manifest caches per project root, blocked dirty project switching, removed hardcoded Map Forge project authorities, and added runtime revision/map/spawn verification.
- Added visible project/source/bake/connection ownership, documented viewport controls, bounded Ollama completion requests, SSE disconnect/recovery state, and a protected-hash Playwright proof.

## 2026-05-28

- Added the `cognitive-skill-kernel` package router and first behavioural-contract pack for ACE/AXIOM cognition: useful completion, goal-preserving initiative, implementation gravity, no orphan work, evidence-first completion, dead-end detection, projection/truth discipline, and Felix completion sense.
- Added the `negative-space-intent-reasoning` skill for latent requirement detection, pragmatic second-order intent, and goal-preserving gap handling across ACE/AXIOM work.
- Added the `fail-loud-output-loop` skill for bold, evidence-producing ACE/AXIOM work that fails early, records misses, and refuses silent fallback success.
- Routed Canvas sketch strokes through the server-owned `/api/spatial/intent` path instead of browser-local canonical intent creation.
- Declared governed `field_influence` and `ghost_projection` truth projections and added a read-only `buildDesirability` field-to-ghost resolver.
- Re-anchored the Truth Kernel as a measured substrate behind the sketchpad canvas.
- Added focused validation for the canonical registries, sketch intent route, ghost resolver, ghost projection payload, and Truth Kernel measured-stage alignment.

## 2026-03-15

- Added a shared anchor resolver and canonical brain bundle.
- Switched runtime/dashboard/intent flow to canonical brain paths with legacy fallback.
- Added anchor provenance and drift metadata for manager/runtime surfaces.
- Renamed external target config to `targets.json` with `projects.json` fallback.
- Moved legacy repo trees under `legacy/`.

## 2026-03-25

- Shifted the core vision from task and pipeline execution to an intent-driven spatial world system.
- Defined ACE orchestration, a persistent graph layer, and spatial fields as the new stack, favoring continuous evaluation and emergent agent-driven outcomes.

## 2026-03-26

<!-- archivist-writeback:start -->
- Synced repo docs from the live spatial runtime snapshot.
- Runtime snapshot: page `page_1774440616080_m3p3` has 6 nodes / 4 edges; team board has 0 cards and `slices.md` reports 0 active slices.
- Latest QA evidence: `qa_1774523588041_da5xzo` (studio-smoke) failed at 2026-03-26T11:13:12.318Z; 22 findings (error).
- No active slices or team-board cards are currently recorded, so the backlog still needs its next bounded seed.
<!-- archivist-writeback:end -->

## 2026-07-20

- Removed smoke from BSB's default Level 1 kit and migrated legacy profiles so only the canonical smoke-awakening receipt preserves it.
- Added the night-only Level 1-to-2 smoke-instinct transition: offscreen impact, debris and fleeing raiders, rolling smoke, three embodied exhale inputs, a real radial burst, persisted unlock, and the escape-use cue.
- Kept the old directional smoke plume wired behind a later progression lock and changed the Level 1 combat tutorial to melee-only.
- Added five nearby raiders to AXIOM's canonical second-region authoring source and regenerated the revision-5 BSB runtime bake.
- Added focused scene/progression/smoke tests and real Chromium transition/replay proof artifacts with clean runtime and error telemetry.
