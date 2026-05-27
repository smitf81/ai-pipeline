# UI Backend Drift

Last updated: 2026-04-13

This file is an operational drift note for ACE work.
Treat it as audit context, not canonical truth.

## 1. Confirmed wired relationships

### World scaffold mutation apply still persists through the backend and rehydrates the browser runtime
- Why it was checked:
  The browser claims apply-and-refresh behavior for world scaffold mutations, so the key question is whether the server actually persists and returns runtime state.
- Exact files involved:
  `/ui/public/spatial/spatialApp.js`
  `/ui/public/spatial/aceConnector.js`
  `/ui/server.js`
- Evidence:
  `spatialApp.js` calls `ace.applyMutation(preview.mutations)` and consumes the returned `runtime`.
  `aceConnector.js` posts to `/api/spatial/mutations/apply`.
  `server.js` handles that route, builds `mutationSummary`, persists the workspace when needed, appends architecture history, and returns `runtime`.
- Confidence:
  high
- Recommended next validation step:
  Re-run one scaffold mutation, refresh the UI, and confirm the persisted world state matches the returned runtime payload.

## 2. Frontend with weak or missing backend grounding

### Generic worker-run helper still points at a route shape the server does not expose
- Why it was flagged:
  The connector builds a generic `/api/spatial/agents/:id/run` request, but the backend only exposes explicit per-agent run routes.
- Exact files involved:
  `/ui/public/spatial/aceConnector.js`
  `/ui/public/spatial/spatialApp.js`
  `/ui/server.js`
- Evidence:
  `aceConnector.js` sends `POST /api/spatial/agents/${encodeURIComponent(id)}/run`.
  `server.js` defines `POST /api/spatial/agents/context-manager/run`, `POST /api/spatial/agents/planner/run`, and `POST /api/spatial/agents/executor/run`, but no generic `POST /api/spatial/agents/:agentId/run` handler.
  The only active UI call site found is `spatialApp.js` calling `ace.runAgentWorker('executor', ...)`, so the mismatch is on a live browser path.
- Confidence:
  high
- Recommended next validation step:
  Either retarget `runAgentWorker()` to the explicit routes or add the generic server handler if that is the intended contract.

### Connector code/test generation methods remain local stubs
- Why it was flagged:
  The connector still exposes regeneration helpers that produce hardcoded strings instead of calling any backend generation service.
- Exact files involved:
  `/ui/public/spatial/aceConnector.js`
- Evidence:
  `regenerateCode()` returns a string-built `export function ... { return 'ok'; }`.
  `generateTests()` returns a fixed `describe(...){ it('works'...) }` template.
  No backend call or persisted source of truth is used by either method, and no active UI call site was found for them in the current spatial shell.
- Confidence:
  high
- Recommended next validation step:
  Wire these helpers to a real generation endpoint or remove them if generation is not a supported browser capability.

## 3. Backend with no clear frontend surface

### Planner and context-manager run routes are backend primitives without a direct browser control surface
- Why it was flagged:
  The backend offers explicit planner and context-manager run endpoints, but the browser shell only invokes the executor worker path directly.
- Exact files involved:
  `/ui/server.js`
  `/ui/public/spatial/spatialApp.js`
  `/ui/public/spatial/aceConnector.js`
- Evidence:
  `server.js` defines `POST /api/spatial/agents/context-manager/run` and `POST /api/spatial/agents/planner/run`.
  `spatialApp.js` contains a direct `ace.runAgentWorker('executor', ...)` call, but no direct planner or context-manager run call was found in the active shell.
  The connector still advertises a generic `runAgentWorker()` wrapper rather than explicit planner/context-manager UI entrypoints.
- Confidence:
  medium
- Recommended next validation step:
  Decide whether planner/context-manager runs are automation-only. If not, add explicit browser controls or document the hidden operator path.

## 4. Likely placeholders or heuristic bridges

### No additional placeholder bridge beyond the stubs above
- Why it matters:
  I did not find another confirmed placeholder or fallback path that materially changes the UI/backend contract.
- Exact files involved:
  `/ui/public/spatial/aceConnector.js`
  `/ui/public/spatial/spatialApp.js`
  `/ui/server.js`
- Evidence:
  The remaining surfaced flows I checked were either backend-grounded or already explained by the three findings above.
- Confidence:
  high
- Recommended next validation step:
  Re-audit after any new connector capability or agent-route refactor lands.

## 5. High-risk drift areas

### Route-shape drift is still concentrated in the connector layer
- Why it was flagged:
  The browser-facing abstraction is still generic while the backend contract is explicit, which makes future route changes easy to miss.
- Exact files involved:
  `/ui/public/spatial/aceConnector.js`
  `/ui/server.js`
- Evidence:
  `runAgentWorker()` uses a generic path, while the server contract is split across explicit agent routes.
- Confidence:
  medium
- Recommended next validation step:
  Normalize the connector/server contract so the browser API mirrors the actual route set.

## 6. Uncertain findings needing manual validation

### No additional uncertain drift noted in this pass
- Why it was not flagged:
  The inspected paths either had direct backend grounding or a clearly scoped mismatch.
- Exact files involved:
  `/ui/public/spatial/spatialApp.js`
  `/ui/public/spatial/aceConnector.js`
  `/ui/server.js`
- Evidence:
  The strongest residual issues are the generic run-route mismatch, the local regeneration stubs, and the hidden planner/context-manager run routes.
- Confidence:
  medium
- Recommended next validation step:
  Revisit once the connector or agent-control surface changes.
