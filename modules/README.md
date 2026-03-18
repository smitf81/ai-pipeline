# ACE Modules

This folder is the home for ACE-compatible modules.

Each module follows a deterministic contract:

`Intent -> Structured Artifact -> Validated Output`

## Contract goals

- clear inputs
- structured outputs
- validation hooks
- agent-compatible invocation

## Folder layout

- `schemas/base-module.schema.json` - universal module contract
- `schemas/shared-artifact.schema.json` - typed artifact backbone used across modules
- `schemas/module-interface.schema.json` - shared agent callable interface
- `schemas/specialized/*.schema.json` - module-specific artifact payload shapes
- `examples/material_gen.module.json` - example module manifest using standard pipeline stages

## Standard pipeline stages

1. `plan` - intent -> structured specification
2. `generate` - raw creation
3. `refine` - constraints and correction enforcement
4. `validate` - hard checks with pass/fail output
5. `export` - target engine output conversion

## Validation principle

Assume generated output is wrong until proven valid by explicit checks.
