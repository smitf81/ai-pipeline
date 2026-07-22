# Wyvern Projection Partition v1

Historical note: this document describes the former Canvas 2D wyvern renderer partition. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live player wyvern renderer is now `src/render/backends/webgl/WebGLWyvernSilhouette.js`, fed by the same renderer-neutral wyvern projection facts.

## Purpose

The grounded wyvern player is still one gameplay entity. This pass formalises the creature as a projection/anatomy structure so future head, neck, spine, tail, material, attack, and emitter passes do not turn `wyvernLayer.js` into a renderer blob.

## Current rule

```txt
Gameplay truth:
  one player entity
  Transform / Collider / Health / PlayerControlled / WyvernProjection

Canonical creature projection truth:
  immutable base profile + file-backed tuning overrides
  -> resolved creature projection recipe
  -> CreatureRigPose

Motion/action drive:
  ProceduralPose supplies action phase, gait phase, offsets, sockets, and contact windows.
  It does not own anatomical proportions, visual bounds, or renderer-facing skeleton truth.

Renderer truth:
  WebGL consumes CreatureRigPose as the preferred live silhouette contract.
  Legacy body-chain/pose fields are solver provenance or explicit debug fallback only.
```

Do not promote wings, hind legs, tail segments, or head parts into independent ECS entities unless gameplay needs limb-specific collision, injury, targeting, or state.

## Partition

```txt
src/data/creatures/groundedWyvernHatchling.js
  Data-backed immutable anatomy recipe builder. Legacy fields are derived from the resolved
  profile instead of hand-copied into competing truth.

src/data/creatures/creatureTuning.js
  Bounded tuning manifest, override normalization, profile merge, and editable-path validation.

src/projection/creatures/creatureKinematics.js
  Shared projection maths: two-bone IK-style solve, offsets, facing vectors, role indexing.

src/projection/creatures/wyvernCreatureRigPose.js
  Canonical resolved rig output: axial body, head/jaw, neck, shoulders, hips, wing-forelimbs,
  hind legs, tail, gait contacts, sockets, constraint state, visual scale, and visual bounds.

src/systems/wyvernProjectionSystem.js
  Updates projection drive state, resolves the active tuned recipe, and writes CreatureRigPose.

src/render/backends/webgl/WebGLWyvernSilhouette.js
  Draws the live silhouette from CreatureRigPose. It must not own action timing, gait timing,
  anatomy profile truth, or local body scale constants.
```

## Why not ECS limb components yet?

That would imply limb-level gameplay truth. We do not need that yet. The current need is visual/anatomical readability, not limb damage, per-foot collision, or attack hitboxes.

## Data/code split

Creature values should live in recipe data:

```txt
- head and snout size
- chest and hip proportions
- tail segment spacing
- wing digit lengths
- membrane attachment rules
- wrist stride
- hind-leg thigh/shin lengths
- foot spread/girth
- gait cadence
- palette/material colours
```

Reusable logic should live in projection helpers:

```txt
- two-bone IK-style solve
- offsets along forward/right vectors
- role indexing
- shared distance/midpoint helpers
```

Render modules should only draw the current projection. They must not own gameplay state.

## Future passes

This partition is intended to support:

```txt
1. head / jaw / eye / hornlet readability
2. neck / spine connection and body mass pass
3. tail taper and tail-tip pass
4. black scale colour/material pass
5. later attack/state-machine pass
6. later player emitter pass
7. later trail pass
```
