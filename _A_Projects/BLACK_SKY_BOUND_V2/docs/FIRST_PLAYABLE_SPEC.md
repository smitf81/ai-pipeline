# First Playable Spec — First Flightless Night

## Goal

Build one short top-down 2D action-survival scenario where the player controls a young grounded dragon/wyvern escaping a collapsing forest after its nest is raided.

## Player fantasy to prove

The player should feel like a small but dangerous young dragon: vulnerable, fast, vicious, and capable of surviving by tooth, claw, smoke, speed, dodge, lunge, and panic movement.

## Current playable loop

1. Start near the broken nest / forest edge.
2. Move through dangerous night forest terrain.
3. Avoid, dodge, or attack immediate threats.
4. Use smoke to disrupt pursuit.
5. Manage stamina, sprint, and dodge under pressure.
6. Reach the escape zone before being overwhelmed.
7. Die/retry or win/replay without needing a browser reload.

## Must include for v0

- Young dragon/wyvern player actor.
- Keyboard movement.
- Sprint and bounded dodge.
- Close-range tooth/claw attack.
- Short body lunge.
- Smoke disruption.
- Raider, husk, and werewolf pressure actors.
- One escape-zone win condition.
- Health/failure state.
- Retry/reset loop.
- Simple menu/start flow.
- Pause/resume.
- Objective and control hints.
- WebGL rendering with readable dark-forest mood.
- AXIOM-baked runtime map loaded through the BSB manifest default.
- 16-mask terrain/blob rule support preserved for map/bake output.

## Current controls

- WASD / arrows: move
- Hold Shift: sprint while stamina lasts
- Q: dodge
- Left click or J: tooth/claw attack
- Space: body lunge
- Right click: smoke
- Mouse wheel: zoom

## Must not include for v0

- Full stealth system.
- Full flight.
- Starting dragonfire spit.
- Base building.
- Economy.
- Morale.
- Strategy control.
- Complex fire simulation.
- 2.5D fake-height renderer.
- AI art generation or spritesheet pipeline.
- Tool/engine work not directly needed for the playable.

## Acceptance target

A player can run the project, start the scenario, move the dragon, sprint, dodge, attack enemies, lunge, drop smoke, take damage, pause, die, retry, and win by reaching safety.

A tester should be able to complete three attempts in a row without developer explanation:

1. one death;
2. one retry;
3. one escape/win.
