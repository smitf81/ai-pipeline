# Scenario Spine v0

## Goal
Replace the ambiguous Scenario Creator control pile with a tighter beginning → middle events → ending spine.

This is not a cinematic editor and not a dialogue system. It keeps scenario authorship diegetic and gameplay-first.

## What changed

### New scenario spine contract
Added `src/world/scenarioSpine.js` with:
- `SCENARIO_SPINE_VERSION`
- default Chapter 1 spine generation
- spine validation
- lightweight runtime state machine
- runtime progress application

A scenario spine contains:
- Beginning: commander start, opening camera, omen cue, silhouette cue
- Middle: cheap gameplay event beats triggered by game state
- Ending: victory/end condition, failure condition, next chapter target

### Default Chapter 1 behaviour
Chapter 1 now gets a playable spine by default:
- Beginning: commander starts at the generated player start with a black-sky omen cue
- Middle: neutral outpost discovered, enemy pressure stirs, horizon silhouette reveal
- Ending: scenario completes when the commander reaches the first neutral outpost
- Failure: commander dies
- Next target: `chapter_002` placeholder unlock

### Lightweight scenario director
`src/main.js` now advances the scenario spine after normal game ticks.
It does not run heavy per-frame scans.
It reads normal game state and updates:
- opening → active
- event triggered ids
- completed / failed runtime state
- next chapter unlock scaffold

Effects such as lightning flash, storm pulse, silhouette reveal and camera nudge can emit existing scenario camera shake cues without freezing gameplay.

### Scenario Creator UI reframed
The authoring panel is now labelled **Scenario Spine** and focuses on:
- Chapter
- Scene seed
- Mood preset
- Generate Spine
- Beginning / Middle Events / Ending readiness cards
- Opening camera controls
- diegetic event layer toggle

This should feel more like assembling a playable mission spine and less like fiddling with unrelated debug levers.

## Files changed
- `src/world/scenarioSpine.js`
- `src/world/scenarioCatalogue.js`
- `src/editor/editorState.js`
- `src/main.js`
- `src/ui/components.js`
- `styles.css`
- `tests/scenarioSpine.test.mjs`
- `tests/runInProcessTests.mjs`

## Validation
- `node --check` across `src/`, `tests/`, and `tools/`
- `npm test`

## What this does not build yet
- no timeline editor
- no branching dialogue system
- no full cinematic control layer
- no pathfinding changes
- no combat/construction changes
- no heavy every-frame scenario scripting

## Next sensible slice
Make the diegetic event effects more visible in-game:
- smoke column marker
- silhouette flash marker
- outpost glow state
- storm pulse overlay

Keep this event-driven and cheap.
