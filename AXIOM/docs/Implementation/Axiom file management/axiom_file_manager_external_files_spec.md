# AXIOM File Manager, External File Authority, Project Save/Load & Agent Access Specification v1

## 0. Purpose

AXIOM needs a file manager that is not merely a visual file browser. It must become the editor's shared authority seam for project awareness, external file inspection, safe mutation, scene/project/plugin persistence, and agent-visible filesystem context.

The File Manager must answer, reliably:

- What project is AXIOM currently operating on?
- What files and folders exist?
- Which paths are trusted, brittle, missing, external, generated, or unsafe?
- What tools can read, create, edit, validate, or register files?
- What has actually been changed, saved, loaded, verified, or rejected?
- What should chat, MSOL, plugins, and the viewport treat as current truth?

The blunt bit: if AXIOM cannot see its own files honestly, it cannot repair itself honestly. Otherwise we are back to fancy AI buttons poking a black box with a stick.

---

## 1. Current grounding

The current `axiom-editor.html` already contains the beginnings of this system:

- Left panel tabs: Scene, Props, Plugins, Stream, Code, Files.
- Code Viewer panel with path input and `FileManagerRuntime.openPath(...)`.
- File Manager panel with path input, Scan, Health, Save Scene, Load Scene, Verify.
- MCP quick-call panel with tool selector, parameter JSON box, and result output.
- `SkillRuntime`, which already discovers markdown skills from filesystem paths through MCP.
- `AgenticToolUseLoop`, which classifies intent lanes and routes to tools.
- `FileManagerRuntime`, exposed as `window.FileManagerRuntime` and `window.AXIOM_FILE_MANAGER`.
- MSOL capability registration for File Manager Path Awareness.

This spec formalises those pieces into one coherent contract.

---

## 2. Design principle

### 2.1 File Manager is a shared authority, not a tab

The Files tab is only one surface. The actual system is:

```txt
FileManagerRuntime
  owns file/path/project/file-receipt authority

Files Panel
  visual inspection surface

Code Viewer
  file preview/edit context surface

Chat Agent
  intent entry surface

MSOL
  capability/provenance/contract graph surface

MCP/SSE Bridge
  external filesystem/tool execution bridge

Project Registry
  canonical project/session persistence
```

No surface should invent file truth locally.

### 2.2 Never confuse these four things

AXIOM must explicitly separate:

| Thing | Meaning |
|---|---|
| Existing file | A path exists on disk or in a virtual file store |
| Selected file | The UI currently has this file focused |
| Loaded file | AXIOM has read and cached this file |
| Registered file | AXIOM has classified this file as part of the active project, plugin, scene, skill, asset, or config |

A file being visible in the browser does **not** mean it is safe, registered, canonical, or mutable.

---

## 3. Core object model

### 3.1 ProjectRoot

Represents the active workspace root.

```json
{
  "id": "project_root_current",
  "path": "C:/Users/felix/Desktop/Automated_AI_Pipeline/AXIOM",
  "kind": "local_filesystem",
  "trust": "trusted_root",
  "createdAt": "ISO_DATE",
  "lastScannedAt": "ISO_DATE",
  "source": "launcher|manual|localStorage|mcp|imported_project_file",
  "status": "active|missing|unverified|external"
}
```

Rules:

- AXIOM must always know the active project root before allowing write operations.
- Relative paths must resolve against the active project root.
- Absolute paths outside the project root are external and require a stronger validation path.

### 3.2 FileNode

Represents a file or directory known to AXIOM.

```json
{
  "id": "file:src/mcp/server.js",
  "name": "server.js",
  "path": "src/mcp/server.js",
  "absolutePath": "C:/.../AXIOM/src/mcp/server.js",
  "kind": "file|directory",
  "extension": ".js",
  "sizeBytes": 12345,
  "modifiedAt": "ISO_DATE|null",
  "hash": "sha256|null",
  "classification": "source|config|scene|plugin|skill|asset|generated|receipt|unknown",
  "trust": "trusted_project|external|generated|unsafe|missing",
  "readable": true,
  "writable": false,
  "registered": false,
  "owner": "FileManagerRuntime",
  "provenance": {
    "discoveredBy": "fs_ls|fs_find|manual|import|recent",
    "discoveredAt": "ISO_DATE"
  }
}
```

### 3.3 FileSnapshot

Represents a specific read of a file.

```json
{
  "path": "public/axiom-editor.html",
  "hash": "sha256",
  "sizeBytes": 100000,
  "readAt": "ISO_DATE",
  "contentPreview": "first N chars",
  "contentTruncated": true,
  "encoding": "utf-8",
  "readerTool": "fs_cat|safe_read_project_file|browser_local|uploaded_file"
}
```

Snapshots are evidence, not current truth forever.

### 3.4 FileMutationProposal

Represents a proposed edit before applying.

```json
{
  "proposalId": "patch_abc123",
  "targetPath": "public/axiom-editor.html",
  "operation": "replace|append|create|delete|move|rename|json_patch",
  "expectedFind": "string or null",
  "replacement": "string or null",
  "newContent": "string or null",
  "reason": "why this change exists",
  "requestedBy": "chat|MSOL|plugin_builder|manual",
  "createdAt": "ISO_DATE",
  "risk": "low|medium|high|blocked",
  "status": "proposed|validated|rejected|applied|failed",
  "validation": null
}
```

### 3.5 FileMutationReceipt

Represents the truth of what happened.

```json
{
  "receiptId": "file_receipt_abc123",
  "proposalId": "patch_abc123|null",
  "operation": "read|scan|create|edit|delete|register|save|load|verify",
  "targetPath": "public/axiom-editor.html",
  "ok": true,
  "applied": true,
  "beforeHash": "sha256|null",
  "afterHash": "sha256|null",
  "tool": "safe_write_project_file",
  "createdAt": "ISO_DATE",
  "errors": [],
  "warnings": [],
  "provenance": {
    "sourceSurface": "chat|files_panel|code_viewer|cli|msol",
    "agentTurnId": "turn_id|null",
    "mcpRequestId": "request_id|null"
  }
}
```

Receipts are mandatory for anything that changes state.

---

## 4. Authority model

### 4.1 FileManagerRuntime

Owns:

- Current project root.
- Last scan result.
- Selected file/path state.
- File health diagnostics.
- File operation receipts.
- Read/open routing.
- Save/load verification.
- Chat command handling for file actions.
- MSOL capability publication.

It does **not** own:

- Scene object truth.
- Plugin runtime activation truth.
- MSOL capability truth.
- Model output truth.

It may read and route to those systems, but must not silently become them.

### 4.2 SceneManager

Owns live in-browser scene state.

FileManager may persist or load scene state, but `SceneManager` remains the live scene authority.

### 4.3 PluginRegistry

Owns active in-browser plugin registration.

FileManager may discover plugin files and read manifests, but plugin activation must route through `PluginRegistry` or a plugin manager backend.

### 4.4 MSOL

Owns capability graph semantics.

FileManager publishes capabilities and file relations into MSOL, but MSOL should not perform raw filesystem mutation directly.

### 4.5 MCP/SSE Bridge

Owns communication with external filesystem tools.

FileManager should treat MCP as a bridge, not as truth. Every MCP result must be normalised into FileManager receipts/context before being shown as AXIOM state.

---

## 5. Required internal bridges

### 5.1 FileManager ↔ MCP Bridge

Purpose: scan/read/write/verify real project files.

Required MCP tools:

```txt
fs_ls
fs_find
fs_cat
fs_grep
safe_read_project_file
safe_write_project_file
safe_write_documentation
file_stat
file_hash
file_validate
project_manifest_read
project_manifest_write
```

Minimum viable current compatibility:

- Use `fs_ls` for listing.
- Use `fs_find` for broad discovery.
- Use `fs_cat` or `safe_read_project_file` for reading.
- Use `safe_write_project_file` for edits.
- Use `fs_grep` for targeted diagnostics.

New methods that should be added if absent:

#### `file_stat`

```json
{
  "path": "string"
}
```

Returns:

```json
{
  "ok": true,
  "exists": true,
  "kind": "file|directory",
  "sizeBytes": 123,
  "modifiedAt": "ISO_DATE",
  "hash": "sha256|null"
}
```

#### `file_hash`

```json
{
  "path": "string",
  "algorithm": "sha256"
}
```

#### `file_validate_path`

Checks path safety before read/write.

```json
{
  "path": "string",
  "operation": "read|write|delete|scan",
  "projectRoot": "string"
}
```

Returns:

```json
{
  "ok": true,
  "normalisedPath": "string",
  "insideProjectRoot": true,
  "risk": "low|medium|high|blocked",
  "reasons": []
}
```

#### `file_apply_patch`

A safer patch operation than raw write.

```json
{
  "target_path": "string",
  "expected_find": "string",
  "replacement": "string",
  "mode": "single_replace|multi_replace",
  "create_backup": true
}
```

Returns before/after hashes and whether the expected find matched exactly.

### 5.2 FileManager ↔ Code Viewer Bridge

Purpose: opening a file from Files should show it in Code Viewer.

Contract:

```js
FileManagerRuntime.openPath(path, {
  targetSurface: 'code_viewer',
  readMode: 'preview|full',
  maxChars: 20000
})
```

Expected behaviour:

1. Validate path.
2. Read file through safest available read tool.
3. Render preview in Code Viewer.
4. Store FileSnapshot.
5. Emit receipt.
6. Update selected file state.
7. Offer chat context injection.

### 5.3 FileManager ↔ Chat Bridge

Purpose: chat can ask for file operations without pretending.

Supported chat forms:

```txt
scan files
scan path apps/plugin-builder
open axiom-editor.html
read public/axiom-editor.html
find WorldFieldOverlay
grep FileManagerRuntime in axiom-editor.html
create file docs/foo.md with ...
edit file X replace Y with Z
verify save/load
save scene
load scene
register plugin from path X
show file health
```

Chat must route these through `FileManagerRuntime.handleChatCommand()` or `AXIOM_FILE_MANAGER.action()`.

Chat must not:

- Claim a file was edited unless a receipt says `applied: true`.
- Claim a file exists unless scan/stat/read confirms it.
- Register a plugin just because a manifest looks plausible.
- Treat model-generated file content as applied project state.

### 5.4 FileManager ↔ MSOL Bridge

Purpose: file/project relations become visible in the capability graph.

FileManager should publish these MSOL nodes:

```txt
FileManagerCapability
ProjectRootCapability
FilesystemInspectionCapability
SafeWriteCapability
ScenePersistenceCapability
PluginFileRegistrationCapability
ExternalFileBridgeCapability
PathHealthDiagnosticsCapability
```

MSOL edges:

```txt
FileManagerCapability consumes MCPToolRegistry
FileManagerCapability consumes SSEBridgeCapability
FileManagerCapability provides PathAwareness
FileManagerCapability provides FileOperationReceipts
ScenePersistenceCapability consumes SceneGraphCapability
PluginFileRegistrationCapability consumes PluginRegistryCapability
ExternalFileBridgeCapability consumes FilePathTrustPolicy
SafeWriteCapability requires PreflightValidationCapability
```

MSOL inspector should show:

- Current project root.
- Last scan path and result count.
- Health verdict.
- Missing tools.
- Recent receipts.
- Current selected file.
- External file warnings.
- Which systems consume FileManager authority.

### 5.5 FileManager ↔ SceneManager Bridge

Purpose: save/load scene state safely.

Scene save/load must distinguish:

| State | Owner |
|---|---|
| Live scene state | SceneManager |
| Scene save file | FileManager / ProjectPersistence |
| Scene manifest registration | ProjectRegistry |
| Scene load preview | FileManager |
| Applied loaded scene | SceneManager |

Scene save contract:

```json
{
  "schema": "axiom.scene.v1",
  "sceneId": "scene_default",
  "savedAt": "ISO_DATE",
  "editorVersion": "0.1.0",
  "objectCount": 1,
  "objects": [],
  "camera": {},
  "selection": null,
  "provenance": {
    "savedBy": "FileManagerRuntime.saveScene",
    "source": "SceneManager.getSceneState"
  }
}
```

Scene load process:

1. Read scene file.
2. Validate schema.
3. Preview load result.
4. Check object type support.
5. Prepare apply plan.
6. Apply to SceneManager.
7. Verify resulting live scene equals expected object summary.
8. Emit load receipt.

No direct blind load into live scene.

---

## 6. Path trust policy

Every path must be classified before action.

### 6.1 Path classes

| Class | Meaning | Read | Write |
|---|---|---:|---:|
| `trusted_project` | Inside active project root | yes | yes, via safe write |
| `trusted_generated` | AXIOM-generated artefact folder | yes | yes, receipts required |
| `external_readonly` | Outside project root but allowed for read | yes | no by default |
| `external_write_blocked` | Outside root and write requested | maybe | no |
| `unsafe_path` | traversal, system folder, unknown drive risk | no | no |
| `missing` | does not exist | maybe create | only create if parent trusted |

### 6.2 Brittle path detection

File health should flag:

- Hardcoded absolute paths.
- Old moved project roots.
- Mixed slashes causing duplicate identity.
- References to missing files.
- References to plugin-builder paths that no longer exist.
- Skills path mismatch.
- File panel path resolving differently from MCP server root.
- Browser localStorage save/load only when project save is expected.

### 6.3 Normalisation rules

FileManager must normalise:

- `\` to `/` internally.
- `./` and `../` safely.
- Case-insensitive comparisons on Windows.
- URL-ish paths separately from filesystem paths.
- Sandbox/uploaded paths separately from local project paths.

---

## 7. File operation contracts

### 7.1 Scan path

```js
AXIOM_FILE_MANAGER.action('scan_path', { path: '.' })
```

Returns:

```json
{
  "ok": true,
  "action": "scan_path",
  "path": ".",
  "entries": [],
  "receipt": {},
  "warnings": []
}
```

Required behaviour:

- Validate path.
- Use MCP listing/find tools.
- Classify each file.
- Store last scan.
- Render Files panel list.
- Emit MSOL update.

### 7.2 Open/read file

```js
AXIOM_FILE_MANAGER.action('open_path', {
  "path": "axiom-editor.html",
  "targetSurface": "code_viewer"
})
```

Required behaviour:

- Validate path.
- Read file.
- Store snapshot.
- Render Code Viewer.
- Show truncation status.
- Provide `Send to Chat` and `Inspect in MSOL` actions.

### 7.3 Create file

```js
AXIOM_FILE_MANAGER.action('create_file', {
  "path": "docs/file-manager-spec.md",
  "content": "...",
  "mode": "create_new|overwrite_blocked|overwrite_allowed"
})
```

Rules:

- Default must block overwrite.
- Parent folder must be trusted.
- Receipts mandatory.
- Newly created file is not automatically registered unless requested.

### 7.4 Edit file

```js
AXIOM_FILE_MANAGER.action('edit_file', {
  "path": "public/axiom-editor.html",
  "expectedFind": "old text",
  "replacement": "new text",
  "mode": "single_replace"
})
```

Rules:

- Must require `expectedFind` for patch-like edits.
- Must reject if expected find is missing or ambiguous, unless explicit full-file write mode is used.
- Must record before/after hash.
- Must run validation hooks for recognised file types.

### 7.5 Delete file

Delete should be disabled in v1 unless a safe trash/quarantine system exists.

Allowed replacement:

```txt
move_to_quarantine
```

### 7.6 Register file

Registration links a file to a system.

```js
AXIOM_FILE_MANAGER.action('register_file', {
  "path": "apps/plugin-builder/docs/skills/foo.md",
  "as": "skill|plugin|scene|asset|config"
})
```

Registration must validate the file type first.

---

## 8. Validation and verification

### 8.1 File validation by type

| Type | Validation |
|---|---|
| `.json` | parse JSON, optional schema |
| `.js` / `.mjs` | syntax parse/preflight where possible |
| `.html` | basic DOM parse, script tag scan, duplicate id scan |
| `.md` | markdown skill/doc structure if registered as skill/doc |
| plugin manifest | schema + required entry file exists |
| scene file | `axiom.scene.v1` schema |
| project manifest | `axiom.project.v1` schema |

### 8.2 Preflight gates

Any file edit that can affect AXIOM boot must run:

```txt
path validate
read before hash
patch dry run
syntax/preflight validation
write
read after hash
post-write validation
receipt
```

For `axiom-editor.html`, at minimum:

- Confirm HTML contains required root IDs.
- Confirm no duplicate critical IDs.
- Confirm required runtime objects are present.
- Confirm script parses if practical.
- Confirm FileManagerRuntime and SSEBridge exposure still exists.

### 8.3 Save/load verification

Scene save/load verification must test:

1. Save current scene to local browser persistence.
2. Read saved payload.
3. Validate schema.
4. Load into scene.
5. Compare object count and object summaries.
6. Emit receipt.

Project save/load verification must test:

1. Save project manifest.
2. Re-read manifest.
3. Validate paths exist.
4. Validate scene/plugin/skill references.
5. Confirm no external write-blocked paths are registered as mutable.

---

## 9. Project model

### 9.1 Project manifest

AXIOM should persist one project manifest.

Suggested path:

```txt
.axiom/project.json
```

Schema:

```json
{
  "schema": "axiom.project.v1",
  "projectId": "axiom_current",
  "name": "AXIOM",
  "root": ".",
  "createdAt": "ISO_DATE",
  "updatedAt": "ISO_DATE",
  "scenes": [
    {
      "id": "default_scene",
      "path": "scenes/default.scene.json",
      "active": true
    }
  ],
  "plugins": [
    {
      "id": "ViewportNavigationImplementation",
      "manifestPath": "plugins/ViewportNavigationImplementation/plugin.json",
      "status": "registered|active|disabled|invalid"
    }
  ],
  "skills": [
    {
      "id": "axiom.architecture.integrity.v1",
      "path": "apps/plugin-builder/docs/skills/architecture.md"
    }
  ],
  "filePolicy": {
    "trustedRoots": ["."],
    "externalReadRoots": [],
    "writeBlockedGlobs": ["node_modules/**", ".git/**"]
  },
  "lastOpened": {
    "sceneId": "default_scene",
    "files": []
  }
}
```

### 9.2 Project open

Project open flow:

1. Resolve root.
2. Read `.axiom/project.json` if present.
3. If absent, create an unregistered project session in memory.
4. Scan key folders.
5. Validate manifest references.
6. Publish ProjectRoot into MSOL.
7. Render Files panel.
8. Chat announces project state only if user asks or if blockers exist.

### 9.3 Project save

Project save writes:

- Project manifest.
- Active scene reference.
- Recent opened files.
- Registered plugin/skill references.
- Health summary as derived metadata.

Project save must not dump volatile chat history into core manifest by default.

---

## 10. Scene persistence

### 10.1 Scene file path

Default:

```txt
scenes/default.scene.json
```

### 10.2 Scene save command surfaces

All of these must route to the same authority:

```txt
File menu → Save
CLI → save
Files tab → Save Scene
Chat → save scene
MSOL mutation/action → save scene
```

All call:

```js
FileManagerRuntime.saveScene({ target: 'project|localStorage', path })
```

### 10.3 LocalStorage vs project save

Current browser-only save/load is acceptable as an emergency fallback, but must be labelled:

```txt
Persistence: browser localStorage fallback
Not project file save
```

Proper project save must write to disk through MCP.

---

## 11. Plugin file handling

### 11.1 Plugin discovery

Plugin discovery scans known plugin folders:

```txt
plugins/
apps/plugin-builder/plugins/
apps/plugin-builder/generated/
```

Looks for:

```txt
plugin.json
manifest.json
package.json with axiom plugin field
src/index.js
```

### 11.2 Plugin registration states

| State | Meaning |
|---|---|
| discovered | plugin-like files found |
| validated | manifest and entry file valid |
| registered | added to PluginRegistry/project manifest |
| active | runtime init succeeded |
| failed | validation/init failed |
| quarantined | blocked due to safety/contract issue |

### 11.3 Plugin repair requirement

AXIOM must support file-level plugin repair, not just broad proposal generation.

Required new tool:

```txt
axiom_plugin_repair
```

Input:

```json
{
  "plugin_id": "ViewportNavigationImplementation",
  "target_file": "src/index.js",
  "error": "Uncaught TypeError: t.set is not a function",
  "repair_instruction": "Replace unsafe orbitTarget.set calls with helper supporting THREE.Vector3 and plain objects",
  "include_files": true,
  "expected_find_required": true
}
```

Output:

```json
{
  "ok": true,
  "proposalId": "plugin_repair_abc",
  "filesInspected": [],
  "patches": [],
  "validationPlan": [],
  "risk": "low|medium|high"
}
```

Plugin Builder must preserve runtime evidence. It must not reduce concrete errors to generic capability gaps. That's how we end up with nonsense repairs, and frankly, that's how the robot starts eating glue again.

---

## 12. MSOL representation

### 12.1 Capability node

`FileManagerCapability`

Fields:

```json
{
  "id": "FileManagerCapability",
  "category": "data",
  "authority": "FileManagerRuntime",
  "provides": [
    "PathAwareness",
    "FileInspection",
    "SafeFileMutation",
    "ScenePersistence",
    "ProjectManifestPersistence",
    "PluginFileRegistration",
    "FileOperationReceipts"
  ],
  "consumes": [
    "MCPToolRegistry",
    "SSEBridgeCapability",
    "SceneGraphCapability",
    "PluginRegistryCapability",
    "SkillRuntimeCapability"
  ],
  "health": {
    "verdict": "healthy|degraded|blocked|unknown",
    "issues": []
  }
}
```

### 12.2 File relation graph

MSOL should show relations like:

```txt
ProjectRoot
  owns .axiom/project.json
  owns scenes/default.scene.json
  owns public/axiom-editor.html
  references apps/plugin-builder/docs/skills

FileManagerCapability
  reads ProjectRoot
  publishes FileReceipts
  routes ChatFileIntent
  verifies ScenePersistence

PluginRegistryCapability
  registers PluginManifest

SkillRuntimeCapability
  registers MarkdownSkillFile
```

### 12.3 MSOL query examples

MSOL should answer:

```txt
What paths are brittle?
Which files are external?
What changed most recently?
What tools can write files?
Can AXIOM safely edit axiom-editor.html?
Which plugins are discovered but not registered?
Which files affect boot?
What save/load proof exists?
```

---

## 13. Files panel UI specification

### 13.1 Top strip

The Files tab should show:

```txt
Project: AXIOM
Root: C:/.../AXIOM
Trust: trusted_project
MCP: connected/degraded/offline
Write: enabled/read-only/blocked
```

### 13.2 Path toolbar

Buttons:

```txt
Scan
Health
Find
Grep
Refresh
Open Root
```

Path box must support:

- Relative path.
- Absolute path read-only warning.
- Recent paths dropdown.
- Breadcrumb rendering.

### 13.3 Health card

Should show:

```txt
Verdict: healthy/degraded/blocked
Missing tools: fs_cat, safe_write_project_file, etc.
Brittle paths: count
External paths: count
Save/load status
Last receipt
```

### 13.4 File tree/list

Rows should include:

```txt
icon | name | classification | trust | status | modified/hash badge
```

Badges:

```txt
SRC
SCENE
PLUGIN
SKILL
CONFIG
GEN
EXT
MISSING
WRITABLE
READONLY
BOOT
```

### 13.5 File details drawer

When selecting a file:

- Path.
- Absolute path.
- Classification.
- Trust.
- Size/hash/modified.
- Read/open status.
- Registered as.
- Recent receipts.
- Buttons:
  - Open in Code Viewer
  - Send context to Chat
  - Inspect in MSOL
  - Validate
  - Register as...
  - Propose edit

### 13.6 Write operations in UI

Editing should not be buried in the file tree.

Use a guarded mutation card:

```txt
Target path
Operation
Expected find
Replacement preview
Risk
Validate button
Apply button only after validation
Receipt after apply
```

---

## 14. Code Viewer specification

The Code tab should become a read/preview surface first, edit surface second.

Required features:

- Open selected file.
- Show path and trust badge.
- Show truncation warning.
- Syntax highlighting later, plain preview now.
- Copy path.
- Send selection/file summary to Chat.
- Validate file.
- Propose patch from selected text.
- Show last read hash.

Do not make the Code Viewer a silent unsaved editor until save/apply contracts exist.

---

## 15. Chat / agent access

### 15.1 Runtime context injected into chat

Chat should receive compact file context only when relevant.

```json
{
  "fileManager": {
    "available": true,
    "projectRoot": "...",
    "selectedFile": "public/axiom-editor.html",
    "lastScan": { "path": ".", "entryCount": 42 },
    "health": { "verdict": "degraded", "issueCount": 2 },
    "supportedActions": ["scan_path", "open_path", "read_file", "create_file", "edit_file", "validate_file", "save_scene", "load_scene"]
  }
}
```

### 15.2 Agentic lane additions

Add lanes:

```js
file_read: ['fs_cat', 'safe_read_project_file', 'fs_grep', 'fs_ls']
file_write_proposal: ['safe_write_project_file']
file_validation: ['file_validate', 'file_stat', 'file_hash']
project_persistence: ['project_manifest_read', 'project_manifest_write']
scene_persistence: ['scene_save', 'scene_load', 'safe_write_project_file']
plugin_repair: ['axiom_plugin_repair', 'axiom_plugin_inspect']
```

### 15.3 Chat response rules

When chat performs a file action it must show:

```txt
Action
Tool used
Target path
Applied: true/false
Receipt id
Next validation step
```

It must not just say “done”. That word is banned until the receipt says so. Tiny dictatorship, but a useful one.

---

## 16. Receipts and history

### 16.1 Receipt storage

Short term:

```txt
localStorage: axiom.file.receipts.v1
```

Proper project storage:

```txt
.axiom/receipts/file-ops.jsonl
```

JSONL is preferred because receipts append cleanly.

### 16.2 Receipt types

```txt
file.scan
file.read
file.create
file.patch.proposed
file.patch.applied
file.patch.rejected
file.validate
file.register
scene.save
scene.load
scene.verify
project.save
project.load
plugin.discover
plugin.register
plugin.repair.proposed
plugin.repair.applied
```

### 16.3 Receipt visibility

Receipts should surface in:

- Files panel health card.
- File details drawer.
- Chat response.
- MSOL inspector.
- CLI output.
- Stream panel if SSE event exists.

---

## 17. External files

### 17.1 External read

External files may be read if:

- User selected them manually, or
- Path is inside an approved external read root, or
- A tool result discovered them as dependency evidence.

They must be labelled:

```txt
EXTERNAL READ-ONLY
```

### 17.2 External write

External write is blocked by default.

To support it later, require:

- Explicit trusted external root registration.
- Per-root write policy.
- Receipts.
- Backup/quarantine.

### 17.3 Imported external file

When importing external content into AXIOM:

```txt
external file → import copy → project file → registered project file
```

Never mutate the original by accident.

---

## 18. Failure handling

### 18.1 If MCP is offline

Files panel should still show:

- Browser-local saved scene status.
- Last known scan.
- Last receipts.
- Clear warning: real filesystem unavailable.

Writes must be blocked unless local fallback explicitly applies.

### 18.2 If scan fails

Show:

```txt
Path
Tool attempted
Error
Possible reason
Suggested next action
```

### 18.3 If write fails

Write receipt must include:

- `applied: false`
- error
- whether file was untouched
- before hash if available
- rollback status if applicable

### 18.4 If validation fails after write

The system must mark state as:

```txt
applied_but_validation_failed
```

This is not the same as success. Do not let the UI go green because the write call returned HTTP 200. That's how the gremlins get in.

---

## 19. Backend/API route recommendations

AXIOM should eventually move filesystem authority out of the monolithic HTML and into backend routes.

Suggested routes:

```txt
GET  /api/files/health
POST /api/files/scan
POST /api/files/read
POST /api/files/stat
POST /api/files/validate
POST /api/files/propose-patch
POST /api/files/apply-patch
POST /api/files/register
GET  /api/files/receipts

GET  /api/project/current
POST /api/project/open
POST /api/project/save
POST /api/project/validate

GET  /api/scene/current
POST /api/scene/save
POST /api/scene/load-preview
POST /api/scene/apply-load
POST /api/scene/verify-save-load

POST /api/plugins/discover
POST /api/plugins/register
POST /api/plugins/repair
```

Frontend `FileManagerRuntime` then becomes a client-side adapter, not the whole filesystem brain.

---

## 20. Implementation phases

### Phase 1 — Harden current browser runtime

- Keep current Files and Code tabs.
- Formalise `AXIOM_FILE_MANAGER.action()`.
- Add standard receipt format.
- Improve health diagnostics.
- Route chat file commands through FileManager.
- Surface selected file context to chat and MSOL.

### Phase 2 — Real project root and manifest

- Add `.axiom/project.json`.
- Add project root detection.
- Add project save/load.
- Replace browser-only scene save with project scene file save.
- Keep localStorage as fallback only.

### Phase 3 — Safe mutation path

- Add path validation.
- Add patch proposal model.
- Add expected-find patch apply.
- Add pre/post hashes.
- Add validation hooks.
- Add write receipts.

### Phase 4 — Plugin/skill/file registration

- Discover plugin manifests.
- Register plugin files through validated state.
- Wire `axiom_plugin_repair`.
- Improve SkillRuntime file discovery receipts.
- Show registered files in MSOL.

### Phase 5 — Backend extraction

- Move file actions to backend routes.
- Keep frontend runtime as adapter.
- Add tests.
- Add recovery-safe file inspection surface.

---

## 21. Acceptance tests

### Test: file scan works

```txt
Given MCP is connected
When user scans project root
Then Files panel lists entries
And FileManager stores lastScan
And MSOL shows scan count
And a file.scan receipt exists
```

### Test: code viewer opens file

```txt
Given a file exists
When user opens it from Files panel
Then Code Viewer shows content preview
And selected file state updates
And a file.read receipt exists
```

### Test: unsafe external write blocked

```txt
Given path is outside project root
When chat requests edit
Then FileManager rejects write
And receipt says applied:false
And chat reports blocked path
```

### Test: scene save/load verified

```txt
Given scene has objects
When user saves scene
Then a scene file/local fallback is written
When user verifies save/load
Then object count and object summaries match
And scene.verify receipt exists
```

### Test: plugin repair preserves evidence

```txt
Given plugin error includes concrete stack/message
When AXIOM requests plugin repair
Then repair tool receives plugin id, file, error, instruction, include_files:true
And output contains file-level patch proposal
And generic capability gap is not accepted as sufficient
```

### Test: chat cannot lie about write

```txt
Given safe_write_project_file is unavailable
When user asks chat to edit a file
Then chat must say blocked
And must not claim the file was edited
```

---

## 22. Non-goals for v1

Do not build these yet:

- Full VS Code clone.
- Arbitrary recursive delete.
- Git replacement.
- Multi-user file locking.
- Binary asset editing.
- Live collaborative editing.
- Automatic sweeping writes across the repo.
- Agent free-write mode.

Tiny steps, big machine. We are building the crane before asking it to juggle chainsaws.

---

## 23. Final target behaviour

The intended end-state:

```txt
User: Fix the broken viewport plugin.

AXIOM:
1. Finds the plugin files.
2. Reads the manifest and source.
3. Preserves the runtime error as evidence.
4. Proposes a file-level patch.
5. Validates the patch against expected text/hash.
6. Applies only through safe write.
7. Runs syntax/preflight checks.
8. Registers the result.
9. Updates Files panel, Plugin panel, MSOL, Chat, and receipts.
10. Clearly says whether the fix is applied, verified, or blocked.
```

That is the line between an AI-themed editor and an AI-native development environment.

