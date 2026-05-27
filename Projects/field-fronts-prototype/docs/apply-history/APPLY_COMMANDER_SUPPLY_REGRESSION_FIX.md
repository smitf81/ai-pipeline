# Commander + Supply Regression Fix

## Problem
The structure occupancy UI pass accidentally defined the HUD context action renderer inside the main-menu mount scope, while the in-game HUD render path called it from `mountGameHUD()`.

That caused the HUD render pass to throw at runtime before the later render listeners could finish. Symptoms looked like missing starting commander / stale or missing supply income because the game render pipeline was being interrupted by the UI layer.

## Fix
- Moved `renderContextActionPanel()` into the `mountGameHUD()` scope where `actionButton`, `actionTitle`, and `actionBody` are actually defined.
- Added a regression test that locks opening commander seeding, opening commander selection, and first-tick supply income.
- Added a HUD scope regression test to stop this exact helper from drifting back into the wrong UI mount function.

## Validation
- `node --check` passed across `src/` and `tests/` JS/MJS files.
- `npm test` passed.
