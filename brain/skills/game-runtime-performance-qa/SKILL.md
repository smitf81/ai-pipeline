---
name: game-runtime-performance-qa
description: Create, audit, and run deterministic QA tests for game-loop cadence, fixed timestep vs variable render delta, accumulator remainder interpolation, visual/collider transform detachment, RTS horde performance, pathfinding chokepoints, spatial culling, FPS/TPS telemetry, and action-ready senior QA performance reports. Use when validating browser games, RTS simulations, entity systems, physics-like ticks, pathfinding, or runtime performance before ship.
---

# Game Runtime Performance QA

## Workflow

Use this skill to validate game runtime performance as a senior QA games engineer.

1. Identify the canonical runtime owner for the loop, simulation step, pathfinding, spatial partition, and visual transform code.
2. Separate assertions into deterministic unit tests and optional live browser probes.
3. Prefer fixed inputs, operation counters, and bounded queues over wall-clock thresholds unless profiling is explicitly requested.
4. Report failures as shipping risks with evidence, impact, and the next engineering action.

## Required Test Classes

Create or audit these tests when relevant:

- Fixed vs variable delta: fixed simulation callbacks must receive one constant tick size, while visual interpolation receives the variable render delta.
- Accumulator remainder: leftover time after fixed ticks must be exposed as an interpolation alpha or remainder payload.
- Visual detachment: rendered model/sprite transform must be independently interpolated from the logical collider/physics transform.
- Horde stress: spawn or synthesize 500+ moving units and report FPS/TPS-style counters, update counts, and any deferred work.
- Chokepoint pathfinding: send hundreds of units to one narrow target and assert path requests are budgeted or deferred rather than processed as one unbounded spike.
- Spatial culling: assert off-screen or out-of-interest units skip expensive visual/AI updates via grid, quadtree, chunk, or sector queries.

## Reporting Standard

Every result should include:

- scenario name and unit count
- fixed tick rate and render delta policy
- FPS/TPS or deterministic equivalents
- total updates, visible updates, culled updates, queued jobs, processed jobs, deferred jobs
- severity, failure code, likely impact, and recommended action
- whether the test is deterministic unit coverage, live browser profiling, or manual observation

## Guardrails

Do not make performance tests flaky by failing on tiny wall-clock differences. Use wall-clock metrics for reporting unless the threshold is generous, repeated, and stable in CI.

Do not accept tests that only prove entities exist. Tests must prove cadence, budget, culling, detachment, or reporting behavior.

Do not let QA reports become canonical game truth. Treat them as evidence artifacts unless the project has an explicit QA evidence owner.
