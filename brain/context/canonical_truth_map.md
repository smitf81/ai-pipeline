# ACE Canonical Truth Map

Generated: 2026-05-18T12:27:04.844Z
Contract: canonical-truth-domains.v0

Source of truth: `brain/emergence/canonical_truth_domains.json`.
This Markdown file is planner-support context only.

## Use

Before changing a domain, identify its canonical owner, mutation authority, allowed projections, and stale/duplicate paths. If the domain is absent, add or clarify the canonical domain before implementing behavior.

## workspace - Spatial Workspace

- classification: canonical
- system of record: data/spatial/workspace.json + data/spatial/pages.json + data/spatial/intent-state.json + data/spatial/studio-state.json + data/spatial/architecture-memory.json + projectCanonicalSlicesIntoWorkspace + refreshSpatialOrchestrator + pumpAutomatedTeamBoardAsync
- canonical owner: ui/server.js::readSpatialWorkspace + ui/server.js::refreshSpatialOrchestrator
- mutation authority: ui/server.js workspace persistence routes and governed worker flows
- allowed projections: workspace, runtime, truth_kernel, desk_properties, intent
- notes: Primary live workspace backbone plus governed read aggregation over persisted workspace state, sidecars, canonical slice projection, and orchestrator refresh.

## runtime - Spatial Runtime

- classification: projection
- system of record: workspace domain projected through buildSpatialRuntimePayload
- canonical owner: ui/server.js::buildSpatialRuntimePayload
- mutation authority: read-only projection from refreshed workspace
- allowed projections: runtime
- notes: Operational runtime projection consumed by Studio and automation refresh flows.

## truth_kernel - Truth Kernel

- classification: projection
- system of record: workspace domain plus surfaced evidence artifacts projected through buildTruthKernelPayload
- canonical owner: ui/truthKernelAdapter.js::buildTruthKernelPayload
- mutation authority: read-only projection from refreshed workspace and evidence stores
- allowed projections: truth_kernel
- notes: Read-only spatial substrate of surfaced ACE entities and immediate relationships.

## intent - Canonical Intent

- classification: canonical
- system of record: workspace.intentState.registry + workspace.studio.intake.records
- canonical owner: ui/server.js::maybeRunContextManagerWorker + ui/server.js::getCurrentSpatialIntent
- mutation authority: ui/server.js::maybeRunContextManagerWorker + ui/server.js::persistCanonicalIntakeRecord
- allowed projections: intent
- notes: Canonical authored/request intent state surfaced through the live intent route, workspace intent registry, and canonical intake persistence.

## desk_properties - Desk Properties

- classification: projection
- system of record: workspace domain projected through buildDeskPropertiesPayload
- canonical owner: ui/server.js::buildDeskPropertiesPayload
- mutation authority: read-only projection from refreshed workspace and QA evidence
- allowed projections: desk_properties
- notes: Per-desk truth projection used by Studio desk property surfaces.

## qa_evidence - QA Evidence

- classification: canonical
- system of record: data/spatial/qa/structured/latest.json + data/spatial/qa/*.json + data/spatial/qa/local-gates/*.json + qa lead state + QA investigations/repair state
- canonical owner: ui/server.js::buildQAStatePayload + ui/server.js::readQaLeadOutput + ui/server.js::buildQaRepairLoopState
- mutation authority: ui/qaRunner.js + ui/qaLeadRunner.js + ui/qaRepairLoop.js + ui/externalQaProbe.js + ui/qaResearch.js
- allowed projections: qa_evidence
- notes: Mixed QA source-of-record domain spanning structured reports, recorded QA runs, local gates, QA lead state, investigations, and repair-loop evidence.

## execution_provenance - Execution Provenance

- classification: canonical
- system of record: throughput sessions, planner runs, executor runs, and context-manager run artifacts
- canonical owner: ui/server.js throughput and worker runners
- mutation authority: governed execution flows only
- allowed projections: execution_provenance
- notes: Run lineage, timings, and artifact provenance for executions.

