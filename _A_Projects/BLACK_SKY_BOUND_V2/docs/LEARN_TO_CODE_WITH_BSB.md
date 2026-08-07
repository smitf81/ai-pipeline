# Learn To Code Through Black Sky Bound

This is not a normal beginner coding course.

A normal course teaches loops, arrays, functions, classes, DOM, then maybe one day you get to touch your own game.
That would bore you into the floor and it would not move BSB forward.

This path teaches only what Black Sky Bound needs, in the order that lets you make visible progress without wrecking the architecture.

## The language choice

Learn **JavaScript first**.

Not because JavaScript is the grand final language of your whole life, but because BSB currently is:

- browser JavaScript
- ES modules using `import` / `export`
- Node tooling for launch and tests
- a project-local ECS
- WebGL renderer layers

TypeScript comes later, when the structure is stable enough that types protect it instead of just giving you 900 red squiggles and a migraine. C++ and Unreal are parked for this game until BSB has a playable shape worth rebuilding around.

## The deal

Every lesson must touch one of these:

1. a data file that changes game feel,
2. a component that changes what an entity can hold,
3. a system that changes behaviour,
4. a projection file that changes what the renderer receives,
5. a WebGL layer that changes what appears on screen,
6. a test that proves we did not break the thing.

No abstract calculator exercises. No “build a todo app”. We are not starting a second hobby like a clown.

## Your learning rule

For each slice, do this loop:

```txt
Read one file → predict one behaviour → change one small thing → run tests → launch game → describe what changed.
```

That is coding.

Not memorising every method. Not pretending you understand WebGL by reading a shader blog at 2am. One small truthful loop at a time.

## The first six skills you need

### 1. Read data objects

BSB uses data files as design tables. These are your safest starting point.

Good first files:

- `src/data/actors.js`
- `src/data/abilities.js`
- `src/data/napalmDribble.js`
- `src/data/renderBudgets.js`
- `src/config.js`

What you are learning:

- objects
- constants
- nested properties
- imports and exports
- why tuning belongs in data, not random system code

Visible result:

- dragon speed changes
- raider health changes
- smoke radius changes
- napalm droplets read differently
- camera feels different

### 2. Understand components

Components are the little data packets attached to entities.

Good files:

- `src/constants/componentTypes.js`
- `src/components/createComponents.js`
- `src/game/spawn.js`
- `src/ecs/world.js`

What you are learning:

- objects as state
- maps and sets
- entity IDs
- factory functions
- why BSB does not use inheritance soup

Visible result:

- an entity gains a new capability
- the dragon gets a new counter/state
- enemies gain a behaviour flag

### 3. Understand systems

Systems are the behaviour. They read components, update components, and emit events/projections.

Good files:

- `src/game/systemOrder.js`
- `src/systems/inputSystem.js`
- `src/systems/movementSystem.js`
- `src/systems/combatSystem.js`
- `src/systems/smokeSystem.js`
- `src/systems/napalmDripSystem.js`

What you are learning:

- loops
- conditionals
- functions
- time delta `dt`
- separation of behaviour from drawing

Visible result:

- player movement changes
- cooldowns behave differently
- smoke affects units differently
- napalm drip cadence changes

### 4. Understand projection

Projection means: turn canonical game state into renderer-neutral packets.

Good files:

- `src/projection/renderProjection.js`
- `src/projection/renderLayerState.js`
- `src/projection/napalmLayerState.js`
- `src/projection/lightProjection.js`
- `src/projection/creatures/wyvernCreatureRigPose.js`

What you are learning:

- data transformation
- separating truth from visuals
- why the renderer should not own gameplay facts

Visible result:

- renderer receives better packets
- debug HUD can show more honest information
- visual effects become easier to diagnose

### 5. Understand WebGL layers

The WebGL renderer is where visible pixels happen. Do not start here. Earn it by understanding data → system → projection first.

Good files:

- `src/render/backends/webgl/WebGLGameRenderer.js`
- `src/render/backends/webgl/WebGLRenderLayerRegistry.js`
- `src/render/backends/webgl/layers/*`

What you are learning:

- render order
- layer boundaries
- draw calls and budgets
- why “just add a glow” can quietly mug your FPS in an alley

Visible result:

- terrain/lighting/smoke ordering improves
- HUD debug info improves
- effects read better

### 6. Write tests as proof

Tests are not school homework. In this project, they are armour.

Good files:

- `tests/runTests.mjs`
- `tests/napalmDribble.test.mjs`
- `tests/ecsFoundation.test.mjs`
- `tests/webglRendererHierarchy.test.mjs`

What you are learning:

- assertions
- importing code into test files
- proving contracts
- catching your own nonsense before Codex makes it worse

Visible result:

- you change code with less fear
- I can verify your work faster
- future agents have guardrails

## The learning ladder

### Phase 0 — Boot confidence

Goal: know how to launch, test, and inspect the game without panic.

You must be able to:

- run `npm test`
- run `npm run learn`
- launch `LAUNCH_BSB.bat`
- open the browser console
- find `window.BSB_V2_DEMO`
- call `window.render_game_to_text()`

### Phase 1 — Tuning without breaking architecture

Goal: change game feel through data only.

Feature slices:

- make the wyvern 10% slower or faster
- make smoke linger longer but not larger
- make napalm droplets less frequent
- make raiders slightly more fragile
- adjust camera follow feel

You are not allowed to touch systems yet.

### Phase 2 — Components and ECS

Goal: understand how entities hold state.

Feature slices:

- add a simple `Stamina` component factory
- attach it to the player only
- expose it in a debug snapshot
- write one test proving the player has stamina and enemies do not

Do not make sprint yet. First prove the data exists.

### Phase 3 — First real behaviour system

Goal: turn state into behaviour.

Feature slice:

- add sprint drain/recovery using the stamina component
- only affect movement speed when shift is held
- cap stamina cleanly between 0 and max
- show it in debug text or snapshot
- test drain and recovery

This is the first slice where you start becoming dangerous. Lovely, but still supervised.

### Phase 4 — Combat readability

Goal: make player actions easier to read.

Feature slices:

- add a short claw impact flash through existing effect/projection seams
- add stronger bite feedback
- ensure effects have lifetime caps
- test that the effect reaches render projection

### Phase 5 — Renderer confidence

Goal: change visuals without smearing logic into renderer code.

Feature slices:

- improve one WebGL layer debug counter
- add a simple visual flag from projection metadata
- tune smoke/napalm layer ordering
- prove with tests that layer order remains canonical

### Phase 6 — Mini feature ownership

Goal: own a complete tiny feature from data to visible output.

Good candidates:

- player stamina sprint
- smoke fear pulse
- raider torch panic reaction
- napalm scorch fade variation
- simple health pulse when damaged

A complete feature means:

```txt
data → component → system → projection/render/debug → test → visual confirmation
```

## Your actual weekly rhythm

Three short sessions beat one heroic doom-scroll marathon.

### Session A — Reading

Pick one file. Write five comments in your own words. Do not change code.

### Session B — Tiny edit

Change one number or one branch. Run tests. Launch. Observe.

### Session C — Proof

Add or update one test. Ask me to review your reasoning and patch.

## What you should avoid at first

Avoid these until Phase 4+:

- shader work
- broad renderer rewrites
- architecture refactors
- pathfinding rewrites
- “make AI smarter”
- multi-file changes without a test
- adding new folders because it feels cleaner

Those are not forbidden forever. They are forbidden while your hands are still getting used to the steering wheel.

## The first task

Start with `docs/learning/QUEST_00_BOOT_AND_READ.md`.

Then run:

```bash
npm run learn
```

When that passes, do Quest 1.
