# Visual Scope and Art Direction

## Purpose

Keep Black Sky Bound visually distinctive without trapping the project in asset production, spritesheets, 2.5D renderer ambition, or procedural art-tool development.

## Visual doctrine

Black Sky Bound V2 is **asset-light, not asset-free**.

The game should mostly render from:

- WebGL primitives;
- renderer-neutral projection packets;
- data-owned creature/humanoid proportions;
- procedural motion;
- local light pools;
- smoke, shadows, decals, and material rules.

Small authored image assets are allowed only when they are high-leverage support assets, not a production dependency.

Allowed examples:

- noise masks;
- smoke/cloud masks;
- glow/falloff ramps;
- small UI glyphs;
- reusable scorch/blood/mud/ash decals;
- tiny material-detail atlases if they replace many repeated primitives cheaply.

Avoid for the first playable:

- bespoke character spritesheets;
- large hand-painted prop libraries;
- full animation frame sets;
- an AI 2D art generator;
- per-creature custom asset pipelines.

## Current visual language

The intended look is:

- dark forest;
- warm local torch/fire pools;
- mostly-dark actor bodies;
- silhouettes revealed by light interruption;
- smoke and haze catching light;
- grounded, primitive-built creature and humanoid forms;
- harsh, desperate, low-visibility atmosphere.

The game should not become a bright, outlined, sticker-like action game.

## Actor readability principle

Actors should read through **dark silhouette against light**, not through artificial full-body brightening.

Good:

- black body mass crossing warm light;
- narrow light-facing rim only where the emitter would catch an edge;
- tiny catchlights on eyes, mouth, torch, spear, claws, or wet scale;
- grounded contact shadow/occlusion;
- stronger pose/silhouette shapes.

Bad:

- global outline strokes;
- full-body brightening;
- UI-like highlights;
- bright faction stickers;
- glow around every actor regardless of light source.

## Actor Light-Silhouette Readability v0 verdict

The implemented v0 pass is structurally correct but visually too timid.

It proved:

- nearest local emitters can drive actor rim/catchlight metadata;
- scene lights can be excluded;
- profile-owned rim/socket/contact geometry can render without extra actor draw calls;
- actor base materials can stay dark.

It did not prove:

- a player can reliably read actors during normal play;
- tiny rim/catchlight changes are enough in the live forest scene;
- this seam deserves more Friday-brain iteration.

Decision:

> Keep v0, but do not keep tuning tiny pixel deltas. Future readability should come from stronger composition, better atmosphere, simpler silhouettes, tree/trunk redesign, and UX/objective clarity before deeper actor rendering.

## 2.5D / fake-height decision

A fake height/depth model could eventually help:

- actor parts know front/back/raised/lowered roles;
- tree bases/crowns can layer over actors cleanly;
- light can catch top/side shapes more believably;
- occlusion can be more readable.

But this is explicitly **parked** for the first game.

Why:

- it risks becoming a renderer project;
- it creates more data contracts and sorting bugs;
- it delays death/retry/menu/objective work;
- it belongs better in a second game or post-release engine evolution.

## Preferred near-term visual wins

After core UX/game loop is locked, choose one bounded visual pass at a time:

1. atmosphere tuning: smoke, haze, moon/cloud readability, torch bloom shape;
2. tree/trunk readability: remove debug-bar feeling, clarify base/crown/background roles;
3. unit silhouette simplification: make pose language more readable before adding detail;
4. fire/torch source shaping: hot core, vertical flame shape, embers, smoke;
5. UI/objective overlay: make state clear without making the world brighter.

No visual slice should be accepted unless a human can see the difference in a normal runtime screenshot.
