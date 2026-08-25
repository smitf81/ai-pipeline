import assert from 'node:assert/strict';
import {
  AXIOM_AGENT_INTENT_CONTRACT,
  AxiomIntentContractError,
  interpretAxiomNaturalLanguage,
  validateAxiomIntent
} from '../public/natural-language-agent.js';

const capabilities = [
  { id: 'conversation.respond', operation: 'respond', description: 'Talk without mutation.', arguments: {} },
  { id: 'system.capability_gap', operation: 'report_gap', description: 'Expose a missing executor.', arguments: {} },
  { id: 'mapforge.terrain.patch', operation: 'preview_patch', description: 'Preview exact terrain changes.', arguments: {} }
];

const terrainIntent = {
  contract: AXIOM_AGENT_INTENT_CONTRACT,
  outcome: 'act',
  intentSummary: 'Replace the obsolete inner rock enclosure and trace the expanded player area.',
  successCriteria: ['The old enclosure is replaced with its dominant adjacent floor.', 'A rock boundary traces the expanded region.'],
  plan: [{
    capability: 'mapforge.terrain.patch',
    operation: 'preview_patch',
    arguments: {
      expectedRevision: 230,
      label: 'Replace old enclosure and trace expanded boundary',
      operations: [
        { op: 'replace_component', componentId: 'rock_component_10_8_22_18_44', terrain: 'adjacent_dominant' },
        { op: 'trace_region_boundary', regionId: 'map_interior', terrain: 'rock', thickness: 1 }
      ]
    },
    reason: 'The request is a bounded edit to the active canonical Map Forge terrain.'
  }],
  clarification: null,
  confidence: 0.94
};

assert.equal(validateAxiomIntent(terrainIntent, capabilities).ok, true, 'a registered action contract should validate');

let calls = 0;
const direct = await interpretAxiomNaturalLanguage({
  complete: async () => { calls += 1; return JSON.stringify(terrainIntent); },
  userText: 'can you replace the old smaller rock tile boundary to encapsulate the new larger player area',
  observation: { mapForge: { revision: 230 } },
  capabilities
});
assert.equal(calls, 1, 'a valid model decision should not be reinterpreted');
assert.equal(direct.intent.plan[0].capability, 'mapforge.terrain.patch');
assert.equal(direct.repaired, false);

const visibleAttempts = [];
const repaired = await interpretAxiomNaturalLanguage({
  complete: async (_messages, options) => options.system.includes('REPAIR REQUIRED') ? JSON.stringify(terrainIntent) : 'not valid json',
  userText: 'replace the old boundary with grass and outline the larger playable area',
  capabilities,
  onAttempt: attempt => visibleAttempts.push(attempt)
});
assert.equal(repaired.repaired, true, 'one bounded repair should recover a malformed first response');
assert.deepEqual(visibleAttempts.map(attempt => attempt.ok), [false, true], 'both the failed parse and repaired contract must be externally observable');

let blocked = null;
try {
  await interpretAxiomNaturalLanguage({
    complete: async () => 'plain conversational prose',
    userText: 'change the active map terrain',
    capabilities
  });
} catch (error) {
  blocked = error;
}
assert.ok(blocked instanceof AxiomIntentContractError);
assert.equal(blocked.code, 'intent_contract_invalid');
assert.equal(blocked.detail.attempts.length, 2, 'invalid output must block after exactly one repair attempt');

const unknown = structuredClone(terrainIntent);
unknown.plan[0].capability = 'mapforge.magic.unregistered';
const unknownValidation = validateAxiomIntent(unknown, capabilities);
assert.equal(unknownValidation.ok, false);
assert.ok(unknownValidation.errors.includes('intent_capability_unavailable:mapforge.magic.unregistered'));

console.log('AXIOM natural-language agent contract tests passed.');
