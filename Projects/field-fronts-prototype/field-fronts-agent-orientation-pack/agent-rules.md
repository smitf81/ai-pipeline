# Agent Rules

Read this before touching the project.

## Hard rules

1. Read `docs/agent-orientation/README.md` and this file before patching.
2. Inspect existing docs/tests before changing code.
3. Keep `MapData` and `GameState` separate.
4. Do not persist derived overlays, command fields, frontlines, or nav caches as canonical truth.
5. Do not move heavy work into `requestAnimationFrame` unless it is strictly visual-only.
6. Do not mutate authoritative entity positions inside visual interpolation.
7. Do not spend supplies from hover/preview state.
8. Do not bypass existing tests because the UI “looks fine”.
9. Add or update tests when behaviour changes.
10. Update `progress.md` after meaningful implementation slices.
11. Prefer small, testable slices over heroic rewrites.
12. No broad architecture rewrite without explicit request.

## Before patching, answer this

```txt
Target seam:
Files likely touched:
Truth owner:
Derived outputs affected:
Performance cadence:
Tests required:
Rollback risk:
```

If you cannot answer, you are not ready to patch.

## Patch boundaries

| Request type | Correct behaviour |
|---|---|
| Docs-only | Do not touch runtime source. |
| UI/readability | Do not alter game model unless required. |
| Construction logic | Touch `gameModel`/registry/topology/economy carefully and test. |
| Rendering | Keep it visual-only; no hidden state mutation. |
| Performance | State cadence and prove with QA. |
| New field/overlay | Hidden by default unless explicitly gameplay-facing. |
| New persistence | Declare owner and contract first. |

## Reporting format

Use this after a patch:

```txt
Changed:
- file list

Why:
- root cause / target seam

Validation:
- command and result

Not validated:
- anything skipped or unavailable

Known risk:
- honest remaining issue
```

## Absolutely forbidden nonsense

- “I fixed construction” when only the sprite changed.
- “The field is saved” when only a screenshot exists.
- “The path works” without movement/path test evidence.
- “It’s probably performant” after adding nested loops.
- “The UI owns this state now.” No. Bad agent. Sit down.

## One-line project discipline

Source truth lives in the model. Visuals explain it. QA proves it. Agents do not get to freestyle the hierarchy because they saw a shiny button.
