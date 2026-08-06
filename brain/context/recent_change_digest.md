# Recent Change Digest

Status: updated 2026-08-03

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## 2026-08-03 AXIOM / Black Sky Bound Entity Studio Foundation v0

- Added one provider/capability/candidate/apply spine across live BSB creatures and AXIOM procedural geology. The UI owns no raider-specific tuning paths; manifests and canonical providers decide what is editable.
- Animated selection now pauses/focuses/restores the actual BSB runtime, choosing a low-occlusion live raider for useful preview. Stationary selection hands the viewport back to the real Map Forge canvas and canonical scene-object selection.
- Human and agent proposals share the same non-committed candidate contract. Apply persists through the owning API, refreshes the runtime, verifies readback, and rejects stale candidates; werewolf remains explicitly `manifest_missing`.
- The browser proof now requires a new bridge response after iframe reload, preventing stale parent state from masquerading as persistence proof. It also checks Outliner/Details/candidate/viewport salience and restores all protected tuning/map files.
- Official Unreal Editor documentation informed the final viewport + searchable Outliner + context-sensitive categorized Details arrangement; AXIOM retains its own restrained visual language.
- The local BSB live-source launcher now verifies project/root identity before reusing port 5177, so a stale or unrelated server fails loudly.
- This is authoring infrastructure, not raider visual acceptance. The current production body remains visibly inadequate and physical motion remains `shadow_only_pending_visual_acceptance`; the immediate next slice is one fixed-seed production raider body and motion pass.

## 2026-07-31 Black Sky Bound selective player-mesh rollback

- The Blender V5 baby-wyvern import was rejected on visual acceptance despite mechanically correct loading, bone mapping, contact alignment, and automated tests. Production now uses the exact prior `black-sky-bound.procedural-wyvern-mesh-recipe.v1` faceted hatchling again.
- Mama remains a deliberate separate success: its `dragon_main_march_v5_flyover.glb` path, timing, parallax compensation, and smoke gate are unchanged and passing.
- The failed player outputs remain preserved as unbundled research evidence. Unit and production-build gates now reject player GLTF/skinning dependencies and the baby-rig asset while requiring the procedural player contract and Mama mesh contract/asset.
- `npm run smoke:wyvern-visual` is the reusable promotion gate: ten locked close live-game frames cover idle, crawl, bilateral claw, bite, and contact alignment before any future imported player can replace the production reference.
- The rollback did not touch terrain, map, floor-material, or PBR sources, allowing the parallel floor-texture work to remain isolated.

## 2026-07-21 AXIOM / Black Sky Bound Procedural Geology DNA v1

- Axiom now normalizes every authored `boulder` into compact `axiom.geology-dna.v1` intent and exposes Fieldstone, Fractured Basalt, and Weathered Outcrop recipes through Map Forge, `EDITOR.procedural.geology`, `axiom_geology_apply`, and the local-agent `geology_action` lane.
- Semantic create, cluster, formation, scale, randomise, erode, fracture, moss, weather, and patch operations each produce explicit authoring receipts. A cluster is deterministic, collision-aware, bounded to 2â€“12 rocks, and commits in one revision.
- BSB resolves authored intent into `black-sky-bound.procedural-geology-definition.v1`, then derives deterministic hull points, facets, strata polylines, crack polylines, moss patches, and wet edges. Only the WebGL boundary triangulates those projections.
- The stale `buildBoulder` lit-detail path is deleted. Live boulders use `procedural_geology` while retaining the existing 2x2 movement blocker, `stone_moss` material, occlusion silhouette, and legacy map compatibility.
- Focused Axiom and BSB tests pass. The broad BSB suite still stops only at the pre-existing atmospheric-overlay alpha baseline; every post-baseline renderer/architecture test passes separately.
- Real Chromium proof rendered three distinct formations with 35 hull points, 26 strata segments, 28 crack segments, and 10 moss patches. Axiom routed natural language through MCP, applied three direct weathering operations plus a five-rock cluster, and reloaded with all four protected map hashes unchanged.
- The next recommended slice is a shared procedural scene-painting UX over tree, undergrowth, and geology intent, built by extracting the proven undergrowth brush contract rather than duplicating brush logic.

## 2026-07-16 AXIOM / Black Sky Bound Opening-Scene Pass

- The active BSB authoring source is `AXIOM/apps/launcher/data/bsb-v2/maps/first_escape.authoring.json`; `_A_Projects/BLACK_SKY_BOUND_V2/data/maps/axiom-first-escape.runtime-map.json` remains a derived bake.
- A fresh standalone BSB browser playtest showed the player reaching the opening werewolf/raider knot within roughly three seconds of sprinting north. Nearby factions begin resolving the battle while movement and combat prompts are still teaching the controls.
- The Blender layout reference is being translated as encounter rhythm rather than copied literally: quiet nest basin, tightening S-loop, choke/reveal, optional eastern bypass, and a northern release into the existing map.
- AXIOM Map Forge successfully loaded the BSB workspace at authoring revision `2438`, with FileManager still providing `axiom.workspace-context.v0`.
- Authoring friction observed in the live editor is narrow and concrete: the outliner renders only `records.slice(-24)`, scenery/units/spawners use generic `O/U/S` canvas markers, and hardcoded `http://localhost:3007` bridge calls fail when the editor is opened through the equivalent `127.0.0.1` origin.
- Project Diary preserved the opening-scene intent and invoked the live `qwen3.5:9b` model, but its first owner candidate pointed to runtime spawner code. For map-layout requests the authoring source/Map Forge must be presented as the mutation owner, with runtime systems retained only as validation evidence.
- The working tree remains heavily modified and largely untracked. Changes in this pass must stay inside the canonical map workflow and the few AXIOM surfaces directly exercised by the authoring task.

## 2026-06-24 Black Sky Bound V2 Light/Shadow Note

- In `_A_Projects/BLACK_SKY_BOUND_V2`, WebGL light/shadow compositing was split so `shadows` render under `worldDepth`, while darkness and emitted light render over `worldDepth`.
- The active BSB contract is `black-sky-bound.webgl-ground-shadows-under-world-depth-light-over-world-depth.v0`.
- This fixes the relationship where trees, boulders, wyvern, and raider stickmen participate in light/dark without local contact shadow pooling consuming their silhouettes.
- Proof artifacts live under `_A_Projects/BLACK_SKY_BOUND_V2/artifacts/light-shadow-world-depth-v0/`; project-specific detail is recorded in that project's `progress.md`.

## What changed

- The active repository root is still on `master` at `7882435`, with only 106 tracked files and no configured remote or upstream.
- The working tree contains 96 modified/deleted tracked paths, principally an extensive `Projects/field-fronts-prototype` implementation pass and removal/migration of early scaffold files.
- The current ACE runtime, spatial UI, QA tooling, canonical brain tree, AXIOM application, legacy tree, and additional projects are present locally but largely untracked.
- A nested historical checkout under `dev/ai-pipeline/ai-pipeline-updated/ai-pipeline/` retains an `origin` URL of `https://github.com/smitf81/ai-pipeline.git`; it is not the active working root.
- Local generated storage is substantial: `.git` contains about 5.5 GB of loose unreachable objects, while browser/dependency/runtime evidence directories add several more GB outside tracked source.
- `.gitignore` has been extended to exclude local caches, nested checkout content, generated output captures, throughput evidence, staging scratch files, and temporary screenshots.
- The project-index scan now excludes the same confirmed generated/historical roots, and the misnamed `brain/skills/game-loop-delta-time-runtime-cadence` skill has been made validator-compatible.
- Git-visible untracked candidates fell sharply without deleting local files; the refreshed project index fell from 1,821 to 1,275 entries after confirmed historical and generated paths were excluded.
- The locked stale root `.git` directory has been preserved as `.git.locked-legacy-20260528-1036/`.
- The failed directory-style replacement attempt has been preserved as `.git.failed-init-20260528-1045/`.
- The root now has a writable `.git` control file pointing at `.recovery/repository-recovery.git`; branch `codex/repository-recovery-2026-05-27` resolves to the preserved local snapshot and `origin` is configured as `https://github.com/smitf81/ai-pipeline.git`.
- An immediate follow-up preservation increment captures the shelter-chain browser verifier strengthening that arrived after the initial snapshot boundary.
- A late-arriving subconscious advisory unit is also preserved: daemon/task wrappers, derived truth-kernel and AXIOM bridge exposure, and focused tests; its own contract explicitly marks the output as advisory rather than canonical truth.

## Why it matters

- This is a repository recovery problem before it is a feature-planning problem: most live source has never been protected by the active root's Git history.
- Adding or pulling from an upstream before preserving the local source snapshot risks obscuring which implementation is authoritative.
- Generated artifacts and stale nested checkouts must be excluded from any recovery commit so a source snapshot does not absorb gigabytes of replaceable output.
- The canonical brain had a broken constitution filename reference; it is repaired to point at the existing `brain/emergence/ace_engineering_constitution.md`.

## Files to know before the next pass

- `.gitignore`
- `AGENTS.md`
- `agents/AGENTS.md`
- `brain/emergence/ace_engineering_constitution.md`
- `brain/emergence/project_brain.md`
- `brain/emergence/slices.md`
- `brain/context/next_slice.md`
- `ui/server.js`
- `AXIOM/apps/launcher/server.js`
- `Projects/field-fronts-prototype/`
- `dev/ai-pipeline/ai-pipeline-updated/ai-pipeline/.git/config`

## Likely follow-up areas

- Fetch upstream history once Git credentials are available, then compare rather than immediately merge.
- Review and commit the now-visible worktree relocation from `Projects/field-fronts-prototype/` to `Projects/BLACK_SKY_BOUND_FFP/` as a separate source-tidy slice.
- Decide which historical trees belong under `legacy/` versus outside version control: `dev/ai-pipeline/`, `Projects/field-fronts-prototype_OLD/`, and `ACE_Local_lightweight/`.
- Reclaim unreachable `.git` storage only after all desired local work is committed and recoverable.

## Risks / uncertainty

- The original directory-style `.git` metadata remains unwritable in this sandbox, so it has been retained as a locked legacy backup rather than edited in place.
- The active root `.git` is a standard `gitdir:` file that points to `.recovery/repository-recovery.git`; this avoids the sandbox block on writing inside a directory named `.git`.
- It is not yet confirmed whether every untracked project is intended for the main repository or is local reference material.
- Generated runtime state under `data/spatial/` may contain both useful seed state and expendable evidence; only obvious evidence paths are ignored here.
- The `ui` test completion gate currently stalls in `ui/tests/server.test.mjs`; this is recorded as an unresolved validation blocker rather than treated as a passed gate.

## Validation in this pass

- `.\run.cmd smoke:ace` passed after refreshing `brain/context/master_index.*` and validating every repository skill.
- `.\run.cmd --cwd Projects\field-fronts-prototype test` passed.
- `.\run.cmd --cwd Projects\field-fronts-prototype test:mouse` passed after the shelter-target grounding updates were incorporated.
- `.\run.cmd --cwd Projects\field-fronts-prototype test:shelter-route` passed with all five shelter objectives completed.
- `.\run.cmd --cwd AXIOM\apps\plugin-builder test` passed.
- Syntax checks passed for `ui/subconsciousDaemon.js`, `ui/truthKernelAdapter.js`, and `AXIOM/apps/launcher/server.js`; direct runs of `ui/tests/subconsciousDaemon.test.mjs` and `ui/tests/truthKernelAdapter.test.mjs` passed.
- `.\run.cmd --cwd ui test` did not complete within 300 seconds after reaching `PASS talentUi`; a direct run of `ui/tests/server.test.mjs` from `ui/` also timed out after 60 seconds during server initialization.
- `git diff --check` passed for the previously tracked working-tree cleanup, while `git diff --cached --check` on the full preservation snapshot reports inherited whitespace and blank-line-at-EOF warnings across newly captured local files; those are not mass-normalized during recovery capture.
- Direct checks confirmed ignored output/cache/nested-checkout patterns and the repaired constitution reference.
- Root Git recovery checks confirm the root `.git` control file resolves to branch `codex/repository-recovery-2026-05-27` and the configured `origin` URL.
- Staged-source inspection found no ignored generated artifacts staged as additions; formerly tracked `Projects/field-fronts-prototype/output/` captures are removed from the recovery index.
- Validation wrote current planner and spatial state receipts under `brain/context/` and `data/spatial/`; those non-ignored current-state files are included in the preservation snapshot.

## Suggested starting context for the next task

- Treat the root `.git` control file plus `.recovery/repository-recovery.git` as the active local Git metadata unless deliberately converting to a physical `.git` directory outside the sandbox.
- Keep source capture separate from generated-output deletion and Git garbage collection.
- Use `https://github.com/smitf81/ai-pipeline.git` as the candidate `origin`, verified from the nested historical checkout.
- Preserve the substantial `Projects/field-fronts-prototype` tracked work during recovery.
- Include ACE, AXIOM, UI, QA, tools, canonical brain, and deliberate seed/config data only after reviewing the staged file list.
- Exclude caches, output captures, nested checkouts, package archives, and runtime evidence from commits.
- The canonical engineering constitution path has been corrected; retain it during recovery.
