# Architecture

Small browser/WebGL ES module game using a lightweight project-local ECS.

## Runtime path

`index.html` -> `src/app.js` -> fixed-step loop -> ordered ECS systems -> renderer-neutral projection -> WebGL layer renderer.

Canvas 2D runtime rendering has been removed. The browser still uses an HTML canvas element, but WebGL owns the active render path.

## ECS rules

- Entity = id only.
- Component = runtime data attached to an entity.
- System = behaviour that updates entities with required components.
- Interface = capability contract based on required components, not inheritance.
- Data files = tuning/design values, similar in spirit to Unreal data assets/data tables.
- Constants = enum-style frozen objects, used instead of loose magic strings.

## System order

The canonical runtime order lives in `src/game/systemOrder.js`.

Current shape:

1. timers and input;
2. stamina/resource decisions;
3. player movement, dodge displacement, and buffered charge-counter transition;
4. player combat intent and action timing;
5. enemy pressure/target decisions;
6. actor separation;
7. enemy attack resolution;
8. health/death seam;
9. creature/humanoid/predator projections;
10. wyvern action impulse, smoke, and contact resolution;
11. death lifecycle, torch lifecycle, unit spawning, napalm, lifetime cleanup, scenario checks;
12. view sync/projection for rendering.

Do not let individual systems call the renderer or rewrite scenario state outside their lane.

## Interface contracts

Interfaces live in `src/ecs/interfaces.js` and are defined by required components.

Examples:

- `Damageable` = has `Health`.
- `Moveable` = has `Transform` + `Motion`.
- `AttackSource` = has `Transform` + `AttackSet` + `Cooldowns`.
- `SmokeAffectable` = has `Transform` + `StatusEffects`.
- `Renderable` = has `Transform` + `Renderable`.

This gives us Unreal-style capability checks without inheritance or Blueprint-class soup.

## Data ownership

- `src/data/actors.js` owns actor tuning: HP, speed, radius, visual identity, enemy AI ranges/damage.
- `src/data/locomotionProfiles.js` owns actor stamina, sprint, and shared dodge displacement tuning; `Stamina` remains the shared resource while `DodgeState` carries the active collision-safe hop.
- `src/data/abilities.js` owns ability availability and player ability tuning: bite/claw, lunge, smoke, dodge cost, charge-counter buffer/action/contact, and the locked dragonfire marker. `AbilityProgression` is the sole runtime unlock authority; `src/data/abilityUnlockEvents.js` owns event-to-grant definitions separately.
- `src/data/enemyAttackProfiles.js` owns enemy attack profile timing, damage, ranges, collateral rules, and telegraph/effect metadata.
- `src/data/creatures/*` owns grounded wyvern proportions, tuning, procedural pose, and motion/action profiles.
- `src/data/humanoids/*` owns raider/humanoid projection and tuning fields.
- `src/data/scenarios.js` owns scenario setup: spawn, escape zone, enemy spawns, authored terrain blobs.
- `src/data/maps.js` and `data/maps/manifest.json` own runtime map selection/publication metadata, registered region links, and manifest validation for escape-zone transitions.
- `src/data/worldScale.js` owns the current grounded scale profile: one tile reads as roughly half a metre, and hatchling/tree/boulder tile relationships derive from that profile.
- `src/data/sceneObjects.js` owns tree/boulder physical size, collision footprint, visual footprint, and occlusion tuning.
- `src/data/materialProfiles.js` owns material families and renderer-neutral material profile ids.
- `src/data/actorLightReadabilityProfiles.js` owns the current bounded actor rim/catchlight/contact-shadow readability profile data.
- `src/world/terrain.js` owns terrain definitions.

Systems and renderers should consume these definitions through spawned components/projection packets. Do not hide tuning numbers inside systems unless they are genuinely algorithmic.

## Projection/rendering rule

Gameplay truth flows into projection packets before rendering.

Renderer may:

- sort;
- batch;
- compose;
- shade;
- cull;
- apply visual-only post-processing.

Renderer must not:

- invent gameplay truth;
- change simulation state;
- become a second owner of actor/map/scenario facts;
- restore Canvas 2D fallback.

## Main folders

- `src/core` — loop, input, math.
- `src/ecs` — world storage, queries, event queue, interfaces, system runner.
- `src/constants` — enum-like frozen objects for component names, entity kinds, factions, damage types, abilities, statuses, phases, events.
- `src/components` — small component data factories.
- `src/data` — actor, ability, scenario, visual, material, lighting, and tuning values.
- `src/game` — game creation, spawning, system order, compatibility selectors, scenario-facing facade.
- `src/systems` — gameplay behaviour.
- `src/projection` — renderer-neutral runtime views derived from simulation/data truth.
- `src/render/backends/webgl` — active runtime renderer and WebGL layer consumers.
- `src/world` — map, runtime map loading, and terrain definitions.
- `src/terrain` — connected tile/blob/spline rules.
- `src/debug` — validation and snapshots.

## Current compatibility seam

`src/game/state.js` deliberately remains as a thin facade because existing boot/tests/rendering already import it. It should stay small and only coordinate ECS systems.

## Rule

The architecture exists to support the first playable. Do not expand engine/tool systems unless a playable feature forces it.
