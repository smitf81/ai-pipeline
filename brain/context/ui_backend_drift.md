# UI Backend Drift

Last updated: 2026-03-17

This file is an operational context artefact for the ACE planner.
Use it as drift-audit input, not as canonical truth.

## 1. Confirmed wired relationships

### Talent candidate generation is end-to-end wired
- Why it was flagged:
  Confirmed as a real UI-to-backend flow, not placeholder UI.
- Exact files involved:
  `ui/public/app.js`
  `ui/server.js`
  `ta/generateCandidates.js`
- Evidence:
  `ui/public/app.js:278-295` posts to `/api/ta/candidates`, renders returned candidates, and reports generated counts.
  `ui/public/app.js:433` binds the browser button to `generateTalentCandidates()`.
  `ui/server.js:2897-2908` validates `gap` input and returns `generateCandidates(body.gap)`.
  `ta/generateCandidates.js` contains the deterministic candidate generation implementation.
- Confidence:
  high
- Recommended next validation step:
  Manual browser check that the rendered candidate cards match the server payload shape after a non-trivial gap description.

### Browser QA surface is backed by persisted QA runs and artifacts
- Why it was flagged:
  Confirmed as a grounded browser surface with backend run storage and artifact retrieval.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:1406-1414` triggers `ace.runBrowserPass(...)`.
  `ui/public/spatial/spatialApp.js:2576-2605` renders latest QA run status, screenshot preview, findings, and steps.
  `ui/public/spatial/aceConnector.js:64-90` posts `/api/spatial/qa/run` and fetches `/api/spatial/qa/runs/:runId`.
  `ui/server.js` exposes `/api/spatial/qa/run`, `/api/spatial/qa/runs`, `/api/spatial/qa/runs/:runId`, and artifact download routes.
- Confidence:
  high
- Recommended next validation step:
  Open a recent QA run in the UI and verify that screenshot URLs resolve to stored files under `data/spatial/qa/`.

### Executor manual run is exposed in the browser and hits the real worker endpoint
- Why it was flagged:
  Confirmed manual executor control exists and is not just a desk-status decoration.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:1735-1742` calls `ace.runAgentWorker('executor', { cardId, mode: 'manual' })`.
  `ui/public/spatial/aceConnector.js:49-62` posts to `/api/spatial/agents/:id/run`.
  `ui/server.js:2992-3004` implements `/api/spatial/agents/executor/run`.
- Confidence:
  high
- Recommended next validation step:
  Trigger a manual executor run against a safe test card and compare the returned runtime payload with the next persisted `data/spatial/workspace.json`.

## 2. Frontend with weak or missing backend grounding

### Mutation apply acknowledges success before any workspace persistence
- Why it was flagged:
  The browser tells the user ACE suggestions were applied, but the server route only appends history and never writes the mutated graph back to `workspace.json`.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/public/spatial/aceConnector.js`
  `ui/server.js`
- Evidence:
  `ui/public/spatial/spatialApp.js:2352-2357` calls `ace.applyMutation(preview.mutations)`, then mutates local graph state with `mutationEngine.applyMutations(...)`, then shows `ACE suggestions applied`.
  `ui/public/spatial/aceConnector.js:33-47` posts `/api/spatial/mutations/apply`.
  `ui/server.js:3405-3408` handles `/api/spatial/mutations/apply` by recording `mutation-apply` history and returning `{ ok: true, applied }` only.
- Confidence:
  high
- Recommended next validation step:
  Apply a mutation, reload the page, and compare the resulting graph against `data/spatial/workspace.json` to confirm whether the change was actually persisted anywhere else.

## 3. Backend with no clear frontend surface

### Planner and Context Manager manual run endpoints exist without a matching browser control
- Why it was flagged:
  The backend exposes direct manual-run endpoints for planner and context-manager, but the browser only calls the executor worker directly.
- Exact files involved:
  `ui/public/spatial/spatialApp.js`
  `ui/server.js`
- Evidence:
  `ui/server.js:2930-2942` implements `/api/spatial/agents/context-manager/run`.
  `ui/server.js:2966-2978` implements `/api/spatial/agents/planner/run`.
  `ui/public/spatial/spatialApp.js:1737-1740` is the only direct `runAgentWorker(...)` call and it targets `executor`.
  No matching direct `runAgentWorker('planner'...)` or `runAgentWorker('context-manager'...)` call was found in `ui/public/spatial/`.
- Confidence:
  medium
- Recommended next validation step:
  Confirm whether these two endpoints are intentionally reserved for automation/tests or whether Studio is missing manual controls for them.

## 4. Likely placeholders or heuristic bridges

### Code and test generation methods are still local placeholders
- Why it was flagged:
  The connector exposes code-generation capabilities that return synthetic strings locally instead of calling a backend implementation.
- Exact files involved:
  `ui/public/spatial/aceConnector.js`
- Evidence:
  `ui/public/spatial/aceConnector.js:14-27` implements `regenerateCode()` and `generateTests()` by returning inline template strings.
  Unlike `parseIntent`, `previewMutation`, `applyMutation`, `teamBoardAction`, `runAgentWorker`, and QA methods, these functions do not issue any fetch to backend routes.
- Confidence:
  high
- Recommended next validation step:
  Decide whether these methods should be removed from the surfaced contract or backed by real endpoints before any UI starts presenting them as live ACE capabilities.

## 5. High-risk drift areas

### Studio governance state is partly inferred and can read as authoritative beyond worker truth
- Why it was flagged:
  Desk statuses, thought bubbles, and conflict summaries are derived in `studioData.js` from heuristics and current workspace shape, while persisted worker metadata shows gaps such as no completed planner run.
- Exact files involved:
  `ui/public/spatial/studioData.js`
  `data/spatial/workspace.json`
- Evidence:
  `ui/public/spatial/studioData.js:1133-1167` synthesizes planner/context/governance thought bubbles from handoff state, planner feedback, low confidence, and summary counts.
  `ui/public/spatial/studioData.js:616-689` advances team-board state and rewrites card desk/state labels.
  `data/spatial/workspace.json` currently shows `studio.orchestrator.conflicts` entries like `ready-to-apply ... because risk heuristics require approval` and desk thought bubbles such as `Planner status: blocked. Waiting for a clarified handoff.`
  The same file shows `studio.agentWorkers.planner.lastRunId: null` and `proposalArtifactRefs: []`, so part of the presented planner/governance narrative is inferred from orchestration state rather than an actual recent planner run artifact.
- Confidence:
  medium
- Recommended next validation step:
  Trace one displayed conflict and one desk thought bubble back to their canonical source fields and decide which of those fields should be labeled as inferred vs authoritative in the UI.

## 6. Uncertain findings needing manual validation

### Auto-builder retry loop may be surfacing instability without a clear browser explanation
- Why it was flagged:
  Runtime history shows repeated builder start/fail cycles for the same card within seconds, which risks the UI looking merely "active" or "blocked" without exposing the repetition or cause clearly.
- Exact files involved:
  `data/spatial/history.json`
  `data/spatial/workspace.json`
  `ui/public/spatial/studioData.js`
- Evidence:
  `data/spatial/history.json` contains repeated `team-board-builder-start` and `team-board-builder-failed` entries for card `0002` and task `10000` across 2026-03-16T21:56:15Z through 2026-03-16T21:58:52Z.
  `data/spatial/workspace.json` still reports active/review board counts and blocked desk states, but this audit did not confirm a dedicated browser surface that explains the retry loop itself.
- Confidence:
  low
- Recommended next validation step:
  Reproduce one builder failure in Studio and verify whether the repeated retries and failure reason are visible anywhere user-facing without opening raw history JSON.
