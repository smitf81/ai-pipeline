# Cadence Obligation Registry

## Purpose
The cadence registry prevents future gameplay/runtime slices from silently adding expensive every-tick work.

It is the runtime-budget equivalent of a truth registry:

> scheduled/heavy systems must declare who owns them, when they are allowed to run, what wakes them, and how drift is detected.

## Canonical file

```txt
src/game/cadenceRegistry.js
```

This is the declared contract source for scheduled runtime systems. `runtimeEvents.js` derives scheduler defaults from it.

## Current registered systems

| System | Owner | Cadence | Allowed wakes | Forbidden generic wakes | Risk |
|---|---|---:|---|---|---|
| `enemyAI` | `gameModel.js::advanceEnemyAIDirector` | 4 ticks | cadence only | fields, combatTargets, logistics, economy, renderUi | high |
| `logistics` | `logisticsSystem.js::advanceLogistics` | 2 ticks | logistics dirty; economy/construction/logistics/squads/structures versions | fields, combatTargets, renderUi | medium |
| `fieldOverlay` | scheduler diagnostic projection | 8 ticks | map version | fields, combatTargets, renderUi | medium |
| `aiAppraisal` | `gameModel.js::deriveRuntimeBehaviourFields` | 6 ticks | explicit AI dirty | fields, combatTargets, logistics, economy, renderUi | high |
| `weatherFields` | `gameModel.js::deriveCachedWeatherFields` | 16 ticks | map version | fields, combatTargets, ai, renderUi | high |

## Runtime rule

Before adding any runtime system, classify it as one of:

- **per-frame** — visual/input interpolation only; must not mutate simulation truth
- **per-tick** — cheap mandatory simulation truth
- **cadenced** — scheduled heartbeat through runtime coordinator
- **event-driven** — only wakes from explicit event/dirty ownership
- **cached** — derives truth but reuses until explicit version/dirty invalidation
- **diagnostic-only** — off by default or low cadence; never writes truth

## Validation commands

```powershell
npm.cmd run test:cadence
npm.cmd run test:validation
```

`test:validation` includes the cadence audit before the sim frame-budget QA.

## Agent rule

Do not add a new scheduled/heavy runtime loop without updating:

1. `src/game/cadenceRegistry.js`
2. focused tests or audit proof
3. relevant docs/apply-history note
4. sim/browser validation if runtime cost can change

Do not make high-risk systems wake from broad generic dirtiness like `fields`, `combatTargets`, or `renderUi` unless the cadence registry explicitly explains why and tests prove it does not become every-tick work.
