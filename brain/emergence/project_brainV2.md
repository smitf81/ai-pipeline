# Project Brain — Emergence (v2)

## System Identity

Emergence is the active ACE domain brain.

ACE is no longer a task runner or pipeline tool.

ACE is an **intent-driven world system** where:

* users express intent as pressure,
* the system continuously evaluates that intent,
* candidate changes are projected,
* validated changes are applied as slices.

The system operates over a persistent world composed of:

* canonical graph state (structure),
* spatial fields (distributed pressure),
* intent records (user and system input),
* projections (non-committed candidate changes).

---

## Core Execution Model (Authoritative)

All system behaviour must conform to this pipeline:

```
Intent → Canonical Intent Record → Field Influence → Resolver → Ghost Projection → Slice Execution
```

### Rules:

* No system may bypass this pipeline.
* No system may invent parallel truth paths.
* All outputs must be traceable through this chain.

---

## Canonical Data Model

### 1. Entities

All real system objects must be explicitly defined:

* departments
* desks
* agents
* roles
* model profiles

No implicit identity or label-based inference is allowed.

---

### 2. Relationships

All relationships must be explicit and stable:

* desk → department
* agent → desk
* agent → role
* agent → model profile

No duplicated relationship logic across systems.

---

### 3. Intent Records

All input must become a **canonical intent record**.

Intent is not UI state.

Each intent must include:

* id
* source (user/system/agent)
* geometry or scope
* semantic meaning (even if low confidence)
* timestamp
* provenance

---

### 4. Ghost Projections

All candidate outputs must exist as **non-committed projections**.

Each projection must include:

* source intent(s)
* proposed change(s)
* confidence
* status (candidate / blocked / ready)
* blockers (if any)
* provenance

Projections must never be treated as committed state.

---

## Runtime Layers

The system is composed of distinct layers. These must remain separated.

### 1. Intent Layer

Captures and stores canonical intent.

### 2. Field Layer

Represents distributed pressures over space.

Examples:

* traversal
* cover
* visibility
* build desirability

### 3. Graph Layer

Represents persistent world structure.

This is the only source of truth for:

* actual objects
* spatial relationships
* applied changes

### 4. Resolver Layer

Transforms field pressure into candidate actions.

Must:

* evaluate alternatives
* respect constraints
* produce explainable reasoning

### 5. Projection Layer

Holds non-committed candidate changes.

Must:

* remain separate from graph state
* expose provenance and confidence

### 6. Execution Layer

Applies validated changes as slices.

Must:

* validate before applying
* preserve provenance chain
* avoid direct mutation bypasses

---

## Spatial System Direction

ACE is evolving toward a **spatial intent surface**.

Users will:

* sketch intent into space,
* influence fields across multiple resolutions,
* observe ghost projections of potential changes,
* apply validated slices.

See:

```
spatial_sketchpad_foundation.md
```

This document defines the long-term architecture for:

* intent surfaces
* field propagation
* ghost projection systems
* slice execution integration

---

## Operating Principles

### 1. Intent = Pressure, Not Commands

No one-shot execution model.

All input contributes to continuous system evaluation.

---

### 2. Continuous Evaluation

The system must always be able to:

* reinterpret intent,
* recompute fields,
* update projections,
* surface new candidates.

---

### 3. One Source of Truth

No duplicated logic for:

* staffing
* planner identity
* routing
* targeting

All systems must read from canonical structures.

---

### 4. Observability is Mandatory

If a system state cannot be inspected, it is not valid.

Must be able to inspect:

* intent
* field values
* projections
* blockers
* execution decisions

---

### 5. No Silent Degradation

Failures must be explicit.

Disallowed:

* fallback disguised as success
* hidden errors
* unreadable model output treated as valid

---

### 6. Provenance Everywhere

Every output must trace back to:

* originating intent
* contributing fields
* responsible system/module

---

### 7. Strict Layer Separation

Do not blur:

* intent
* field
* resolver
* projection
* execution

Mixing these layers leads to:

* hidden bugs
* debugging difficulty
* inconsistent system behaviour

---

## Current Focus

* Enforce canonical data flow across all systems.
* Remove duplicated inference logic (especially planner/staffing).
* Ensure projections and blockers read from the same source of truth.
* Stabilise CTO → model → structured output → action pipeline.
* Begin foundational implementation of:

  * canonical intent records
  * ghost projection backbone

---

## Known System Risks

### 1. Split Truth (Critical)

Multiple systems derive different answers from:

* planner coverage
* staffing state
* routing logic

This must be eliminated.

---

### 2. Stale Derived State

Cached or persisted derived signals are not being invalidated correctly.

Result:

* UI contradictions
* incorrect blockers
* outdated decisions

---

### 3. Silent Model Failure

LLM failures currently degrade into:

* unreadable structured responses
* fallback outputs
* misleading UI states

Must be surfaced explicitly.

---

### 4. UI / Backend Drift

UI surfaces may not reflect canonical backend state.

Must ensure:

* all UI reads from canonical data
* no local-only truth

---

### 5. Overextension Risk

There is a risk of attempting:

* full semantic systems
* multi-resolution fields
* advanced AI behaviour

before the core pipeline is stable.

---

## Execution Doctrine

### Rule 1 — Build Vertical Slices

Each step must complete the full pipeline:

```
intent → projection → inspection → execution
```

---

### Rule 2 — No Throwaway Systems

Everything built must scale into the final architecture.

---

### Rule 3 — Fix Breaks Before Expanding

If any layer produces inconsistent or hidden results:

* stop
* debug
* stabilise

---

### Rule 4 — Keep It Observable

Every new feature must be:

* inspectable
* traceable
* explainable

---

## Immediate Direction

The next priority is:

**Establish canonical intent + projection backbone**

This enables:

* traceable system behaviour
* consistent reasoning
* reliable debugging
* future spatial system expansion

---

## Closing Statement

ACE is transitioning from:

> a collection of tools and flows

to:

> a unified, continuously-evaluated world system

This document defines the rules of that world.

All future work must align with it.
