# AXIOM File Manager Verification Report — Slice 6

## Slice

**Slice 6 — Open/read file into Code Viewer**

Target version: **v0.3**

Delivered file:

```txt
axiom-editor-slice6-open-read-codeviewer.html
```

## Verification verdict

```txt
PASS_STATIC_WITH_RUNTIME_PENDING
```

## Important limitation

This report confirms static/code-level checks only. It does **not** claim live browser/runtime verification.

Runtime checks still need to be performed inside AXIOM with the actual browser, MCP bridge, SSE bridge, and local tool server state.

## Plan expectations checked

- `FileManagerRuntime.openPath(path, options)` exists.
- `FileManagerRuntime.readFile(path, options)` exists.
- Preferred read tool order is now `safe_read_project_file → fs_cat → read_project_file → unavailable error`.
- File reads create `axiom.file.snapshot.v1` snapshots.
- Snapshots include path, requestedPath, hash, sizeBytes, readAt, contentPreview, contentTruncated, encoding, readerTool, and pathPolicy.
- `state.selectedPath` updates on successful read.
- `state.lastSnapshot` updates on successful read.
- Code Viewer path input and preview update from FileManager state.
- File read receipts include content length, content hash, truncation status, tool, attempts, and path policy.
- Files panel file selection routes through FileManager read/open behaviour.

## Static syntax verification

```txt
node --check extracted inline JavaScript: PASS
```

No syntax error reported by Node.

## Static token / structure checks

### Found

- `async function readFile(path, options = {})`
- `async function openPath(path, options = {})`
- `createFileSnapshot`
- `axiom.file.snapshot.v1`
- `simpleContentHash`
- `renderCodeViewerSnapshot`
- `contentPreview`
- `contentTruncated`
- `readerTool`
- `FileManagerState.lastSnapshot`
- `FileManagerState.selectedPath`
- `safe_read_project_file`
- `fs_cat`
- `file.read`
- `open_path`

### Missing / needs manual review

- None found missing by simple token scan.

## Runtime verification still required

- Open AXIOM in browser.
- Ensure MCP/SSE bridge is connected and exposes either `safe_read_project_file`, `fs_cat`, or `read_project_file`.
- Open Files tab.
- Scan root with `.`.
- Open `axiom-editor.html` or another text file.
- Confirm Code Viewer updates with file content.
- Confirm `FileManagerRuntime.getState().selectedPath` equals the opened file path.
- Confirm `FileManagerRuntime.getState().lastSnapshot` contains a snapshot.
- Confirm `FileManagerRuntime.getReceipts(5)` contains a `file.read` receipt.
- Confirm large file previews show truncation status instead of silently pretending full content is displayed.

## Suggested browser console checks

```js
await AXIOM_FILE_MANAGER.action('scan_path', { path: '.' })
const r = await AXIOM_FILE_MANAGER.action('open_path', {
  path: 'axiom-editor.html',
  targetSurface: 'code_viewer',
  maxChars: 20000
})
r.ok
r.result?.snapshot || r.snapshot
FileManagerRuntime.getState().selectedPath
FileManagerRuntime.getState().lastSnapshot
FileManagerRuntime.getReceipts(5)
```

## Notes

- This slice should not be considered fully accepted until the runtime checks pass in AXIOM.
- If runtime behaviour disagrees with this report, runtime wins.
- Any failed runtime check should be treated as a blocker before continuing beyond the current slice.
- This slice deliberately does not add editing. It only routes safe read/open behaviour into Code Viewer with snapshots and receipts.
