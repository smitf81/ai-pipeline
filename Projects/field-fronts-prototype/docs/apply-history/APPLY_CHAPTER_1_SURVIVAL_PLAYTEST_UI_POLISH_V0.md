# Chapter 1 Survival Playtest + UI Polish v0

## Scope
This is a content/readability and presentation pass only.

It does not change:
- pathfinding maths
- combat resolution
- construction/economy logic
- command wheel behaviour contracts
- AI appraisal cadence

## Chapter 1 alignment
Chapter 1 is now framed as a survival-command test scenario rather than a generic authored scenario.

The default scenario spine now communicates:
- vulnerable human commander entry
- black-sky omen on arrival
- shelter/cover lane readability
- attention/noise pressure
- corpse/body-wall foreshadowing
- enemy pressure reveal
- distant dragon/wing silhouette near the outpost
- victory by reaching/securing the first neutral outpost
- failure if the commander dies

This keeps the intended feel:
> player is directing survival, not playing a warrior.

## Runtime visuals
Scenario runtime effects now render as lightweight diegetic overlays:
- lightning/storm pulses
- silhouettes
- smoke columns
- enemy banner reveals
- corpse/body-wall warning marks
- attention pings/non-verbal markers

These are render-only visual effects based on scenario runtime history.
They do not alter gameplay systems.

## UI/UX polish
Buttons, menu cards, scenario cards, chapter tiles and command-wheel segments received:
- softer hover glow
- stronger active press weight
- subtle scan-sheen on hover
- selected chapter glow
- playable/incomplete scenario state affordances
- highlighted command wheel aura

Reduced-motion users keep animation toned down.

## Validation
- `node --check` across `src/`, `tests/`, and `tools`
- `npm test`
- `npm run test:browser` starts the server but skips the Codex Playwright client when unavailable
- Static HTTP smoke successfully served `index.html` and `src/main.js`

## Known limitation
Headless Chromium screenshot capture hung in this sandbox, so no screenshot is included in this patch. The static server and in-process tests passed.
