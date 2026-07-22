# Technical Boundaries

## Purpose

Keep Black Sky Bound V2 small enough to ship a focused first playable instead of sliding back into engine work, strategy-game scope, renderer research, or tool-building.

## Allowed in v0

- WebGL-only runtime renderer using the existing layer/projection architecture;
- fixed-step simulation;
- camera follows player;
- top-down keyboard movement;
- sprint and bounded dodge;
- simple close-range combat;
- body lunge;
- smoke disruption;
- enemy pressure AI for raiders, husks, and werewolves;
- one escape scenario;
- AXIOM-baked runtime-map consumption through the manifest-owned boundary;
- asset-light primitive/projection visual language;
- small support textures only when they replace lots of repeated primitive work;
- focused automated tests and browser/manual proofs.

## Parked for this first game / first playable

- full 2.5D fake-height/depth renderer;
- spritesheet-heavy art pipeline;
- AI 2D asset generation tool;
- AXIOM runtime/editor UI inside BSB;
- map authoring UI inside BSB;
- old heavy RTS prototype runtime;
- economy/base-building/worker systems;
- strategy selection/command systems;
- morale/confidence systems;
- full stealth;
- full flight;
- complex fire propagation;
- weather volumes;
- LLM/agent gameplay systems;
- campaign/meta progression;
- Steam/trailer polish before the loop is playable.

## Runtime map boundary

- BSB owns simulation, rendering, gameplay, and consumption of baked runtime maps.
- AXIOM owns map authoring, placement tools, validation, and export/bake workflows.
- The passive interchange seam is `src/world/runtimeMapContract.js` plus the manifest at `data/maps/manifest.json`.
- BSB must not import authoring UI, editor input, local scene libraries, or scene-document conversion into its runtime path.

## Renderer boundary

- WebGL is the only supported runtime renderer.
- `?renderer=canvas`, `?renderer=canvas2d`, and `?renderer=2d` must remain unsupported.
- Do not reintroduce Canvas 2D fallback or full-scene Canvas texture upload.
- Future visual features should enter through renderer-neutral projection/data contracts and one bounded WebGL consumer at a time.
- Visual changes must be human-visible in normal runtime screenshots, not just measurable in tiny diff pixels.

## Art boundary

- The project is asset-light, not asset-free.
- Do not block progress on drawing hundreds of assets.
- Do not build an asset factory before shipping a game.
- Allow tiny support textures/masks/decals only when they produce clear leverage.

## File size stop signs

- 500 LoC: review;
- 800 LoC: split unless exceptional;
- 1000 LoC: architecture failure.
