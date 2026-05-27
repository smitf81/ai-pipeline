# Project Brain - Emergence

Emergence is the active ACE domain brain.
It tracks the architecture and operating model for ACE as a local-first manager for code, context, tool access, and guarded self-upgrade.

## Current Architecture

- ACE Studio exposes Context Manager, Planner, Executor, Memory Archivist, and CTO/Architect desks.
- The runtime keeps a persisted workspace, handoffs, team-board state, throughput sessions, and QA history.
- The runner owns scan, manage, build, run, and apply actions against target repos.
- MCP exposes ACE runtime state as a tool/resource layer instead of forcing bespoke per-tool wiring.

## Core System Direction

- ACE is shifting from a task and pipeline-driven tool into an intent-driven world system.
- Intent should be expressed as continuous pressure over a persistent graph-based world rather than as one-shot commands against isolated objects.
- The core stack is ACE for interpretation and orchestration, a graph layer for persistent world state, and a spatial field layer for distributed pressures such as cover, visibility, flow, and threat.
- The system should increasingly favor continuous evaluation, spatial reasoning, constrained execution via agents, and emergent outcomes over predefined results.

## Current Focus

- Make repo anchors canonical for manager, context, and intent flow.
- Separate canonical brain storage from external target-repo configuration.
- Remove legacy path drift so runtime behavior is not coupled to stale folder structure.

## Current State

- Canonical anchor storage is `brain/emergence/` with compatibility reads from `projects/emergence/`.
- External targets resolve from `targets.json` first, then `projects.json`.
- Legacy repo content is archived under `legacy/` and excluded from active runtime resolution.
