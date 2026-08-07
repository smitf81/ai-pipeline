# Structured Audit Framework Standards Pack

## Purpose

Use these standards to audit a bounded subsystem without drifting into redesign or generic review. The audit must answer who owns truth, what is evidence, what is canonical, and where authority is broken or ambiguous.

## Evidence model

Every meaningful claim should identify:

- implementation module or function
- route, job, or CLI entrypoint
- persisted output or artefact path
- consumer surface
- whether the output is canonical, derived, artefactual, mirrored, sidecar, UI-only, or unclear

If evidence is missing, mark the claim `blocked` or `unverifiable`.

## Canonical classifications

- `canonical_source`: authoritative state or registry
- `derived_projection`: computed view built from canonical state
- `evidence_artefact`: generated record proving something happened
- `compatibility_mirror`: mirrored output kept for compatibility
- `sidecar_state`: auxiliary persisted state with limited authority
- `ui_summary`: display-oriented summary, never assumed canonical
- `unclear`: classification cannot be established from repo evidence

## Audit standards

### `qa.truth-publication.v1`

Audit whether QA evidence flows into a shared authoritative QA publication seam before being consumed upstream.

#### `QA-TP-001`
- Single explicit authoritative publisher for current QA posture.

#### `QA-TP-002`
- QA evidence producers may be multiple, but they must remain evidence producers, not competing truth publishers.

#### `QA-TP-003`
- Planner-, CTO-, and other upstream-facing QA decisions must read from the authoritative QA publication seam, not arbitrary artefacts.

#### `QA-TP-004`
- QA lead/adjudicator role must be explicit, not inferred only through naming.

#### `QA-TP-005`
- Generated QA summaries or `latest` files must not be treated as canonical truth unless explicitly owned and declared as such.

#### `QA-TP-006`
- Provenance linking raw QA evidence to escalated QA posture must be retained.

#### `QA-TP-007`
- Detect whether executor or external QA bypasses QA lead publication.

### `canonical.artefact-separation.v1`

Audit whether the system clearly distinguishes canonical state from generated artefacts, projections, and summaries.

#### `CA-001`
- Canonical source-of-truth objects must be explicitly named or registry-backed.

#### `CA-002`
- Generated reports must not implicitly acquire behavioural authority.

#### `CA-003`
- Derived projections must identify their source backbone or owner.

#### `CA-004`
- Compatibility mirrors and sidecars must not silently drift into authority roles.

#### `CA-005`
- Higher-level consumers must read canonical truth for current posture and separate evidence stores for historical detail.

#### `CA-006`
- Identify every place a `latest`, `summary`, or `report` file risks being mistaken for canonical truth.

### `boot.governance.v1`

Audit whether boot-critical failures are classified, surfaced, and handled through governed paths rather than ad hoc manual fixes.

#### `BG-001`
- Boot-critical assets and required modules must be explicitly classifiable.

#### `BG-002`
- Boot failure state must remain observable through a recovery-safe surface.

#### `BG-003`
- Repair attempts must be evidence-backed and bounded.

#### `BG-004`
- Repair artefacts must not be mistaken for resolved truth unless canonical boot posture updates.

#### `BG-005`
- Manual override paths must retain provenance.

### `patch.acceptance.v1`

Audit whether patches, proposals, and diffs remain proposals until accepted through a governed seam.

#### `PA-001`
- Patch proposals must be distinguishable from live state.

#### `PA-002`
- Acceptance and rejection authority must be explicit.

#### `PA-003`
- Preflight and validation evidence must be tied to the proposal.

#### `PA-004`
- Rejected proposals must not appear as active truth.

#### `PA-005`
- Historical patch artefacts must remain inspectable without confusing activation status.

## Output schema

### Audit header
- audit target
- audit standard
- audit date/time
- scope
- repo areas inspected
- scope limitations

### Evidence producers table

Include:

- producer
- module
- output type
- persisted output path
- immediate consumer
- via lead/adjudicator
- classification
- notes

### Findings

Use this schema:

- Finding ID
- Rule
- Severity
- Verdict
- Summary
- Why it matters
- Evidence
- Affected owner
- Recommended response

## Structural verdict selection

Prefer the most specific verdict supported by evidence:

- `sound`: structure and authority chain are coherent
- `sound_but_incompletely_wired`: the design is right but wiring is partial
- `ambiguous_contract`: ownership or truth boundaries are unclear
- `fragmented_publication`: multiple publication paths compete
- `unsafe_truth_chain`: authority or truth flow is structurally misleading

## Narrow recommendation rules

- keep recommendations small
- keep them structural
- avoid cosmetic cleanup
- avoid broad rewrites
- avoid “improve architecture” language without a concrete seam
