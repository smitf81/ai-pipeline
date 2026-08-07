# AXIOM File Manager Slice 18 Verification Report

Date: 2026-06-02

## Slice Continued

Slice 18 - Register file as skill/scene/plugin/config.

## Target

AXIOM can register validated project files into the project manifest and expose
that ownership without confusing registration with plugin activation.

## Implementation

- Added `FileManagerRuntime.registerFile({ path, as })`.
- Supported registration classes:
  - `skill`
  - `scene`
  - `plugin`
  - `config`
  - `asset`
- Added validation gates:
  - target path must be project-relative and pass register path policy
  - class must be one of the supported registration classes
  - skill files must be markdown and parse through `SkillRuntime`
  - scene files must pass the AXIOM scene schema
  - plugin files must be valid plugin manifests with readable entry files
  - config files must parse as JSON
  - asset files require stat proof and are never mutated
- Added strict manifest gates:
  - registration requires a filesystem-read project manifest
  - registration requires a filesystem-applied project manifest save
  - degraded localStorage/default manifest state blocks registration
- Extended project manifest normalization/validation with:
  - `configs`
  - `assets`
- Updated manifest references for registered files.
- Added manifest-backed registered status in the Files panel.
- Enabled the Selected File `Register` button with inferred class registration.
- Added exact chat registration syntax:

```txt
register skill file docs/example.md
register scene file scenes/default.scene.json
register plugin file plugins/example/plugin.json
register plugin from path plugins/example/plugin.json
register file config/example.json as config
```

- Added `file.register` receipts.
- Updated MSOL inspect data to include registered files from the manifest.
- Updated FileManager/MSOL capability metadata for Slice 18.

## Registration / Activation Boundary

Plugin manifest registration creates a project-manifest candidate only:

```txt
PluginRegistry.candidate_only_no_activation
```

It does not call `PluginRegistry.register(...)` and does not activate runtime
plugin code.

## Validation

Commands run:

```txt
node --check AXIOM/apps/launcher/server.js
inline script parse for AXIOM/apps/launcher/public/axiom-editor.html
Slice 18 source invariant check
```

Results:

```txt
server syntax: pass
browser script parse: pass
source invariants: pass
```

## Scope Guard

Black Sky Bound gameplay code was not modified. This slice only changed AXIOM
file/project-management source and documentation.

## Caveats

- Live registration acceptance was not run in this sandbox turn.
- Asset registration requires stat tooling; missing stat capability blocks
  asset registration loudly.
- Project manifest registration is intentionally stricter than older manifest
  save behavior. LocalStorage/default manifest state is not accepted as a
  registration base.

## Next Slice

Slice 19 - Plugin repair contract integration.
