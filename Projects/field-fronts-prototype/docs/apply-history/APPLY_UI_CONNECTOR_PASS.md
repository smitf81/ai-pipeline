# Field Fronts UI Connector Pass

Drop these files into their matching paths:

- `src/ui/gameUI.js`
- `src/main.js`
- `styles.css`

## Fixed

- Hidden overlays now actually disappear with a hard `[hidden]` CSS rule. This fixes the pause panel visually staying active after Resume.
- Pause menu transitions now run through one shared screen setter.
- Escape now pauses, resumes, or backs out of Settings/Quit subpanels instead of blindly toggling state.
- Quit Game no longer uses the browser `confirm()` dialog. It opens an in-game confirmation and returns to the main menu in the prototype.
- Spacebar tick advance is blocked while paused, in the main menu, or while typing in inputs.
- Build/unit/economy UI controls now update lightweight selection/status state instead of only emitting unobserved bus events.

## Validation run here

```text
node --check src/ui/gameUI.js
node --check src/main.js
```
