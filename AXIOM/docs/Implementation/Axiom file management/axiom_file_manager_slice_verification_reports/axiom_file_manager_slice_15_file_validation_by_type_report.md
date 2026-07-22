# AXIOM File Manager Slice 15 Verification Report

Date: 2026-06-02

## Slice Continued

Slice 15 - File validation by type.

## Target

Project files must be validated before registration or mutation. Validation
must route through FileManager, return structured results, and emit
`file.validate` receipts instead of relying on path-policy-only placeholders.

## Implementation

- Added `FileManagerRuntime.validateFile(path, options)`.
- Added validation result shape:

```js
{
  ok,
  path,
  classification,
  verdict: 'valid|warning|invalid|blocked',
  checks: [],
  errors: [],
  warnings: []
}
```

- Added scoped text reading for validation through existing project read tools.
  If read tools or path trust are unavailable, validation returns `blocked`.
- Added type validators:
  - `.json` parses as JSON.
  - `.scene.json` parses JSON and validates the AXIOM scene schema.
  - `.axiom/project.json` validates the file as written against
    `axiom.project.v1` without normalising defaults into it.
  - `.md` verifies readable non-empty markdown and reports optional skill
    fields as warnings when absent.
  - `.html` checks required AXIOM root IDs, script presence, and duplicate
    critical IDs.
  - `.js/.mjs` runs classic-script syntax preflight where possible and reports
    module syntax as a degraded static check when backend preflight is not
    available.
  - plugin manifests require exact `id`, `name`, and `entry` fields, then probe
    entry readability.
- Replaced the old `content_validation_lands_in_slice_15` placeholder action.
- Added Validate actions in both Files selected-file details and the Code Viewer.
- Added `lastValidation` to FileManager state and selected-file details.
- Exposed `validateFile` through `FileManagerRuntime` and `AXIOM_FILE_MANAGER`.
- Updated MSOL FileManager capability metadata to expose file validation.

## Validation

Commands run:

```txt
node --check AXIOM/apps/launcher/server.js
inline script parse for AXIOM/apps/launcher/public/axiom-editor.html
Slice 15 source invariant check
Slice 15 validator branch check
project manifest fail-loud validation check
git diff --check -- AXIOM/apps/launcher/public/axiom-editor.html
```

Results:

```txt
server syntax: pass
browser script parse: pass
source invariants: pass
validator branches: pass
project manifest raw validation: pass
diff check: pass, with Git LF-to-CRLF warning only
```

## Scope Guard

Black Sky Bound gameplay code was not modified. It remained outside the write
scope for this AXIOM file/project-management slice.

## Caveats

- Live browser validation of `axiom-editor.html` was not run in this turn; the
  Browser control tool was not exposed after discovery in the prior slice.
- JavaScript module syntax validation is explicitly degraded unless a future
  backend syntax/preflight tool is available. It is reported as a warning, not a
  silent pass.
- Plugin manifest validation requires the exact planned `entry` field. Legacy
  `main`/`module` aliases are not accepted.

## Next Slice

Slice 16 - Safe create file.
