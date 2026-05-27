# Apply Notes — UI Resolution Stability + Economy Pace

## Goal
Keep the in-game UX anchored to the visible viewport, stop lower HUD/build/economy controls from being cut off, slow supply income to a more playable pace, and make the HUD resource readout update while the build/economy panels are open.

## Result
- The app shell now uses fixed viewport sizing (`100dvh`) with internal panel scrolling only where needed.
- Game canvas rendering now respects a HUD safe area, so the map is fitted above the bottom HUD instead of hiding underneath it.
- Build and economy panels open upward from the bottom bar and have bounded heights.
- Build/economy buttons remain reachable across awkward laptop/browser resolutions.
- Game ticks emit a lightweight `game:tick` event, and the HUD listens to it so resource values refresh while panels are open.
- Supply income per outpost tick is reduced from `10` to `3`.

## Files changed
- `styles.css`
- `src/rendering/canvasRenderer.js`
- `src/ui/gameUI.js`
- `src/main.js`
- `src/game/economy.js`
- `tests/gameModel.test.mjs`
- `tests/constructionJobs.test.mjs`
- `tests/navigationConstructionRegressionLock.test.mjs`

## Validation
- `node --check` passed for changed runtime modules.
- `npm test` passed all in-process tests.
- `npm run test:browser` was attempted but skipped because the expected Playwright client was not present in this sandbox path.

## Notes
This is intentionally a stability/anchoring pass. It does not alter construction mechanics, pathfinding, enemy AI, map data, or building definitions beyond the slower supply income cadence.
