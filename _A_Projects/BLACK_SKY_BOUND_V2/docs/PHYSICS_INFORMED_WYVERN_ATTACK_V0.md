# Physics-Informed Wyvern Attack Definition v0

## Purpose

This slice turns the first two player wyvern attacks into body-driven contact definitions.

The canonical flow is:

```txt
Input cooldown/action start
  -> ActionState phase
  -> Wyvern action profile contact contract
  -> ProceduralPose.attackContact
  -> wyvernAttackContactSystem
  -> damage + ImpactResponse
  -> projection/WebGL debug marker
```

The renderer receives contact debug data. It does not decide hits.

## Attack Definitions

### bite_attack

Driving body part:

- `jaw_head_front`

Body motion:

- head and jaw project forward;
- neck extends;
- chest braces slightly back;
- both wing/wrist claws brace as stabilising contacts.

Contact contract:

- active phase: `0.42 -> 0.68`;
- shape: capsule approximation;
- contact is biased forward from the head/jaw;
- impact direction: mostly forward;
- result: bite damage plus bounded forward stagger/knockback.

### claw_swipe_attack

Driving body part:

- `primary_wrist_claw`

Body motion:

- leading wing-forelimb wrist drives forward and across the body front;
- opposite wrist braces;
- chest, neck, and head counter-shift for readability.

Contact contract:

- active phase: `0.34 -> 0.68`;
- shape: front arc/band approximation;
- contact follows the front sweep band rather than a circular radius;
- impact direction: sideways/diagonal;
- result: body damage plus stronger lateral stagger/knockback.

## Contact Profile Fields

Each action profile now defines:

- `contactBodyPart`
- `activePhaseStart`
- `activePhaseEnd`
- `contactShape`
- `contactOffset`
- `contactSize`
- `impactDirection`
- `impactStrength`
- `staggerStrength`

These fields live in:

```txt
src/data/creatures/groundedWyvernMotionProfiles.js
```

## Physics-Informed Fields

Actors now own `ImpactResponse`:

- `mass`
- `impactResistance`
- `staggerResistance`
- `knockbackVelocityX`
- `knockbackVelocityY`
- `staggerTimer`
- `lastImpact`

The response is deterministic and bounded. It is not a rigid-body or ragdoll system.

## Runtime Owners

- `combatSystem` starts attack actions and cooldowns only.
- `wyvernProjectionSystem` advances action phase and pose.
- `wyvernAttackContactSystem` resolves active contact windows.
- `impactResponseSystem` applies and damps knockback velocity.
- `enemyPressureSystem` slows enemies while staggered.
- `WebGLWyvernSilhouette` draws only a debug marker for active projected contact data.

## Intentionally Left Later

- no blood puffs;
- no sparks;
- no death decals;
- no large slash overlays;
- no ragdolls;
- no skeletal framework;
- no GPU instancing;
- no combat balance overhaul;
- no enemy AI expansion;
- no Canvas renderer revival.

## Validation

The focused test coverage lives in:

```txt
tests/physicsInformedWyvernAttack.test.mjs
```

It proves profile contracts, active-window gating, bite-vs-claw impact direction differences, damage/stagger/knockback application, projected contact debug data, WebGL marker consumption without hit logic, and Canvas 2D remaining unavailable.
