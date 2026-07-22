# Procedural Motion + Action State Foundation v0

## Purpose

This slice makes the player wyvern's movement and attacks visible through live procedural pose data before adding more combat hit feedback.

The canonical flow is:

```txt
ECS MotionState + ActionState + LimbRig + WyvernProjection + CreatureRigPose
  -> wyvernProjectionSystem
  -> ProceduralPose component as motion/action drive
  -> CreatureRigPose component as resolved anatomy/skeleton/bounds truth
  -> renderer-neutral wyvernProjection.proceduralPose + wyvernProjection.rigPose packets
  -> WebGLActorLayer / WebGLWyvernSilhouette
```

The renderer consumes rig and pose packets. It does not own action timing, gameplay state, gait phase, procedural pose truth, anatomical proportions, sockets, visual bounds, or local creature scale.

After Canonical Wyvern Rig + File-Backed Tuning Overlay v0, `ProceduralPose` is intentionally narrower than the original v0 wording implied. It remains the source for action phase, motion phase, offsets, attack contacts, and socket drive. `CreatureRigPose` is the canonical renderer-neutral output for axial body, head/jaw, neck, shoulders, hips, wing-forelimb anchors, hind legs, tail, gait contacts, constraint state, sockets, and visual bounds.

## Existing Code Found

Live before this slice:

- `src/systems/wyvernProjectionSystem.js` advanced `gaitPhase`, `idlePhase`, `movement01`, body-chain points, and mouth socket data from actual movement.
- `src/data/creatures/groundedWyvernHatchling.js` already held projection/anatomy data for a four-limb grounded wyvern.
- `src/render/backends/webgl/WebGLWyvernSilhouette.js` drew the player wyvern mesh in WebGL.

Parked or only partially wired before this slice:

- `src/projection/creatures/creatureKinematics.js` contained reusable vector and IK helpers, but the active WebGL silhouette was not using it.
- Wing/hind-leg anatomy values existed, but WebGL limb positions were mostly static renderer-local offsets.
- Combat inputs created damage/effect events, but did not start body/limb action poses.

## New Components

The player wyvern now owns:

- `MotionState`: locomotion id, speed, velocity, movement amount, facing, phase, and phase bucket.
- `ActionState`: current action id, elapsed time, duration, phase, phase label, source ability, side, and aim point.
- `LimbRig`: the active rig reference and contact policy.
- `ProceduralPose`: the live pose output, contact anchors, sockets, jaw amount, cache key, and cache policy.

`PoseCacheRef` was not added in v0. The needed cache contract lives on `ProceduralPose.cachePolicy` and `ProceduralPose.cacheKey`.

## Motion and Action Profiles

Lightweight profile data lives in:

```txt
src/data/creatures/groundedWyvernMotionProfiles.js
```

Minimum profile set:

- `idle`
- `crawl`
- `bite_attack`
- `claw_swipe_attack`

Each profile declares duration, phase labels, weight shifts, contact anchor intent, affected joints, pose offsets, and action hit timing markers where relevant. These markers do not redesign combat; they make future feedback timing attachable to body motion.

Current action mapping preserves existing combat controls:

- `BITE_CLAW` starts `bite_attack`.
- `BODY_LUNGE` starts `claw_swipe_attack`.

The follow-up Physics-Informed Wyvern Attack Definition v0 slice moved player attack hit resolution out of immediate button-press radius checks. Attack damage now resolves from active `ProceduralPose.attackContact` windows.

## Solver and Projection Contract

The pose solver lives in:

```txt
src/projection/creatures/wyvernProceduralPose.js
```

It reuses `creatureKinematics.js` for facing vectors, body role indexing, and socket offsets. It emits normalized body/limb offsets plus tile-space sockets. `renderProjection.js` wraps that as:

```txt
renderer_neutral_procedural_pose_projection
```

The anatomical rig solve lives in:

```txt
src/projection/creatures/wyvernCreatureRigPose.js
```

It consumes the resolved creature projection recipe and the current `ProceduralPose`, then emits:

```txt
renderer_neutral_creature_rig_projection
```

The WebGL silhouette applies:

- rig axial points for head, neck, chest, hips, and tail base;
- rig wing-forelimb shoulder, elbow, wrist, and contact anchors;
- rig hind-leg hip, knee, ankle, and foot contact anchors;
- rig tail bones and taper widths;
- bite jaw visibility from projected `jawOpen`;
- claw wrist sweep from projected forelimb offsets.

## Caching and Baking Strategy

v0:

- solve pose live for the unique player wyvern;
- keep the output deterministic;
- emit `cachePolicy: "v0_live_solve_v1_phase_bucket_cache"`;
- emit a `cacheKey` based on rig id, motion id, motion phase bucket, action id, action phase bucket, and action side.

v1:

- cache repeated pose outputs by actor type or rig id, motion id, action id, phase bucket, and action side;
- keep cache entries renderer-neutral, not WebGL objects.

Later:

- optional baked pose tables for common actions;
- optional authored profile expansion if combat readability needs more pose beats.

## GPU Instancing Later

GPU instancing is intentionally not part of this slice.

It would apply later to:

- repeated human units;
- repeated simple enemy actors;
- repeated decals;
- repeated effects.

It should not be the first optimization target for the unique articulated player wyvern. The player needs correct, readable procedural pose output before GPU batching work.

## Intentionally Left Later

- No new slash sparks, blood puffs, hit decals, or death feedback.
- No full skeletal framework.
- No pathfinding changes.
- No Canvas renderer revival.
- No GPU instancing implementation.
- No offline bake pipeline.
