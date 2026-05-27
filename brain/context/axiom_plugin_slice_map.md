# AXIOM Plugin Slice Map

Generated: 2026-05-18T13:32:16.213Z

Source of lifecycle truth: `AXIOM/apps/plugin-builder/plugins/*/manifest.json`, `lifecycle.json`, packages, and registry.
This file is planner-support context only.

## Lifecycle

`draft -> generated -> validated -> packaged -> registered -> active -> suspended -> rejected`

Generated output is a proposal. Do not activate or treat a plugin as runtime truth before validation, packaging, registration, and explicit activation.

## Status Counts

- generated: 1
- registered: 4
- rejected: 7

## Validation

- passed: true
- no errors or warnings

## Plugins

### boundedskilldocumentsaver

- name: BoundedSkillDocumentSaver
- version: 0.1.0
- status: registered
- validated: true
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: false
- implementation mismatch: false
- capability gap: Bridge missing AXIOM capability: AXIOM needs a bounded document/skill saver so approved operating notes can be saved from the editor into safe project folders.
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: true
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\boundedskilldocumentsaver-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\boundedskilldocumentsaver-0.1.0.axpkg

### bridge-editor-gap

- name: Bridge editor gap
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: true
- implementation mismatch: false
- capability gap: Bridge missing AXIOM capability: RenderPipeline
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\bridge-editor-gap-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\bridge-editor-gap-0.1.0.axpkg

### capabilitydependencypressurefield

- name: CapabilityDependencyPressureField
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: implementation_bearing_plugin_proposal
- placeholder only: false
- implementation mismatch: true
- implementation mismatch reason: source exports viewport navigation code but capability gap is non-viewport
- capability gap: Implementation-bearing plugin proposal for: create_capability_dependency_pressure_field
- entrypoint exists: true
- test exists: true
- integration contract exists: true
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\capabilitydependencypressurefield-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\capabilitydependencypressurefield-0.1.0.axpkg

### editor-file-patch

- name: Viewport Navigation Plugin
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: true
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: Implement bounded document saving for AXIOM operating skill markdown files.
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\editor-file-patch-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\editor-file-patch-0.1.0.axpkg

### file-io-patch

- name: Viewport Navigation Plugin
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: true
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: BoundedSkillDocumentSaver is currently only a stub. Generate implementation-bearing code for a bounded document saver command that accepts path, content, and overwrite, enforces safe relative paths, and returns a save receipt.
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\file-io-patch-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\file-io-patch-0.1.0.axpkg

### fs-write-bounded

- name: Viewport Navigation Plugin
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: true
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: bounded file writing tool for saving approved operating documents, skill markdown files, and plugin workspace files inside approved project folders (docs/, docs/skills/, pluginbuilder_workspace/, pluginbuilder_finished/) with safety checks: reject absolute paths outside AXIOM project root, reject ../ traversal, reject edits to server core, node_modules, .env, package files, launcher scripts, require overwrite: true for replacing existing files, return applied:true only after successful write, return before/after existence status, return full receipt with path, bytes_written, timestamp
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\fs-write-bounded-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\fs-write-bounded-0.1.0.axpkg

### mesh-edit-mode-plugin

- name: mesh_edit_mode_plugin
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: true
- implementation mismatch: false
- capability gap: Bridge missing AXIOM capability: vertex manipulation/edit mode for selected mesh model
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\mesh-edit-mode-plugin-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\mesh-edit-mode-plugin-0.1.0.axpkg

### plugin-persistence-handler

- name: plugin-persistence-handler
- version: 0.1.0
- status: rejected
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: implementation_bearing_plugin_proposal
- placeholder only: false
- implementation mismatch: true
- implementation mismatch reason: source exports viewport navigation code but capability gap is plugin-persistence
- capability gap: Implementation-bearing plugin proposal for: Make registered active plugins persist across AXIOM restarts - add persisted enabled/autoload state, auto-activate enabled_on_boot plugins on boot, remove enabled_on_boot on deactivate, autoload only registered+validated plugins
- entrypoint exists: true
- test exists: true
- integration contract exists: true
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\plugin-persistence-handler-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\plugin-persistence-handler-0.1.0.axpkg

### safe-write-project-file

- name: safe_write_project_file
- version: 0.1.0
- status: registered
- validated: true
- capabilities: mcp-tool-expose, project-file-patch
- implementation: safe_write_project_file
- placeholder only: false
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: safe_write_project_file
- entrypoint exists: true
- test exists: true
- integration contract exists: true
- package bundle exists: true
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\safe-write-project-file-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\safe-write-project-file-0.1.0.axpkg

### viewportnavigationimplementation

- name: ViewportNavigationImplementation
- version: 0.1.0
- status: registered
- validated: true
- capabilities: ui-command-palette, event-subscribe
- implementation: implementation_bearing_plugin_proposal
- placeholder only: false
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: AXIOM viewport navigation is incomplete
- entrypoint exists: true
- test exists: true
- integration contract exists: true
- package bundle exists: true
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationimplementation-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationimplementation-0.1.0.axpkg

### viewportnavigationimplementationpatch

- name: ViewportNavigationImplementationPatch
- version: 0.1.0
- status: generated
- validated: false
- capabilities: ui-command-palette, event-subscribe
- implementation: implementation_bearing_plugin_proposal
- placeholder only: false
- implementation mismatch: false
- capability gap: Implementation-bearing plugin proposal for: ViewportNavigationImplementation crashes during WASD movement because orbitTarget.set is not a function
- entrypoint exists: true
- test exists: true
- integration contract exists: true
- package bundle exists: false
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationimplementationpatch-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationimplementationpatch-0.1.0.axpkg

### viewportnavigationplugin

- name: ViewportNavigationPlugin
- version: 0.1.0
- status: registered
- validated: true
- capabilities: ui-command-palette, event-subscribe
- implementation: none
- placeholder only: false
- implementation mismatch: false
- capability gap: Bridge missing AXIOM capability: AXIOM viewport navigation is incomplete
- entrypoint exists: true
- test exists: true
- integration contract exists: false
- package bundle exists: true
- bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationplugin-0.1.0.axpkg
- canonical bundle path: C:\Users\felix\Desktop\Automated_AI_Pipeline\AXIOM\apps\plugin-builder\packages\viewportnavigationplugin-0.1.0.axpkg

