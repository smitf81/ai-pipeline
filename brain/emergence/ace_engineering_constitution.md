# ACE Engineering Constitution

## Status
Authoritative working constitution for all ACE/Codex/executive-agent changes.

This document governs how code, architecture, tests, prompts, summaries, and repo changes must be produced inside ACE.

It is intended for:
- Codex
- ACE executive agents
- human contributors
- future autonomous worker agents

This is not a style guide only.
This is a system-integrity constitution.

---

# 1. Purpose

ACE is not a generic app.
ACE is an intent-driven world system with persistent canonical truth, spatial reasoning, explicit provenance, guarded execution, and continuous validation.

Therefore, contributors must not optimise only for “working code”.
They must optimise for:
- single-source truth
- architectural coherence
- inspectability
- safe evolution
- repeatable validation
- deletion of stale logic

Every change must leave the system:
- more truthful
- more observable
- less heuristic
- less duplicated
- easier to validate

---

# 2. Constitutional Principles

## 2.1 One Source of Truth Per Domain
Every important concept must have one canonical owner.

Examples:
- agent/desk/role identity
- staffing coverage
- QA evidence
- blocker generation
- intent records
- ghost projections
- execution provenance

No second module may invent or reconstruct operational truth from labels, UI state, stale history, or convenience helpers.

If multiple modules answer the same domain question independently, the system is in violation.

---

## 2.2 Canonical Truth Beats History
Historical, pending, cached, or derived state must never override canonical live truth.

Allowed use of history:
- display context
- audit trail
- human review
- retrospective reasoning

Forbidden use of history:
- acting as current fact when contradicted by canonical truth
- blocking live execution without recomputation
- surviving as stale pending state when prerequisites are no longer true

---

## 2.3 Intent Over Commands
ACE is built around intent expressed as pressure, not one-shot commands.

All new work must align with the core execution spine:

Intent → Canonical Intent Record → Field Influence → Resolver → Ghost Projection → Slice Execution

Features that bypass this model must be treated as temporary compatibility layers, clearly marked and constrained.

---

## 2.4 Every Decision Must Be Explainable
Operational decisions must expose:
- who made the decision
- what canonical source was used
- which predicate failed or passed
- what entity IDs or records were involved
- whether fallback or override was used

If a decision cannot explain itself, it is not trustworthy.

---

## 2.5 No Silent Degradation
The system must never present degraded, fallback, unreadable, stale, or guessed output as if it were healthy canonical truth.

Failures must be surfaced explicitly.

Required examples:
- model fallback status
- unreadable structured response
- stale QA evidence
- missing provenance
- blocked execution reason
- override reason and skipped gates

---

## 2.6 Delete Stale Logic
When canonical logic is introduced, stale helper paths, duplicate inference, UI fallbacks, and dead compatibility logic must be removed or rerouted.

Do not leave obsolete logic in place “just in case” unless explicitly approved and tagged as legacy.

Stale code is not neutral.
It actively breeds split truth.

---

## 2.7 Validation Is Part of the Feature
No task is complete without validation.
No summary is complete without reporting validation.
No architecture doc is complete if it does not reflect the current validation reality.

Every document produced from implementation work must say what was validated and how.

---

# 3. Authoritative Core Model

## 3.1 ACE Identity
ACE is an intent-driven world system.
It is not primarily:
- a form-driven admin panel
- a one-shot pipeline runner
- a UI-first CRUD app
- a chat wrapper around tools

All work must preserve the direction that ACE:
- stores canonical world truth
- reasons over graph and fields
- projects candidate changes before applying them
- preserves provenance
- validates before mutation

---

## 3.2 Core Execution Spine
All major architecture work must remain legible against this spine:

Intent → Canonical Intent Record → Field Influence → Resolver → Ghost Projection → Slice Execution

Contributors must explicitly state where their task sits in this spine.

If a task does not clearly map to the spine, it must explain why.

---

## 3.3 Runtime Layer Separation
The following layers must remain distinct.

### Intent Layer
Owns capture and storage of intent.
Must not mutate world state directly.

### Field Layer
Owns distributed pressure over space.
Must not invent canonical entities.

### Graph Layer
Owns persistent world structure.
Must be the source of truth for real committed state.

### Resolver Layer
Owns candidate reasoning from fields and graph.
Must not fake committed results.

### Projection Layer
Owns non-committed candidate outputs.
Must remain visibly distinct from committed state.

### Execution Layer
Owns validation and application of slices.
Must preserve provenance and guardrails.

Any contributor that blurs these layers must justify it explicitly and narrowly.
Default assumption: blurring layers is wrong.

---

# 4. Domain Ownership Rules

Every operational domain must identify its owner.

## 4.1 Domain Owner Definition
A domain owner is the single module or small set of canonical functions responsible for deriving the live truth for that domain.

Examples:
- agent identity owner
- staffing coverage owner
- QA audit owner
- blocker generation owner
- execution override owner

Contributors must name the owner in each task.

---

## 4.2 Domain Questions Must Have One Answering Path
Examples of domain questions:
- Do we have a QA Lead?
- Is planner coverage satisfied?
- What blocker is currently active?
- What scorecard evidence is canonical?
- Which action is pending?
- What seat owns this desk?

For each such question, the system must have one answering path.

If the repo contains multiple functions answering the same question differently, the task must treat that as technical debt to be removed, not preserved.

---

## 4.3 Prohibited Local Reconstruction
Modules may not reconstruct domain truth from:
- labels
- UI text
- desk names
- historical pending actions
- cached summary cards
- prompt wording
- partial payloads

If canonical truth exists, consumers must consume it directly.

---

# 5. Anti-Heuristic Rules

## 5.1 Heuristic Logic Is Guilty Until Proven Necessary
Heuristic or inferred logic must be assumed dangerous when it affects:
- staffing
n- blocker generation
- execution permission
- seat identity
- scorecard truth
- routing
- orchestration

Allowed heuristic logic:
- cosmetic ranking
- non-authoritative display ordering
- optional recommendation UI

Forbidden heuristic logic:
- operational truth decisions where canonical truth exists

---

## 5.2 Ban Label-Based Identity
Never decide identity from human-readable strings when stable IDs exist or should exist.

Forbidden examples:
- matching `'qa-lead'` from labels instead of canonical role/agent IDs
- inferring planner seat from desk title alone
- reconstructing entity identity from card labels

---

## 5.3 Ban Shadow Helpers
Do not create near-duplicate helpers like:
- `getPlannerStatus`
- `derivePlannerCoverage`
- `resolvePlannerState`
- `computePlannerNeed`
- `plannerMissingLead`

Unless one is canonical and the others are clearly presentational only.

Every helper affecting domain truth must declare whether it is:
- canonical derivation
- presentational summary
- validation-only assertion

---

## 5.4 Ban Truth Fallback Chains
Do not use fallback chains for operational truth.

Dangerous pattern:
- `a || b || c`

This is acceptable only for cosmetic display fallback, and even then should be used carefully.

Forbidden when used for:
- blocker truth
- staffing truth
- QA evidence truth
- seat identity
- orchestration decisions

---

# 6. State Rules

## 6.1 Live State, Derived State, Historical State Must Be Distinguished
Every state artifact must clearly be one of:
- live canonical truth
- derived current summary
- historical record
- pending request
- cache

Do not let these blur together.

---

## 6.2 Pending State Must Expire or Be Invalidated
Pending actions and delegations must not outlive the conditions that created them.

If canonical truth changes, pending state must be:
- recomputed
- invalidated
- downgraded to historical context

Pending state must never silently remain authoritative.

---

## 6.3 Caches Are Read Optimisations, Not Truth Sources
A cache may accelerate reads.
A cache may never become the deciding source of domain truth.

Any cache-backed logic must support invalidation when canonical truth changes.

---

# 7. UI Constitution

## 7.1 UI Renders Truth; UI Does Not Invent Truth
UI may:
- render canonical payloads
- render derived summaries explicitly tagged as such
- surface missing data honestly

UI may not:
- reconstruct staffing truth
- synthesize seat identity
- invent blockers
- silently merge stale/local fallback data into operational truth

---

## 7.2 No Local-Truth Fallbacks for Operational Data
Patterns like these are prohibited for operational surfaces:
- `panelData.qa.scorecards || panelData.truth.scorecards || []`
- `desk.role || inferredRoleFromLabel`
- `activeBlocker || historicalPendingBlocker`

If data is missing, UI must show it is missing.

---

## 7.3 Missing Data Must Be Visible
Missing, stale, partial, or failed state must be visible in the UI.

Do not conceal missing truth with placeholders that resemble real state.

---

## 7.4 UI Affordances Must Respect Authorship Boundaries
Desk-level permissions must reflect system roles.

Examples:
- QA may observe and audit, not execute
- CTO may approve, override, or authorise explicit operator actions
- planner may propose structured outputs, not perform direct mutations unless explicitly designed to do so

---

# 8. Server and Runtime Constitution

## 8.1 Server Must Prefer Canonical Truth First
Any request path involving blockers, staffing, execution permission, or desk targeting must resolve canonical truth first before using history, summaries, or pending state.

---

## 8.2 Runtime Decisions Must Carry Provenance
Server/runtime responses for operational decisions must expose structured provenance, including where practical:
- decision source
- entity IDs
- blocker IDs or names
- canonical predicates used
- override fields
- fallback state

---

## 8.3 No Cosmetic-Only Fixes for Runtime Bugs
If a bug is in the runtime truth path, do not “fix” it by changing UI wording or prompt text only.

Allowed: temporary warning labels that explicitly admit underlying runtime issue.
Not allowed: wording changes that conceal truth divergence.

---

# 9. Override Constitution

## 9.1 Override Is a First-Class Feature
Override is not a hack.
It is an explicit operator-authority mechanism for progressing through legitimate cross-layer conflicts.

Override must never be used to mask false blockers that should be fixed at the truth source.

---

## 9.2 Override Must Be Explicit and Auditable
Any override path must stamp:
- `origin`
- `execution_mode`
- `override_reason`
- `blocked_by`
- `skipped_gates`

and preserve that provenance on:
- success
- blocked outcome
- downstream failure

---

## 9.3 Override Must Not Become Hidden Global Permission
Overrides must be narrowly scoped.

Forbidden forms:
- global `planner=true`
- invisible bypasses
- stateful override flags that silently affect future unrelated actions

---

# 10. QA Constitution

## 10.1 QA Is Observer, Verifier, and Auditor
QA is not an execution desk.
QA owns:
- reviewing evidence
- checking freshness
- flagging stale or missing tests
- comparing scorecards to source evidence
- auditing the QA process itself

QA does not own:
- overrides
- operational mutations
- authoring execution decisions

---

## 10.2 QA Evidence Must Be Canonical and Traceable
Every QA output must expose:
- source artifact(s)
- freshness status
- generation time
- generating module/system
- mismatch reasons where applicable

---

## 10.3 QA Scorecards Must Never Be Detached from Evidence
A scorecard without evidence provenance is not valid.

Any scorecard surface must be able to answer:
- what evidence produced this?
- when was it generated?
- is it stale?
- does it match the underlying report?

---

# 11. Naming Constitution

## 11.1 Naming Must Reveal Responsibility
Prefer names that reveal role and authority.

Recommended prefixes:
- `buildCanonical...` → authoritative truth builders
- `normalize...` → shape cleanup only
- `resolve...` → runtime decision from canonical inputs
- `derive...Summary` → presentational summary only
- `collect...` → aggregation without new truth invention
- `validate...` → assertion/check logic

Avoid vague names such as:
- `handleState`
- `processData`
- `computeThing`
- `getStuff`
- `fixCoverage`

---

## 11.2 Presentational Names Must Not Sound Canonical
If a function is a UI summary only, do not name it like a truth owner.

Example:
- `derivePlannerSummaryCard` is clearer than `getPlannerStatus`

---

# 12. File and Module Rules

## 12.1 One Module Should Not Own Unrelated Truth Domains
Avoid giant utility files that decide:
- staffing
- QA
n- orchestration
- seat identity
- routing
all at once.

Separate by domain ownership where reasonable.

---

## 12.2 Cross-Module Imports Must Not Smuggle Logic
Do not clone or half-copy canonical logic into another module because an import path is awkward.
Fix the import path or extract shared canonical logic properly.

---

## 12.3 Legacy Compatibility Must Be Tagged
If a legacy path is retained, mark it clearly with:
- why it still exists
- what canonical system replaces it
- what conditions allow deletion

---

# 13. Task Constitution

Every Codex or executive-agent task must include the following sections.

## 13.1 Mandatory Task Sections
1. **Current Objective**
2. **Canonical Domain Owner(s)**
3. **Current Divergent Paths**
4. **Exact Files to Modify**
5. **Constraints**
6. **Validation Plan**
7. **Expected Deletions or Reroutes**

Tasks that omit these are incomplete.

---

## 13.2 Every Task Must Name the Canonical Owner
Example:
- staffing truth owner: `staffingRules`
- seat identity owner: `studioLayoutSchema`
- QA audit owner: `qaAuditTrail`

If the owner is unclear, the first task is to identify or create one.

---

## 13.3 Every Task Must Look for Duplicate Inference
Before implementing, contributors must trace read/write paths for the domain and classify them as:
- canonical
- duplicate
- stale
- UI fallback
- historical only
- dead code

---

## 13.4 Prefer Deletion or Rerouting Over Layering New Helpers
The default fix for stale logic is:
- delete it
- reroute it
- invalidate it

Not:
- wrap it
- add a second helper
- leave it in place beside the new one

---

# 14. Sequence and Loop Constitution

## 14.1 Small Permanent Bricks Over Temporary MVP Tricks
ACE work must be broken into narrow, structurally valid slices.

Allowed:
- small, testable, architecture-aligned slices
- validation loops
- sequential dependency chains

Disallowed:
- throwaway scaffolding likely to rot immediately
- fake MVP logic that bypasses the intended final model without explicit legacy tagging

---

## 14.2 Every Slice Must End in a Truth Check
At the end of each slice, validate:
- what changed
- what did not change
- what truth path now owns the domain
- whether stale paths were removed
- whether tests prove the intended result

---

## 14.3 Sequence Planning Must Include Bottlenecks
Task plans should mention:
- dependencies
- potential stale-state risks
- expected bottlenecks
- likely follow-up validation needs

---

# 15. Validation Constitution

## 15.1 Validation Is Mandatory
No implementation summary may omit validation.

Required validation categories where relevant:
- unit tests
- targeted integration tests
- direct runtime probes
- manual scenario validation
- syntax/load checks

---

## 15.2 Targeted Validation Is Acceptable If Full Suite Is Dirty
If the full suite contains known unrelated failures, contributors may use focused validation, but must say:
- which full-suite failures remain
- why they are believed unrelated
- what targeted tests were run instead

This is a temporary allowance, not a permanent excuse.

---

## 15.3 Anti-Drift Tests Are Required for Canonicalisation Work
When fixing split truth, add tests such as:
- canonical covered means no missing-lead blocker
- canonical scorecards mean no UI fallback path
- canonical seat IDs prevent label inference
- canonical blocker source beats stale pending history

---

## 15.4 Validation Results Must Be Reflected in Documents
All implementation docs, summaries, and updates must reflect actual validation results.

Never write as though work is complete if validation is partial.

Required phrasing categories:
- passed
- failed
- partially validated
- validated by targeted probe only
- blocked by unrelated baseline failure

---

# 16. Documentation Constitution

## 16.1 Docs Must Reflect Current Truth, Not Aspirational Lies
Architecture and progress docs must distinguish:
- current reality
- intended future design
- known drift
- validation state

---

## 16.2 Every Implementation Summary Must Include
- root cause
- exact files changed
- current divergent read path (if applicable)
- before/after truth flow
- insertion points if relevant
- validation performed
- residual known issues

---

## 16.3 Architectural Docs Must Mention Validation Gates
If a new canonical path is introduced, the corresponding doc must note how it is validated.

---

# 17. Review Constitution

## 17.1 Review for Truth Paths First, Style Second
During review, first ask:
- what is the domain owner?
- did the task create another truth path?
- did pending/history remain authoritative incorrectly?
- did UI invent state?
- were stale helpers deleted?

Only then worry about cosmetic style.

---

## 17.2 Red Flags in Review
Immediate suspicion if you see:
- duplicated logic in new helper names
- `||` fallback chains for operational state
- label-based matching
- UI fallback truth
- “pending” surviving despite canonical contradiction
- summary strings with no structured provenance
- tests deleted without replacement
- “unrelated” failure claims with no targeted validation

---

## 17.3 Review Must Prefer Structural Clarity Over Cleverness
Do not accept clever compression that obscures:
- owner of truth
- layer boundaries
- provenance
- invalidation logic

---

# 18. Legacy and Migration Constitution

## 18.1 Legacy Paths Must Not Quietly Compete
When keeping a legacy path alive, contributors must ensure it cannot still participate in live decisions unless explicitly allowed.

---

## 18.2 Migration Tasks Must Include Removal Criteria
Every migration must define:
- what old path remains
- what canonical path replaces it
- what test or condition allows deletion of the old path

---

# 19. Agent Constitution

## 19.1 Executive Agents Are Bound by the Same Truth Rules
ACE executive agents must not invent new truth paths just because they operate through prompts.

Their prompts and task plans must include:
- domain owner
- constraints
- validation expectations
- anti-heuristic rules

---

## 19.2 Agents Must Prefer Inspection Over Assumption
If an agent needs to answer a truth question, it must inspect the canonical source or the canonical derived decision, not infer from narrative context.

---

## 19.3 Agents Must Report Residual Drift Honestly
Agents must name:
- what they changed
- what remains stale
- what they did not validate
- what baseline failures still exist

---

# 20. Required Delivery Format for Codex and Executive Agents

Every returned implementation summary should follow this pattern.

## 20.1 Required Summary Structure
- **Root Cause**
- **Canonical Owner(s)**
- **Current Divergent Path(s)**
- **Exact Files Changed**
- **What Changed**
- **Before / After Truth Flow**
- **Validation**
- **Residual Issues**

---

## 20.2 Required Validation Structure
Validation must list:
- exact tests run
- direct probes used
- runtime/manual scenario checks
- failures still present
- whether failures are believed unrelated

---

# 21. Banned Patterns

The following are banned unless explicitly approved and documented.

- label-based seat identity
- UI-local operational truth
- operational fallback chains
- duplicate missing-lead logic
- stale pending state treated as current fact
- legacy summary paths overriding canonical truth
- cosmetic wording changes used as runtime fixes
- hidden override flags
- dead compatibility helpers left beside canonical replacements
- tests removed without replacement when canonical behaviour changes

---

# 22. Required Patterns

The following are strongly preferred.

- canonical owner per domain
- structured provenance on decisions
- anti-drift tests
- explicit validation summaries
- narrow slices
- deletion of stale logic
- desk/agent role boundaries
- read-only QA surfaces
- explicit override provenance
- current vs historical state separation

---

# 23. Enforcement Rules

## 23.1 Any Task May Be Rejected for Constitutional Violation
A task is invalid if it:
- introduces another truth path
- leaves known duplicate logic in place without justification
- uses heuristics where canonical truth exists
- omits validation
- conceals degraded state
- muddies authorship or desk boundaries

---

## 23.2 When in Doubt, Choose Truth Over Convenience
If a contributor must choose between:
- a quick convenience helper
- a clean canonical read path

they must choose the canonical read path.

---

## 23.3 When in Doubt, Expose the State
If a contributor cannot make a path fully elegant yet, they must at least expose:
- provenance
- missing data
- stale data
- blockers
- override details

Observable truth is preferred over smooth deception.

---

# 24. Working Amendment Rule

This constitution may evolve.
But amendments must:
- be explicit
- state the reason
- state what problem they solve
- not weaken single-source truth, provenance, validation, or anti-heuristic protections without strong justification

---

# 25. Final Governing Principle

ACE must never become a system where multiple polite lies agree with each other more often than they agree with reality.

Every task must reduce that risk.

If a change makes the system:
- more canonical
- more inspectable
- more validated
- less heuristic
- less duplicated

then it is constitutionally aligned.

If it does the opposite, it should not land.

