# AXIOM File Manager v0 → v1 Implementation Plan

## Scope

This plan implements the behaviour defined in:

**AXIOM File Manager, External File Authority, Project Save/Load & Agent Access Specification v1**

It is written so a third-party junior developer, AI coding agent, or future AXIOM repair agent can implement the system in slices without needing to understand the whole cursed cathedral at once.

The main deliverable is not “a nicer file browser”.

The main deliverable is:

```txt
A governed file authority seam that can scan, read, classify, create, edit, validate, register, save, load, verify, and expose file/project state to Files panel, Code Viewer, MSOL, Chat, CLI, and agent tool routing.
```

---

## Global implementation rules

These apply to every slice.

1. **No silent mutation**
   Any create/edit/save/load/register operation must produce a receipt.

2. **No UI-only truth**
   The Files panel, Code Viewer, Chat, and MSOL must all read from FileManager state, not invent separate state.

3. **No pretending MCP is always available**
   If MCP/SSE tools are missing, mark filesystem access degraded and block project-file writes.

4. **No blind full-file rewrites in early slices**
   Patch/edit operations must use expected-find replacement or a guarded explicit full-write mode.

5. **No external writes by default**
   Anything outside project root is read-only unless future policy explicitly allows it.

6. **No plugin activation through file discovery alone**
   Discovering a plugin file is not the same as validating, registering, or activating it.

7. **No scene load without preview + validation**
   Scene load must validate schema and supported object types before mutating the live scene.

8. **Every slice must be independently verifiable**
   If a slice cannot be verified, it is not done. It is just vibes in a trench coat.

---

## Version ladder

| Version | Meaning |
|---|---|
| v0.0 | Current partial Files/Code tab runtime exists but is not authoritative |
| v0.1 | FileManager core state + receipt model exists |
| v0.2 | Path policy + scan/read/open flow works |
| v0.3 | Files panel and Code Viewer consume FileManager state cleanly |
| v0.4 | Project root and project manifest introduced |
| v0.5 | Scene save/load/verify works through FileManager |
| v0.6 | Chat/CLI agent access routes through FileManager |
| v0.7 | MSOL file/project capability graph is live |
| v0.8 | Safe create/edit/validate path works |
| v0.9 | Plugin/skill registration and repair contract exists |
| v1.0 | Full file authority seam verified end-to-end |

---

# Slice 0 — Baseline audit and guardrail snapshot

## Goal

Capture current behaviour before changing anything.

## Files likely touched

None, unless adding test notes.

## Tasks

1. Open current AXIOM editor.
2. Verify these current surfaces exist:
   - Files tab
   - Code tab
   - Stream/MCP tool tab
   - Chat panel
   - MSOL dock
   - CLI
3. Search current code for:
   - `FileManagerRuntime`
   - `AXIOM_FILE_MANAGER`
   - `SkillRuntime`
   - `SSEBridge`
   - `AgenticToolUseLoop`
   - `MSOLRuntime`
4. Record current MCP tool names if available.
5. Record current localStorage keys used by file/skill/scene runtime.

## Deliverable

A short baseline note:

```txt
Current FileManager status:
- Files tab present: yes/no
- Code viewer present: yes/no
- MCP connected: yes/no
- FileManagerRuntime exposed: yes/no
- AXIOM_FILE_MANAGER exposed: yes/no
- Save/load currently uses: localStorage/project file/both/unknown
- Known blockers:
```

## Verification

Manual:

- Editor boots.
- No new regressions.
- Browser console has no new errors.
- Baseline note exists.

CLI/browser console checks:

```js
typeof window.FileManagerRuntime
Boolean(window.AXIOM_FILE_MANAGER)
typeof window.SkillRuntime
typeof window.SSEBridge
```

Expected:

```txt
FileManagerRuntime and AXIOM_FILE_MANAGER should exist or this is marked as a baseline blocker.
```

## Done when

The implementer knows what currently exists and has not changed behaviour yet.

---

# Slice 1 — FileManager core state and public action contract

## Goal

Create one stable FileManager authority API that every surface can call.

## Version target

v0.1

## Files likely touched

- `public/axiom-editor.html` or extracted FileManager module if modularised
- Optional: `src/file-manager/FileManagerRuntime.js` if project supports modules

## Tasks

1. Add/standardise a central FileManager state object:

```js
const FileManagerState = {
  projectRoot: null,
  selectedPath: null,
  lastScan: null,
  lastSnapshot: null,
  health: null,
  receipts: [],
  filesByPath: new Map(),
  capabilities: {
    canRead: false,
    canWrite: false,
    canScan: false,
    mcpAvailable: false
  }
};
```

2. Add a public action router:

```js
AXIOM_FILE_MANAGER.action(type, payload)
```

Supported initial actions:

```txt
get_state
set_project_root
scan_path
open_path
check_health
save_scene_local
load_scene_local
verify_save_load_local
```

3. Every action returns a normalised result:

```js
{
  ok: true,
  action: 'scan_path',
  applied: false,
  result: {},
  receipt: null,
  warnings: [],
  errors: []
}
```

4. Add helper methods:

```js
FileManagerRuntime.getState()
FileManagerRuntime.emitStateChanged(reason)
FileManagerRuntime.addReceipt(receipt)
FileManagerRuntime.getReceipts(limit)
```

5. Expose:

```js
window.FileManagerRuntime = FileManagerRuntime;
window.AXIOM_FILE_MANAGER = { action: FileManagerRuntime.action };
```

## Verification

Browser console:

```js
await AXIOM_FILE_MANAGER.action('get_state', {})
await AXIOM_FILE_MANAGER.action('check_health', {})
FileManagerRuntime.getReceipts(5)
```

Expected:

- Returns structured result.
- Does not throw.
- Health result exists even if degraded.
- Receipts array exists.

## Acceptance criteria

- There is one public action entrypoint.
- No panel directly mutates FileManager internals.
- Every action returns the same response shape.
- Current UI still boots.

---

# Slice 2 — Receipt model v1

## Goal

Make reads, scans, saves, loads, validation, and future writes auditable.

## Version target

v0.1

## Files likely touched

- FileManager runtime
- Optional storage helper

## Tasks

1. Add receipt creator:

```js
createFileReceipt({
  operation,
  targetPath,
  ok,
  applied,
  tool,
  beforeHash,
  afterHash,
  warnings,
  errors,
  provenance
})
```

2. Persist receipts to localStorage short term:

```txt
axiom.file.receipts.v1
```

3. Add receipt types:

```txt
file.health
file.scan
file.read
scene.save.local
scene.load.local
scene.verify.local
```

4. Update existing Save Scene, Load Scene, Verify methods to produce receipts.

5. Add UI-visible last receipt summary to Files health card.

## Verification

Browser console:

```js
await AXIOM_FILE_MANAGER.action('check_health', {})
FileManagerRuntime.getReceipts(1)
localStorage.getItem('axiom.file.receipts.v1')
```

Expected:

- Latest receipt has `operation: file.health`.
- Receipt includes timestamp, ok, applied, operation, targetPath or null.
- Receipts survive page refresh.

## Acceptance criteria

- Every FileManager action that observes or changes state can produce a receipt.
- Mutating actions always produce receipts.
- Receipts are visible in health/debug output.

---

# Slice 3 — Path normalisation and trust policy

## Goal

Prevent brittle/unsafe path confusion before expanding scan/write features.

## Version target

v0.2

## Files likely touched

- FileManager runtime

## Tasks

1. Add path utility functions:

```js
normalisePath(path)
isAbsoluteWindowsPath(path)
isPathTraversal(path)
joinProjectPath(root, path)
classifyPath(path, projectRoot)
```

2. Add trust classes:

```txt
trusted_project
trusted_generated
external_readonly
external_write_blocked
unsafe_path
missing
unknown
```

3. Add `validatePath(path, operation)`:

```js
{
  ok,
  path,
  normalisedPath,
  trust,
  insideProjectRoot,
  risk,
  reasons
}
```

4. Use this validator in:

- scan
- open/read
- create/edit placeholders
- scene/project save paths

5. Update health card to show:

```txt
Project root: set/missing
External path count
Unsafe path attempts
Brittle path warnings
```

## Verification

Browser console:

```js
FileManagerRuntime.validatePath('.', 'scan')
FileManagerRuntime.validatePath('../secret.txt', 'read')
FileManagerRuntime.validatePath('C:/Windows/System32/test.txt', 'write')
FileManagerRuntime.validatePath('public/axiom-editor.html', 'read')
```

Expected:

- `../secret.txt` is medium/high risk or blocked depending root.
- `C:/Windows/...` write is blocked.
- Project file read is allowed if root is configured.
- All results include reasons.

## Acceptance criteria

- No read/write/scan path bypasses validation.
- External write is blocked by default.
- Relative paths resolve consistently.

---

# Slice 4 — MCP tool capability detection

## Goal

FileManager knows exactly which external filesystem tools are available.

## Version target

v0.2

## Files likely touched

- FileManager runtime
- SSEBridge adapter if needed
- Stream/MCP panel only if tool list needs exposure

## Tasks

1. Add tool discovery adapter:

```js
FileManagerRuntime.refreshToolCapabilities()
```

2. Detect available tools:

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
```

3. Store capability booleans:

```js
capabilities: {
  mcpAvailable,
  canScan,
  canRead,
  canGrep,
  canWrite,
  canStat,
  canHash,
  canValidate
}
```

4. Health should report missing but desired tools.

5. Add fallback classification:

```txt
healthy: scan+read+safe_write available
read_only: scan+read available, safe_write missing
degraded: partial tools
blocked: no MCP bridge
```

## Verification

Browser console:

```js
await FileManagerRuntime.refreshToolCapabilities()
await AXIOM_FILE_MANAGER.action('check_health', {})
```

Expected:

- Health shows MCP state.
- Missing tools listed clearly.
- Write actions blocked if safe write missing.

## Acceptance criteria

- FileManager never assumes tools exist.
- UI can explain degraded state.
- Chat can see supported file actions.

---

# Slice 5 — Real scan path implementation

## Goal

Scan a folder and render classified FileNodes.

## Version target

v0.2

## Files likely touched

- FileManager runtime
- Files panel render function

## Tasks

1. Implement:

```js
FileManagerRuntime.scanPath(path)
```

2. Use preferred tool order:

```txt
fs_ls → fs_find fallback → unavailable error
```

3. Normalise results into FileNode objects.

4. Classify files:

```txt
.js/.mjs → source
.html → source/editor_surface
.json → config or scene/project depending schema/name
.md → documentation or skill candidate
plugin.json/manifest.json → plugin_manifest
.scene.json → scene
node_modules/.git → ignored/protected
unknown → unknown
```

5. Store:

```js
state.lastScan
state.filesByPath
```

6. Emit receipt:

```txt
file.scan
```

7. Render Files panel list from state, not raw MCP output.

## Verification

UI:

- Open Files tab.
- Enter `.`.
- Press Scan.
- File rows appear.
- Health/last receipt updates.

Browser console:

```js
const r = await AXIOM_FILE_MANAGER.action('scan_path', { path: '.' })
r.ok
r.result.entries.length
FileManagerRuntime.getState().lastScan
```

Expected:

- Scan returns ok if MCP scan tool exists.
- Entries are normalised.
- Each entry has path, kind, classification, trust.

## Acceptance criteria

- Files panel is backed by FileManager state.
- Scan failure is explicit, not silent.
- Receipts prove scan occurred.

---

# Slice 6 — Open/read file into Code Viewer

## Goal

Open files from FileManager and preview them in Code Viewer safely.

## Version target

v0.3

## Files likely touched

- FileManager runtime
- Code Viewer panel
- Files panel click handler

## Tasks

1. Implement:

```js
FileManagerRuntime.openPath(path, options)
FileManagerRuntime.readFile(path, options)
```

2. Preferred read tool order:

```txt
safe_read_project_file → fs_cat → unavailable error
```

3. Create FileSnapshot:

```js
{
  path,
  hash,
  sizeBytes,
  readAt,
  contentPreview,
  contentTruncated,
  readerTool
}
```

4. Update:

- `state.selectedPath`
- `state.lastSnapshot`
- Code Viewer path input
- Code Viewer preview
- File details summary

5. Add Files row click:

```txt
single click = select
open button/double click = open in Code Viewer
```

6. Emit receipt:

```txt
file.read
```

## Verification

UI:

- Scan root.
- Open `axiom-editor.html` or another text file.
- Code tab shows preview.
- Preview has path and status.

Browser console:

```js
await AXIOM_FILE_MANAGER.action('open_path', { path: 'axiom-editor.html', targetSurface: 'code_viewer' })
FileManagerRuntime.getState().lastSnapshot
```

Expected:

- Snapshot exists.
- Content preview exists.
- Receipt exists.
- Large files show truncation warning.

## Acceptance criteria

- Code Viewer does not read files independently.
- File read is validated and receipted.
- Chat can later inject selected file context from state.

---

# Slice 7 — Files panel UI authority pass

## Goal

Make the Files panel a trustworthy status surface.

## Version target

v0.3

## Files likely touched

- Files panel HTML/CSS/render functions
- FileManager runtime render integration

## Tasks

1. Add top project strip:

```txt
Project: name/root
Trust: trusted/degraded/blocked
MCP: connected/degraded/offline
Write: enabled/read-only/blocked
```

2. Add health card fields:

```txt
verdict
missing tools
brittle path count
external path count
last scan
last receipt
```

3. File rows show badges:

```txt
SRC / SCENE / PLUGIN / SKILL / CONFIG / EXT / READONLY / WRITABLE / BOOT
```

4. Add selected file detail block:

```txt
path
classification
trust
registered as
last read hash
actions
```

5. Add buttons:

```txt
Open in Code
Send to Chat
Inspect in MSOL
Validate
Register as...
```

Early versions may disable unavailable buttons but must show why.

## Verification

Manual:

- Scan root.
- Select a file.
- Details update.
- Open in Code works.
- Disabled actions explain missing capability.

Expected:

- No stale data if scan fails.
- No UI says writable when safe write is unavailable.

## Acceptance criteria

- Files panel reflects FileManager state only.
- Health status is understandable without opening console.
- User can diagnose missing MCP/write tools from panel.

---

# Slice 8 — Project root and project manifest v0

## Goal

AXIOM has an active project root and a manifest structure.

## Version target

v0.4

## Files likely touched

- FileManager runtime
- Project manifest helper
- Optional MCP write route/tool if needed

## Tasks

1. Add project root actions:

```txt
get_project
set_project_root
validate_project_root
```

2. Default root discovery order:

```txt
explicit user setting
localStorage axiom.project.root.v1
launcher-provided root if available
'.'
```

3. Define manifest path:

```txt
.axiom/project.json
```

4. Add manifest schema:

```js
{
  schema: 'axiom.project.v1',
  projectId,
  name,
  root,
  scenes: [],
  plugins: [],
  skills: [],
  filePolicy: {},
  lastOpened: {}
}
```

5. Implement read/create/update manifest functions:

```js
readProjectManifest()
createDefaultProjectManifest()
saveProjectManifest()
validateProjectManifest()
```

6. If safe write is not available, project manifest is in-memory/localStorage only and marked degraded.

## Verification

Browser console:

```js
await AXIOM_FILE_MANAGER.action('set_project_root', { path: '.' })
await AXIOM_FILE_MANAGER.action('get_project', {})
await AXIOM_FILE_MANAGER.action('save_project_manifest', {})
```

Expected:

- Project root exists in state.
- Manifest validates.
- If safe write unavailable, result clearly says project file save blocked/degraded.

## Acceptance criteria

- Active project root is visible in Files panel and MSOL.
- Manifest save/read is receipted.
- Missing project manifest does not crash editor.

---

# Slice 9 — Scene save/load local fallback formalisation

## Goal

Make current local scene save/load honest and receipted before project-file save.

## Version target

v0.5a

## Files likely touched

- FileManager runtime
- SceneManager bridge
- CLI save/load commands if needed

## Tasks

1. Formalise localStorage scene key:

```txt
axiom.scene.local.v1
```

2. Scene save payload:

```js
{
  schema: 'axiom.scene.v1',
  sceneId,
  savedAt,
  editorVersion,
  objectCount,
  objects,
  camera,
  selection,
  provenance
}
```

3. Implement:

```js
saveSceneToLocal()
loadSceneFromLocal({ previewOnly })
verifySaveLoad()
```

4. Verification compares:

- object count
- object names/types
- selected object if supported

5. UI must label:

```txt
Persistence: browser localStorage fallback, not project file save
```

## Verification

UI:

- Add sphere.
- Save Scene.
- Verify.
- Refresh page.
- Load Scene.

Browser console:

```js
await AXIOM_FILE_MANAGER.action('save_scene_local', {})
await AXIOM_FILE_MANAGER.action('verify_save_load_local', {})
```

Expected:

- Receipts: `scene.save.local`, `scene.verify.local`.
- Verification says match or mismatch with reasons.

## Acceptance criteria

- Existing save/load is no longer ambiguous.
- It is clearly labelled as local fallback.
- Verification proves object-level consistency.

---

# Slice 10 — Project scene file save/load

## Goal

Move from browser-only scene persistence to project-file scene persistence.

## Version target

v0.5b

## Files likely touched

- FileManager runtime
- Project manifest helper
- SceneManager bridge

## Tasks

1. Default project scene path:

```txt
scenes/default.scene.json
```

2. Implement:

```js
saveSceneToProject(path)
readSceneFile(path)
previewSceneLoad(path)
applySceneLoad(validatedScene)
verifyProjectSceneSaveLoad(path)
```

3. Scene load validation:

- JSON parse.
- `schema === axiom.scene.v1`.
- Objects array exists.
- Object types supported by SceneManager.
- Numeric transforms valid.

4. Save updates project manifest scenes array.

5. Load process:

```txt
read → validate → preview → apply → verify → receipt
```

6. If safe write missing, project scene save is blocked with clear reason.

## Verification

Manual with MCP write available:

- Add cube/sphere.
- Save scene to project.
- Confirm file exists via scan/open.
- Clear scene.
- Preview load.
- Apply load.
- Verify object count/types.

Browser console:

```js
await AXIOM_FILE_MANAGER.action('save_scene_project', { path: 'scenes/default.scene.json' })
await AXIOM_FILE_MANAGER.action('verify_scene_project', { path: 'scenes/default.scene.json' })
```

Expected:

- File exists.
- Manifest references it.
- Receipts exist.
- Scene restored correctly.

## Acceptance criteria

- Project scene save/load works through FileManager.
- Load never mutates scene before validation.
- Chat/CLI/File menu all call this same route where possible.

---

# Slice 11 — CLI and menu unification

## Goal

All save/load/file commands route through FileManager action API.

## Version target

v0.6a

## Files likely touched

- CLI command registry
- Menu handlers
- FileManager runtime

## Tasks

1. Update CLI commands:

```txt
files health
files scan <path>
open <path>
save
load
save project
load project
scene save
scene load
scene verify
```

2. Update File menu:

```txt
Save → FileManagerRuntime action
Export Scene → FileManagerRuntime action or clear export-only path
New Scene → SceneManager authority with FileManager receipt if project state changes
```

3. Ensure CLI output includes receipt summary.

Example:

```txt
Scene saved: applied=true receipt=scene.save.project target=scenes/default.scene.json
```

## Verification

Manual:

- Run CLI `files health`.
- Run CLI `files scan .`.
- Run menu Save.
- Check receipts.

Expected:

- Same receipt model regardless of entry point.
- No duplicate local save code paths.

## Acceptance criteria

- CLI/menu do not bypass FileManager.
- Receipt count increases predictably.

---

# Slice 12 — Chat file intent routing

## Goal

Chat/agent can inspect and operate files through FileManager without lying.

## Version target

v0.6b

## Files likely touched

- Chat send pipeline
- AgenticToolUseLoop intent classifier
- FileManager runtime

## Tasks

1. Add chat file command parser:

```js
FileManagerRuntime.tryHandleChatIntent(prompt, context)
```

2. Supported deterministic commands:

```txt
scan files
scan path <path>
open <path>
read <path>
find <pattern>
grep <pattern> in <path>
save scene
load scene
verify save load
show file health
show selected file
send selected file to chat context
```

3. Route matching commands to `AXIOM_FILE_MANAGER.action()`.

4. Chat response format:

```txt
Action: file.scan
Target: .
Applied: false
Tool: fs_ls
Receipt: file.scan_xxx
Result: 42 entries
Warnings: safe_write missing; write disabled
```

5. If command cannot be safely performed, chat must say blocked and why.

6. Add compact FileManager context into model prompt only when relevant:

```js
fileManager: {
  projectRoot,
  selectedPath,
  healthVerdict,
  supportedActions,
  lastScan
}
```

## Verification

Chat prompts:

```txt
show file health
scan files
open axiom-editor.html
save scene
verify save load
```

Expected:

- Chat displays structured receipts.
- Chat does not claim project writes if only local fallback was used.
- Chat does not hallucinate file contents if read failed.

## Acceptance criteria

- Chat file actions are governed.
- Chat gets selected-file context from FileManager, not ad hoc DOM reads.
- Chat cannot say “done” without receipt.

---

# Slice 13 — Agentic lane integration

## Goal

The agent tool loop understands file work as first-class lanes.

## Version target

v0.6c

## Files likely touched

- AgenticToolUseLoop
- Tool lane registry
- Chat/action bridge

## Tasks

1. Add lanes:

```js
file_read
file_scan
file_validate
file_write_proposal
scene_persistence
project_persistence
plugin_file_registration
plugin_repair
```

2. Map natural language intent to lanes.

Examples:

```txt
"find where save happens" → file_read/file_scan/fs_grep
"edit axiom-editor" → file_write_proposal
"save scene" → scene_persistence
"register plugin" → plugin_file_registration
```

3. Lanes must resolve to FileManager actions or MCP tools through FileManager.

4. Add lane result receipts to chat pipeline card.

## Verification

Chat prompts:

```txt
Find FileManagerRuntime in axiom-editor.html
Open the current selected file
Save the scene to project
Register this markdown file as a skill
```

Expected:

- Agent chooses correct lane.
- Tool receipts shown.
- No direct write bypass.

## Acceptance criteria

- Agent sees file operations as governed actions.
- File writes are proposals/validated operations, not freeform text.

---

# Slice 14 — MSOL FileManager capability graph

## Goal

MSOL represents file/project authority and current health.

## Version target

v0.7

## Files likely touched

- MSOL capability registration helpers
- FileManager runtime
- MSOL inspector render logic

## Tasks

1. Register capability nodes:

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

2. Publish edges:

```txt
FileManager consumes SSEBridge
FileManager consumes MCPToolRegistry
FileManager provides FileOperationReceipts
ScenePersistence consumes SceneManager
PluginFileRegistration consumes PluginRegistry
SafeWrite requires PathTrustPolicy
```

3. Add FileManager MSOL inspect data:

```js
{
  projectRoot,
  healthVerdict,
  lastScan,
  selectedPath,
  missingTools,
  receiptCount,
  writeStatus
}
```

4. MSOL query support:

```txt
what paths are brittle?
can AXIOM edit files?
what save/load proof exists?
which files are registered plugins?
```

5. Add `Inspect in MSOL` button from file details.

## Verification

Manual:

- Open MSOL.
- Find FileManagerCapability.
- Inspect it.
- Run query: `can AXIOM safely edit files?`

Expected:

- MSOL shows current FileManager health.
- Missing MCP tools reflected.
- Selected file relation visible if selected.

## Acceptance criteria

- MSOL does not invent file state.
- FileManager health is graph-visible.
- File/project relations are inspectable.

---

# Slice 15 — File validation by type

## Goal

Files can be validated before registration or mutation.

## Version target

v0.8a

## Files likely touched

- FileManager validation helpers
- Optional backend/MCP validation tool

## Tasks

1. Implement:

```js
validateFile(path, options)
```

2. Validation rules:

```txt
.json → parse JSON
.scene.json → parse + scene schema
project.json → parse + project schema
.md → markdown exists + optional skill fields
.html → required AXIOM root IDs + script presence + duplicate critical ID scan
.js/.mjs → basic syntax/preflight if backend available, otherwise degraded static check
plugin manifest → required id/name/entry fields + entry file exists
```

3. Emit receipt:

```txt
file.validate
```

4. Add Validate button in Files and Code tabs.

5. Validation result shape:

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

## Verification

Manual:

- Validate `axiom-editor.html`.
- Validate a known JSON file.
- Validate invalid JSON test file if safe to create one.

Expected:

- Valid files show checks passed.
- Invalid files show exact parse/check error.
- Receipt exists.

## Acceptance criteria

- Validation is available before write/register.
- Validation result is surfaced in UI/chat.

---

# Slice 16 — Safe create file

## Goal

AXIOM can create new project files safely with receipts.

## Version target

v0.8b

## Files likely touched

- FileManager mutation helpers
- MCP safe write adapter
- UI mutation card optional

## Tasks

1. Implement:

```js
createFile({ path, content, mode })
```

2. Modes:

```txt
create_new
overwrite_blocked
overwrite_allowed
```

Default: `create_new`.

3. Required checks:

- Path valid.
- Parent inside project root.
- Existing file check if stat tool available.
- Safe write tool available.
- Content non-null.

4. Emit receipt:

```txt
file.create
```

5. Add minimal UI:

- Create file button hidden or guarded.
- Chat command support:

```txt
create file docs/test.md with "hello"
```

## Verification

Chat/console:

```js
await AXIOM_FILE_MANAGER.action('create_file', {
  path: 'docs/file-manager-test.md',
  content: '# Test',
  mode: 'create_new'
})
```

Then:

```js
await AXIOM_FILE_MANAGER.action('open_path', { path: 'docs/file-manager-test.md' })
```

Expected:

- File exists.
- Content readable.
- Receipt includes applied true.
- Re-running create_new blocks overwrite.

## Acceptance criteria

- Create only works through safe write.
- Existing files are not overwritten accidentally.
- External create is blocked.

---

# Slice 17 — Safe expected-find edit

## Goal

AXIOM can apply small targeted file edits with before/after verification.

## Version target

v0.8c

## Files likely touched

- FileManager mutation helpers
- MCP adapter
- Optional Code Viewer mutation card

## Tasks

1. Implement:

```js
proposeEdit({ path, expectedFind, replacement, mode })
validateEditProposal(proposal)
applyEditProposal(proposalId)
```

2. Modes:

```txt
single_replace
multi_replace
full_write_explicit
```

Start with `single_replace` only.

3. Validation checks:

- Path safe.
- Read file.
- `expectedFind` occurs exactly once.
- Replacement is not empty unless allowed.
- File type validation passes after simulated replacement where possible.

4. Apply checks:

- Re-read before apply.
- Confirm expectedFind still exactly once.
- Write patched content.
- Read after apply.
- Verify expected replacement present.
- Emit receipt with before/after hash.

5. Chat must display proposal before apply unless user explicitly says apply.

## Verification

Use a harmless test file:

```txt
docs/file-manager-test.md
```

Console:

```js
const p = await AXIOM_FILE_MANAGER.action('propose_edit', {
  path: 'docs/file-manager-test.md',
  expectedFind: '# Test',
  replacement: '# Test Updated',
  mode: 'single_replace'
})
await AXIOM_FILE_MANAGER.action('apply_edit', { proposalId: p.result.proposalId })
```

Expected:

- Proposal validates.
- Apply receipt has beforeHash and afterHash.
- File content changed.
- Ambiguous/missing expectedFind is rejected.

## Acceptance criteria

- No broad blind edits required for v1.
- Edits are reversible/traceable by receipt.
- Failed validation blocks apply.

---

# Slice 18 — Register file as skill/scene/plugin/config

## Goal

AXIOM can classify and register files into project systems.

## Version target

v0.9a

## Files likely touched

- FileManager registration helper
- SkillRuntime bridge
- PluginRegistry bridge
- Project manifest helper

## Tasks

1. Implement:

```js
registerFile({ path, as })
```

2. Supported registration classes:

```txt
skill
scene
plugin
config
asset
```

3. Validation per class:

- Skill: markdown file; parse skill id/name/triggers if available.
- Scene: scene schema valid.
- Plugin: manifest valid + entry exists.
- Config: JSON parse valid.
- Asset: exists, no mutation.

4. Update project manifest references.

5. Notify relevant subsystem:

```txt
skill → SkillRuntime.register/discover
plugin → PluginRegistry registration candidate, not auto active
scene → project scenes list
```

6. Emit receipt:

```txt
file.register
```

## Verification

Manual:

- Register a markdown skill.
- Register a scene file.
- Discover/register a plugin manifest as candidate.

Expected:

- Project manifest updates.
- Files panel shows registered badge.
- MSOL shows relation.
- No plugin auto-activates unless separately requested.

## Acceptance criteria

- Registration is validated and receipted.
- Registration does not imply runtime activation.

---

# Slice 19 — Plugin repair contract integration

## Goal

AXIOM can request targeted plugin repair without losing runtime evidence.

## Version target

v0.9b

## Files likely touched

- Plugin Builder server/tool registry
- MCP tools list
- AgenticToolUseLoop
- FileManager plugin bridge

## Tasks

1. Add or expose MCP tool:

```txt
axiom_plugin_repair
```

2. Input contract:

```json
{
  "plugin_id": "string",
  "target_file": "string",
  "error": "string",
  "repair_instruction": "string",
  "include_files": true,
  "expected_find_required": true
}
```

3. Output contract:

```json
{
  "ok": true,
  "proposalId": "string",
  "filesInspected": [],
  "patches": [],
  "validationPlan": [],
  "risk": "low|medium|high"
}
```

4. FileManager stores repair proposal as `FileMutationProposal`.

5. Applying plugin repair still routes through safe edit/apply.

6. Chat/agent must preserve:

- exact runtime error
- plugin id
- target file
- stack/message
- repair instruction

No generic “capability gap” replacement allowed.

## Verification

Prompt:

```txt
Repair plugin ViewportNavigationImplementation. Error: Uncaught TypeError: t.set is not a function. Target file: src/index.js. Replace unsafe orbitTarget.set calls with a helper supporting THREE.Vector3 and plain objects.
```

Expected:

- `axiom_plugin_repair` receives exact error.
- Proposal references target file.
- Patch is file-level.
- No apply without safe edit receipt.

## Acceptance criteria

- AXIOM can distinguish plugin proposal, repair proposal, applied patch, and active plugin.
- Runtime evidence survives into repair request.

---

# Slice 20 — End-to-end v1 verification harness

## Goal

Prove FileManager v1 works as an integrated authority seam.

## Version target

v1.0

## Files likely touched

- Test harness file if available
- Manual verification doc
- FileManager runtime final polish

## Tasks

Create a verification command or manual checklist called:

```txt
File Manager Authority Verification v1
```

It should test:

1. Health check.
2. Tool capability detection.
3. Scan project root.
4. Open known file in Code Viewer.
5. Validate known file.
6. Create harmless test file.
7. Edit harmless test file through expected-find patch.
8. Save scene local fallback.
9. Save scene to project if safe write available.
10. Verify scene save/load.
11. Register test markdown skill.
12. Show MSOL FileManager capability.
13. Chat can ask for file health and selected file.
14. Receipts exist for each operation.
15. External write is blocked.

## Verification output shape

```json
{
  "name": "File Manager Authority Verification v1",
  "ok": true,
  "startedAt": "ISO_DATE",
  "completedAt": "ISO_DATE",
  "checks": [
    {
      "id": "fm.health",
      "ok": true,
      "summary": "File health route returned degraded because safe_write missing",
      "receiptId": "..."
    }
  ],
  "summary": {
    "passed": 14,
    "failed": 0,
    "warnings": 1,
    "writeMode": "project_write|read_only|local_fallback"
  }
}
```

## Manual acceptance checklist

A human should be able to verify:

- Files tab tells the truth about MCP/write status.
- Scanning shows real files.
- Opening a file updates Code Viewer.
- Chat can reference selected file.
- Save/load status says local fallback vs project file honestly.
- MSOL shows FileManagerCapability.
- Every mutation has a receipt.
- External writes are blocked.
- Plugin discovery/repair does not auto-apply unsafe patches.

## Acceptance criteria

FileManager v1 is complete when:

```txt
A user or agent can inspect, read, create, edit, validate, register, save, load, and verify files/scenes through FileManager authority, and every relevant AXIOM surface reports the same state with receipts.
```

---

# Suggested implementation order for a junior developer

Do not jump around.

```txt
Day/Sprint 1:
- Slice 0
- Slice 1
- Slice 2
- Slice 3

Day/Sprint 2:
- Slice 4
- Slice 5
- Slice 6
- Slice 7

Day/Sprint 3:
- Slice 8
- Slice 9
- Slice 10
- Slice 11

Day/Sprint 4:
- Slice 12
- Slice 13
- Slice 14

Day/Sprint 5:
- Slice 15
- Slice 16
- Slice 17

Day/Sprint 6:
- Slice 18
- Slice 19
- Slice 20
```

If time is tight, stop at v0.6 first. That gives:

```txt
scan/read/open/save/load/chat visibility
```

That is already useful and testable.

---

# Recommended AI-agent prompt format per slice

Use this for each implementation slice:

```txt
Implement Slice X from the AXIOM File Manager v0→v1 plan.

Constraints:
- Stay within this slice only.
- Do not refactor unrelated systems.
- Do not invent a second file authority.
- All new actions must route through FileManagerRuntime / AXIOM_FILE_MANAGER.action.
- All mutating actions must create receipts.
- If MCP tools are unavailable, mark degraded and block writes.
- Include verification steps and report results.

Before editing:
1. Inspect current FileManagerRuntime, AXIOM_FILE_MANAGER, SSEBridge, MSOLRuntime, CLIRuntime, and relevant UI panel code.
2. Identify exact functions to touch.
3. Preserve existing behaviour unless the slice explicitly changes it.

After editing:
1. Run syntax/preflight validation if available.
2. Boot AXIOM.
3. Run the slice verification checks.
4. Report files changed, receipts produced, and any blockers.
```

---

# Red flags during implementation

Stop and fix if any of these appear:

- Chat says a file was edited but no receipt exists.
- Files panel and Code Viewer disagree on selected file.
- MSOL shows FileManager healthy while MCP is unavailable.
- Scene save says project save but only localStorage changed.
- Plugin discovery activates plugin automatically.
- External absolute path is writable by default.
- File edit uses full rewrite when expected-find patch would work.
- Validation failure is shown as success.
- Project manifest becomes the only source of scene live truth.
- FileManager starts owning plugin activation or scene object runtime truth.

These are not minor bugs. These are authority leaks.

---

# Final v1 definition

AXIOM File Manager v1 is done when the following sentence is true:

```txt
Any human or agent can ask AXIOM what files exist, what project is active, what can be safely read or written, what was changed, what was saved or loaded, what is registered, and what proof exists — and Files, Code Viewer, Chat, CLI, MSOL, and receipts all agree.
```

That is the target.

