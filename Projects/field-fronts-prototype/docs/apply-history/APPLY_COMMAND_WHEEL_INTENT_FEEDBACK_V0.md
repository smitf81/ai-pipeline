# Command Wheel Intent Feedback v0

## Goal
Make command → intent → response → action readable without adding another AI/sim layer.

This pass keeps the existing command wheel interaction shape:
- right-click single = quick/default MoveTo
- hold right-click = opens command wheel
- hover over a wheel segment = highlights intent
- release right-click = confirms the highlighted intent
- left-click drag with an already selected player unit = paints a desired path

## What changed

### 1. Release-to-confirm command wheel
`src/input/pointerController.js` now treats the right-click wheel as a hold/hover/release surface.

The highlighted command is calculated from mouse angle around the wheel and stored on `state.orderWheel.highlightedActionId`.

### 2. Intent feedback contract
`src/game/commandWheel.js` now exposes:
- `resolveCommandWheelHover()`
- `createCommandFeedback()`
- `commandFeedbackTone()`

The main game loop stores the latest command feedback in `state.commandFeedback`.

### 3. Readable HUD feedback
`src/ui/gameUI.js` now shows command feedback chips such as:
- accepted
- degraded
- rejected
- overridden by survival
- urgency/forced pressure when repeated commands build override risk

### 4. Map feedback line
`src/rendering/canvasRenderer.js` draws a lightweight command feedback line from selected unit to command target.

Tones:
- blue = accepted/completed
- amber dashed = degraded
- red dashed = rejected/failed
- violet dashed = overridden by survival / forced pressure

### 5. Painted path intent fix
Left-click drag with an already selected player leader/squad now keeps the existing selection when dragging over empty ground and injects the painted path rather than clearing selection first.

The movement route builder now preserves player-intended anchors more aggressively. If a drawn route has multiple anchors and a direct path fails, it attempts segment-by-segment routing through the painted anchors instead of silently collapsing to start → final target.

## Deliberately not done
- No radial wheel polish pass yet.
- No new command types.
- No new AI appraisal logic.
- No heavy per-frame command scanning.
- No scenario/test mission yet.

## Validation
- `node --check` across `src/`, `tests/`, `tools/`
- `npm test`
- command wheel regression coverage extended for hover/release and feedback generation
