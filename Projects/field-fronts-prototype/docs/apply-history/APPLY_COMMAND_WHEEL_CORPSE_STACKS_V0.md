# Field Fronts — Command Wheel Functional v0 + Corpse Stack Contract

## Slice goal

Land the fourth AI behaviour slice: hook the context/order wheel into the AI intent contract and tighten the corpse obstacle model so bodies behave like a stacking movement/shelter problem rather than a binary magic wall.

## What changed

### Command wheel functional v0

- Added `src/game/commandWheel.js`.
- Command wheel actions now map to AI intent packets:
  - `MoveTo` → `move_to_target`
  - `Shelter` → `seek_shelter`
  - `Quiet` → `quiet_move`
  - `Distract` → `distract`
  - `Regroup` → `regroup`
- The right-click hold wheel now stays open for selection instead of instantly firing a move command on release.
- Wheel buttons emit `orders:survival-intent`.
- `main.js` routes wheel actions through `issueAIBehaviourIntent()`.
- Intent responses update HUD status with accepted/degraded/rejected style feedback.

### AI response routing

- `seek_shelter` now uses the best shelter target found by the behaviour fields rather than blindly moving to the clicked tile.
- `regroup` now prefers the commander command anchor/fallback rally.
- Panicked/routed units still degrade or reject unsafe intent through the existing state machine.

### Corpse stacking contract

- Reworked corpse obstacles from binary blockers into tile stacks.
- One corpse is step-over terrain.
- Two to three corpses become clamber terrain:
  - slower movement
  - higher movement cost
  - crude cover/shelter bonus
  - some exposure reduction
- Four or more corpses become a body-wall obstacle.
- Corpse stack signatures now invalidate navigation only when stacks become meaningful slow/blocking terrain.
- Pathfinding cost now accounts for corpse clamber stacks.
- Movement speed now slows when stepping through corpse stacks.
- Behaviour fields now read corpse stacks as:
  - horror/threat/attention pressure
  - morale pressure
  - crude cover/shelter and exposure reduction

## Files changed

- `src/game/commandWheel.js`
- `src/game/aiStateMachine.js`
- `src/game/corpseSystem.js`
- `src/game/gameModel.js`
- `src/game/movementSystem.js`
- `src/input/pointerController.js`
- `src/main.js`
- `src/ui/gameUI.js`
- `src/world/behaviourFields.js`
- `styles.css`
- `tests/aiBehaviourAppraisal.test.mjs`
- `tests/behaviourFields.test.mjs`
- `tests/commandWheel.test.mjs`
- `tests/runInProcessTests.mjs`

## What is intentionally not done yet

- No polished radial command wheel UX.
- No corpse disposal job system yet.
- No baby dragon/wolf command variants.
- No full survival scenario test map yet.
- No new heavy every-frame AI scanning.

## Validation

- `node --check` across `src/`, `tests/`, `tools/` passed.
- `npm test` passed.

## Next suggested slice

Command wheel UX polish + feedback readability:

- make accepted/degraded/rejected responses more visible in-world
- show command urgency/strain feedback clearly
- show why a unit degraded or rejected an order
- tune wheel layout so it feels like a survival command language, not a debug menu

After that, build the dedicated test scenario.
