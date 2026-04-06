import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeJson(rootPath, relativePath, payload) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export default async function runIntentExtractionSurfaceTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-intent-surface-'));
  const {
    buildCanonicalIntentExtractionState,
    buildGovernedLoopContract,
    persistCanonicalIntakeRecord,
    readSpatialWorkspace,
  } = require('../server.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: {
      system: { nodes: [], edges: [] },
      world: { nodes: [], edges: [] },
    },
    pages: [],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'Intent page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: {
      currentIntentId: 'intent_extracted_1',
      latestIntentId: 'intent_extracted_1',
      byId: {
        intent_extracted_1: {
          id: 'intent_extracted_1',
          source: { type: 'canvas-text', ref: 'prompt-extracted', requestedBy: 'canvas-intent' },
          geometry: { kind: 'region', region: { bounds: { x: 1, y: 1, width: 4, height: 4 } }, stroke: null },
          semanticMeaning: {
            summary: 'Expose governed loop intake in canvas.',
            statement: 'Expose governed loop intake in canvas.',
            goal: 'Expose governed loop intake in canvas.',
            requestType: 'context_request',
            requestedOutcomes: ['Show canonical extraction'],
            targets: ['canvas'],
            constraints: ['No heuristics'],
            urgency: 'normal',
            labels: ['governed-loop'],
          },
          confidence: 0.91,
          provenance: { sourceType: 'canvas-text', sourceRef: 'prompt-extracted' },
          missingFields: [],
          status: 'canonical',
        },
      },
      records: [],
    },
    currentIntentId: 'intent_extracted_1',
    summary: 'Expose governed loop intake in canvas.',
    status: 'ready',
  });

  let write = persistCanonicalIntakeRecord({
    id: 'intake_extracted',
    channel: 'canvas_text',
    text: 'Expose governed loop intake in canvas.',
    sourceType: 'canvas-text',
    sourceRef: 'prompt-extracted',
    requestedBy: 'canvas-intent',
    originRoute: '/api/spatial/executive/route',
    intentExtraction: buildCanonicalIntentExtractionState({
      status: 'extracted',
      canonicalIntent: {
        id: 'intent_extracted_1',
        sourceType: 'canvas-text',
        sourceRef: 'prompt-extracted',
        geometry: { kind: 'region', region: { bounds: { x: 1, y: 1, width: 4, height: 4 } } },
        semanticMeaning: {
          summary: 'Expose governed loop intake in canvas.',
          statement: 'Expose governed loop intake in canvas.',
          goal: 'Expose governed loop intake in canvas.',
          requestType: 'context_request',
          requestedOutcomes: ['Show canonical extraction'],
          targets: ['canvas'],
          constraints: ['No heuristics'],
          urgency: 'normal',
          labels: ['governed-loop'],
        },
        confidence: 0.91,
      },
    }),
    canonicalIntentId: 'intent_extracted_1',
  }, { rootPath });

  write = persistCanonicalIntakeRecord({
    id: 'intake_degraded',
    channel: 'canvas_text',
    text: 'Something ambiguous on canvas.',
    sourceType: 'canvas-text',
    sourceRef: 'prompt-degraded',
    requestedBy: 'canvas-intent',
    originRoute: '/api/spatial/executive/route',
    intentExtraction: buildCanonicalIntentExtractionState({
      status: 'degraded',
      canonicalIntent: {
        id: 'intent_degraded_1',
        sourceType: 'canvas-text',
        sourceRef: 'prompt-degraded',
        geometry: { kind: 'unknown', region: null, stroke: null },
        semanticMeaning: {
          summary: '',
          statement: '',
          goal: '',
          requestType: 'context_request',
          requestedOutcomes: [],
          targets: [],
          constraints: [],
          urgency: 'normal',
          labels: [],
        },
        confidence: 0.11,
      },
    }),
    canonicalIntentId: 'intent_degraded_1',
  }, { rootPath, workspace: write.workspace });

  persistCanonicalIntakeRecord({
    id: 'intake_failed',
    channel: 'canvas_text',
    text: 'Fail this extraction honestly.',
    sourceType: 'canvas-text',
    sourceRef: 'prompt-failed',
    requestedBy: 'canvas-intent',
    originRoute: '/api/spatial/executive/route',
    intentExtraction: buildCanonicalIntentExtractionState({
      status: 'failed',
      reason: 'Context Manager could not produce an intent report.',
    }),
  }, { rootPath, workspace: write.workspace });

  const rereadWorkspace = readSpatialWorkspace(rootPath);
  const records = rereadWorkspace.studio.intake.records;
  const extracted = records.find((record) => record.id === 'intake_extracted');
  const degraded = records.find((record) => record.id === 'intake_degraded');
  const failed = records.find((record) => record.id === 'intake_failed');

  assert.equal(extracted.intentExtraction.status, 'extracted');
  assert.equal(extracted.intentExtraction.canonicalIntentId, 'intent_extracted_1');
  assert.equal(extracted.intentExtraction.summary, 'Expose governed loop intake in canvas.');
  assert.equal(degraded.intentExtraction.status, 'degraded');
  assert.equal(degraded.intentExtraction.canonicalIntentId, 'intent_degraded_1');
  assert.equal(failed.intentExtraction.status, 'failed');
  assert.equal(failed.intentExtraction.reason, 'Context Manager could not produce an intent report.');
  assert.equal(failed.text, 'Fail this extraction honestly.');

  const contract = buildGovernedLoopContract(null, { rootPath });
  const contractRecords = contract.domains.input.intake.records;
  assert.equal(contractRecords.find((record) => record.id === 'intake_extracted').intentExtraction.status, 'extracted');
  assert.equal(contractRecords.find((record) => record.id === 'intake_degraded').intentExtraction.status, 'degraded');
  assert.equal(contractRecords.find((record) => record.id === 'intake_failed').intentExtraction.status, 'failed');
  assert.equal(contractRecords.find((record) => record.id === 'intake_failed').text, 'Fail this extraction honestly.');
  assert.equal(contract.domains.input.currentIntentId, 'intent_extracted_1');
}
