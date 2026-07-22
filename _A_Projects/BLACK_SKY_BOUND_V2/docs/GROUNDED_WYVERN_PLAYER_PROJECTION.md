# Grounded Wyvern Player Projection v1

Historical note: this document describes the former Canvas 2D grounded wyvern renderer pass. Canvas 2D runtime modules under `src/render/layers/` were removed in Canvas 2D Renderer Cull v1. The live player wyvern renderer is now `src/render/backends/webgl/WebGLWyvernSilhouette.js`.

## Purpose

Replace the placeholder player silhouette with a grounded baby wyvern projection while keeping the player as one simple gameplay entity.

This is a render/projection pass, not a combat or animation-state-machine pass.

## Creature rule

The player creature is treated as a young wyvern:

- four-limb body plan
- two hind legs
- two batlike wing-forelimbs
- grounded crawl/lope movement
- no wing flapping for ordinary movement
- no player light emitter in this slice
- no trails in this slice

## Architecture rule

The wyvern body parts are projection data, not separate gameplay actors.

Gameplay truth remains:

- `Transform`
- `Motion`
- `Health`
- `Collider`
- `PlayerControlled`
- `PlayerIntent`

The projection is stored in:

- `WyvernProjection`

The renderer consumes the derived projection through actor views.

## Files

- `src/data/creatureProjections.js`
- `src/systems/wyvernProjectionSystem.js`
- `src/render/layers/actorLayer.js`
- `src/components/createComponents.js`
- `src/constants/componentTypes.js`
- `src/game/spawn.js`
- `src/game/selectors.js`
- `src/game/systemOrder.js`
- `tests/wyvernProjection.test.mjs`

## What this pass does

- Adds a data-backed grounded wyvern hatchling projection recipe.
- Adds a `WyvernProjection` component to the player entity only.
- Adds a projection system that maintains body/tail chain points.
- Adds gait/idle projection state driven by actual player movement.
- Draws a low, naturalistic wyvern silhouette with:
  - head
  - neck/chest/hips
  - tail chain
  - batlike wing-forelimbs
  - hind legs
  - faint eye glints

## What this pass does not do

- no attacks
- no special moves
- no fire breath
- no player light emitter
- no trails
- no fog
- no per-limb collision
- no separate wing/tail entities
- no skeletal animation system

## Validation

`npm test` passes, including a focused test that confirms:

- the player remains one gameplay entity
- only the player owns `WyvernProjection`
- the projection recipe preserves the four-limb wyvern body plan
- the dragon/wyvern still has no player light emitter
- the renderer receives derived body-chain projection data

## v1.1 Wing anatomy correction

The first visible pass read too much like a segmented centipede because wings were drawn as simple stick triangles and the body chain was too visibly separated.

Correction pass:

- wing-forelimbs now have explicit anatomy data:
  - shoulder
  - elbow
  - wrist/claw contact point
  - three visible digit spars
  - digit knuckles
  - connected membrane surface
- the wrist/claw is the grounded front contact point for crawling.
- long digits support the wing membrane; they are not extra legs.
- ordinary movement still does not flap wings.
- wing placement uses a cheap two-bone IK-style solve at projection/render time.
- torso rendering is slightly connected so the player reads as one creature rather than separate beads.

This is still not a full animation-state-machine pass. The player remains one gameplay entity and the wing anatomy remains projection-only.

## Tick / frame-loop note

The wyvern projection is not a free-running physics simulation hidden in the render loop.

Current split:

- `wyvernProjectionSystem` runs as part of the fixed-step ECS update.
- It maintains tiny body-chain projection state for the single player entity.
- Wing anatomy and IK-style limb positions are solved during rendering from current projection data.
- No extra gameplay entities, collision bodies, timers, or independent wing simulations are created.

This keeps the movement cheap and bounded while still letting the projection look more anatomical.

## v1.2 Wing membrane and wrist-led crawl correction

The v1.1 wing anatomy improved the silhouette, but the digits were still too short and the membrane did not read as a large folded wing attached along the body.

Correction pass:

- lengthened the wing digits so they read as large folded wing spars rather than small side limbs.
- kept the wrist/claw as the grounded forelimb contact point.
- increased visible wrist/claw reach during crawling so the forelimbs lead the movement instead of feeling static.
- added slight outward bracing during the crawl phase.
- anchored the membrane lower along the body/flank near the hip area, closer to a Reign of Fire-style wyvern wing relationship.
- rendered faint membrane tension folds from the low body anchor to the digit tips.
- slightly reduced player movement speed and gait cadence so the crawl reads less skittery.

Still not included:

- no flight/flapping animation for ordinary movement
- no attack animation/state machine
- no special moves
- no trails
- no player light emitter
- no per-limb collision

The wing remains projection-only and bounded. The wrist-led crawl is visual articulation, not a new limb simulation.

## v1.3 Wing joint-origin correction

The v1.2 membrane pass made the wings larger, but the membrane tension lines could visually imply that the main digit spars originated from the low body/flank anchor instead of the wrist/claw.

Correction pass:

- added explicit anatomy metadata for:
  - `digitOrigin: "wrist_claw"`
  - `membraneFoldOrigin: "wrist_claw"`
  - `bodyAttachmentRole: "low_flank_hip"`
- made each rendered digit carry a wrist/claw base and named knuckle points.
- added a visible body/chest → shoulder connector.
- kept the shoulder → elbow → wrist/claw connector as the primary forelimb chain.
- forced every digit spar to draw from the wrist/claw hub through its knuckles to its tip.
- softened membrane folds so they read as surface tension, not extra bones.
- preserved the low flank/hip membrane attachment without making it look like the digit root.

This keeps the intended Reign-of-Fire-style body attachment while making the anatomical hierarchy clearer:

`body/chest → shoulder → elbow → wrist/claw → digit knuckles → digit tips`

The wing remains projection-only and does not introduce per-limb gameplay collision or simulation.

## v1.4 Folded digit readability correction

The v1.3 pass fixed digit origin, but the final wing digits still visually collapsed into a single path. That made the membrane read as one triangle rather than a folded batlike wing with separate supporting spars.

Correction pass:

- expanded the wing from three to four visible digit spars.
- kept every visible digit originating from the wrist/claw hub.
- separated each digit tip with distinct lateral and backward offsets.
- made the leading digit form the upper folded wing edge.
- made the lower support digits shape subtle membrane scallops.
- added small, low-contrast membrane-tip marks so the tips are readable without looking artificially highlighted.
- reduced digit-line contrast so the spars sit inside the silhouette instead of dominating it.
- increased wrist/claw stride and reduced gait cadence slightly so each forelimb plant reads as a proper reach/pull, not a nervous shuffle.

The intended hierarchy remains:

`body/chest → shoulder → elbow → wrist/claw → digit knuckles → digit tips`

The wing remains projection-only. No extra gameplay entities, limb colliders, player light emitters, trails, attacks, or animation state machines were introduced.

## v1.5 Hind leg relationship and grounded gait correction

The previous passes made the wing-forelimbs readable, but the hind legs still behaved like simple trailing sticks rather than weight-bearing rear limbs.

Correction pass:

- added explicit hind-leg anatomy metadata:
  - hip socket
  - knee
  - ankle/foot contact
  - thigh length
  - shin length
  - stride/reach
  - spread
  - girth
- replaced the one-line hind legs with a cheap two-bone IK-style projection solve.
- kept the hind legs diagonally related to the opposite wing-forelimb so the gait reads as a grounded crawl rather than symmetrical paddling.
- increased hind-foot spread and stride so each step has more reach and body weight.
- made thighs thicker than shins so the rear limbs read as muscular support rather than insect legs.
- added small foot/claw contact shapes without adding per-limb collision.
- slightly reduced gait cadence so the reach/plant/push cycle has more time to read.

Still not included:

- no attack animation/state machine
- no per-limb collision
- no trails
- no player light emitter
- no physics ragdoll/limb simulation

The hind-leg articulation remains projection-only and bounded to the single player entity.
