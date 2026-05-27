# APPLY_BLACK_SKY_BOUND_UI_STYLE_PASS_V0

## Goal
Beautify the prototype shell with the new Black Sky Bound visual doctrine without touching game mechanics, economy, pathfinding, AI, construction, or progression logic.

## Files changed
- `src/ui/gameUI.js`
- `styles.css`

## What changed
- Added a cinematic boot/loading splash:
  - `BLACK SKY / BOUND` wordmark
  - dark storm field
  - animated blue lightning
  - horizon glow
  - skippable by click or keypress
- Reworked the main menu into a Black Sky Bound style front-end:
  - storm-cloud background
  - blue horizon light
  - metallic wordmark treatment
  - doctrine rail: Weight & Scar / Constrained Light / Structural Tension / Implied Motion
  - renamed menu cards to match the style:
    - Continue Mission
    - War Table
    - Map Forge
  - renamed chapter/map strip:
    - Sector Theta-9
    - The Long Climb
    - Black Sky
- Added responsive layout rules for smaller screens.
- Added reduced-motion handling for users/systems that disable animation.

## What this does not change
- No unit logic changed.
- No economy logic changed.
- No progression unlock logic changed.
- No construction logic changed.
- No renderer/game simulation loop changed.
- No canvas drawing logic changed.

## Validation
- `node --check src/ui/gameUI.js` passed.
- `npm test` passed all in-process tests.
- `npm run test:browser` started the local server but skipped browser smoke because the Codex Playwright client path is not present in this sandbox.

## Notes
This is a pure presentation pass. The loading screen is intentionally short and skippable so it gives flavour without becoming annoying during rapid testing.
