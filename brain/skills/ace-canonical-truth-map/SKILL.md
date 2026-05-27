---
name: ace-canonical-truth-map
description: Map ACE canonical truth ownership before implementation. Use when changing ACE/AXIOM domains such as workspace, runtime, truth kernel, intent, desk properties, QA evidence, execution provenance, agent/desk identity, planner state, or any code path that risks duplicate truth, UI-local fallbacks, stale projections, label-based identity, or unclear mutation authority.
---

# Ace Canonical Truth Map

Use this skill before editing behavior that answers a domain question: "what is true, who owns it, who may mutate it, and which projections may display it?"

## Canonical Source

Read `brain/emergence/canonical_truth_domains.json` first. It is the canonical truth-domain registry.

Use `brain/context/canonical_truth_map.md` as a generated planner-support view only. Refresh it with:

```bash
.\run.cmd truth:map
```

Check the registry with:

```bash
.\run.cmd truth:check
```

Look up one domain with:

```bash
node tools/canonical-truth-map.mjs --domain <domainId>
```

## Implementation Workflow

1. Name the domain being changed.
2. Read its registry entry: system of record, canonical owner, mutation authority, and allowed projections.
3. Search for divergent paths with `rg` using domain terms, route names, helper names, and data file paths.
4. Classify each path as canonical, projection, mutation authority, stale duplicate, UI fallback, historical, or unknown.
5. Modify the canonical owner or reroute callers to it.
6. Remove or explicitly quarantine stale duplicate logic.
7. Validate through the smallest runtime smoke that covers the domain.

## Divergence Rules

- Do not create a second source of truth.
- Do not infer identity from labels when IDs or records exist.
- Do not let UI state become operational truth.
- Do not let history, pending state, cached state, or generated context override live canonical truth.
- Do not add fallback chains that silently degrade canonical data.
- If a needed domain is missing from the registry, pause implementation long enough to add or clarify the domain.

## Output Shape

When using this skill for a change, report:

- domain
- canonical owner
- mutation authority
- divergent paths found
- files changed
- stale logic removed or rerouted
- validation command and result
