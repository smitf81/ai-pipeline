# Testing and QA

## Automated checks

Run:

```bash
npm test
```

Useful focused checks:

```bash
node tests/locBudget.test.mjs
node tests/actorLightReadability.test.mjs
node tests/wyvernProjectionContinuity.test.mjs
```

Current test coverage includes:

- ECS foundation shape and component-backed dragon entity;
- ECS architecture contracts: ordered systems, validation, debug snapshot, actor/scenario data ownership;
- first playable state smoke test;
- runtime map manifest/load boundaries;
- 16-mask connected terrain rules;
- terrain blob painting mask resolution;
- fixed-step loop behaviour;
- stamina, sprint, dodge, and enemy evasion contracts;
- wyvern projection continuity and recovery regressions;
- actor light-readability projection/renderer ownership;
- architecture boundary checks against reintroducing parked systems;
- production file size budget.

## Launch check

Recommended Windows launch:

```txt
Double-click LAUNCH_BSB.bat
```

Terminal launch:

```bash
npm start
```

Both should serve the game at:

```txt
http://127.0.0.1:5177
```

## Current controls to verify

- WASD / arrows: move
- Shift: sprint
- Q: dodge
- Left click or J: tooth/claw attack
- Space: body lunge
- Right click: smoke
- Mouse wheel: zoom

## Manual QA checklist — current priority

Manual QA should now focus on game-loop completeness, not only proof-state correctness:

- launcher opens the browser successfully;
- map loads from manifest default, not built-in demo fallback;
- start/menu state is understandable once implemented;
- movement, sprint, and dodge work;
- attack and lunge are readable enough to use;
- smoke visibly helps or buys time;
- enemies pursue, telegraph, and damage the dragon;
- stamina/health/cooldowns are readable enough;
- pause freezes and resumes cleanly once implemented;
- death/failure state appears and retry works once implemented;
- escape/win state appears and replay/restart works once implemented;
- no manual browser refresh is needed for repeated attempts;
- console errors, page errors, and request failures remain zero in proof runs.

## Visual QA rule

Do not call a visual slice successful just because tests pass.

For player-facing visuals, proof should include a normal runtime screenshot and answer:

> Can a human actually see and use the change during play?

Actor Light-Silhouette Readability v0 is the cautionary example: it passed structurally, but the visible improvement was too subtle to be considered a major readability win.
