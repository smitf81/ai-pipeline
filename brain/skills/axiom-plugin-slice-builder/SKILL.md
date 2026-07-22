---
name: axiom-plugin-slice-builder
description: Build, audit, validate, package, and register governed AXIOM plugin slices through the AXIOM plugin-builder app. Use when creating a plugin proposal, generating an implementation-bearing plugin patch, inspecting plugin lifecycle status, fixing manifest/lifecycle/integration-contract drift, packaging .axpkg bundles, registering plugins, or validating AXIOM plugin governance without modifying core AXIOM files directly.
---

# Axiom Plugin Slice Builder

Use this skill when the work belongs in AXIOM's governed plugin system rather than as a direct AXIOM core edit.

## Source Files

Start with:

- `AXIOM/apps/plugin-builder/README.md`
- `AXIOM/apps/plugin-builder/src/builder/index.js`
- `AXIOM/apps/plugin-builder/src/validator.js`
- `AXIOM/apps/plugin-builder/src/builder/templates.js`
- target plugin under `AXIOM/apps/plugin-builder/plugins/<plugin-id>/`

## Lifecycle Rule

Generated plugin output is a proposal until it passes the full lifecycle:

`draft -> generated -> validated -> packaged -> registered -> active`

Do not activate, register, or describe a plugin as runtime truth before validation, packaging, registration, and explicit activation have occurred.

## Commands

Use repo-local commands:

```bash
.\run.cmd axiom:plugin:check
.\run.cmd axiom:plugin:map
.\run.cmd axiom:plugin:repair-bundles
.\run.cmd axiom:plugin:smoke
.\run.cmd --cwd AXIOM/apps/plugin-builder test
```

Build a supported implementation slice end-to-end:

```bash
.\run.cmd axiom:plugin:build-safe-write
node tools/axiom-plugin-slice.mjs --build-slice --plugin-id <plugin-id> --gap "<gap>" --target-area <area>
```

When the local AXIOM model/agent has generated candidate files, use the candidate landing lane rather than stopping at planning:

- `axiom_plugin_build_from_candidate`: write candidate files, validate, package, and register; failed validation returns exact errors plus a retry prompt.
- `axiom_plugin_model_build_slice`: ask the local Ollama model for a candidate, then run the same landing lane.

Inspect one plugin:

```bash
node tools/axiom-plugin-slice.mjs --plugin <plugin-id>
```

Reject a placeholder-only generated gap that did not produce real implementation:

```bash
node tools/axiom-plugin-slice.mjs --reject-placeholder <plugin-id> --reason "<why this is not real>"
```

## Slice Workflow

1. Define the capability gap and target area.
   - If the literal gap may hide a required second step, use `brain/skills/negative-space-intent-reasoning/SKILL.md` to separate the stated request from the goal-preserving requirement.
2. Decide whether a generated proposal, template plugin, or implementation-bearing proposal is appropriate.
3. Prefer `--build-slice` for supported implementation generators when the user expects an artifact to be validated, packaged, and registered.
4. Use `create_from_gap` only for honest scaffold/template work. It must refuse implementation-heavy unsupported gaps unless a placeholder is explicitly requested.
5. Use `generate_patch` only when a proposal is acceptable; it does not by itself prove validation, packaging, registration, activation, or persistence.
6. For unsupported implementation gaps, route to `axiom_plugin_model_build_slice` or `axiom_plugin_build_from_candidate` so the local model gets a chance to produce code and the validator returns concrete pass/fail feedback.
7. Create or update only the plugin folder under `AXIOM/apps/plugin-builder/plugins/<plugin-id>/`.
8. Maintain required files:
   - `manifest.json`
   - `lifecycle.json`
   - `src/index.js`
   - `tests/plugin.test.js`
   - `README.md`
   - `integration-contract.json` for implementation-bearing proposals
9. Keep `safety.may_modify_core=false` unless the plugin is explicitly proposal-only and guarded.
10. Validate before packaging. Package before registration. Register before activation.
11. Run `.\run.cmd axiom:plugin:smoke` before claiming the plugin-builder lifecycle works.
12. If `axiom:plugin:check` reports stale bundle paths, run `.\run.cmd axiom:plugin:repair-bundles` and regenerate the map.

## Validation Requirements

- Manifest includes required fields from `src/validator.js`.
- Capabilities are in the allowed capability set.
- Entrypoint exports `onLoad` and `onActivate`.
- Implementation-bearing proposals export install and uninstall functions, declare required runtime APIs, guard missing runtime APIs, and include an integration contract.
- Registered or active plugins must have `validation_status.passed=true`.
- Registered or active plugins must point at existing canonical package bundles.
- Plugins must not silently modify AXIOM core files.
- Placeholder-only generated gaps must be rejected or replaced with a real implementation-bearing proposal.
- Implementation-bearing proposals must match their capability gap. Viewport-navigation source in a non-viewport plugin is a rejection, not a partial success.
- The plugin-builder may register packaged plugins, but runtime activation/persistence belongs to the AXIOM runtime loader.

## Output Shape

When using this skill, report:

- plugin id
- capability gap
- target area
- lifecycle status before and after
- files changed
- validation/package/register commands run
- package or receipt result when applicable
- remaining activation blockers
