# AI Behaviour Appraisal & Corpse Obstacles v0

## Goal
Close Slice 3 of the command-wheel foundation by making behaviour intents produce explicit unit responses, while keeping AI appraisal cadence/dirty-event driven instead of turning `gameModel.js` into a per-tick field blender.

This slice also changes death handling so dead leaders/squads leave corpse obstacles rather than disappearing. Corpse disposal is intentionally only scaffolded for now.

## What changed

### AI appraisal
- Added entity appraisal through `appraiseEntityBehaviour()`.
- Entities now update emotional/perception state from sampled behaviour fields.
- Threat, exposure, nearby deaths, isolation and commander loss push units toward pressure/panic/rout.
- Shelter, morale, command confidence and commander proximity support recovery.

### Intent responses
- `issueAIBehaviourIntent()` now applies intent packets to target entities immediately.
- Units emit explicit responses:
  - accepted
  - degraded
  - rejected
  - overridden_by_survival
- Repeated/urgent commands can override panic, but now carry strain/override cost.
- Chosen movement states write through to the existing movement-order system rather than replacing pathfinding.

### Attention/distraction
- `distract` intents create transient attention markers.
- Attention markers feed behaviour fields and enemy perception appraisal.

### Corpse obstacles
- Added `src/game/corpseSystem.js`.
- Squad/leader deaths now produce persistent corpse records.
- Death events now use `onDeath: leave-corpse-obstacle` for units.
- Corpses contribute to movement blocking/navigation signatures.
- Corpse presence also contributes horror/threat/morale pressure in behaviour fields.
- Disposal state is scaffolded but not yet implemented as logistics gameplay.

### UI/debug
- Selected entities now show AI emotional state, degraded/rejected response state, command confidence and mental strain in the context panel.

## Performance discipline
- Behaviour fields remain cached/cadenced.
- AI appraisal runs through the existing `aiAppraisal` scheduler path.
- Corpse blockers invalidate navigation via runtime dirty/version events only when death happens.
- No heavy every-frame scanning was added.

## Validation
- `node --check` across `src/`, `tests/`, and `tools/` passed.
- `npm test` passed.
- Added `tests/aiBehaviourAppraisal.test.mjs` covering:
  - exposed/threatened units becoming pressured/panicked
  - sheltered commander-supported recovery
  - urgent panic override with cost
  - attention marker perception shift
  - issued intent response persistence
  - corpse obstacle blocking movement

## Intentionally not built yet
- Full command wheel UX.
- Corpse disposal logistics jobs.
- Dragon/predator AI.
- Baby dragon / wolf command variants.
- Any pathfinding rewrite.
