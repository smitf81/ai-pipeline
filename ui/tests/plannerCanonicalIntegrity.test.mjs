import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default async function runPlannerCanonicalIntegrityTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-planner-integrity-'));
  const layoutSchemaPath = path.resolve(process.cwd(), 'studioLayoutSchema.js');
  const repairLoopPath = path.resolve(process.cwd(), 'qaRepairLoop.js');
  const integrityPath = path.resolve(process.cwd(), 'plannerCanonicalIntegrity.js');
  const probePath = path.resolve(process.cwd(), 'externalQaProbe.js');

  const {
    buildCanonicalPlannerCoverageTruth,
    createDefaultStudioLayoutSchema,
  } = require(layoutSchemaPath);
  const {
    buildPlannerCanonicalIntegrityState,
    buildPlannerCanonicalIntegrityInvestigation,
  } = require(integrityPath);
  const {
    buildQaRepairLoopState,
    getQaRepairLaneConfig,
    maybeBridgeOpenInvestigationsToRepairJobs,
    selectQaRepairLaneForInvestigation,
  } = require(repairLoopPath);
  const {
    readOpenQaInvestigations,
  } = require(probePath);

  const plannerLane = getQaRepairLaneConfig('planner_canonical_integrity');
  assert.ok(plannerLane);
  assert.equal(plannerLane.lane_id, 'planner_canonical_integrity');
  assert.equal(plannerLane.owner_department, 'Delivery');
  assert.ok(plannerLane.scoped_targets.includes('ui/studioLayoutSchema.js'));
  assert.ok(plannerLane.scoped_targets.includes('ui/public/spatial/staffingRules.js'));
  assert.ok(plannerLane.scoped_targets.includes('ui/agentWorkers.js'));

  const healthyLayout = createDefaultStudioLayoutSchema();
  const healthyCoverage = buildCanonicalPlannerCoverageTruth(healthyLayout);
  assert.equal(healthyCoverage.covered, true);

  const healthyState = buildPlannerCanonicalIntegrityState(rootPath, { layout: healthyLayout });
  assert.equal(healthyState.covered, true);
  assert.equal(healthyState.status, 'healthy');
  assert.equal(healthyState.trigger, null);
  assert.equal(healthyState.packagingTruth.known, false);

  const brokenLayout = clone(healthyLayout);
  brokenLayout.desks.planner.assignedAgentIds = [];
  brokenLayout.organization.planner.assignedAgentIds = [];
  brokenLayout.organization.planner.modelProfileId = 'model-profile.invalid';
  brokenLayout.organization.agents.planner.modelProfileId = 'model-profile.invalid';
  const brokenCoverage = buildCanonicalPlannerCoverageTruth(brokenLayout);
  assert.equal(brokenCoverage.covered, false);
  const firstInvestigation = buildPlannerCanonicalIntegrityInvestigation(rootPath, {
    layout: brokenLayout,
    checkedAt: '2026-04-06T08:00:00.000Z',
  });
  assert.equal(firstInvestigation.created, true);
  assert.equal(firstInvestigation.investigation.trigger, 'planner_truth_stale');
  assert.equal(firstInvestigation.investigation.repeat_count, 1);
  assert.equal(selectQaRepairLaneForInvestigation(firstInvestigation.investigation), null);

  const secondInvestigation = buildPlannerCanonicalIntegrityInvestigation(rootPath, {
    layout: brokenLayout,
    checkedAt: '2026-04-06T08:01:00.000Z',
  });
  assert.equal(secondInvestigation.created, false);
  assert.equal(secondInvestigation.investigation.repeat_count, 2);
  assert.equal(selectQaRepairLaneForInvestigation(secondInvestigation.investigation)?.lane_id, 'planner_canonical_integrity');

  const bridgedJobs = maybeBridgeOpenInvestigationsToRepairJobs(rootPath, {
    investigations: readOpenQaInvestigations(rootPath, 10),
  });
  assert.ok(bridgedJobs.some((job) => job.lane === 'planner_canonical_integrity'));
  const repairLoop = buildQaRepairLoopState(rootPath);
  const plannerLaneState = repairLoop.lanes.find((lane) => lane.lane_id === 'planner_canonical_integrity');
  assert.ok(plannerLaneState);
  assert.equal(plannerLaneState.open_job_count, 1);
  assert.equal(plannerLaneState.latest_attempt_verdict, null);

  const packagingMismatchState = buildPlannerCanonicalIntegrityState(rootPath, {
    layout: healthyLayout,
    plannerRun: {
      id: 'planner_run_contract_1',
      summary: 'Planner contract mismatch.',
      planningMode: 'normal',
      planBundle: {
        planId: 'plan_bundle_1',
        intentId: 'intent_1',
        status: 'ready',
        items: [
          {
            planId: 'plan_1',
            intentId: 'intent_1',
            status: 'ready',
            targetDesk: 'executor',
            targetRole: 'Executor',
          },
        ],
      },
      taskBundle: {
        taskBundleId: 'task_bundle_1',
        intentId: 'intent_1',
        status: 'ready',
        tasks: [
          {
            taskId: 'task_1',
            planId: 'plan_1',
            intentId: 'intent_1',
            status: 'planned',
            targetDesk: 'planner',
            targetRole: 'Planner',
          },
        ],
      },
      qaRequest: {
        qaRequestId: 'qa_1',
        intentId: 'intent_1',
        status: 'ready',
        targetDesk: 'qa-lead',
        targetRole: 'QA Lead',
      },
      hireRequest: {
        hireRequestId: 'hire_1',
        intentId: 'intent_1',
        status: 'queued',
        targetDesk: 'planner',
        targetRole: 'Planner',
      },
    },
  });
  assert.equal(packagingMismatchState.covered, false);
  assert.equal(packagingMismatchState.trigger, 'planner_target_mismatch');
  assert.ok(packagingMismatchState.packagingTruth.failedPredicates.some((predicate) => predicate.key === 'planner-plan-target-class'));
  assert.ok(packagingMismatchState.packagingTruth.failedPredicates.some((predicate) => predicate.key === 'planner-task-target-class'));
}
