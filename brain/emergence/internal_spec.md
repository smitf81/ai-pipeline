# Internal Specification - ACE Intent-Driven Spatial World System

## 1. Purpose

ACE should operate as a world simulation substrate that interprets intent, evaluates persistent world state, and produces constrained changes over time. The system is not defined as a direct command runner or fixed pipeline; it is defined as a loop that reads a graph-based world, derives spatial pressures, proposes small changes, and lets agents execute those changes inside clear limits.

## 2. Core Principle

**Intent is expressed as pressure, not commands.**

- Continuous evaluation: the system re-scores the world every cycle instead of treating each request as a one-shot instruction.
- Constraint-driven change: the resolver may only propose actions that fit world state, field values, and agent limits.
- Emergence over direct placement: the target result is approached through repeated small actions, not by placing the final structure directly.

## 3. System Layers

### 3.1 ACE (Interpretation & Orchestration)

- Converts user intent into structured intent objects.
- Starts evaluation cycles and routes work to the graph, field, and resolver stages.
- Translates resolver output into task records for agents.
- Owns task queueing, tick advancement, and system-level policy.

### 3.2 Graph Layer (World Model)

- Stores persistent world state as nodes and edges.
- Nodes may represent tiles, agents, structures, resources, and intent anchors.
- Edges may represent adjacency, containment, support, or other stable relationships.
- Nodes carry tags and affordances such as `walkable`, `blocking`, `paintable`, and `occupied`.
- This layer is the canonical state read by the simulation loop.

### 3.3 Field Layer (Spatial Pressure)

- Stores grid-aligned scalar fields over the current tilemap.
- Each field uses a continuous `0.0` to `1.0` range.
- Initial MVP fields are `cover`, `visibility`, and `traversal`.
- Fields are derived from graph state and tile state each cycle; they are not authoritative state on their own.

## 4. Core Simulation Loop

The loop for each tick is:

`evaluate world -> compute fields -> generate intent gradients -> resolve -> produce candidate tasks -> agents execute -> update world`

Practical definition of each step:

1. Evaluate world: read the current graph, tile tags, agent state, queued tasks, and active intents.
2. Compute fields: rebuild the MVP field grids from the current world snapshot using deterministic heuristics.
3. Generate intent gradients: convert each intent into a spatial weighting function over nearby tiles.
4. Resolve: score possible world changes against the current fields, gradients, and local constraints.
5. Produce candidate tasks: emit a small ranked set of concrete tasks in the existing task style, such as `paintTile`.
6. Agents execute: eligible agents claim tasks, spend ticks and optional energy, and apply work only when constraints are satisfied.
7. Update world: write completed task effects back into the graph and tile state, then begin the next cycle.

## 5. Field Model (MVP Definition)

- Grid: `20 x 20`, aligned one-to-one with the tilemap.
- Value range: all fields are normalized to `0.0` to `1.0`.
- Rebuild cadence: all fields are recomputed every simulation cycle from current world state.

Initial MVP fields:

### Cover

- Meaning: how much nearby blocking geometry protects a tile.
- Heuristic:
  - `1.0` if the tile itself is blocking.
  - Otherwise `0.25` for each blocking cardinal neighbor.
  - Clamp the result to `1.0`.

### Visibility

- Meaning: how exposed a tile is.
- Heuristic:
  - `0.0` if the tile itself is blocking.
  - For each cardinal direction, look ahead up to `3` tiles.
  - A direction contributes `0.25` if no blocking tile is encountered in that short scan.
  - Sum the visible directions and clamp to `1.0`.

### Traversal

- Meaning: how easy it is for an agent to act at or through a tile.
- Heuristic:
  - `1.0` for walkable, unoccupied tiles.
  - `0.5` for walkable but occupied or rough tiles.
  - `0.0` for blocking tiles.

These heuristics are intentionally simple. The MVP should not use physics simulation, ray tracing, or full path cost fields.

## 6. Intent Model (MVP)

Intent object:

```json
{
  "id": "intent-001",
  "type": "defensibility",
  "position": { "x": 10, "y": 10 },
  "radius": 6,
  "weight": 1.0
}
```

Rules:

- `id`: stable identifier for tracking and testing.
- `type`: semantic objective. MVP supports `defensibility`.
- `position`: center of influence on the tile grid.
- `radius`: maximum distance influenced by the intent.
- `weight`: multiplier applied to the gradient.

Gradient definition:

- Intents generate gradients, not actions.
- A simple MVP gradient is radial linear falloff:
  - `gradient(x, y) = weight * max(0, 1 - distance(position, tile) / radius)`
- The gradient biases the resolver toward tiles near the intent center.

## 7. Resolver (MVP)

Inputs:

- Current field grids.
- Current intent gradients.
- Current tile state and graph tags.
- Current agent state.
- Recently issued and currently queued tasks.

Output:

- A small ranked set of candidate world changes.
- MVP output should map to the existing task system as concrete task objects, using `paintTile` as the first supported action.

Candidate scoring for `defensibility`:

- Consider only paintable, local tiles.
- For each candidate tile, estimate the local effect of painting that tile as blocking geometry.
- Score the candidate by favoring:
  - higher intent gradient
  - higher resulting cover
  - lower resulting visibility
  - acceptable traversal loss

Deterministic and bounded behavior:

- Sort candidates by score descending.
- Break ties by `y`, then `x`, then action type.
- Emit at most `3` tasks per cycle.
- Do not emit a task if the same task is already queued.
- Do not emit a task for a tile whose last change is within a `5` tick cooldown window.

MVP task shape:

```json
{
  "type": "paintTile",
  "target": { "x": 11, "y": 9 },
  "value": "blocking",
  "reason": "increase_defensibility",
  "score": 0.82
}
```

## 8. Agent / NPC Constraints (MVP)

- Agents execute tasks, not intents directly.
- Agents are the mechanism that enforces realism and limits.

MVP constraints:

- Locality: an agent may only claim a task within a work radius of `3` tiles from its current position.
- Energy: optional simple counter, default `10`, with cost `1` per completed task.
- Execution time: `paintTile` takes `2` ticks to complete after the agent starts work.

Notes:

- The MVP does not require advanced pathfinding.
- If no agent satisfies locality, the task remains unclaimed or is skipped that cycle.

## 9. MVP Slice Definition

Scope:

- Grid: `20 x 20`
- Fields: `cover`, `visibility`, `traversal`
- One intent: `defensibility`
- One worker agent
- One action: `paintTile`

Success criteria:

- The system produces gradual, visible tile changes across multiple cycles.
- Resolver output trends toward higher local defensibility near the intent center.
- The result is not hardcoded as a fixed structure template.
- The system avoids repeated duplicate tasks on the same tile during the cooldown window.

## 10. Non-Goals (Important)

- Multiple competing intents
- Advanced pathfinding
- Full ACE integration
- Multi-agent coordination
- Persistence
- Complex physics
- UI overhaul

## 11. Future Milestones (Brief)

- Conflicting intents such as flow versus defensibility
- Field propagation and decay
- Agent autonomy and prioritization
- Multi-scale fields
- User-injected intent

## 12. MVP Clarifications

These clarifications tighten the MVP rules above without expanding scope.

### 12.1 Traversal Scoring Clarification

- The stored `traversal` field remains the normalized local movement availability defined in Section 5.
- Resolver scoring must convert that value into traversal cost before ranking candidates:
  - `traversalCost = 1.0 - traversal`
- Candidate evaluation should minimize traversal cost increase rather than referring to generic traversal loss.

### 12.2 Traversal Stop Condition

- A candidate tile must not be selected if the simulated change would reduce local traversal below a minimum threshold of `0.2`.
- For the MVP, `local traversal` means the average `traversal` value of the target tile's non-blocking cardinal neighbors after the simulated change.
- This stop condition exists to prevent the resolver from filling all nearby space with blocking tiles.

### 12.3 Mandatory Agent Energy

- Agent energy is mandatory in the MVP.
- Each worker agent starts with `10` energy.
- Completing a task costs `1` energy.
- An agent with `0` energy must not claim new tasks.
- Energy recharge is not part of the MVP; tests may reset agent energy only between runs or scenarios.
