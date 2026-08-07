# Documentation Audit — 2026-07-03

## Reason for audit

The docs were lagging behind the project after several rapid rendering, map, combat, and projection passes. Some entry docs still described the project as a simple Canvas 2D husk even though the active runtime is now WebGL-only and the current production concern is finishing the playable loop.

## Main stale areas found

### 1. Renderer status

Old docs still said or implied:

- simple canvas renderer;
- Canvas rendering with readable dark-forest mood;
- Canvas as a viable runtime path.

Current truth:

- WebGL is the only supported runtime renderer;
- Canvas 2D runtime fallback has been culled;
- the HTML canvas remains only as the WebGL drawing surface.

### 2. Start point

`docs/START_HERE.md` still pointed at the 2026-06-15 handover as the main fresh-session state.

Current truth:

- the current operational handover is `docs/HANDOVER_2026-07-03.md`;
- the 2026-06-15 handover is historical context only.

### 3. Next slices

`docs/NEXT_SLICES.md` had accumulated renderer migration detail and old first-foundation items. It did not clearly express the new production priority: game loop and UX lock before more visuals.

Current truth:

- next slices should focus on menu/start, pause, death/retry, win/completion, objective/controls, scenario tuning, then one bounded atmosphere/readability pass.

### 4. Controls

Some docs still disagreed on lunge/smoke controls.

Current truth from `src/systems/inputSystem.js`:

- left click or J: tooth/claw;
- Space: body lunge;
- right click: smoke;
- Shift: sprint;
- Q: dodge.

### 5. Visual strategy

Docs had plenty of implementation history but not a clear current doctrine for asset-light visuals or the decision to park 2.5D.

Current truth:

- asset-light, not asset-free;
- projected primitives and WebGL layers remain the core look;
- small support textures are allowed;
- AI asset generation and spritesheet dependence are out of scope;
- 2.5D/fake-height modelling is parked until a later game/post-release evolution.

## Files updated

- `README.md`
- `GCD.md`
- `docs/START_HERE.md`
- `docs/NEXT_SLICES.md`
- `docs/TECH_BOUNDARIES.md`
- `docs/FIRST_PLAYABLE_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING_AND_QA.md`
- `progress.md`

## Files added

- `docs/HANDOVER_2026-07-03.md`
- `docs/VISUAL_SCOPE_AND_ART_DIRECTION.md`
- `docs/PLAYABLE_LOOP_AND_UX_LOCK.md`
- `docs/DOCS_AUDIT_2026-07-03.md`

## Remaining documentation risk

`progress.md` is detailed and useful, but it is now a history log, not the fastest way to regain project state. Fresh sessions should begin with `START_HERE`, the current handover, and `NEXT_SLICES`.
