# Quest 04 — Projection Before Rendering

## Goal

Learn the difference between game truth and visual packets.

## Concept

The renderer should not invent gameplay state. It should draw what projection gives it.

```txt
game state → projection → WebGL layer
```

## Read these files

- `src/projection/renderProjection.js`
- `src/projection/renderLayerState.js`
- `src/projection/napalmLayerState.js`
- `tests/napalmDribble.test.mjs`

## Task

Trace how a napalm droplet becomes visible:

1. `napalmDripSystem` spawns a droplet into render layer state.
2. the droplet updates and lands.
3. the pool becomes a ground hazard projection.
4. the renderer receives it as neutral visual data.

Write a note in:

```txt
learning/quest_notes/quest_04_projection_trace.md
```

Use this shape:

```txt
Source truth:
System that writes it:
Projection helper:
Renderer-facing packet:
Test that proves it:
```

## Tiny edit option

Add one harmless metadata field to a projected packet only if a test can prove it survives. Do not change WebGL yet.

## What you are learning

- transformations
- renderer-neutral contracts
- how to avoid duplicating truth

## Done when

You can explain why “just draw it in WebGL” is usually the wrong first move.
