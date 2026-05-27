# AXIOM File Manager Verification Report — Slice 7 Repair

## Slice

**Slice 7 Repair — Files panel UI authority pass visibility fix**

Target version: **v0.3**

Delivered file:

```txt
axiom-editor-slice7-files-panel-authority-REPAIRED.html
```

## Verification verdict

```txt
PASS_STATIC_WITH_RUNTIME_PENDING
```

## What was wrong in the first Slice 7 attempt

The first Slice 7 attempt placed the new `panel-code` and `panel-files` blocks under the viewport area instead of inside the left panel tab container.

That meant `switchTab('files')` and `switchTab('code')` could technically find/show the panels, but they were not reliably fronted in the intended left-panel surface. In practice, the preview could look like the Files and Code panels had not landed at all.

This was a UI placement/authority-surface bug, not a FileManager state-model bug.

## What this repair changed

- Moved the Code Viewer panel back into the left panel tab stack.
- Moved the Files panel back into the left panel tab stack.
- Left the viewport, CLI, and chat layout alone.
- Preserved the Slice 6 read/open/snapshot behaviour.
- Preserved the Slice 7 Files authority UI elements:
  - project/root/trust/MCP/write strip
  - scan/health toolbar
  - health card
  - file list
  - selected file detail block
  - action buttons with disabled-state explanations
- Added a small selected-node update after successful reads so opened files keep the detail state more coherent.
- Added explicit scan-failure health state so failed scans are visible in the Files panel rather than silently appearing empty.

## Static syntax verification

```txt
node --check extracted inline JavaScript: PASS
```

No syntax error reported by Node.

## Static structure checks

### Found

- `panel-code` appears before `viewport`
- `panel-files` appears before `viewport`
- `FileManagerRuntime.renderFilesPanel`
- `FileManagerRuntime.scanPath`
- `FileManagerRuntime.openPath`
- `FileManagerRuntime.readFile`
- `fm-project-strip`
- `fm-health-card`
- `fm-file-list`
- `fm-detail-block`
- `fm-code-preview`

### Important limitation

This report still does **not** claim live browser/runtime verification. Slice 7 is only acceptable after Felix manually confirms the Files and Code panels are visible and connected to real FileManager state in AXIOM.

## Runtime verification required

### Browser UI checks

1. Replace the current editor file with:

```txt
axiom-editor-slice7-files-panel-authority-REPAIRED.html
```

2. Boot AXIOM normally.
3. Click the **Files** tab.
4. Confirm the left panel visibly shows:
   - Project / Root / Trust / MCP / Write strip
   - Scan and Health buttons
   - File authority health card
   - File list area
   - Selected file area
5. Click **Health**.
6. Confirm the health card updates, even if MCP is offline/degraded.
7. Click **Scan** with path `.`.
8. Expected outcomes:
   - If MCP filesystem tools are available: file rows appear.
   - If MCP tools are missing: Files panel shows degraded/blocking evidence, not a blank panel.
9. Select a file row.
10. Confirm the selected file detail block updates.
11. Click **Open in Code** on a readable file.
12. Confirm the **Code** tab opens and shows:
   - file path
   - trust/reader/hash/truncation meta
   - preview content

### Browser console checks

```js
typeof window.FileManagerRuntime
typeof window.AXIOM_FILE_MANAGER
await AXIOM_FILE_MANAGER.action('check_health', {})
FileManagerRuntime.getState().health
await AXIOM_FILE_MANAGER.action('scan_path', { path: '.' })
FileManagerRuntime.getState().lastScan
FileManagerRuntime.getReceipts(5)
```

If scan succeeds:

```js
Object.keys(FileManagerRuntime.getState().filesByPath).slice(0, 5)
```

Then open a real file path from the scan result:

```js
await AXIOM_FILE_MANAGER.action('open_path', {
  path: 'axiom-editor.html',
  targetSurface: 'code_viewer',
  maxChars: 20000
})
FileManagerRuntime.getState().lastSnapshot
```

## Acceptance status

```txt
STATIC_REPAIR_OK_BUT_NOT_ACCEPTED_UNTIL_BROWSER_TEST
```

## Notes

- This repair does not advance to Slice 8.
- This repair exists because the first Slice 7 patch failed the visible UI acceptance test.
- Runtime/UI behaviour wins over this report.
