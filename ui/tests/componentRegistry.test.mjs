import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const componentRegistryPath = path.resolve(process.cwd(), 'public', 'spatial', 'componentRegistry.js');

export default async function runComponentRegistryTests() {
  const registry = await loadModuleCopy(componentRegistryPath, { label: 'componentRegistry' });

  assert.ok(Array.isArray(registry.COMPONENT_REGISTRY));
  assert.ok(Array.isArray(registry.COMPONENT_STATUSES));
  assert.deepEqual(registry.COMPONENT_STATUSES, ['active', 'experimental', 'deprecated']);

  const entries = registry.COMPONENT_REGISTRY;
  const ids = entries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(registry.validateComponentRegistry(entries), true);

  for (const entry of entries) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.name, 'string');
    assert.equal(typeof entry.type, 'string');
    assert.equal(typeof entry.status, 'string');
    assert.equal(typeof entry.domain, 'string');
    assert.ok(Array.isArray(entry.inputs));
    assert.ok(Array.isArray(entry.outputs));
    assert.ok(Array.isArray(entry.consumers));
    assert.ok(registry.COMPONENT_STATUSES.includes(entry.status));
  }

  const studioLayoutModel = registry.getComponentById('studio_layout_model');
  assert.deepEqual(studioLayoutModel, {
    id: 'studio_layout_model',
    name: 'Studio Layout Model',
    type: 'ui_model',
    status: 'active',
    domain: 'layout',
    inputs: ['studio_layout_schema', 'staffing_rules'],
    outputs: ['normalized layout', 'render model', 'desk map'],
    consumers: ['spatialApp', 'studio_mutations', 'roster_surface'],
    notes: 'Builds the derived studio render model from canonical layout data.',
  });

  assert.equal(registry.getComponentById('missing-component'), null);
  assert.deepEqual(registry.listComponentsByStatus('experimental').map((entry) => entry.id).sort(), ['agent_assignment_model', 'agent_context']);
  assert.ok(registry.listComponentsByDomain('layout').some((entry) => entry.id === 'studio_mutations'));
  assert.ok(registry.listActiveComponents().some((entry) => entry.id === 'staffing_rules'));
  assert.ok(!registry.listActiveComponents().some((entry) => entry.id === 'agent_context'));
}
