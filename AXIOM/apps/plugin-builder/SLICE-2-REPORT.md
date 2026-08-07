# AXIOM Plugin Builder — Slice 2 Report

## What changed

Added implementation-bearing plugin generation through a new MCP tool:

- `axiom_plugin_generate_patch`

This tool generates real plugin implementation code for a bounded AXIOM capability gap while preserving the governance rule that generated output is still proposal-only.

## First supported implementation target

Viewport navigation:

- hold middle mouse + drag to orbit around the orbit target
- hold middle mouse + WASD to move the camera and orbit target through the scene
- preserve mouse wheel zoom by not touching wheel handlers
- press F to delegate to AXIOM's existing selected-object focus API
- do not intercept left-click selection
- install additive event listeners only
- remove all event listeners on deactivate/unload

## Generated files

For implementation-bearing plugins, the builder writes:

- `src/index.js`
- `tests/plugin.test.js`
- `README.md`
- `integration-contract.json`

## Required AXIOM runtime APIs

The generated viewport plugin expects AXIOM to provide this activation context:

```js
{
  scene: {
    getCamera(),
    getOrbitTarget(),
    getRendererDomElement(),
    getSelected(),
    focusSelected()
  },
  events,
  notify,
  logger
}
```

If those APIs are missing, the plugin returns:

```js
{
  ok: false,
  reason: "missing_runtime_api",
  required_apis: [...],
  missing_apis: [...]
}
```

## Validation upgrades

Implementation-bearing plugins now get extra validation checks:

- lifecycle exports exist
- install function exists
- uninstall/cleanup function exists
- missing runtime API guard exists
- required runtime APIs are declared
- integration contract file exists
- proposal-only flag is preserved

Smoke test now confirms the generated viewport implementation validates with 26 rules.

## What this does not do yet

This does not activate the plugin inside AXIOM.

AXIOM still needs a runtime plugin loader/activation seam that can provide the declared context object safely.

## Recommended next slice

Add AXIOM runtime plugin activation v0:

- load a registered plugin package or source folder
- provide a bounded context object
- call `onLoad` and `onActivate`
- record activation receipt
- allow `onDeactivate` rollback
