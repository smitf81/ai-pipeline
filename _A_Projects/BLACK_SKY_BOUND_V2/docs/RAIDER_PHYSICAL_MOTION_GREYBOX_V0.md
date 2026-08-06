# Raider Physical Motion Greybox v0

## Decision

This slice freezes the procedural raider family at recipe `raider_scavenger_v1`, seed `1`, and evaluates motion before the finished faceted body is reattached. The production recipe, balance, AI, and contact systems remain canonical; the greybox is an optional presentation lane, not a second gameplay implementation.

The architecture follows the useful part of [Gibbon's layered animation approach](https://www.hemispheregames.com/new_blog/2022/03/19/physics-based-animation-in-gibbon-beyond-the-trees/): preserve a small set of important physical constraints, then derive the richer display rig. BSB uses a pelvis/centre-of-mass proxy, persistent foot contacts, independent attention headings, and a weapon goal. Elbows and knees are solved afterwards with two-bone IK.

## Runtime contract

`black-sky-bound.raider-physical-motion-intent.v0` is present only on recipe-backed raiders. It defaults to `poseEnabled: false`, so it can observe production motion without reattaching the finished body. The dedicated proof actor opts into the greybox pose explicitly. It owns:

- filtered and measured pelvis velocity, acceleration, attack shift, and recoil shift;
- planted left/right contacts, support/swing identity, plant ids, and gait phase;
- independent travel, chest, and head headings;
- target-velocity observation and a bounded spear prediction;
- the immutable impact point after attack commitment;
- contact recoil and cross-state continuity counters.

The production landing path is:

```text
movement + EnemyPressureAI
  -> raiderPhysicalMotionSystem
  -> humanoidProjectionSystem / two-bone IK
  -> bodyContactRigSystem / solved spear-tip sweep
  -> enemyAttackSystem damage
  -> actor view
  -> renderer-neutral 3D projection
  -> finished body or optional coloured greybox
```

The physical solver runs after AI and before humanoid projection, body-contact projection, and enemy attack resolution. The attack system freezes the predicted point at the wind-up-to-active boundary. Post-commit target motion cannot change that point, and the existing swept spear-tip contact volume decides whether damage lands.

## Spear-jab policy

During wind-up, the predicted point is `target + observed velocity * remaining wind-up`. Lead time is capped at 0.36 seconds, lead displacement at 0.42 gameplay units, and angular deviation at 0.18 pi radians. Commitment copies the current prediction into `frozenImpact` and aligns the attack once. Active and recovery poses continue to use that frozen point.

Contact starts a short recoil impulse that travels visually from the spear and hands into the shoulders, chest, and pelvis. A miss does not create recoil. Recovery eases the pelvis back over the same planted contacts.

## Deliberate v0 limits

- One recipe, seed, body, spear, and flat proof stage.
- Idle, locomotion, start/stop inertia, attention separation, and spear jab only.
- Torch attack, guard, dodge, reaction, and death continue to use the established compatibility poses.
- Recipe variation, masks, armour, packs, and the production faceted shell remain frozen. Reattachment is a later slice after visible motion acceptance.
- This is a low-order procedural constraint solver, not a rigid-body or ballistic-planning simulation.

## Evidence gate

Run `npm run smoke:raider-motion-greybox`. The browser lane produces:

- a 13-frame gameplay-camera contact sheet;
- post-setup normal-speed and slow-motion WebM captures;
- a sampled video contact sheet for human inspection;
- a JSON report with planted-contact, inertia, attention, frozen-impact, fair-dodge, recoil, renderer, topology, and browser-error evidence.

The proof must retain the exact support-foot coordinates while its plant id is unchanged, show non-zero stopping inertia, separate chest attention from travel, preserve a frozen point after the target dodges, miss without damage after that dodge, hit a static target through the real contact volume, and produce recoil only on contact. The optional F3 diagnostics expose the intent contract and renderer counts.

Evidence is written to `artifacts/raider-physical-motion-greybox-v0/`.
