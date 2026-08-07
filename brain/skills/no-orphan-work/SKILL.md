---
name: no-orphan-work
description: Prevent disconnected work products. Use when creating files, panels, routes, helpers, tests, docs, plugins, assets, or generated artifacts that must be wired into ACE/AXIOM rather than left as unused islands.
---

# No Orphan Work

Use this skill before creating or finishing any artifact that could sit disconnected from the real product.

## Core Rule

Every non-temporary artifact needs a parent, a consumer, and a proof path.

## Orphan Types

- File with no import, route, registry entry, or loader.
- Route with no caller.
- UI with no backend truth source.
- Backend capability with no UI, automation, or documented operator path.
- Test that does not guard the changed behavior.
- Doc that is not linked from the relevant operational or canonical index.
- Plugin proposal not in the plugin lifecycle.
- Generated asset not referenced by runtime or manifest.

## Connection Check

Before claiming completion, answer:

- Who owns this artifact?
- Who reads or calls it?
- How does it become live?
- How is it discovered after restart or reload?
- What proves it is connected?
- If it is intentionally standalone, where is that stated?

## Failure Mode

The agent creates a plausible file or surface and reports progress, but nothing in ACE/AXIOM actually uses it.

## Output Requirement

Report:

- Artifact:
- Owner:
- Consumer/caller:
- Activation/discovery path:
- Proof it is not orphaned:
