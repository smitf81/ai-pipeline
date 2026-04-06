import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQAStatePayload,
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  QA_REPAIR_LANES,
  buildQaRepairLoopState,
  getQaRepairLaneConfig,
} = require('../qaRepairLoop.js');
const {
  emptyQaLaneCanaryState,
} = require('../qaLaneCanaries.js');

export default async function runQaRepairLaneContractTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const qaState = buildQAStatePayload(repoRoot, {
    qaCanaries: emptyQaLaneCanaryState(),
  });
  const repairLoop = buildQaRepairLoopState(repoRoot);
  const routeLane = getQaRepairLaneConfig('route_contract_health');

  assert.equal(QA_REPAIR_LANES.length, 4);
  assert.deepEqual(repairLoop.lanes.map((lane) => lane.lane_id), ['ui_boot_integrity', 'validation_seam', 'route_contract_health', 'planner_canonical_integrity']);
  assert.equal(repairLoop.summary.totalLanes, 4);
  assert.ok(routeLane);
  assert.equal(routeLane.label, 'Route + Contract Health');
  assert.equal(routeLane.owner_department, 'QA');
  assert.ok(routeLane.scoped_targets.includes('ui/server.js'));
  assert.ok(routeLane.scoped_targets.includes('ui/tests/qaRepairLaneContracts.test.mjs'));
  assert.ok(routeLane.validation_checks.some((check) => check.test_file === 'tests/qaRepairLaneContracts.test.mjs'));

  const routeLaneState = repairLoop.lanes.find((lane) => lane.lane_id === 'route_contract_health');
  assert.ok(routeLaneState);
  assert.ok(['idle', 'watching', 'active', 'healthy', 'stalled'].includes(routeLaneState.status));
  assert.ok(routeLaneState.repair_job_count >= 0);
  assert.ok(routeLaneState.open_investigations >= 0);
  assert.equal(routeLaneState.trust_level, 'medium');
  assert.match(routeLaneState.eligibility_summary, /route_contract_mismatch/);

  const validationLaneState = repairLoop.lanes.find((lane) => lane.lane_id === 'validation_seam');
  assert.ok(validationLaneState);
  assert.equal(validationLaneState.trust_level, 'high');
  assert.ok(validationLaneState.scoped_targets.includes('ui/externalQaProbe.js'));

  const deskPayload = buildDeskPropertiesPayload({
    studio: {
      layout: createDefaultStudioLayoutSchema(),
    },
  }, 'qa-lead', qaState);

  assert.ok(deskPayload.qa.repairLoop);
  assert.equal(deskPayload.qa.repairLoop.lanes.length, 4);
  assert.equal(deskPayload.qa.repairLoop.summary.totalLanes, 4);
  assert.equal(deskPayload.qa.repairLoop.lanes.find((lane) => lane.lane_id === 'route_contract_health')?.label, 'Route + Contract Health');
  assert.equal(deskPayload.qa.repairLoop.lanes.find((lane) => lane.lane_id === 'route_contract_health')?.status, routeLaneState.status);
}
