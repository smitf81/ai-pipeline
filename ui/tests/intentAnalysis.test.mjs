import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runIntentAnalysisTests() {
  const intentAnalysisPath = path.resolve(process.cwd(), 'intentAnalysis.js');
  const {
    analyzeSpatialIntent,
    buildIntentProjectContext,
    buildCanonicalIntentContract,
    deriveSpatialIntentFieldInfluence,
    interpretSpatialGeometry,
  } = require(intentAnalysisPath);

  const projectContext = buildIntentProjectContext({
    workspace: {
      graph: {
        nodes: [
          {
            id: 'node_ctx',
            type: 'text',
            content: 'ACE Studio desks planner executor archivist QA workflow board',
            metadata: { agentId: 'context-manager' },
          },
        ],
      },
    },
    readDashboardFile(relativePath) {
      if (relativePath === 'brain/emergence/state.json') {
        return {
          parsed: {
            current_focus: 'ACE Studio desks',
            next_actions: ['Expose desk workloads in Studio'],
            blockers: ['Need review gate before deploy'],
          },
        };
      }
      if (relativePath === 'brain/emergence/plan.md') {
        return { content: 'Plan the desk workflow, sequencing, and surface task states on the kanban board.' };
      }
      if (relativePath === 'brain/emergence/project_brain.md') {
        return { content: 'ACE Studio orchestrates desks, planner handoffs, executor work, and QA review contract.' };
      }
      if (relativePath === 'brain/emergence/roadmap.md') {
        return { content: 'Roadmap: add QA desk support, milestone gates, and better planner-to-worker task flow.' };
      }
      if (relativePath === 'brain/emergence/tasks.md') {
        return { content: '- Add QA desk support\n- Improve planner handoff context\n- Verify acceptance gates\n' };
      }
      if (relativePath === 'brain/emergence/decisions.md') {
        return { content: '2026-03-15: Decision ledger says keep plan.md as a canonical anchor with review protocols.' };
      }
      if (relativePath === 'brain/emergence/changelog.md') {
        return { content: '2026-03-15: Changelog records runtime anchor refs and provenance snapshots.' };
      }
      return { parsed: {}, content: '' };
    },
  });

  const prompt = 'I think we should add a desk to the studio for a QA agent';
  const report = analyzeSpatialIntent(prompt, projectContext);

  assert.equal(report.agent.criteriaVersion, 'ace-intent-v2');
  assert.equal(report.agent.legacyCriteriaVersion, 'ace-intent-v1');
  assert.equal(report.classification.role, 'module');
  assert.ok(report.classification.labels.includes('plan'));
  assert.ok(report.classification.labels.includes('ux'));
  assert.ok(report.tasks.length >= 1);
  assert.match(report.tasks[0], /add a desk to the studio for a QA agent/i);
  assert.ok(report.projectContext.matchedTerms.includes('desk'));
  assert.ok(report.projectContext.matchedTerms.includes('studio'));
  assert.ok(projectContext.keywords.includes('decision'));
  assert.ok(projectContext.keywords.includes('changelog'));
  assert.ok(report.projectContext.sourcesRead.includes('brain/emergence/state.json'));
  assert.ok(report.projectContext.sourcesRead.includes('workspace.graph.context-manager-node'));
  assert.ok(Array.isArray(projectContext.graphMutationsPreview));
  assert.ok(projectContext.graphMutationsPreview.length >= 1);
  assert.equal(projectContext.graphMutationsPreview[0].type, 'set_prop');
  assert.equal(projectContext.graphMutationsPreview[0].preview, true);
  assert.equal(projectContext.graphMutationsPreview[0].nodeId, 'node_ctx');
  assert.ok(projectContext.graphMutationApplyResult);
  assert.ok(Array.isArray(projectContext.graphMutationApplyResult.applied));
  assert.ok(Array.isArray(projectContext.graphMutationApplyResult.rejected));
  assert.ok(projectContext.graphMutationApplyResult.applied.length >= 1);
  assert.equal(projectContext.graphMutationApplyResult.rejected.length, 0);
  assert.ok(report.projectContext.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.ok(report.projectContext.truthSources.some((source) => source.relativePath === 'brain/emergence/state.json' && source.authority === 'derived-state'));
  assert.ok(report.projectContext.truthSources.some((source) => source.relativePath === 'brain/emergence/roadmap.md' && source.authority === 'canonical-anchor'));
  assert.ok(report.confidence > report.legacyConfidence);
  assert.ok(report.scores.intentConfidence >= 0.45);
  assert.ok(report.scores.plannerUsefulness >= 0.65);
  assert.ok(report.scores.executionReadiness < report.scores.plannerUsefulness);
  assert.equal(report.truth.intentType, 'ACE architecture / capability request');
  assert.ok(report.truth.requestedOutcomes.length >= 1);
  assert.match(report.truth.plannerBrief, /Planner should treat this as/i);
  assert.ok(Array.isArray(report.truth.evidence));
  assert.ok(report.intentContract);
  assert.equal(report.intentContract.sourceType, 'sanctioned-intent-parser');
  assert.equal(report.intentContract.canonicalIntent.requestedBy, 'context-manager');
  assert.ok(report.intentContract.canonicalIntent.requestedOutcomes.length >= 1);
  assert.ok(report.metrics.featureRequestSignals >= 1);
  assert.equal(report.metrics.executionSignals, 0);
  assert.match(
    report.criteria.find((criterion) => criterion.id === 'actionability')?.reason || '',
    /feature-request phrasing/i,
  );
  assert.ok(report.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.ok(report.provenance.anchors.some((anchor) => anchor.anchorRef === 'brain/emergence/roadmap.md'));

  const canonicalContract = buildCanonicalIntentContract({
    report,
    packet: {
      summary: report.summary,
      goal: report.goal,
      requestedOutcomes: report.requestedOutcomes,
      tasks: report.tasks,
      targets: report.targets,
      constraints: report.constraints,
      requestType: report.requestType,
      urgency: report.urgency,
      sourceType: 'sketchpad-graph',
      sourceRef: 'graph-node-1',
      requestedBy: 'cto',
      priority: 'high',
      anchorRefs: report.anchorRefs,
    },
    sourceType: 'sketchpad-graph',
    sourceRef: 'graph-node-1',
    requestedBy: 'cto',
    priority: 'high',
    timestamp: '2026-03-23T07:05:00.000Z',
    intentId: 'intent_sketchpad_1',
  });
  assert.equal(canonicalContract.intentId, 'intent_sketchpad_1');
  assert.equal(canonicalContract.sourceType, 'sketchpad-graph');
  assert.equal(canonicalContract.sourceRef, 'graph-node-1');
  assert.equal(canonicalContract.canonicalIntent.requestedBy, 'cto');
  assert.equal(canonicalContract.priority, 'high');

  const strokeGeometry = {
    kind: 'stroke',
    stroke: [
      { x: 10, y: 20 },
      { x: 16, y: 24 },
      { x: 24, y: 28 },
    ],
  };
  const firstStrokeInterpretation = interpretSpatialGeometry(strokeGeometry);
  const secondStrokeInterpretation = interpretSpatialGeometry(strokeGeometry);
  assert.deepEqual(firstStrokeInterpretation.semanticMeaning, secondStrokeInterpretation.semanticMeaning);
  assert.equal(firstStrokeInterpretation.confidence, secondStrokeInterpretation.confidence);
  assert.equal(firstStrokeInterpretation.semanticMeaning.requestType, 'flow_influence');
  assert.equal(firstStrokeInterpretation.status, 'canonical');
  assert.ok(firstStrokeInterpretation.provenance.reasoning.some((entry) => entry.includes('kind=stroke')));

  const regionInterpretation = interpretSpatialGeometry({
    kind: 'region',
    region: { bounds: { x: 4, y: 6, width: 20, height: 10 } },
  });
  assert.equal(regionInterpretation.semanticMeaning.requestType, 'build_pressure');
  assert.equal(regionInterpretation.status, 'canonical');
  assert.ok(regionInterpretation.provenance.reasoning.some((entry) => entry.includes('kind=region')));

  const unknownInterpretation = interpretSpatialGeometry({});
  assert.equal(unknownInterpretation.status, 'degraded');
  assert.ok(unknownInterpretation.missingFields.includes('geometry'));
  assert.ok(unknownInterpretation.missingFields.includes('semanticMeaning'));
  assert.ok(unknownInterpretation.provenance.reasoning.some((entry) => entry.includes('kind=unknown')));

  const canonicalGeometryContract = buildCanonicalIntentContract({
    report: {},
    packet: {
      geometry: strokeGeometry,
      sourceType: 'sketchpad-stroke',
      sourceRef: 'stroke-1',
      requestedBy: 'sketchpad',
    },
    sourceType: 'sketchpad-stroke',
    sourceRef: 'stroke-1',
    requestedBy: 'sketchpad',
    timestamp: '2026-04-02T12:51:00.000Z',
  });
  assert.equal(canonicalGeometryContract.canonicalIntent.semanticMeaning.requestType, 'flow_influence');
  assert.equal(canonicalGeometryContract.canonicalIntent.status, 'canonical');
  assert.ok(canonicalGeometryContract.canonicalIntent.provenance.reasoning.some((entry) => entry.includes('kind=stroke')));
  assert.ok(canonicalGeometryContract.canonicalIntent.fieldInfluence);
  assert.equal(canonicalGeometryContract.canonicalIntent.fieldInfluence.fieldKey, 'buildDesirability');
  assert.equal(canonicalGeometryContract.canonicalIntent.fieldInfluence.status, 'canonical');
  assert.ok(canonicalGeometryContract.canonicalIntent.fieldInfluence.provenance.reasoning.some((entry) => entry.includes('field=build_desirability')));

  const repeatedFieldInfluence = deriveSpatialIntentFieldInfluence(canonicalGeometryContract.canonicalIntent);
  assert.deepEqual(
    canonicalGeometryContract.canonicalIntent.fieldInfluence.field.baseLayer.values,
    repeatedFieldInfluence.field.baseLayer.values,
  );

  const regionFieldInfluence = deriveSpatialIntentFieldInfluence({
    ...canonicalGeometryContract.canonicalIntent,
    geometry: {
      kind: 'region',
      region: { bounds: { x: 4, y: 6, width: 20, height: 10 } },
    },
  });
  assert.notDeepEqual(
    canonicalGeometryContract.canonicalIntent.fieldInfluence.field.baseLayer.values,
    regionFieldInfluence.field.baseLayer.values,
  );
  assert.ok(regionFieldInfluence.field.baseLayer.values.some((row) => row.some((value) => value > 0.08)));

  const degradedFieldInfluence = deriveSpatialIntentFieldInfluence({
    id: 'intent_missing_geometry',
    confidence: 0.12,
    status: 'degraded',
    missingFields: ['geometry', 'semanticMeaning'],
    provenance: { sourceType: 'sketchpad-stroke' },
  });
  assert.equal(degradedFieldInfluence.status, 'degraded');
  assert.ok(degradedFieldInfluence.missingFields.includes('geometry'));
  assert.ok(degradedFieldInfluence.missingFields.includes('semanticMeaning'));

  const normalizedProjectContext = buildIntentProjectContext({
    workspace: {
      graphs: {
        system: {
          nodes: [
            {
              id: 'node_sys_ctx',
              type: 'module',
              content: 'System layer runtime anchor',
              metadata: { role: 'module' },
            },
          ],
          edges: [],
        },
        world: {
          nodes: [
            {
              id: 'node_world_ctx',
              type: 'text',
              content: 'World field visibility pressure planner',
              metadata: { agentId: 'context-manager' },
            },
          ],
          edges: [],
        },
      },
    },
    readDashboardFile(relativePath) {
      if (relativePath === 'brain/emergence/state.json') {
        return {
          parsed: {
            current_focus: 'World graph bridge',
            next_actions: ['Bridge graph bundle into intent analysis'],
            blockers: ['Keep the bridge narrow'],
          },
        };
      }
      if (relativePath === 'brain/emergence/plan.md') {
        return { content: 'Plan the graph bridge and preserve existing intent output.' };
      }
      if (relativePath === 'brain/emergence/project_brain.md') {
        return { content: 'ACE now consumes the normalized graph bundle.' };
      }
      if (relativePath === 'brain/emergence/roadmap.md') {
        return { content: 'Roadmap: use graph/world state for intent intake.' };
      }
      if (relativePath === 'brain/emergence/tasks.md') {
        return { content: '- Bridge normalized graph bundle\n- Keep legacy fallback intact\n' };
      }
      if (relativePath === 'brain/emergence/decisions.md') {
        return { content: '2026-03-27: Keep graph bundle consumption narrow.' };
      }
      if (relativePath === 'brain/emergence/changelog.md') {
        return { content: '2026-03-27: Graph bundle bridge noted.' };
      }
      return { parsed: {}, content: '' };
    },
  });

  assert.ok(normalizedProjectContext.keywords.includes('world'));
  assert.ok(normalizedProjectContext.keywords.includes('field'));
  assert.ok(normalizedProjectContext.keywords.includes('visibility'));
  assert.ok(normalizedProjectContext.sourcesRead.includes('brain/emergence/state.json'));
  assert.ok(Array.isArray(normalizedProjectContext.graphMutationsPreview));
  assert.ok(normalizedProjectContext.graphMutationsPreview.length >= 1);
  assert.equal(normalizedProjectContext.graphMutationsPreview[0].nodeId, 'node_world_ctx');
  assert.ok(normalizedProjectContext.graphMutationApplyResult);
  assert.ok(normalizedProjectContext.graphMutationApplyResult.applied.length >= 1);
  assert.equal(normalizedProjectContext.graphMutationApplyResult.rejected.length, 0);

  const normalizedReport = analyzeSpatialIntent(
    'We should wire world field visibility into the planner without changing the UI.',
    normalizedProjectContext,
  );

  assert.ok(normalizedReport.projectContext.matchedTerms.includes('world'));
  assert.ok(normalizedReport.projectContext.matchedTerms.includes('field'));
  assert.ok(normalizedReport.projectContext.matchedTerms.includes('visibility'));
  assert.ok(Array.isArray(normalizedReport.projectContext.graphMutationsPreview));
  assert.ok(normalizedReport.projectContext.graphMutationsPreview.length >= 1);
  assert.match(normalizedReport.truth.plannerBrief, /Planner should treat this as/i);

  const partialProjectContext = buildIntentProjectContext({
    workspace: {
      graphs: {
        system: {
          nodes: null,
          edges: null,
        },
        world: {
          nodes: [],
          edges: [],
        },
      },
    },
    readDashboardFile(relativePath) {
      if (relativePath === 'brain/emergence/state.json') {
        return {
          parsed: {
            current_focus: 'Partial graph fallback',
            next_actions: [],
            blockers: [],
          },
        };
      }
      if (relativePath === 'brain/emergence/plan.md') {
        return { content: 'Plan stays stable when graph data is partial.' };
      }
      if (relativePath === 'brain/emergence/project_brain.md') {
        return { content: 'Intent intake should fail safely on partial graph bundles.' };
      }
      if (relativePath === 'brain/emergence/roadmap.md') {
        return { content: 'Roadmap keeps compatibility paths until the bridge is stable.' };
      }
      if (relativePath === 'brain/emergence/tasks.md') {
        return { content: '- Preserve fallback behavior\n' };
      }
      if (relativePath === 'brain/emergence/decisions.md') {
        return { content: '2026-03-27: Partial graph data must not crash intent analysis.' };
      }
      if (relativePath === 'brain/emergence/changelog.md') {
        return { content: '2026-03-27: Partial bundle fallback recorded.' };
      }
      return { parsed: {}, content: '' };
    },
  });

  assert.ok(Array.isArray(partialProjectContext.keywords));
  assert.ok(partialProjectContext.keywords.length > 0);
  assert.ok(partialProjectContext.sourcesRead.includes('brain/emergence/state.json'));
  assert.deepEqual(partialProjectContext.graphMutationsPreview, []);
  assert.ok(partialProjectContext.graphMutationApplyResult);
  assert.deepEqual(partialProjectContext.graphMutationApplyResult.applied, []);
  assert.deepEqual(partialProjectContext.graphMutationApplyResult.rejected, []);

  const partialReport = analyzeSpatialIntent(
    'Keep intent analysis stable when graph data is partial.',
    partialProjectContext,
  );

  assert.ok(partialReport.requestedOutcomes.length >= 1);
  assert.ok(Array.isArray(partialReport.projectContext.matchedTerms));
  assert.deepEqual(partialReport.projectContext.graphMutationsPreview, []);
  assert.deepEqual(partialReport.projectContext.graphMutationApplyResult.applied, []);
  assert.deepEqual(partialReport.projectContext.graphMutationApplyResult.rejected, []);

  const precedenceReport = analyzeSpatialIntent(
    'Document decision protocols and changelog provenance alongside roadmap milestone gates.',
    projectContext,
  );
  const precedenceAnchors = precedenceReport.provenance.anchors.map((anchor) => anchor.anchorRef);
  assert.ok(precedenceAnchors.includes('brain/emergence/roadmap.md'));
  assert.ok(precedenceAnchors.includes('brain/emergence/decisions.md'));
  assert.ok(precedenceAnchors.includes('brain/emergence/changelog.md'));
  const roadmapIdx = precedenceAnchors.indexOf('brain/emergence/roadmap.md');
  const decisionsIdx = precedenceAnchors.indexOf('brain/emergence/decisions.md');
  const changelogIdx = precedenceAnchors.indexOf('brain/emergence/changelog.md');
  assert.ok(roadmapIdx >= 0 && decisionsIdx >= 0 && changelogIdx >= 0);
  assert.ok(roadmapIdx < changelogIdx);
  assert.ok(decisionsIdx <= changelogIdx);
}
