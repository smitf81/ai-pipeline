# AI Behaviour Field Derivation v0

## Goal

Land slice 2 of the commander/order-wheel foundation without slipping into sim soup.

This pass turns the AI behaviour contract from slice 1 into actual cached behaviour fields that future command responses can read:

- shelter
- exposure
- threat
- attention
- morale
- commandConfidence

## What changed

### 1. Behaviour fields now derive from existing game truth

`src/world/behaviourFields.js` now derives behaviour fields from:

- terrain passability / cover / logistics / height
- command influence fields
- front pressure / objective pressure
- player/enemy line of sight
- completed structures and outposts
- leaders and squads
- active attention markers
- recent death events

The intent here is not to create a second world model. These fields are a behavioural readout built from the existing map/game state.

### 2. Cached/cadenced integration

`src/game/gameModel.js` now merges derived behaviour fields into `game.fields`, but uses a cached runtime derivation layer so these fields are not blindly rebuilt as fresh heavy work every movement tick.

The behaviour-field recompute is tied to the existing runtime dirty/version/scheduler path, especially AI, fields, squads, structures and combat-target changes.

### 3. Legacy trait roll-forward

Existing leader/squad qualities were not culled because they are not dead data yet. They now feed the behaviour layer:

- leader `presence` → morale anchor
- leader `discipline` → command confidence
- squad `morale` → local morale field
- squad `discipline` → local command confidence
- AI `maxMoralePenalty` / `mentalStrain` remain available for later urgency/override costs

This keeps the old qualities useful instead of leaving them as hollow UI flavour text.

### 4. Attention/death hooks

Attention markers and recent deaths now affect behaviour fields:

- attention markers paint `attention`
- attention markers lightly raise nearby `threat`
- death events raise local threat pressure

This gives future command responses something to react to when distraction, panic, death shock and predator interest come online.

## Files changed

- `src/world/behaviourFields.js`
- `src/game/gameModel.js`
- `tests/behaviourFields.test.mjs`

## Validation

Passed:

```bash
find src tests tools -name '*.js' -o -name '*.mjs' | sort | xargs -I{} node --check {}
npm test
```

## What this does not do yet

- It does not implement the command wheel.
- It does not make units accept/degrade/reject commands in movement yet.
- It does not implement dragon/wolf/predator behaviour.
- It does not rewrite pathfinding.
- It does not add a heavy per-frame AI simulation.

## Next slice

Slice 3 should be **Behaviour Appraisal & Response v0**.

That slice should make selected units actually sample these fields, evaluate their emotional state, and return explicit intent responses:

- accepted
- degraded
- rejected
- overridden_by_survival

That is the bridge between these fields and the command wheel.
