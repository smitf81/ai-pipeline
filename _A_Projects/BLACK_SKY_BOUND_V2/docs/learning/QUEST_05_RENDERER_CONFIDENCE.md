# Quest 05 — Renderer Confidence Without FPS Crimes

## Goal

Learn how to touch the renderer without accidentally inventing a small GPU bonfire.

## Concept

The renderer is layered. Layer order is a contract.

Current WebGL order lives in `src/render/backends/webgl/WebGLGameRenderer.js`.

```txt
terrain → decals → shadows → worldDepth → lighting → effects → fogSmoke → postProcess → hudDebug
```

## Read these files

- `src/render/backends/webgl/WebGLGameRenderer.js`
- `src/render/backends/webgl/WebGLRenderLayerRegistry.js`
- `tests/webglRendererHierarchy.test.mjs`
- `tests/webglWorldDepthLayer.test.mjs`

## Task

Do not alter rendering yet.

Write a note in:

```txt
learning/quest_notes/quest_05_layer_order.md
```

Answer:

1. Which layer draws terrain?
2. Which layer draws lighting?
3. Which layer draws smoke/fog?
4. Which layer draws debug HUD?
5. Why should smoke not own gameplay state?

## First safe renderer edit later

Add or improve one debug counter. Debug counters are safer than visual effect rewrites because they teach you the layer without changing the picture yet.

## What you are learning

- render order
- layer ownership
- diagnostics before prettiness
- why performance work starts with counting

## Done when

You can name the WebGL layer you need before touching a pixel.
