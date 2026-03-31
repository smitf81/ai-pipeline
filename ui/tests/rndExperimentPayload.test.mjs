import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runRndExperimentPayloadTests() {
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const {
    buildDeskPropertiesPayload,
    createDefaultStudioLayoutSchema,
  } = require(serverPath);

  const payload = buildDeskPropertiesPayload({
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    studio: {
      layout: createDefaultStudioLayoutSchema(),
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      deskProperties: {},
      agentWorkers: {},
      teamBoard: { cards: [], selectedCardId: null, summary: {} },
      handoffs: {},
    },
  }, 'rnd-lead');

  assert.equal(Array.isArray(payload.experiments), true);
  assert.equal(payload.experiments.length, 1);
  assert.equal(payload.experiments[0].id, 'RND-0001-JFA-2D');
  assert.equal(payload.experiments[0].lifecycle, 'proposed');
  assert.equal(payload.experiments[0].integration_target, 'delivery-planning');
  assert.deepEqual(payload.experiments[0].what_worked, []);
  assert.deepEqual(payload.experiments[0].what_failed, []);
  assert.deepEqual(payload.experiments[0].reusable_components, []);
  assert.deepEqual(payload.experiments[0].extracted_primitives, []);
  assert.equal(payload.experiments[0].promotion_readiness.state, 'blocked');
  assert.equal(payload.experiments[0].promotion_readiness.eligible, false);
  assert.ok(payload.experiments[0].promotion_readiness.reasons.includes('Basic QA has not passed.'));
  assert.ok(payload.experiments[0].promotion_readiness.reasons.includes('At least one extracted primitive is required.'));
  assert.equal(payload.experimentContract, 'rnd-experiment.v1');
}
