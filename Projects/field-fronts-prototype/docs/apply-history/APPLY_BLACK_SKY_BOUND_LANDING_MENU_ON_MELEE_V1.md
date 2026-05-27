# Black Sky Bound Landing/Menu Integration on Melee Patch v1

## Scope

Integrated the Black Sky Bound landing screen and main-menu visual treatment onto `field-fronts-prototype-melee-combat-death-events-v0`.

This patch is intentionally UI-only:

- landing/loading splash
- main menu composition
- supplied Black Sky Bound key art background
- sporadic blue lightning/cloud glow CSS animation

## Files changed

- `src/ui/gameUI.js`
- `styles.css`
- `assets/black-sky-bound-storm-front-v1.jpg`

## Important merge note

The melee-combat HUD changes from `APPLY_MELEE_COMBAT_DEATH_EVENTS_V0.md` were preserved.
The previous UI overlay version had an older combat meter label; this integration does **not** revert it.

## Validation run

- `node --check src/ui/gameUI.js`
- `npm test`

## Known limitation

The lightning is CSS-based glow/flash animation over the key art, not true video/image-sequence lightning.
That is the sensible version for this prototype: cheap, no render-loop cost, and no extra runtime dependency.
