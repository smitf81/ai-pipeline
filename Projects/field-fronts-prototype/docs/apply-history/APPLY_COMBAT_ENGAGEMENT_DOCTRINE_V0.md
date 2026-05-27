# Combat Engagement Doctrine v0

## Goal

Add a narrow doctrine layer between target visibility and projectile spawning so combat no longer jumps straight from `has LoS` to `fire full volley`.

This slice keeps the existing projectile/LoS/blocker system, but adds first-pass constraints for:

- aiming before firing
- volley readiness / pass-fail state
- under-fire suppression effects
- clearer structure firing relationships for garrisons, towers, trenches, forts, and wall tops

## Files changed

```txt
src/game/combatSystem.js
src/game/structureRegistry.js
tests/combatMechanics.test.mjs
tests/structureTopology.test.mjs
```

## Behaviour added

### 1. Aim-before-fire engagement state

Combatants now acquire a visible target, then enter an aiming/readiness window before spawning projectiles.

New combat fields include:

```txt
aimStartedTick
aimReadyTick
aimTargetId
lastVolleyOutcome
failedVolleyCount
```

Typical states now include:

```txt
searching
blocked
aiming
suppressed
firing
cooldown
```

This gives us a real seam for future UX/debug labels like “aiming”, “suppressed”, “target lost”, or “blocked by LoS”.

### 2. Volley pass/fail reasons

Volley attempts now have explicit outcomes instead of silently doing nothing.

Examples:

```txt
aiming
attempt:ready
fired
failed:out-of-range
failed:line-of-sight
failed:projectile-cap
```

The current target must still be in range and visible when the engagement resolves.

### 3. Suppression/under-fire combat penalty

Existing under-fire state now affects combat, not just movement.

A combatant under incoming fire:

- takes longer to aim
- enters `suppressed` rather than plain `aiming`
- fires with a bounded accuracy penalty based on incoming fire count

This is intentionally small and deterministic. We are not adding morale AI yet.

### 4. Structure doctrine modifiers

Firing context now carries:

```txt
rangeModifier
accuracyModifier
aimModifier
occupancyMode
```

Structure definitions now use aim modifiers for early doctrine:

- watchtower/platform: faster aiming, better range/accuracy
- trench: strong cover, steadier fire, slower aiming
- fort/outpost: stronger garrison firing platforms
- wall segment: now supports one wall-top squad and can fire from the wall

### 5. Wall-top garrison support

`wall_segment` is now occupiable:

```txt
occupancy.enabled: true
occupancy.mode: wall_top
capacitySquads: 1
allowedWeapons: infantry/recon
```

This is a first version only. It does not yet implement ladders, stairs, access points, or manual wall assignment UX polish.

## Validation

Passed:

```txt
node --check src/game/combatSystem.js
node --check src/game/structureRegistry.js
node --check tests/combatMechanics.test.mjs
node tests/runIsolatedTests.mjs gameModel.test.mjs constructionJobs.test.mjs navigationConstructionRegressionLock.test.mjs collisionAuthority.test.mjs runtimePerformanceQa.test.mjs builderPopulation.test.mjs structureTopology.test.mjs structureOccupancy.test.mjs combatMechanics.test.mjs
npm run test:validation
```

Frame-budget gate result:

```txt
Sim frame-budget QA: PASS
averageFrameMs: ~10.96
p95FrameMs: ~47.56
worstFrameMs: ~47.56
```

## What this does not solve yet

This is not full combat AI.

Still missing / future slices:

- visible combat debug overlay for target/aim/block reason
- morale and routed/pinned behaviours
- tactical reactions to suppression
- tower firing arcs
- trench duck/peek cadence
- wall access and assignment UX
- unit type differentiation beyond infantry/recon/artillery tags
- enemy tactical combat director

## Recommended next slice

```txt
Combat Debug Overlay / Engagement Inspector v0
```

Reason: now that combat has states and reasons, we should surface them so playtesting can answer: “why did this unit fire, aim, miss, or refuse to fire?”
