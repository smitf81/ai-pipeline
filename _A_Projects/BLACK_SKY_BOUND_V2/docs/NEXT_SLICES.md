# Next Slices

## Current production lock

BSB V2 has enough rendering and system work for the moment. The next phase is **game loop and UX tightening**.

Do not start next week by adding 2.5D height layers, new renderer contracts, AI art tooling, editor integration, dragonfire, new enemy classes, or another subtle readability micro-pass.

## Slice 1 — Title / start flow

Goal: make the game start like a game, not a raw boot page.

Requirements:

- simple title/menu state;
- `Start First Flightless Night` action;
- compact premise text;
- compact controls;
- enter/start key or click path;
- focused tests for state transition if practical.

Constraints:

- no menu framework;
- no save/profile system;
- no settings screen beyond essentials;
- no art-pipeline work.

## Slice 2 — Pause / resume / restart shell

Goal: make Esc/Tab pause behaviour player-facing and useful.

Requirements:

- freeze simulation;
- show pause overlay;
- resume;
- restart attempt;
- controls reminder;
- preserve WebGL-only rendering path.

Constraints:

- no modal UI library;
- no settings menu creep;
- no debug dashboard work.

## Slice 3 — Death and retry loop

Goal: death should be a designed state, not just HP reaching zero.

Requirements:

- failure state when player HP reaches zero or falls into invalid state;
- clear death/fail message;
- retry from same scenario without browser reload;
- enemies/effects/runtime state reset cleanly;
- test for death -> retry -> playable.

Constraints:

- no roguelike meta progression;
- no save system;
- no new combat features.

## Slice 4 — Win / escape completion

Goal: reaching safety should feel complete enough to prove the level loop.

Requirements:

- visible escape/win state;
- completion message;
- replay/restart option;
- scenario state stops spawning/pressure after completion;
- test for escape -> completion -> restart.

Constraints:

- no campaign map;
- no unlock system;
- no Steam/trailer polish.

## Slice 5 — Objective and controls readability

Goal: a new player should know what to do without Felix narrating over their shoulder like a stressed goblin producer.

Requirements:

- current objective in HUD;
- first-run control hints;
- smoke/lunge/dodge prompts if cheap;
- danger/escape hinting;
- debug overlay remains opt-in.

Constraints:

- no tutorial system;
- no cutscenes;
- no branching dialogue.

## Slice 6 — Scenario tuning pass

Goal: tune the current map and encounter sequence for a short repeatable demo attempt.

Requirements:

- start near nest/broken forest edge;
- early movement space;
- first raider pressure;
- smoke usefulness moment;
- werewolf/husk escalation if already supported;
- readable escape pocket;
- death/win reachable within a short attempt.

Constraints:

- no new map editor features;
- no new biome/content class;
- no economy/base-building/strategy systems.

## Slice 7 — Bounded atmosphere/readability pass

Only after the loop above is playable.

Goal: make the current screenshot read better through atmosphere and composition, not a renderer rewrite.

Allowed:

- torch/flame source shape tuning;
- smoke/haze contrast tuning;
- moon/cloud blocker readability tuning;
- tree trunk/base visual simplification;
- background forest value reduction;
- actor silhouette pose simplification.

Not allowed:

- full 2.5D height/depth model;
- global actor outlines;
- full-body brightening;
- sprite pipeline;
- new SDF architecture;
- AI art generator.

## Validation habit

Each slice should include:

- `npm test`;
- one focused test if stateful;
- one manual/browser proof if UI-facing;
- short note in `progress.md` only after it actually passes.
