# Apply AI Behaviour Contract v0

## Purpose
This slice lays the contract layer for survival-command AI without implementing the full order wheel yet.

It keeps the system game-facing rather than sim-sprawling:
- player urgency is captured through an intent accumulator
- repeated orders can increase urgency
- forcing survival behaviour accrues strain/override debt for later morale damage
- AI work is routed through runtime dirty/events/scheduler seams instead of constant per-frame field scans

## What changed

### New modules
- `src/game/aiContracts.js`
  - emotional states
  - intent states
  - perception states
  - intent packet/response contracts
  - intent accumulator
  - override-cost calculation

- `src/game/aiStateMachine.js`
  - AI system state
  - AI entity state
  - intent accumulator issuing
  - simple emotion-vs-intent classification
  - mental strain / max morale penalty hooks
  - attention marker contract

- `src/world/behaviourFields.js`
  - behaviour field contract shell
  - required field ids:
    - shelter
    - exposure
    - threat
    - attention
    - morale
    - commandConfidence
  - cheap sampling/classification helpers

### Runtime integration
- `src/game/runtimeEvents.js`
  - adds AI dirty/version key
  - adds `aiAppraisal` scheduler slot
  - adds events:
    - `ai:intent_issued`
    - `ai:intent_response`
    - `ai:attention_marker`
    - `ai:appraisal_requested`
  - movement/combat/death/structure events now dirty AI state through the existing dispatcher impact path

### Game model integration
- `src/game/gameModel.js`
  - adds top-level `game.ai`
  - leaders/squads now carry `entity.ai`
  - adds `issueAIBehaviourIntent()` for contract-safe intent issuing
  - does not alter pathfinding, combat, economy, construction, or map maths

### Tests
- `tests/aiBehaviourContracts.test.mjs`
- `tests/behaviourFields.test.mjs`
- added both to `tests/runInProcessTests.mjs`

## Important design commitments

### Not built yet
- no order wheel UI
- no full behaviour field derivation
- no dragon/wolf/predator AI
- no every-frame AI scan
- no pathfinding rewrite

### Why this matters
The next slices can now send commands as intent packets and receive explicit intent responses instead of silently making units obey or ignore commands.

A future command can say:
- accepted
- degraded
- rejected
- overridden_by_survival

That is the foundation for making command → intent → action readable.

## Validation
- `node --check` across `src/`, `tests/`, `tools/` passed
- `npm test` passed

## Next slices
1. AI Behaviour Contract v0 — done
2. Behaviour Field Derivation v0
3. Behaviour Appraisal & Response v0
4. Command Wheel Functional v0
