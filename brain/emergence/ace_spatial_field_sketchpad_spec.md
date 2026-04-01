# ACE Spatial Field Sketchpad & Ghost Projector — Foundational Build Plan

## Intent of This Document
This is not an MVP spec.

This is a **foundational construction plan** for a system we fully intend to scale into its final form.

Every step defined here must:
- move us closer to the end-state architecture,
- avoid throwaway systems,
- remain structurally compatible with future expansion,
- be small enough to implement and verify.

Think: **brick-by-brick construction of a cathedral**, not a temporary shed.

---

# End Goal (Anchor)

A spatial system where:
- intent is expressed as pressure over space,
- pressure propagates across multi-resolution fields,
- candidate world changes are projected as ghosts,
- users can inspect, validate, and apply changes as slices,
- all outputs are explainable and grounded in canonical truth.

---

# Core System Spine (Non-Negotiable)

Everything we build must reinforce this pipeline:

```
User Intent → Canonical Intent Record → Field Influence → Resolver → Ghost Projection → Slice Execution
```

If a feature does not clearly fit into this chain, it is likely a distraction.

---

# Foundational Build Layers

## Layer 1 — Canonical Intent (FIRST BRICK)

### Objective
Create a **permanent, canonical representation of spatial intent**.

### Why this matters
Without this, everything becomes:
- ephemeral
- untraceable
- impossible to debug

### Deliverables
- SpatialIntent schema (stable, versionable)
- Intent registry (in-memory + persisted)
- Mapping from UI input → canonical intent

### Requirements
- Must support:
  - geometry (region/stroke)
  - semantic label (even if naive at first)
  - provenance (user, timestamp)
- Must NOT rely on UI-only state

### Dependencies
- none (this is the base layer)

### Risks
- overcomplicating schema too early
- under-specifying fields and needing breaking changes later

### Time Target
1 focused session (2–4h) to define + wire minimal version

---

## Layer 2 — Ghost Projection Backbone

### Objective
Introduce **non-committed candidate outputs** as first-class entities.

### Why this matters
This is the moment ACE becomes *interpretive*, not reactive.

### Deliverables
- GhostProjection schema
- Projection registry
- Link: intent → projection(s)

### Requirements
- Each ghost must include:
  - source intent IDs
  - confidence (even if naive)
  - status (candidate / blocked / ready)
- Must be clearly separated from committed state

### Dependencies
- Layer 1 (intent must exist first)

### Risks
- ghosts accidentally mutating real state
- unclear ownership between resolver and UI

### Time Target
1–2 sessions

---

## Layer 3 — Minimal Interpretation Bridge

### Objective
Convert raw input into **basic semantic meaning**.

### Deliverables
- Simple interpreter:
  - region → "build pressure"
  - stroke → "flow influence"
- Confidence tagging (even static values initially)

### Requirements
- Deterministic first (LLM optional later)
- Must produce canonical intent fields, not ad-hoc values

### Dependencies
- Layer 1

### Risks
- prematurely introducing LLM complexity
- semantic ambiguity exploding scope

### Time Target
1 session

---

## Layer 4 — Field Influence (Single Band First)

### Objective
Introduce **pressure propagation over space**.

### Deliverables
- One field (e.g. build desirability OR traversal)
- Function:
  - intent → field modification
- Query API for field values

### Requirements
- Must be spatially queryable
- Must support local updates without full recompute

### Dependencies
- Layer 1
- Layer 3

### Risks
- overengineering multi-resolution too early
- performance traps from full recomputation

### Time Target
2–3 sessions

---

## Layer 5 — Resolver → Projection Link

### Objective
Translate field pressure into **candidate actions**.

### Deliverables
- Resolver function:
  - reads field
  - proposes 1–N candidate changes
- Output → GhostProjection

### Requirements
- Must include reasoning summary (even basic)
- Must support rejection/blocking states

### Dependencies
- Layer 2
- Layer 4

### Risks
- black-box behaviour (no explainability)
- overfitting to one scenario

### Time Target
2 sessions

---

## Layer 6 — Visual Ghost Overlay

### Objective
Make the system **observable in space**.

### Deliverables
- Render ghost projections
- Distinguish from real state
- Basic interaction (hover/select)

### Requirements
- Must show:
  - origin intent
  - confidence
  - status

### Dependencies
- Layer 2

### Risks
- UI drift from backend truth
- hiding missing data behind visuals

### Time Target
1–2 sessions

---

## Layer 7 — Slice Execution Path

### Objective
Allow ghosts to become **real, validated changes**.

### Deliverables
- Convert ghost → mutation slice
- Validate
- Apply
- Persist

### Requirements
- Must preserve provenance chain:
  intent → projection → slice

### Dependencies
- All previous layers

### Risks
- skipping validation
- direct mutation bypassing system

### Time Target
2–3 sessions

---

# Multi-Resolution (Deferred but Planned)

We do NOT implement full multi-resolution yet.

But we must design for it:

### Required early decisions
- Coordinate system must support scaling
- Field API must allow band extension
- Intent must include scope hints

### When to introduce
After Layer 5 is stable

---

# Critical Dependencies Across the System

## 1. Canonical Truth Unification
Your current blocker issue (planner contradiction) proves this is fragile.

Everything here must:
- read from one canonical source
- avoid duplicated inference paths

## 2. Provenance Threading
If we lose provenance early, debugging becomes impossible later.

## 3. Separation of Layers
- Intent ≠ Field
- Field ≠ Resolver
- Resolver ≠ Projection
- Projection ≠ Execution

Blurring these will collapse the architecture.

---

# Known Bottlenecks & Blindspots

### ⚠️ 1. Silent Degradation
You already have this:
- model fails → system still produces output

Must be made visible early.

---

### ⚠️ 2. Stale Derived State
Your planner issue is a direct example.

Solution direction:
- recompute or invalidate derived signals
- avoid cached truth without ownership

---

### ⚠️ 3. Over-Ambitious Semantics Too Early
Do NOT attempt:
- full language understanding
- complex semantic graphs

Start with:
- 2–3 clear meanings

---

### ⚠️ 4. UI Leading Architecture
Avoid building UI features that backend cannot support properly yet.

---

### ⚠️ 5. Performance Traps
Field recomputation and projection explosion will become expensive.

Design for:
- locality
- batching
- incremental updates

---

# Execution Strategy (How We Actually Build This)

## Rule 1 — One Path to Truth
Pick ONE scenario and make it fully work:

Example:
> Draw region → generate build pressure → produce ghost structure → inspect → apply

---

## Rule 2 — No Fake Layers
If something is simulated or stubbed, it must be obvious.

---

## Rule 3 — Every Layer Must Be Inspectable
If we cannot see:
- intent
- field
- projection

we cannot debug it.

---

## Rule 4 — No Throwaway Code
Everything must be extensible into final system.

---

# First Concrete Build Slice (Do This Next)

## Goal
End-to-end minimal vertical slice of the full system.

## Scope
- Region input
- One semantic meaning: "build here"
- One field: build desirability
- One projection type: simple structure placement

## Must Achieve
1. User draws region
2. Intent stored canonically
3. Field updated locally
4. Resolver generates candidate
5. Ghost appears
6. Ghost shows provenance

If any of these fail → stop and fix before expanding

---

# Final Note

This system will only work if we resist the urge to:
- jump ahead
- over-generalise
- hide failures

Right now, your edge is:
- you already have partial systems (fields, graph, tasks)
- you’ve already seen where truth diverges

This plan forces everything into alignment around a single observable pipeline.

That’s how we turn ACE from a collection of clever parts into an actual system.

