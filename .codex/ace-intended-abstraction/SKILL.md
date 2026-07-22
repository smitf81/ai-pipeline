---
name: ace-intended-abstraction
description: Enforce honest abstraction-tier labeling in ACE work. Use when defining, reviewing, implementing, exporting, or summarizing ACE slices, experiments, structures, schemas, or PRs where computed outputs must match a specific semantic abstraction tier and must not be mislabeled or over-promoted.
---

# ACE Intended Abstraction

Prevent abstraction drift in ACE work. Distinguish between what is computed internally, what is exported, and what the exported structure is allowed to mean.

## Abstraction Tiers

### Tier 0 - Raw computation

Treat direct low-level artifacts as Tier 0.

Examples:
- pixels
- arrays
- ownership grids
- seed positions
- scalar buffers

### Tier 1 - Derived mechanical groupings

Treat direct rearrangements or comparisons of low-level computation as Tier 1.

Examples:
- per-seed cells
- border masks
- adjacency from direct grid comparison
- unmerged clusters
- direct ownership partitions

### Tier 2 - Semantic primitives

Treat synthesized, meaningful units that survive beyond the implementation detail as Tier 2.

Examples:
- meaningful regions
- stable anchors
- frontiers
- corridors
- field emitters with semantic intent

### Tier 3 - Behavioural or system constructs

Treat planner-facing or role-bearing structures as Tier 3.

Examples:
- tasks
- affordances
- build zones
- tactical areas
- planner-facing structures

## Required Process

Before proposing code, a schema, exported names, or a PR summary:

1. State the target abstraction tier.
2. State which lower tiers are allowed internally.
3. State the final exported tier.
4. State forbidden reductions or simplifications.
5. State the honest downgrade label if the target tier is not actually reached.

Use this block whenever the task is relevant:

- Target tier:
- Internal implementation tier(s):
- Final exported tier:
- Forbidden simplifications:
- Downgrade label if needed:
- Promotion requirement to next tier:

## Rules

- Use lower-tier structures internally when useful.
- Label final outputs by what they actually mean, not by what they are hoped to become.
- Do not label Tier 1 outputs as Tier 2 primitives.
- Do not label Tier 2 outputs as Tier 3 constructs unless they directly support that role.
- Downgrade names explicitly when the requested target tier is not achieved.
- Prefer an honest lower-tier export over a semantically inflated name.

## Semantic Validation Test

Call something a semantic primitive only if it:

- aggregates or synthesizes lower-level computation into a meaningful unit
- is not a 1:1 relabeling of internal computational partitions
- remains useful as an ACE-facing structure independent of the implementation detail that produced it

If any check fails, keep or downgrade the structure to Tier 1 unless stronger evidence exists.

## Output and Naming Guidance

- Separate internal computation names from exported API names.
- Name exported structures according to current semantics, not future intent.
- If the target is not achieved, rename the export to the honest lower-tier term.

Examples:
- `perSeedOwnershipCells` instead of `regions` when the output is still a direct partition
- `mergedRegions` only after real synthesis or merging creates a meaningful region abstraction
- `candidateBuildZones` only after a planner-facing role is supported by the structure

## Review Behaviour

When reviewing ACE PRs or designs:

1. Identify the actual implemented tier.
2. Compare it with the intended tier.
3. Flag naming inflation or semantic overclaim.
4. Recommend the smallest honest rename or export change.
5. State what promotion work is still required.

## Slice-Writing Behaviour

When writing slices, prompts, or task briefs:

- specify the intended abstraction tier explicitly
- specify which lower-tier fallbacks are acceptable
- forbid mislabeled exports
- define what promotion work is required to move to the next tier

## Canonical Examples

- Per-seed JFA ownership cells = Tier 1
- Merged provenance-aware regions = Tier 2
- Region selected as a build zone by a planner = Tier 3
