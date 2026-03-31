# UI Backend Drift

Last updated: 2026-03-31

This file is an operational drift note for ACE work.
Treat it as audit context, not canonical truth.

## 1. Confirmed wired relationships

### World scaffold apply now persists through the backend and rehydrates the browser runtime
- Why it was checked:
  The previous audit note treated mutation apply as a browser-local success path.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js` calls `ace.applyMutation(preview.mutations)` and then applies the returned runtime payload to the local graph state.
  `ui/public/spatial/aceConnector.js` sends the mutations to `/api/spatial/mutations/apply`.
  `ui/server.js` builds a `mutationSummary`, persists the workspace when needed, appends architecture history, and returns `runtime` in the response payload.
- Confidence:
  high
- Recommended next validation step:
  Re-run one scaffold mutation, reload the UI, and confirm the persisted world state matches the returned runtime.

## 2. Frontend with weak or missing backend grounding

### Generic agent-run helper points at a route the server does not define
- Why it was flagged:
  The browser connector exposes a generic `runAgentWorker()` helper, but the server only defines explicit per-agent run endpoints. The generic path has no matching backend route in `ui/server.js`.
- Exact files involved:
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/aceConnector.js` posts to `/api/spatial/agents/${id}/run`.
  `ui/server.js` defines `POST /api/spatial/agents/context-manager/run`, `POST /api/spatial/agents/planner/run`, and `POST /api/spatial/agents/executor/run`, but no `/api/spatial/agents/:id/run` handler.
  The only direct executor worker call in `ui/public/spatial/spatialApp.js` goes through `ace.runAgentWorker('executor', ...)`, so the mismatch is on an active UI code path.
- Confidence:
  high
- Recommended next validation step:
  Either retarget the connector to the explicit server routes or add a generic backend run handler if that is the intended contract.

### Connector code/test generation methods are still local stubs
- Why it was flagged:
  The connector API still exposes `regenerateCode` and `generateTests`, but both return hardcoded strings and do not call the backend.
- Exact files involved:
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `regenerateCode()` returns a generated function body built from `node.content`.
  `generateTests()` returns a fixed `describe(...){ it('works'...) }` template.
  Neither method fetches a server endpoint or references a persisted source of truth.
- Confidence:
  high
- Recommended next validation step:
  Either wire these methods to a real generation endpoint or remove them so the connector does not imply a capability the backend does not provide.

### Planner and context-manager run routes have no direct browser control surface
- Why it was flagged:
  The server exposes manual run endpoints for planner and context-manager, but the current browser shell does not surface direct buttons or connector calls for those specific routes.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/server.js` defines `POST /api/spatial/agents/context-manager/run` and `POST /api/spatial/agents/planner/run`.
  `ui/public/spatial/spatialApp.js` only calls `ace.runAgentWorker('executor', ...)` for manual worker assessment; there are no direct calls to planner or context-manager run endpoints.
  The visible browser controls instead route through higher-level flows such as intent routing, QA, throughput debug, and team-board actions.
- Confidence:
  medium
- Recommended next validation step:
  Decide whether these routes are automation-only by design; if not, add explicit UI controls or document the hidden entrypoint.

## 3. Backend with no clear frontend surface

### Executor-style manual run route is present, but the browser does not call it directly
- Why it was flagged:
  The backend exposes a manual executor run entrypoint, but the current UI path routes through `ace.applyMutation()` and higher-level executive flows instead.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/server.js` defines `POST /api/spatial/agents/executor/run`.
  `ui/public/spatial/spatialApp.js` calls `ace.runAgentWorker('executor', ...)` from `runExecutorWorkerAssessment()`, but the connector currently targets `/api/spatial/agents/${id}/run` instead of the server's explicit executor route.
  The browser's visible executor path is otherwise mediated by the executive route and mutation apply response, not a clearly labeled standalone executor button.
- Confidence:
  high
- Recommended next validation step:
  Decide whether the executor assessment should call the explicit executor route or whether that assessment path should be hidden entirely.

## 4. Likely placeholders or heuristic bridges

### None beyond the local generation stubs and route mismatch above
- Why it matters:
  No additional placeholder bridge stood out as a confirmed mismatch in this pass.
- Exact files involved:
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  The mutation path is backend-grounded, while the remaining gaps are limited to the generic worker-run helper, the local generation helpers, and the hidden manual planner/context-manager routes.
- Confidence:
  high
- Recommended next validation step:
  Re-audit after any new connector capability lands.

## 5. High-risk drift areas

### Planner and context-manager run capabilities are backend-only primitives
- Why it was flagged:
  Separate backend run endpoints exist for planner and context-manager, but the UI mostly surfaces composite flows rather than those underlying routes.
- Exact files involved:
  `ui/server.js`
  `ui/public/spatial/spatialApp.js`
- Evidence:
  The current shell exposes intent routing, QA, throughput, and team-board actions, but the per-agent planner/context-manager `/run` routes are not exposed as first-class browser controls.
- Confidence:
  medium
- Recommended next validation step:
  Decide whether to keep those routes hidden as automation primitives or surface them explicitly for operator use.

## 6. Uncertain findings needing manual validation

### No additional uncertain drift noted in this pass
- Why it was not flagged:
  The code paths inspected either had direct backend grounding or were clearly local placeholders.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  The strongest remaining mismatch is the generic worker-run route mismatch, the stubbed generation helpers, and the hidden per-agent run routes.
- Confidence:
  medium
- Recommended next validation step:
  Revisit once the connector or agent-control surface changes.
