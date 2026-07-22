# Decision Log

## 2026-07-21 - Scene painting previews are revision-bound projections and commits are atomic batches

### Rationale

A spatial brush evaluates many possible placements while the pointer moves. Writing each sampled tile immediately would create noisy revisions, make undo ambiguous, and allow the visible ghost scatter to diverge from persisted map truth. The user and local agents need one inspectable representation of the proposed stroke before authoring changes.

### Consequences

- `axiom.undergrowth-brush-preview.v1` is a transient projection tied to one map ID and source revision. Hovering and dragging cannot mutate the authoring document.
- Sampling is deterministic from map, source revision, brush seed, stroke centers, radius, falloff, density, and species weights; overlapping stroke areas deduplicate before placement.
- Collision decisions are part of the preview evidence. Water, rock, authored occupancy, player spawn, and escape-zone tiles are rejected before commit.
- Commit consumes the exact candidate records already present in the preview and advances the canonical document by one revision regardless of candidate count.
- `axiom.undergrowth-brush-receipt.v1` records the created IDs and revision boundary. Undo is intentionally one-step and refuses to apply after another canonical revision.
- Map Forge owns the human brush state and controls; Undergrowth DNA remains the per-record authoring authority and BSB remains the derived-geometry authority.
- Human controls and automation both enter the same batch owner through `EDITOR.procedural.undergrowth.brush.preview/commit/undo`; automation does not receive a parallel mutation implementation.

## 2026-07-21 - Trees are authored as intent-bearing DNA, not stored geometry

### Rationale

Tree meshes made from copied rectangle and triangle primitives force every species and variation to restate low-level geometry. That representation is expensive for authors, Codex, and smaller local models, and it prevents age, health, season, damage, and forest-scale intent from sharing one coherent growth system.

### Consequences

- AXIOM Map Forge owns authored `axiom.tree-dna.v1` values, semantic tree operations, dirty/freshness state, and revision receipts. `EDITOR.procedural.trees` is the browser API and `axiom_tree_apply` is its MCP/local-agent ingress.
- BSB owns the runtime recipe resolver and deterministic spline skeleton. The renderer consumes the resolved definition and triangulates trunk, root, branch, and foliage output; it does not own species rules or authoring mutation.
- Species are recipes (`old_pine`, `silver_birch`, `ancient_oak`), while seed, age, health, season, dimensions, growth, foliage, roots, moss, and colours remain per-tree intent.
- Legacy `tree` and `birch_tree` records are normalized at authoring/runtime boundaries. They remain valid compatibility inputs, but live runtime trees canonicalize to `type: tree` with an explicit resolved definition.
- Tree generation is deterministic for a given definition. Meshes are derived and disposable; canonical maps never store vertices or species-specific JavaScript geometry files.
- Forest-scale commands must use bounded semantic operations such as `make_forest_ancient`, not direct mesh edits or per-vertex model output.

## 2026-07-16 - Live map proofs must restore canonical authoring and runtime files

### Rationale

The BSB Map Forge Playwright proof performs real terrain, object, spawner, inspector, spawn, save, and bake operations. Running those checks directly against canonical files without restoration silently changed the active opening and second-region maps, including the player spawn, after an otherwise passing validation.

### Consequences

- Browser proofs may exercise the real authoring lifecycle, but must snapshot every canonical authoring source and derived runtime bake they can mutate.
- Restoration runs in `finally`, before pass/fail assertions are reported, so failures and interrupted assertions cannot leave fixture edits as project truth.
- Proof output may describe the temporary authored revision used inside the test; canonical hashes after the run are the authority for mutation safety.
- User-authored map changes remain owned by Map Forge and explicit save/bake actions. Validation fixtures are temporary evidence and cannot become persistent level design.

## 2026-07-15 - Project Diary owns preserved journal material; Map Forge owns authored map mutation

### Rationale

Black Sky Bound needs a conversational front door without creating a second active-project authority or making a Diary click behave like an authoring action. FileManager already owns verified workspace identity, while Map Forge already owns map document, selection, viewport, save, and bake behavior.

### Consequences

- Project Diary stores durable entries by FileManager project id and verified root hash; it does not create or select projects.
- User source is preserved with its source hash. Deterministic and model interpretations are append-only derived records and cannot overwrite the source layer.
- In Diary mode the shared map is read-only input: a normal click captures a spatial context pin without changing revision or dirty state.
- `Open in Forge` transfers input ownership to Map Forge, focuses the captured pin/selection, and leaves the Diary entry and unfinished draft intact for the return trip.
- Other workspace panels use inspect-only map input. The active panel therefore makes input ownership visible and prevents accidental map authoring from a conversational surface.
- The steward is event-only and deterministic by default, with bounded paths/time, debounce, zero retries, no timers, and no idle model calls. Governed file mutation remains in existing FileManager proposal/apply/receipt paths.
- Codex handovers and completion reports are evidence projections: verified facts, accepted decisions, inferences, uncertainty, file claims, and discrepancies remain explicitly separated.

## 2026-07-10 - FileManager owns the AXIOM active workspace context

### Rationale

AXIOM project selection, Project Preview, BSB V2 Map Forge, viewport state, and connection visibility were operating through overlapping local state. FileManager already authorised project roots, loaded project manifests, persisted active selection, and drove preview loading, so creating another project store would have introduced a competing owner.

### Consequences

- `FileManagerRuntime.getActiveProject` is the canonical browser owner for AXIOM active-project identity and root.
- `FileManagerRuntime.getWorkspaceContext` publishes the read-only `axiom.workspace-context.v0` aggregate through `window.EDITOR.workspace.getContext()`.
- Project-specific ownership is declared in the active project's `.axiom/project.json` through `axiom.project-workspace.v0`; BSB V2 declares AXIOM authoring-source ownership and explicit BSB runtime-bake ownership there.
- Project Preview and BSB Map Forge consume FileManager identity instead of independently guessing the active project.
- Project-manifest browser caches are scoped per root, dirty Map Forge state blocks project switching, and matching runtime revision/map/spawn evidence is required before a bake is shown as current.
- SSE, MCP, local-model, and MSOL state remain distinct connection roles inside the shared context; this decision does not merge their transports.

## 2026-05-28 - Cognitive Skill Kernel becomes the ACE/AXIOM reasoning package

### Rationale

ACE/AXIOM agent behaviour needs reusable cognitive operating skills rather than broad prompting. Existing skills covered pieces of the pattern, but there was no package-level router or compact contract set for intent interpretation, useful completion, goal-preserving initiative, implementation grounding, proof, projection/truth separation, dead-end detection, and Felix-specific completion judgment.

### Consequences

- `brain/skills/cognitive-skill-kernel/SKILL.md` is the package router for cognitive operating skills.
- The kernel references existing skills where they already cover a behaviour, including negative-space intent reasoning, fail-loud output, canonical truth mapping, runtime smoke validation, and AXIOM plugin slicing.
- New focused cognitive skills define behavioural contracts for literal-vs-useful completion, goal-preserving initiative, implementation gravity, no orphan work, evidence-first completion, dead-end detection, projection-vs-truth discipline, and Felix completion sense.
- These skills must affect planning, proof, or completion criteria; they are not decorative style prompts.

## 2026-05-28 - Negative-space intent reasoning becomes an agent skill

### Rationale

ACE and AXIOM agents need to detect when a literal task would technically pass while missing the user's real goal, especially across boundaries like import-to-render, proposal-to-activation, or intent-to-projection.

### Consequences

- `brain/skills/negative-space-intent-reasoning/SKILL.md` is the shared skill for latent requirement detection and goal-preserving gap detection.
- Agents should handle bounded, necessary inferred requirements when they are safe and validateable.
- Ambiguous, risky, or large second-order requirements must be surfaced explicitly instead of silently wandering away from the original goal.

## 2026-05-28 - Fail-loud output orientation is an ACE/AXIOM skill

### Rationale

ACE already requires no silent degradation, canonical truth, and explicit validation, but the working philosophy for bold attempts, honest mistakes, and rapid ruling-out was not captured as a reusable agent skill.

### Consequences

- `brain/skills/fail-loud-output-loop/SKILL.md` is the shared working mode for fail-fast/fail-loud ACE and AXIOM tasks.
- The skill may be paired with canonical truth, runtime smoke, and AXIOM plugin-slice skills, but it does not replace their governance.
- Fallbacks, heuristics, and partial outputs must be labelled as such and must not be reported as successful output.

## 2026-05-28 - Sketchpad projections are governed server truth

### Rationale

The Canvas sketchpad was creating intent and ghost state in the browser while the intended ACE spine requires server-owned intent, field influence, resolver projection, and provenance.

### Consequences

- Sketch strokes submit geometry to `/api/spatial/intent`.
- `field_influence` is owned by `ui/intentAnalysis.js::deriveSpatialIntentFieldInfluence`.
- `ghost_projection` is owned by `ui/spatialGhostResolver.js::resolveSpatialGhostProjection`.
- Ghost projections are read-only and uncommitted; future execution slices must pass through explicit approval and mutation gates.
- Truth Kernel rendering must share measured canvas bounds with the sketchpad instead of using a fixed stage.

## 2026-03-15 - Canonical brain moves to brain/emergence

ACE now treats `brain/emergence` as the canonical manager/context anchor bundle.
`projects/emergence` remains as a deprecated compatibility path during migration.

## 2026-03-15 - External targets move to targets.json

External repos and tools are now configured through `targets.json`.
`projects.json` remains as a compatibility input until the migration is complete.

## 2026-03-15 - Legacy repo trees move under legacy

Archived repo content now lives under `legacy/`.
Active runtime resolution must not depend on `legacy/ai-pipeline` or `legacy/Old`.

## 2026-03-25 - Shift to intent-driven spatial system

### Rationale

ACE is moving beyond direct task execution so the system can reason over persistent world state, reconcile competing pressures, and produce more adaptive behavior than fixed pipeline outputs allow.

### Consequences

- Architecture planning now centers on three layers: ACE orchestration, a persistent graph world model, and spatial field systems.
- New features should prefer continuous evaluation, spatial reasoning, and constrained agent action over one-shot object edits or instant global changes.
- Success criteria increasingly shift from predefined task completion toward stable, emergent outcomes shaped by world conditions.

## 2026-07-20 - BSB smoke begins as a transition-owned radial instinct

### Rationale

The Level 1-to-2 smoke discovery is a story and progression boundary, not a default combat binding or a map-script-owned unlock. The first expression should feel uncontrolled and embodied, while the existing directed smoke plume remains available for a later refinement.

### Consequences

- `AbilityProgression` and the one-shot `instinct_smoke_awakened` receipt are the only authority for player smoke availability; profile normalization removes the old default unlock when the receipt is absent.
- `src/app.js` owns the bounded transition lifecycle and freezes gameplay while it runs; the scene has separate state, projection, audio, pose, and WebGL presentation rather than overloading the hatch-opening state.
- The canonical smoke system owns both the first radial cloud burst and the later locked directional plume.
- Level 1 combat teaching no longer advertises or requires smoke; Level 2 resumes with a high-priority exhale-and-run cue.
- The Level 2 pressure formation is authored in AXIOM's `second_approach.authoring.json`; BSB's runtime map remains a generated bake.

## 2026-07-21 - Undergrowth becomes the second procedural scene-object family

### Rationale

Tree DNA proved that Axiom should author compact intent while BSB generates geometry. Ferns, shrubs, and smouldering brambles are the largest remaining non-tree family and the necessary stable target for a human painting brush. Treating each legacy type as a separate WebGL builder would preserve the exact duplication the tree slice removed.

### Consequences

- Axiom owns `axiom.undergrowth-dna.v1`, semantic operations, selection, persistence, dirty/freshness state, and apply receipts.
- BSB owns recipe resolution and deterministic spline/leaf/ground-cover generation; WebGL only triangulates the renderer-neutral result.
- `fern_patch`, `forest_shrub`, `smouldering_fern`, and `smouldering_bramble` remain accepted compatibility types, but all use one procedural render path.
- Smouldering emitters, smoke, lighting, collision, and damage semantics remain with their existing scene-object definitions; the procedural family owns plant intent and shape only.
- The next human-facing brush must consume `EDITOR.procedural.undergrowth` and batch semantic placements/edits rather than introduce a parallel geometry or map mutation path.

## 2026-07-21 - Boulders become authored geology intent, not stored shapes

### Rationale

Tree and undergrowth DNA proved that authored semantic parameters can produce stronger visual variety with less persistent data than fixed renderer geometry. Boulders were the next visible duplicated primitive and provide a clean validation of the same boundary for non-living scene objects.

### Consequences

- Axiom owns `axiom.geology-dna.v1`, recipes, semantic operations, transaction receipts, editor controls, persistence, and local-agent/MCP access.
- BSB owns `black-sky-bound.procedural-geology-definition.v1`, deterministic hull/surface generation, renderer adaptation, and generated diagnostics.
- Fieldstone, fractured basalt, and weathered outcrop are recipes over one canonical geology family; generated hulls, facets, strata, cracks, moss, and wet edges are disposable runtime projections.
- Legacy `type: boulder` records remain compatibility inputs, but the fixed lit-detail boulder builder is deleted and all live boulders use `procedural_geology`.
- Collision remains the existing 2x2 blocker and does not scale with the visual hull. Stone material and occlusion ownership remain in the scene-object system.
- The next human-facing painting slice must extend the proven semantic-operation path through a shared brush kernel rather than create per-family geometry tools.
