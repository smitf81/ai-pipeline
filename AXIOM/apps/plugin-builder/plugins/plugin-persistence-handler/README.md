# plugin-persistence-handler

Implementation-bearing plugin proposal for: Make registered active plugins persist across AXIOM restarts - add persisted enabled/autoload state, auto-activate enabled_on_boot plugins on boot, remove enabled_on_boot on deactivate, autoload only registered+validated plugins

## Status

Generated implementation-bearing proposal. This plugin is not active until AXIOM provides an explicit runtime plugin loader/activation seam.

## Behaviour

- Hold middle mouse + drag to orbit around AXIOM's orbit target.
- Hold middle mouse + WASD to move camera and orbit target through the scene.
- Mouse wheel zoom is not touched.
- F delegates to AXIOM's existing selected-object focus function.
- Left-click selection is not intercepted.

## Required AXIOM runtime APIs

- `scene.getCamera`
- `scene.getOrbitTarget`
- `scene.getRendererDomElement`
- `scene.getSelected`
- `scene.focusSelected`

## Safety

This plugin does not modify AXIOM core files. It installs additive event listeners during activation and removes them during deactivation/unload.
