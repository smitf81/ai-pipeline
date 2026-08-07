# Shadow Shape Families v1

## Intent

Shadow casters declare a small, controllable ground footprint and a simplified projected silhouette. The renderer does not infer geometry from sprites and does not treat the object's collision box as its shadow root.

Contact and projection have separate owners:

1. The contact footprint is a short, soft ellipse, capsule, or authored polygon anchored at ground contact.
2. The projected shadow begins beyond that footprint and is rendered only by the existing tapered-capsule SDF fields.
3. The former full-region penumbra/core wedge is retired. Diagnostic region bounds remain renderer-neutral data but do not draw geometry.

This preserves the severe directional streaks while removing square, chunky roots and duplicate darkening.

## Declarative contract

`src/data/shadowShapeProfiles.js` owns `black-sky-bound.shadow-shape-profile.v1`.

Each resolved profile contains:

- `profileId` and `variantId`;
- a ground `anchor`, `rotation`, and `scale`;
- `contact` shape, width/depth, softness, density, and optional polygon points;
- `projection` length, root width, spread, and root inset;
- a small list of projected SDF primitives.

Live bindings are:

- old pine: `broad_tree:dense_pine`;
- silver birch: `broad_tree:airy_birch`;
- dead snag: `narrow_trunk:dead_snag`;
- boulder: `rock:faceted`;
- wyvern/humanoid/generic actor: `creature` variants.

`tent`, `wall_segment`, and `no_shadow` profiles establish the next authoring vocabulary without adding unowned live objects.

## Runtime ownership

- Scene-object definitions select a family; runtime scene objects resolve it once.
- Actor visual projection supplies dynamic creature primitives to the shared creature family.
- Occlusion projection rotates/anchors the footprint, starts the streak after its root inset, and preserves profile identity in regions and field packets.
- WebGL contact geometry is deduplicated per blocker across overlapping lights.
- Projected shape remains SDF shader work; no automatic sprite analysis or per-pixel height map is introduced.
- The dead snag's legacy rectangular painted base was replaced by bounded elliptical grounding geometry.

## Diagnostics and validation

The shadow layer reports `shadowContactFootprintCount` and `coarseProjectedShadowTriangleCount`. The latter must remain zero. Renderer-neutral projection reports the active profile IDs and contact-footprint count.

`tests/shadowShapeProfiles.test.mjs` protects family resolution, live bindings, contact/projected separation, per-caster deduplication, and retirement of coarse projected geometry. `tests/playtest/shadowShapeFamilies.playtest.mjs` stages deterministic pine, birch, snag, rock, and creature scenes in a real browser and captures both images and runtime evidence.
