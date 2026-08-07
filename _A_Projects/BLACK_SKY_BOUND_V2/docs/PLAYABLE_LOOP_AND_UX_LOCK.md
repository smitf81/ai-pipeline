# Playable Loop and UX Lock

## Purpose

Define the next production phase: make BSB V2 feel like a playable game rather than a collection of successful rendering/combat slices.

## Target player journey

A first-time player should be able to:

1. launch the game;
2. start the scenario from a clear menu/start state;
3. understand controls quickly;
4. understand the immediate objective;
5. move, sprint, dodge, attack, lunge, and smoke;
6. recognise damage and danger;
7. die and retry without reloading the browser manually;
8. reach the escape condition;
9. see a short completion state;
10. restart or exit cleanly.

## Current likely gaps

The code has many individual systems, but the outer loop still needs production attention:

- menu/start flow;
- pause overlay;
- retry/reset path;
- death presentation;
- win/completion presentation;
- objective text;
- control reminders;
- readable scenario state transitions;
- tuning based on actual human play, not only proof scripts.

## UX minimum for first playable

### Main menu / start

Must show:

- title;
- `Start First Flightless Night`;
- short premise line;
- compact controls;
- clear note that this is a demo/prototype if needed.

### In-game HUD

Must show only what helps play:

- health;
- stamina;
- current objective;
- core cooldowns/readiness;
- optional tiny controls reminder;
- pause hint.

Debug/projection stats should remain opt-in.

### Pause

Must freeze gameplay and show:

- `Paused`;
- resume;
- restart;
- controls;
- quit/back to title if easy.

### Death/fail

Must show:

- death/failure reason in plain language;
- retry button/key;
- optional short encouragement/status line;
- no manual browser refresh required.

### Win/completion

Must show:

- escaped/survived message;
- simple summary if cheap;
- retry/replay/back to title.

## Slice rules

For this phase, every slice should answer:

> Does this make the current game easier to start, understand, fail, retry, or complete?

If no, park it.

## Explicitly not in this phase

- 2.5D renderer/depth model;
- new creature class;
- dragonfire;
- new map editor work;
- economy/base systems;
- asset-generation pipeline;
- Steam page/trailer polish;
- large atmosphere rewrite;
- new AI architecture.

## Acceptance target

A tester can play three full attempts in a row without developer explanation or browser reload:

- one death;
- one restart;
- one escape/win;
- zero console/page errors;
- objective and controls understood from the game itself.
