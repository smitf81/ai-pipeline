# Quest 03 — First Behaviour Slice: Stamina, But Sensibly

## Goal

Prepare for a real feature by designing it in the right lanes.

## Feature

Player sprint stamina.

Do **not** build all of this in one go.

## Correct ownership split

| Concern | File area |
|---|---|
| Component name | `src/constants/componentTypes.js` |
| Component data shape | `src/components/createComponents.js` |
| Attach to player | `src/game/spawn.js` |
| Drain/recover behaviour | new or existing system in `src/systems` |
| System order | `src/game/systemOrder.js` |
| Debug visibility | `src/debug/snapshot.js` |
| Proof | `tests/stamina.test.mjs` |

## Slice 1 — Data only

Add the component type and component factory.

Suggested component shape:

```js
stamina(max = 100) {
  return {
    current: max,
    max,
    drainPerSecond: 35,
    recoverPerSecond: 22,
    sprintMultiplier: 1.35
  };
}
```

Do not change movement yet.

## Slice 2 — Attach to player

Attach stamina to the young dragon in spawn logic only.

Write a test proving:

- dragon has stamina
- raider does not have stamina

## Slice 3 — Behaviour

Only after Slice 1 and 2 pass:

- hold Shift to sprint
- drain stamina while sprinting
- recover when not sprinting
- cap values between 0 and max

## What you are learning

- how to split a feature
- how to avoid cramming everything into movement
- how to make changes verifiable

## Ada verification prompt

```txt
Ada, help me implement Quest 03 stamina one slice at a time. I only want the next smallest patch. Keep me in the ECS ownership lanes and make me explain each file before I edit it.
```

## Done when

Not yet. This is your first real feature chain. Do not rush it.
