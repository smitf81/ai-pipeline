import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadGhostExports() {
  const ghostPath = path.resolve(process.cwd(), 'public', 'spatial', 'ghostProjection.js');
  const source = fs.readFileSync(ghostPath, 'utf8');
  const transformed = source.replace(/export\s*\{[\s\S]*\};?\s*$/m, `module.exports = {
  buildGhostProjectionFromIntent,
  buildGhostProjectionRegistryPayload,
  buildGhostProjectionRecord,
  createEmptyGhostProjectionRegistry,
  getCurrentGhostProjection,
  normalizeGhostProjectionRecord,
  normalizeGhostProjectionStatus,
  removeGhostProjectionBySourceIntentId,
  summarizeGhostProjection,
  upsertGhostProjectionRegistry,
};`);
  const mod = { exports: {} };
  vm.runInNewContext(transformed, {
    module: mod,
    exports: mod.exports,
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Set,
    Map,
    RegExp,
    parseFloat,
    parseInt,
    isFinite,
  }, { filename: ghostPath });
  return mod.exports;
}

function loadMutationEngine(ghostExports) {
  const enginePath = path.resolve(process.cwd(), 'public', 'spatial', 'mutationEngine.js');
  let source = fs.readFileSync(enginePath, 'utf8');
  source = source.replace(/import\s*\{[\s\S]*?\}\s*from\s*'\.\/ghostProjection\.js';\s*/m, `const {
  buildGhostProjectionFromIntent,
  buildGhostProjectionRegistryPayload,
  createEmptyGhostProjectionRegistry,
  removeGhostProjectionBySourceIntentId,
  upsertGhostProjectionRegistry,
} = ghostExports;\n`);
  source = source.replace(/export class MutationEngine/, 'class MutationEngine');
  source += '\nmodule.exports = { MutationEngine };\n';
  const mod = { exports: {} };
  vm.runInNewContext(source, {
    module: mod,
    exports: mod.exports,
    ghostExports,
    console,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    JSON,
    Set,
    Map,
    RegExp,
    parseFloat,
    parseInt,
    isFinite,
  }, { filename: enginePath });
  return mod.exports;
}

export default async function runGhostProjectionTests() {
  const { buildCanonicalIntentContract } = require(path.resolve(process.cwd(), 'intentAnalysis.js'));
  const ghostExports = loadGhostExports();
  const { MutationEngine } = loadMutationEngine(ghostExports);

  const wrapper = buildCanonicalIntentContract({
    report: {
      summary: 'Draw a build pressure region',
      statement: 'Draw a build pressure region',
      goal: 'Build pressure',
      requestType: 'sketchpad_input',
      confidence: 0.91,
      geometry: {
        kind: 'stroke',
        stroke: [
          { x: 12, y: 18 },
          { x: 44, y: 24 },
          { x: 76, y: 28 },
        ],
      },
      source: 'sketchpad-stroke',
      nodeId: 'sketch_probe_001',
      requestedBy: 'sketchpad',
    },
    packet: {
      summary: 'Draw a build pressure region',
      statement: 'Draw a build pressure region',
      goal: 'Build pressure',
      requestType: 'sketchpad_input',
      confidence: 0.91,
      geometry: {
        kind: 'stroke',
        stroke: [
          { x: 12, y: 18 },
          { x: 44, y: 24 },
          { x: 76, y: 28 },
        ],
      },
      sourceType: 'sketchpad-stroke',
      sourceRef: 'sketch_probe_001',
      requestedBy: 'sketchpad',
      priority: 'normal',
    },
    sourceType: 'sketchpad-stroke',
    sourceRef: 'sketch_probe_001',
    requestedBy: 'sketchpad',
    priority: 'normal',
    timestamp: '2026-04-02T13:00:00.000Z',
    provenance: {
      sourceNodeId: 'sketch_probe_001',
      inputMode: 'sketchpad',
      sketchMode: true,
      createdAt: '2026-04-02T13:00:00.000Z',
    },
    intentId: 'sketch_probe_001',
  });

  const canonicalIntent = wrapper.canonicalIntent;
  const engine = new MutationEngine({ getState: () => ({ nodes: [], edges: [] }) });
  const sourceNode = {
    id: canonicalIntent.id,
    content: canonicalIntent.summary,
    metadata: { graphLayer: 'system' },
  };

  const syncResult = engine.syncDraftNodesFromReport(sourceNode, canonicalIntent, { layer: 'system' });
  const registry = engine.getGhostProjectionRegistry();
  const projection = registry.byId[registry.currentProjectionId];
  const intentField = canonicalIntent.fieldInfluence;

  assert.equal(canonicalIntent.status, 'canonical');
  assert.ok(intentField);
  assert.equal(intentField.fieldKey, 'buildDesirability');
  assert.equal(intentField.status, 'canonical');
  assert.equal(syncResult.projectionRecords.length, 1);
  assert.equal(registry.records.length, 1);
  assert.deepEqual(projection.sourceIntentIds, ['sketch_probe_001']);
  assert.equal(projection.status, 'candidate');
  assert.equal(projection.confidence, 0.91);
  assert.ok(projection.reasoning.some((entry) => entry.includes('status=candidate')));
  assert.match(ghostExports.summarizeGhostProjection(projection), /confidence 91%/);
  assert.match(ghostExports.summarizeGhostProjection(projection), /Draw a build pressure region/);
  assert.equal(projection.provenance.createdAt, '2026-04-02T13:00:00.000Z');
  assert.equal(projection.provenance.sourceNodeId, 'sketch_probe_001');
  assert.equal(projection.provenance.sourceIntentId, 'sketch_probe_001');
  assert.equal(projection.provenance.reasoning, undefined);
  assert.equal(intentField.sourceIntentId, 'sketch_probe_001');
  assert.equal(intentField.sourceIntentConfidence, 0.91);
  assert.equal(intentField.provenance.createdAt, '2026-04-02T13:00:00.000Z');
}
