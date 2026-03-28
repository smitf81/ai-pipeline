# UI Backend Drift

Last updated: 2026-03-27

This file is an operational drift note for ACE work.
Treat it as audit context, not canonical truth.

## 1. Canonical Studio flow now grounded in live state

### Intent trace is now read from Studio runtime, not inferred from legacy artifacts
- Why it was flagged:
  Studio needed to make the world-first flow legible from the real current data path.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` now reads raw intent from the canvas/context node plus `traceLog`, interpreted intent from `executiveResult`, `scanPreview`, and `intentState`, and shows scaffold-route failures without collapsing them into plain text errors.
  `ui/public/spatial/aceConnector.js` now preserves structured `/api/spatial/executive/route` error payloads on rejection.
  `ui/server.js` already returns structured `world-scaffold`, `module`, and `intent-scan` route payloads.
- Confidence:
  high
- Recommended next validation step:
  Enter `let's start with a 20x20 grass/ground grid`, then confirm Studio shows raw intent, route, and interpreted scaffold summary before looking at the world result.

### Mutation trace is grounded in the mutation gate contract
- Why it was flagged:
  Studio should explain proposed mutations, gate decisions, and live outcomes from the real apply route.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` now surfaces the latest mutation package from `executiveResult.mutations` or the latest traced executor input, gate results from `mutationResult/results`, and persisted history from `mutationGate.activity` and `mutationGate.approvalQueue`.
  `ui/server.js` remains the single source of truth for mutation classification, apply, queue, block, and runtime refresh through `/api/spatial/mutations/apply`.
- Confidence:
  high
- Recommended next validation step:
  Trigger one safe scaffold materialisation and one blocked mutation, then verify the proposed package, gate result, approval queue, and activity history all align.

### World trace is grounded in canonical world state
- Why it was flagged:
  Studio must show what exists in the canonical world layer after gate application, not just intent-side previews.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/worldScaffoldView.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` now reads the world trace from `graphBundle.world`, persisted `activeGraphLayer`, persisted `worldViewMode`, and the canonical world scaffold node metadata.
  `ui/server.js` persists scaffold mutations and returns runtime with layer and view state.
  `ui/public/spatial/worldScaffoldView.js` continues to render the persisted scaffold in 2D and 2.5D.
- Confidence:
  high
- Recommended next validation step:
  Reload after a scaffold apply and confirm the world trace panel still matches the rendered grid.

### Agent attempts are surfaced only from existing worker state
- Why it was flagged:
  The user wanted attempt visibility, but this pass should not invent a new telemetry subsystem.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/studioData.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` now shows a minimal Agent Attempts panel based on `agentSnapshots`.
  `ui/public/spatial/studioData.js` already exposes `workerState`, `latestRunStatus`, and `latestRunSummary` for context-manager, planner, and executor workers.
- Confidence:
  high
- Recommended next validation step:
  Run planner, context-manager, and executor actions and confirm the panel reflects outcomes or blocked reasons without implying more telemetry than exists.

## 2. Drift removed or demoted

### Legacy viewer no longer depends on `/api/task-artifacts`
- Why it was flagged:
  The old drawer still fetched task artifacts even though that path is no longer canonical for the world-first Studio flow.
- Exact files involved:
  `ui/public/app.js`
  `ui/public/index.html`
  `ui/tests/appViewerMode.test.mjs`
- Evidence:
  `ui/public/app.js` no longer calls `/api/task-artifacts`; it now labels that card as legacy-only and directs users back to Spatial Studio for canonical flow inspection.
  `ui/public/index.html` now labels the card as legacy observability rather than live truth.
  `ui/tests/appViewerMode.test.mjs` now asserts that no `/api/task-artifacts` request is issued.
- Confidence:
  high
- Recommended next validation step:
  Open the legacy drawer in the browser and confirm the card explicitly states that canonical flow lives in Spatial Studio.

### Dashboard and RSG surfaces are now labeled as secondary context
- Why it was flagged:
  Those panels are still useful, but they should not read like the main source of truth for world scaffold materialisation.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
- Evidence:
  Studio now labels dashboard state as `Legacy Dashboard Signals` and reframes RSG panels as `System Graph Drafting`, making their role secondary to the mutation gate and world state.
- Confidence:
  medium
- Recommended next validation step:
  Review the sidebar copy in both canvas and studio scenes and confirm the canonical flow reads clearly without removing still-useful secondary signals.

## 3. Remaining known drift

### `/api/task-artifacts` still exists on the server as legacy compatibility
- Why it still matters:
  The client dependency was removed, but the server route still exists and could be mistaken for a canonical surface later.
- Exact files involved:
  `ui/server.js`
- Evidence:
  The server still exports task-artifact helpers and the route remains present.
- Confidence:
  high
- Recommended next validation step:
  Decide in a later pass whether to keep the route as explicit legacy compatibility or retire it fully once no consumers remain.

### Trace log and executive result are still session-local
- Why it still matters:
  Persistent truth now survives through context state, mutation history, approval queue, and world state, but the richest per-run trace is still in-memory only.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
- Evidence:
  `traceLog` and `executiveResult` are React state, not persisted workspace slices.
- Confidence:
  high
- Recommended next validation step:
  If historical replay becomes important, add a tiny persisted execution-trace summary instead of persisting full debug traces.

### Agent attempt visibility remains partial by design
- Why it still matters:
  The new panel is honest, but it only knows what worker state already exposes.
- Exact files involved:
  `ui/public/spatial/studioData.js`
  `ui/public/spatial/spatialApp.js`
- Evidence:
  Attempt summaries come from `workerState`, `latestRunStatus`, and `latestRunSummary`; they do not include a full ordered run ledger for every agent action.
- Confidence:
  high
- Recommended next validation step:
  Only add more agent attempt detail if the backend already has a natural persisted source for it.
