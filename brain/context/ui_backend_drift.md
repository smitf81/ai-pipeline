# UI Backend Drift

Last updated: 2026-03-27

This file is an operational context artefact for the ACE planner.
Use it as drift-audit input, not as canonical truth.

## 1. Confirmed wired relationships

### Desk properties are end-to-end wired
- Why it was flagged:
  The spatial UI exposes desk property editing and persists it through a real backend route.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` loads desk properties, renders the desk-properties panel, and exposes desk property actions from desk cards.
  `ui/public/spatial/aceConnector.js` calls `/api/spatial/agents/:id/properties` and `/api/spatial/desks/:id/actions`.
  `ui/server.js` persists Dave desk properties back into workspace state.
- Confidence:
  high
- Recommended next validation step:
  Change one desk property in the modal, reload, and confirm it rehydrates from persisted state.

### Split spatial persistence is wired through the UI and server helpers
- Why it was flagged:
  The save flow uses separate state slices instead of a single opaque blob, so the UI and server need to stay aligned.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/persistence.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` autosaves workspace state and persists architecture memory.
  `ui/public/spatial/persistence.js` provides matching `saveWorkspace`, `savePages`, `saveIntentState`, `saveStudioState`, and `saveArchitectureMemory` helpers.
  `ui/server.js` exposes the corresponding persistence hooks for the workspace state.
- Confidence:
  high
- Recommended next validation step:
  Change one field in each slice, save, and verify the corresponding JSON files update independently.

### Dave learning ledger is operationally wired end-to-end
- Why it was flagged:
  The UI now exposes Dave-specific profile and ledger controls, and the backend persists both the ledger and the editable worker profile.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` loads Dave ledger data, creates entries, updates ledger fixes, and renders the Dave learning profile surface.
  `ui/public/spatial/aceConnector.js` implements the Dave ledger and property calls.
  `ui/server.js` stores ledger entries under `data/spatial/learning-ledger` and persists Dave worker properties into the workspace snapshot.
- Confidence:
  high
- Recommended next validation step:
  Create a ledger entry, edit it, reload Studio, and confirm both the entry and Dave profile state rehydrate.

### Executor manual run is exposed in the browser and hits the real worker endpoint
- Why it was flagged:
  The executor desk is not decorative; it can trigger the actual worker route from Studio.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:2459` calls `ace.runAgentWorker('executor', ...)`.
  `ui/public/spatial/aceConnector.js:129` supports agent worker POSTs.
  `ui/server.js:4571-4619` and `ui/server.js:4619-4654` expose the worker run routes, including executor support.
- Confidence:
  high
- Recommended next validation step:
  Run a safe executor check and compare the returned runtime payload with the next persisted workspace snapshot.

### Mutation apply now persists through the backend workspace write path
- Why it was flagged:
  An earlier planner artefact warned that mutation apply only logged history, but the live route now persists confirmed mutations before returning runtime state.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:3202` calls `ace.applyMutation(preview.mutations)`.
  `ui/public/spatial/aceConnector.js:103-113` posts the mutation list to `/api/spatial/mutations/apply`.
  `ui/server.js:5476-5498` applies mutations and calls `persistSpatialWorkspace(result.workspace)` when the mutation is confirmed.
- Confidence:
  high
- Recommended next validation step:
  Apply a preview mutation, reload Studio, and verify the graph changes survive a fresh workspace read.

## 2. Backend with no clear frontend surface

### Planner and Context Manager manual-run endpoints exist, but Studio only exposes executor run control
- Why it was flagged:
  The server has direct manual-run routes for planner and context-manager, but the browser surface only shows an executor run button and indirect context-intake actions.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/server.js:4571-4619` implements `/api/spatial/agents/context-manager/run`.
  `ui/server.js:4619-4654` implements `/api/spatial/agents/planner/run`.
  `ui/public/spatial/spatialApp.js` exposes context-intake actions and an explicit executor run button, but no matching direct planner or context-manager run controls were found.
  `ui/public/spatial/aceConnector.js:129` supports arbitrary agent IDs, so the missing surface appears to be product choice or UI drift rather than connector limitation.
- Confidence:
  medium
- Recommended next validation step:
  Confirm whether planner/context-manager runs are intentionally automation-only or whether Studio should expose direct controls.

## 3. Likely placeholders or heuristic bridges

### Code and test generation helpers are still local template stubs
- Why it was flagged:
  The public connector defines code/test generation methods, but they never call the backend and instead return synthetic strings inline.
- Exact files involved:
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/public/spatial/aceConnector.js:81-89` implements `regenerateCode()` and `generateTests()` with inline template strings.
  The same file routes other capabilities through fetch calls, but these two methods do not touch any `/api/spatial/...` endpoint.
  A search of the spatial UI subtree found no call sites for either method.
- Confidence:
  high
- Recommended next validation step:
  Decide whether these helpers should be removed, renamed as placeholders, or backed by real backend routes before they are surfaced in the UI.

## 4. Uncertain findings needing manual validation

### Planner/context-manager access may be intentionally automation-only
- Why it was flagged:
  The backend supports manual runs, but the UI currently steers users toward context intake and executor review instead of direct planner/context-manager controls.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
- Evidence:
  Manual-run routes exist on the server, but the visible Studio control surface does not show a matching direct button for them.
- Confidence:
  medium
- Recommended next validation step:
  Confirm the intended product contract before adding more UI or removing the routes.
