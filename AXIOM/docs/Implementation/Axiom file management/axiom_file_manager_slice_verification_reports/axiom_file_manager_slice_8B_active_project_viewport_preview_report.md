# AXIOM File Manager Verification Report - Slice 8B

Date: 2026-05-28

## Slice

**Slice 8B - Active project viewport preview: Black Sky Bound**

## Scope

This slice makes Black Sky Bound the first active live project that AXIOM can
load into a viewport preview surface. The preview is intentionally an isolated
browser runtime projection, not an import into the AXIOM Three.js scene graph.

## Implementation summary

- Removed the duplicate `id="viewport"` element so viewport ownership is not
  ambiguous.
- Added `ProjectPreviewRuntime` to `axiom-editor.html`.
- Added the `AXIOM_PROJECT_PREVIEW` browser API and `window.EDITOR.projectPreview`.
- Routed manifest reads with browser entrypoint URLs from `FileManagerRuntime`
  into the viewport preview.
- Added `project_runtime_probe` to the launcher MCP bridge. The probe reads the
  authorised project's `.axiom/project.json` and checks the declared entrypoint
  URL without starting, mutating, or importing the project.
- Registered a runtime MSOL capability for active project viewport preview.

## First-person / live project test context

Black Sky Bound already contains project-side browser/playtester harnesses:

```txt
npm.cmd run test:browser
npm.cmd run test:shelter-route
npm.cmd run test:mouse
npm.cmd run test:mouse:live
```

For this AXIOM slice, `test:mouse` was run as the fast non-browser proof of the
Mouse/playtester command path:

```txt
PASS commandWheelAdapter.test.mjs
PASS mousePlaytester.test.mjs
Isolated test run complete: 2 passed, 0 failed, 0 timed out
```

## Validation performed

### Static syntax

```txt
node --check AXIOM/apps/launcher/server.js
```

Passed.

Inline browser script parse:

```txt
script 1 ok (0 chars)
script 2 ok (480365 chars)
```

Passed.

### Runtime contract probe

Started Black Sky Bound static server on `4184`, started AXIOM launcher on an
isolated port, then called:

```txt
project_open(projectRoot=Projects/field-fronts-prototype)
project_runtime_probe(projectRoot=Projects/field-fronts-prototype)
```

Observed:

```json
{
  "axiomHealth": true,
  "hasRuntimeProbeTool": true,
  "projectOpenOk": true,
  "projectId": "black-sky-bound",
  "manifestExists": true,
  "runtimeProbeOk": true,
  "runtimeUrl": "http://127.0.0.1:4184/?seed=1",
  "runtimeStatusCode": 200,
  "runtimeReachable": true,
  "runtimeContentType": "text/html; charset=utf-8"
}
```

## Browser acceptance status

Browser visual acceptance remains pending in this local Codex environment
because Chromium/browser process launch is blocked here. The implemented UI
surface is ready for manual/browser-plugin verification:

```js
await AXIOM_FILE_MANAGER.openBlackSkyBound()
AXIOM_PROJECT_PREVIEW.status()
```

Expected:

- Preview panel opens inside the AXIOM viewport.
- URL is `http://127.0.0.1:4184/?seed=1`.
- Status becomes `reachable` or `frame loaded` when the Black Sky Bound server
  is running.
- Status remains explicitly offline/degraded if the project server is not
  running.

## Residual risk

The slice proves active project authorisation, manifest wiring, runtime URL
selection, and server-side reachability. Full visual acceptance still requires a
real browser session to confirm that the iframe paints the game viewport in the
AXIOM shell.

## Verdict

Implementation and contract validation pass. Formal browser visual acceptance is
pending due to the current local browser-launch limitation.
