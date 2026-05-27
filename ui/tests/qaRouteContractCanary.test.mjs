import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildDeskPropertiesPayload,
  buildQAStatePayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  emptyQaLaneCanaryState,
} = require('../qaLaneCanaries.js');

export default async function runQaRouteContractCanaryTests() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const qaState = buildQAStatePayload(repoRoot, {
    qaCanaries: emptyQaLaneCanaryState(),
  });
  const deskPayload = buildDeskPropertiesPayload({
    studio: {
      layout: createDefaultStudioLayoutSchema(),
    },
  }, 'qa-lead', qaState);

  assert.ok(deskPayload.qa);
  assert.ok(deskPayload.qa.repairLoop);
  assert.ok(deskPayload.qa.qaCanaries);
  assert.ok(deskPayload.qa.qaMcpLiveStatus);
  assert.ok(Array.isArray(deskPayload.qa.repairLoop.lanes));
  assert.ok(deskPayload.qa.repairLoop.lanes.some((lane) => lane.lane_id === 'route_contract_health'));
}
