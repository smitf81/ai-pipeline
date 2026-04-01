import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runQAAuditTrailTests() {
  const { buildQAAuditTrail, summarizeQAAuditTrail } = require(path.resolve(process.cwd(), '..', 'qa', 'qaAuditTrail.js'));

  const structuredReport = {
    status: 'pass',
    summary: 'All QA suites passed',
    generatedAt: '2026-04-01T10:00:00.000Z',
    generatedBy: {
      system: 'qa',
      module: 'qa/qaLead.runAll',
    },
    finishedAt: '2026-04-01T10:00:00.000Z',
    desks: [
      {
        desk: 'planner',
        tests: [
          {
            name: 'contract_check',
            status: 'pass',
            qualityCard: {
              id: 'planner.contract_check',
              desk: 'planner',
              testId: 'contract_check',
              testName: 'Planner contract check',
              status: 'pass',
              updatedAt: '2026-04-01T10:00:00.000Z',
              sourceTrace: {
                freshnessClass: 'derived_current',
                sourcePath: 'data/spatial/qa/structured/latest.json',
                observedAt: '2026-04-01T10:00:00.000Z',
              },
            },
          },
        ],
      },
    ],
    sourceTrace: {
      freshnessClass: 'live_canonical',
      sourcePath: 'data/spatial/qa/structured/latest.json',
      observedAt: '2026-04-01T10:00:00.000Z',
    },
  };

  const auditTrail = buildQAAuditTrail({
    structuredReport,
    structuredSummary: {
      finishedAt: '2026-04-01T10:00:00.000Z',
      summary: 'All QA suites passed',
    },
    scorecards: [
      {
        id: 'planner.contract_check',
        desk: 'planner',
        testId: 'contract_check',
        testName: 'Planner contract check',
        status: 'fail',
        updatedAt: '2026-04-01T10:00:00.000Z',
        sourceTrace: {
          freshnessClass: 'derived_current',
          sourcePath: 'data/spatial/qa/structured/latest.json',
          observedAt: '2026-04-01T10:00:00.000Z',
        },
      },
    ],
    latestBrowserRun: {
      id: 'qa_manual_1',
      scenario: 'layout-pass',
      status: 'pass',
      verdict: 'pass',
      finishedAt: '2026-04-01T10:05:00.000Z',
      sourceTrace: {
        freshnessClass: 'live_canonical',
        sourcePath: 'data/spatial/qa/qa_manual_1.json',
        observedAt: '2026-04-01T10:05:00.000Z',
      },
    },
    localGate: {
      unit: {
        status: 'pass',
        finishedAt: '2026-04-01T10:03:00.000Z',
        sourceTrace: {
          freshnessClass: 'live_canonical',
          sourcePath: 'data/spatial/qa/local-gates/test-unit-latest.json',
          observedAt: '2026-04-01T10:03:00.000Z',
        },
      },
    },
  });

  const summary = summarizeQAAuditTrail(auditTrail);
  if (summary.total !== auditTrail.entries.length) {
    throw new Error(`expected summary total ${summary.total} to match audit entries ${auditTrail.entries.length}`);
  }
  if (summary.mismatch !== 1) {
    throw new Error(`expected one audit mismatch, saw ${summary.mismatch}`);
  }
  const scorecardAudit = auditTrail.entries.find((entry) => entry.kind === 'scorecard');
  if (!scorecardAudit || scorecardAudit.status !== 'mismatch') {
    throw new Error('expected the scorecard audit entry to be flagged as mismatch');
  }
  const reportAudit = auditTrail.entries.find((entry) => entry.kind === 'structured-report');
  if (!reportAudit || reportAudit.status !== 'ok') {
    throw new Error('expected the structured report audit entry to remain ok');
  }
  if (!Array.isArray(reportAudit.sourceArtifacts) || !reportAudit.sourceArtifacts.length) {
    throw new Error('expected structured report audit to expose source artifacts');
  }

  const missingAudit = buildQAAuditTrail({
    structuredReport: null,
    scorecards: [
      {
        id: 'planner.contract_check',
        desk: 'planner',
        testId: 'contract_check',
        testName: 'Planner contract check',
        status: 'pass',
      },
    ],
  });
  const missingScorecard = missingAudit.entries.find((entry) => entry.kind === 'scorecard');
  if (!missingScorecard || missingScorecard.status !== 'missing') {
    throw new Error('expected missing structured evidence to downgrade the scorecard audit entry to missing');
  }
}
