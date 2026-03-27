# UI Backend Drift

Last updated: 2026-03-26

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
  `ui/public/spatial/spatialApp.js:1020-1048` loads desk properties and submits edits through the connector.
  `ui/public/spatial/spatialApp.js:3058-3130` renders the desk properties panel and empty/loading states.
  `ui/public/spatial/spatialApp.js:3580-3594` exposes the desk property triggers on the desk cards.
  `ui/public/spatial/aceConnector.js:173-182` calls `/api/spatial/agents/:id/properties`.
  `ui/public/spatial/aceConnector.js:237-246` calls `/api/spatial/desks/:id/actions`.
  `ui/server.js:4306-4340` persists Dave desk properties in the workspace state.
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
  `ui/public/spatial/spatialApp.js:1388` autosaves the current workspace payload.
  `ui/public/spatial/spatialApp.js:1882` saves the merged workspace after planner-handoff updates.
  `ui/public/spatial/spatialApp.js:2695` persists architecture memory alongside the other slices.
  `ui/public/spatial/persistence.js:35-51` provides matching `saveWorkspace`, `savePages`, `saveIntentState`, `saveStudioState`, and `saveArchitectureMemory` helpers.
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
  `ui/public/spatial/spatialApp.js:1345-1431` loads Dave ledger data, creates entries, and updates ledger fixes.
  `ui/public/spatial/spatialApp.js:4392-4542` renders the Dave learning profile and ledger editor surface.
  `ui/public/spatial/aceConnector.js:137-182` implements `getAgentLedger`, `createAgentLedgerEntry`, `updateAgentLedgerEntry`, and `updateAgentProperties`.
  `ui/server.js:4228-4300` stores the learning ledger entries under `data/spatial/learning-ledger`.
  `ui/server.js:4306-4340` persists Dave worker properties back into the workspace snapshot.
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
  `ui/public/spatial/spatialApp.js:2451` calls `ace.runAgentWorker('executor', ...)`.
  `ui/public/spatial/spatialApp.js:4695-4712` renders the `Run executor check` button.
  `ui/public/spatial/aceConnector.js:124-133` posts to `/api/spatial/agents/:id/run`.
  `ui/server.js:4435-4470` implements `/api/spatial/agents/executor/run`.
- Confidence:
  high
- Recommended next validation step:
  Run a safe executor check and compare the returned runtime payload with the next persisted workspace snapshot.

## 2. Frontend with weak or missing backend grounding

### Mutation apply reports success before backend persistence of the mutated graph
- Why it was flagged:
  The browser marks ACE suggestions as applied, but the backend route only appends history and does not persist the mutation result into the workspace file.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:3188-3199` calls `ace.applyMutation(preview.mutations)`, mutates the graph locally, and then sets `ACE suggestions applied`.
  `ui/public/spatial/aceConnector.js:94-110` posts the mutation list to `/api/spatial/mutations/preview` and `/api/spatial/mutations/apply`.
  `ui/server.js:5255-5257` only calls `appendArchitectureHistory(...)` and returns `{ ok: true, applied: mutations.length }`.
  There is no write to the workspace snapshot in that route.
- Confidence:
  high
- Recommended next validation step:
  Apply a preview mutation, reload Studio, and verify whether the graph changes survive a fresh workspace read.

## 3. Backend with no clear frontend surface

### Planner and Context Manager manual-run endpoints exist, but Studio only exposes executor run control
- Why it was flagged:
  The server has direct manual-run routes for planner and context-manager, but the browser surface only shows an executor run button and indirect context-intake actions.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/server.js:4350-4396` implements `/api/spatial/agents/context-manager/run`.
  `ui/server.js:4398-4433` implements `/api/spatial/agents/planner/run`.
  `ui/public/spatial/spatialApp.js:4257-4260` exposes context-intake and scan actions, not direct planner/context-manager run controls.
  `ui/public/spatial/spatialApp.js:4695-4712` renders only the executor run button in the worker panel.
  `ui/public/spatial/aceConnector.js:124-133` supports arbitrary agent IDs, yet the only explicit Studio call site found targets `executor`.
- Confidence:
  medium
- Recommended next validation step:
  Confirm whether planner/context-manager runs are intentionally automation-only or whether Studio should expose direct controls.

## 4. Likely placeholders or heuristic bridges

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

## 5. High-risk drift areas

### Mutation apply remains the clearest user-visible drift risk
- Why it was flagged:
  The UI says the graph was applied, but the authoritative workspace snapshot does not get updated by the backend route.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/server.js`
- Evidence:
  The frontend commits the preview into local state immediately after the API call, while the server only logs history.
- Confidence:
  high
- Recommended next validation step:
  Reload after apply and compare the runtime graph to persisted workspace state.

## 6. Uncertain findings needing manual validation

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
