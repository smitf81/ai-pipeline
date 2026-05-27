# ViewportNavigationImplementation

Implementation-bearing plugin proposal for: AXIOM viewport navigation is incomplete

## Status

Generated implementation-bearing proposal. This plugin is not active until AXIOM provides an explicit runtime plugin loader/activation seam.

## Behaviour

- Middle mouse drag or Alt+left drag orbits around AXIOM's orbit target.
- Right mouse drag or Shift+left drag pans the camera and orbit target.
- Mouse wheel zooms toward or away from the orbit target with distance limits.
- Held WASD while navigating moves camera and orbit target through the scene.
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
