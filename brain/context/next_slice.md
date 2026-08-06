# Black Sky Bound Active Slice

Status: Entity Studio Foundation v0 completed 2026-08-03. Canonical architectural authority remains in `brain/emergence/`; this file is the bounded BSB/AXIOM handoff. Immediate successor: Raider Production Body and Motion v0.

## Interpreted Task

Build the foundation of an AXIOM Entity Studio that can inspect, preview, tune, validate, and persist changes for heterogeneous BSB entities. Raiders remain the first production-quality visual vertical slice, but neither the studio contract nor its UI may be raider-specific.

The practical goal is not a generic-looking panel. It is one shared authoring workflow that delegates to the real canonical owners for animated creatures, procedural scenery, and static scene records, and that can later expose the same governed workflow to AXIOM agents.

## Scope Risks

- A universal entity schema would erase real differences between wyvern, humanoid, predator, procedural-tree/geology, and static-scene-object ownership.
- Fully tuning every entity family in one pass would create shallow manifests and placeholder controls.
- Reusing AXIOM's old Animation Graph would introduce browser-local heuristic state with no BSB consumer or persistence.
- Letting an agent edit source files directly would bypass preview, validation, provenance, and apply receipts.
- Spending the whole slice on infrastructure would repeat the previous failure unless a visible live-runtime proof is included.

## Completed Slice

### Entity Studio Foundation v0

Objective: establish an entity-agnostic selection, capability, live-preview, candidate-diff, validation, and governed-apply spine, proven by one animated target and one stationary target through their existing real consumers.

Core contracts:

- `axiom.entity-authoring-target.v0`: stable target id, target class, provider id, canonical source, runtime identity, revision/hash, capabilities, and provenance.
- `axiom.entity-authoring-field-manifest.v0`: provider-owned editable field descriptors with path, value type, bounds/options, units, classification, affected consumer, and validation rule.
- `axiom.entity-authoring-candidate.v0`: non-committed patch against an exact source revision/hash, with before/after values, provenance, validation status, and blockers.
- `axiom.entity-authoring-apply-receipt.v0`: explicit applied/rejected/stale result, persisted destination, before/after revision/hash, runtime refresh result, and validation evidence.
- `EntityAuthoringProvider`: resolve target, report capabilities, read field manifest, build candidate, validate, preview, apply through the canonical owner, and read back.

Initial real providers:

1. `bsb.creature-profile-tuning`: wraps the existing BSB creature-tuning resolver/API for the baby wyvern and humanoid profiles. Prove it with the accepted procedural hatchling and one raider profile field; husks inherit the same humanoid provider without raider-specific UI branching.
2. `bsb.procedural-scene-object`: wraps one existing governed AXIOM DNA path, preferably geology, to prove stationary entities use the same studio workflow without acquiring animation fields.
3. `bsb.raider-recipe-motion`: registers the canonical raider recipe and physical-motion profile as capabilities, but this foundation pass need only expose current validated fields and live diagnostic state. New art and broad motion tuning belong to the immediate follow-up slice.

The provider registry must discover and classify the current baby wyvern, raider, husk, werewolf, procedural tree/geology/undergrowth, and ordinary static scene-object families. Unsupported write capabilities must be reported explicitly as `read_only` or `manifest_missing`; they may not silently disappear or fall back to generic guessed fields.

AXIOM surface:

- compact target/outliner selection;
- actual BSB runtime preview in the gameplay renderer, not a CSS substitute;
- contextual inspector generated only from the selected provider's real field manifest;
- baseline/candidate toggle and concise diff;
- Preview, Apply, Revert Candidate, and Reset View controls;
- optional diagnostics drawer for source owner, runtime projection, revision/hash, sockets/contacts, validation, and receipts;
- agent proposals enter the same candidate contract and cannot apply directly.

Likely systems involved:

- `AXIOM/apps/launcher/public/axiom-editor.html` only for mounting/routing the modular surface;
- new modular AXIOM Entity Studio JS/CSS rather than additional monolithic inline runtime code;
- `AXIOM/apps/launcher/server.js` for one semantic proposal tool and client-apply receipt path;
- existing `AXIOM/apps/launcher/public/bsb-v2-map-authoring.js` selection and procedural authoring APIs;
- BSB creature tuning runtime, client, API, field manifests, projections, and recipe registry;
- a versioned BSB V2 preview bridge that reports actual target/projection state and fails loudly when unavailable.

Explicit exclusions:

- no claim that raiders are production ready;
- no generalized animation graph or behavior-tree editor;
- no shader, lighting, combat-balance, loot, personality, or population-variation pass;
- no migration of husk, werewolf, or wyvern to the raider creature-recipe schema merely to satisfy the editor;
- no direct agent source mutation and no browser-local canonical tuning state.

## Definition of Done

- The shared Entity Studio core contains no raider-specific field paths or pose logic; those live in providers.
- Selecting the baby wyvern shows its real canonical source, runtime projection, and existing validated tuning fields.
- Selecting a raider uses the same core and shows its recipe/profile identity plus real runtime pose/recipe diagnostics.
- Selecting one geology entity uses the same candidate/apply/readback lifecycle and changes the actual procedural runtime result.
- Husk and werewolf targets are discoverable and accurately declare their current capabilities; no guessed or misleading controls appear.
- A candidate remains non-canonical until Apply, stale base revisions are rejected, save/apply receipts are visible, and reload reproduces the applied value.
- An agent-generated proposal and a human slider change produce the same candidate contract and use the same validation/apply path.
- Real-browser proof covers animated selection, stationary selection, candidate preview, apply/readback, reload persistence, blocked/stale behavior, and zero browser errors.

## Likely Follow-up Slices

1. **Raider Production Body and Motion v0:** one seed and one spear; move physical-intention constants into a provider-owned validated motion profile, enable live pose preview, rebuild the canonical silhouette, and pass normal-speed plus slow-motion human visual review.
2. **Raider Materials, Equipment, and Lighting:** reattach clothing/equipment layers, tune material separation and shadow response, then validate in moon, torch, smoke, and lightning.
3. **Creature Provider Expansion:** add a real predator tuning manifest for werewolves, promote husk-specific controls, and expose more of the accepted wyvern provider without changing their canonical projection families.
4. **Entity Family and Agent Generation:** seeded variant comparison, bounded generation proposals, batch/contact-sheet review, and explicit promotion controls after each canonical exemplar passes visually.

## Confidence / Uncertainty

- High confidence: the provider/capability model matches current BSB ownership better than a universal recipe schema.
- High confidence: BSB's existing creature-tuning API and AXIOM's geology authoring receipts provide real animated and stationary precedents.
- High confidence: raider visual quality must remain the first production-facing follow-up, not be replaced by editor infrastructure.
- Medium confidence: geology is the best stationary proof target; a tree is an equally valid substitute if its preview/readback seam proves cheaper during implementation.

## Immediate Next Slice

### Raider Production Body and Motion v0

- Keep one recipe, one seed, one spear, flat/open staging, and the gameplay camera.
- Use Entity Studio as the governed selection/candidate/apply shell, but add only real provider fields consumed by the production body or physical-intention solver.
- Replace the current fragmented canonical raider silhouette; do not expand family variation, materials breadth, or other species first.
- Promote physical motion from `shadow_only_pending_visual_acceptance` only after planted feet, weight transfer, anticipation, frozen commitment, recoil, and recovery read clearly on the finished faceted body.
- Require comparative current/new stills, normal-speed combat, slow motion, and explicit human acceptance. Technical topology/determinism tests remain necessary but cannot confer visual acceptance.
