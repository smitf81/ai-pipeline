# Apply Black Sky Bound Landing/Menu Focus v1

## Purpose
Rework only the landing/loading screen and main menu so the supplied lower-front **Black Sky Bound** key art becomes the core visual substrate, rather than a loose CSS imitation.

## What changed
- Added a cropped/composited storm-front key-art asset:
  - `assets/black-sky-bound-storm-front-v1.jpg`
- Appended a focused CSS pass in `styles.css`:
  - splash/loading screen now uses the actual Black Sky Bound storm-front composition
  - main menu now uses the same artwork as the primary scene layer
  - synthetic storm/cloud/horizon CSS layers are suppressed where the artwork already carries the image
  - sporadic blue lightning and cloud glow remain as lightweight CSS animation overlays
  - menu controls are pushed down into a compact lower command strip so they do not bury the hero image
  - DOM wordmark remains accessible but is visually hidden to avoid double-printing the logo over the artwork
- Updated footer copy in `src/ui/gameUI.js` to mark the pass as `Landing/Menu Focus v1`.

## Intent
The menu should feel more like a proper title-screen composition:
- ominous black cloud mass
- intermittent blue lightning glow
- bright horizon arc
- heavy metallic title already present in the background art
- low, diegetic-looking command/menu controls

## What this does not touch
- game economy
- progression
- pathfinding
- construction
- combat
- tick/update cadence
- HUD mechanics
- pause menu behaviour

## Validation run
- `node --check src/ui/gameUI.js` passed
- `npm test` passed all in-process tests

## Notes
The visual title in the artwork is now the main title treatment. The HTML title is still present for accessibility, but visually hidden to prevent duplicate `BOUND` wordmarks.
