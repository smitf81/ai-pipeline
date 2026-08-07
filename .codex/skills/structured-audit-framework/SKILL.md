---
name: structured-audit-framework
description: Perform bounded, standards-based repository audits for QA authority chains, canonical truth publication, artefact-vs-truth separation, boot governance, and patch acceptance. Use when Codex must inspect repo evidence, classify outputs, evaluate explicit rules, and return structured findings with a structural verdict and narrow recommendations.
---

# Structured Audit Framework

Use this skill to inspect a bounded subsystem as an independent auditor, not as a redesign partner.

## Overview

Determine what exists now, who owns authority, how evidence and truth move, where contracts are broken or ambiguous, and what small structural seam should be hardened next.

## Operating rules

- Stay bounded to the selected target and audit standard.
- Inspect repo-grounded evidence only.
- Distinguish canonical truth from derived outputs and artefacts.
- Prefer explicit ambiguity over invented certainty.
- Produce findings only when supported by evidence.
- Recommend only small, structural next steps.
- Do not redesign the subsystem or give cosmetic advice.
- Do not patch code unless the user explicitly asks for implementation.

## Workflow

1. Lock scope.
- Restate target, standard, inspected areas, and exclusions.

2. Extract topology.
- Identify components, producers, aggregators, consumers, persisted outputs, routes, tests, and declared contracts.

3. Classify outputs.
- Classify each important output as one of:
  - `canonical_source`
  - `derived_projection`
  - `evidence_artefact`
  - `compatibility_mirror`
  - `sidecar_state`
  - `ui_summary`
  - `unclear`

4. Evaluate rules.
- Test the selected audit standard against repo evidence.
- Mark any unsupported claim as `blocked` or `unverifiable`.

5. Emit findings.
- Return structured findings only where warranted.

6. Choose verdict.
- Select one overall structural verdict.

7. Recommend narrowly.
- Suggest only the smallest seam-hardening next step.

## Required output

Return these sections in order:

1. Audit header
2. Executive summary
3. Current topology
4. Evidence producers table
5. Truth publication map
6. Findings
7. Artefact vs truth audit
8. Structural verdict
9. Narrow recommendations
10. Open questions

## Finding format

Each finding must include:

- Finding ID
- Rule
- Severity
- Verdict
- Summary
- Why it matters
- Evidence
- Affected owner
- Recommended response

## Structural verdicts

Choose one:

- `sound`
- `sound_but_incompletely_wired`
- `ambiguous_contract`
- `fragmented_publication`
- `unsafe_truth_chain`

## Supported standards

See [standards-pack.md](references/standards-pack.md) for the rule sets, evidence model, and audit templates.
