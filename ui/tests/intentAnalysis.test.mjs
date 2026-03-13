import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runIntentAnalysisTests() {
  const intentAnalysisPath = path.resolve(process.cwd(), 'intentAnalysis.js');
  const {
    analyzeSpatialIntent,
    buildIntentProjectContext,
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
      if (relativePath === 'projects/emergence/state.json') {
        return {
          parsed: {
            current_focus: 'ACE Studio desks',
            next_actions: ['Expose desk workloads in Studio'],
            blockers: ['Need review gate before deploy'],
          },
        };
      }
      if (relativePath === 'projects/emergence/plan.md') {
        return { content: 'Plan the desk workflow and surface task states on the kanban board.' };
      }
      if (relativePath === 'projects/emergence/project_brain.md') {
        return { content: 'ACE Studio orchestrates desks, planner handoffs, executor work, and QA review.' };
      }
      if (relativePath === 'projects/emergence/roadmap.md') {
        return { content: 'Roadmap: add QA desk support and better planner-to-worker task flow.' };
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
  assert.ok(report.projectContext.sourcesRead.includes('projects/emergence/state.json'));
  assert.ok(report.projectContext.sourcesRead.includes('workspace.graph.context-manager-node'));
  assert.ok(report.confidence > report.legacyConfidence);
  assert.ok(report.scores.intentConfidence >= 0.45);
  assert.ok(report.scores.plannerUsefulness >= 0.65);
  assert.ok(report.scores.executionReadiness < report.scores.plannerUsefulness);
  assert.ok(report.metrics.featureRequestSignals >= 1);
  assert.equal(report.metrics.executionSignals, 0);
  assert.match(
    report.criteria.find((criterion) => criterion.id === 'actionability')?.reason || '',
    /feature-request phrasing/i,
  );
}
