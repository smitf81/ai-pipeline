import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  appendQaInvestigation,
  buildQaInvestigationRecord,
  readQaInvestigations,
} = require('../externalQaProbe.js');
const {
  buildQAStatePayload,
  buildDeskPropertiesPayload,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const {
  buildQaResearchQueryFromInvestigation,
  buildQaResearchState,
  buildResearchFailurePayload,
  maybeGenerateQaResearchNoteForInvestigation,
  readQaResearchNotes,
} = require('../qaResearch.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-research-trigger-'));
}

function makeInvestigation({
  id = 'qa_inv_001',
  trigger = 'external_mismatch',
  repeatCount = 3,
  createdAt = '2026-04-06T00:00:00.000Z',
  status = 'open',
  summary = 'External probe disagrees with internal QA status',
} = {}) {
  return buildQaInvestigationRecord({
    id,
    trigger,
    repeatCount,
    createdAt,
    status,
    summary,
    external: {
      test_id: 'ollama_ping',
      status: 'fail',
    },
    internal: {
      status: 'pass',
      source: 'data/spatial/qa/structured/latest.json',
      timestamp: createdAt,
      details: 'Structured QA report passed.',
    },
    comparison: {
      status_match: false,
      freshness_known: true,
      notes: ['Validation seam mismatch.'],
    },
  });
}

export default async function runQaResearchTriggerTests() {
  const belowThresholdRoot = makeTempRoot();
  try {
    appendQaInvestigation(belowThresholdRoot, makeInvestigation({ repeatCount: 2 }));
    const investigation = readQaInvestigations(belowThresholdRoot)[0];
    const result = await maybeGenerateQaResearchNoteForInvestigation(belowThresholdRoot, investigation, {
      fetchImpl: async () => {
        throw new Error('should not run');
      },
    });
    assert.equal(result.created, false);
    assert.equal(result.skipped, true);
    assert.equal(readQaResearchNotes(belowThresholdRoot).length, 0);
  } finally {
    fs.rmSync(belowThresholdRoot, { recursive: true, force: true });
  }

  const successRoot = makeTempRoot();
  try {
    appendQaInvestigation(successRoot, makeInvestigation({
      id: 'qa_inv_002',
      createdAt: '2026-04-06T00:10:00.000Z',
    }));
    const investigation = readQaInvestigations(successRoot)[0];
    const query = buildQaResearchQueryFromInvestigation(investigation);
    assert.ok(query.query.includes('QA validation issue'));
    assert.equal(query.investigation_id, 'qa_inv_002');

    const result = await maybeGenerateQaResearchNoteForInvestigation(successRoot, investigation, {
      fetchImpl: async (url) => {
        const target = String(url);
        assert.ok(target.includes('127.0.0.1:5052/research_note'));
        return {
          ok: true,
          json: async () => ({
            ok: true,
            tool: 'research_note',
            query: query.query,
            source_url: 'https://example.invalid/reference',
            timestamp: '2026-04-06T00:10:30.000Z',
            summary: 'Add timeout-path assertions and response-shape checks.',
            recommendation: 'Assert timeout, response schema, and repeat-hit stability.',
            likely_causes: ['timeout budget too short', 'response contract drift'],
            suggested_extra_checks: ['assert timeout path', 'assert body schema'],
            suggested_scorecard_additions: ['timeout budget', 'payload schema'],
            sources: [
              {
                title: 'Reference',
                url: 'https://example.invalid/reference',
                snippet: 'Reference note.',
              },
            ],
          }),
        };
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.equal(result.research_available, true);
    const notes = readQaResearchNotes(successRoot);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].investigation_id, 'qa_inv_002');
    assert.equal(notes[0].research_available, true);
    assert.equal(notes[0].summary, 'Add timeout-path assertions and response-shape checks.');

    const qaState = buildQAStatePayload(successRoot);
    assert.equal(qaState.openInvestigations[0].research_available, true);
    assert.equal(qaState.openInvestigations[0].latest_research_at, '2026-04-06T00:10:30.000Z');
    assert.equal(qaState.researchSummary.availableNotes, 1);

    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.equal(deskPayload.qa.investigations[0].research_available, true);
    assert.equal(deskPayload.qa.investigations[0].latest_research_at, '2026-04-06T00:10:30.000Z');
    assert.equal(deskPayload.qa.researchSummary.availableNotes, 1);
  } finally {
    fs.rmSync(successRoot, { recursive: true, force: true });
  }

  const dedupeRoot = makeTempRoot();
  try {
    appendQaInvestigation(dedupeRoot, makeInvestigation({
      id: 'qa_inv_003',
      createdAt: '2026-04-06T00:20:00.000Z',
    }));
    const investigation = readQaInvestigations(dedupeRoot)[0];
    const first = await maybeGenerateQaResearchNoteForInvestigation(dedupeRoot, investigation, {
      createdAt: '2026-04-06T00:20:30.000Z',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          tool: 'research_note',
          query: 'qa validation issue',
          source_url: 'https://example.invalid/reference',
          timestamp: '2026-04-06T00:20:30.000Z',
          summary: 'First note.',
          recommendation: 'First recommendation.',
          likely_causes: [],
          suggested_extra_checks: [],
          suggested_scorecard_additions: [],
          sources: [],
        }),
      }),
    });
    assert.equal(first.created, true);
    const second = await maybeGenerateQaResearchNoteForInvestigation(dedupeRoot, investigation, {
      now: '2026-04-06T00:30:00.000Z',
      fetchImpl: async () => {
        throw new Error('should not rerun because the note is recent');
      },
    });
    assert.equal(second.created, false);
    assert.equal(second.skipped, true);
    assert.equal(readQaResearchNotes(dedupeRoot).length, 1);
  } finally {
    fs.rmSync(dedupeRoot, { recursive: true, force: true });
  }

  const failureRoot = makeTempRoot();
  try {
    appendQaInvestigation(failureRoot, makeInvestigation({
      id: 'qa_inv_004',
      trigger: 'probe_failure',
      repeatCount: 4,
      createdAt: '2026-04-06T00:40:00.000Z',
    }));
    const investigation = readQaInvestigations(failureRoot)[0];
    const result = await maybeGenerateQaResearchNoteForInvestigation(failureRoot, investigation, {
      fetchImpl: async () => {
        const error = new Error('fetch failed');
        error.cause = { code: 'ECONNREFUSED' };
        throw error;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.advisory_failure, true);
    assert.equal(result.created, true);
    assert.equal(result.note.status, 'offline');
    assert.equal(result.note.failure_kind, 'offline');
    assert.match(result.note.error_message || '', /offline|not listening/i);
    assert.equal(readQaResearchNotes(failureRoot).length, 1);
    assert.equal(readQaResearchNotes(failureRoot)[0].research_available, false);
  } finally {
    fs.rmSync(failureRoot, { recursive: true, force: true });
  }

  const failurePayload = buildResearchFailurePayload({
    investigation: makeInvestigation({ id: 'qa_inv_005' }),
    queryPayload: {
      query: 'QA validation issue',
    },
    error: {
      message: 'QA research server unavailable.',
    },
  });
  assert.equal(failurePayload.ok, false);
  assert.equal(failurePayload.status, 'unavailable');
  assert.equal(failurePayload.research_available, false);
  assert.equal(failurePayload.investigation_id, 'qa_inv_005');
  assert.equal(failurePayload.failure_kind, 'unavailable');

  const stateRoot = makeTempRoot();
  try {
    const qaState = buildQAStatePayload(stateRoot);
    const researchState = buildQaResearchState(stateRoot, qaState.openInvestigations);
    assert.equal(qaState.researchSummary.totalNotes, 0);
    assert.equal(researchState.summary.totalNotes, 0);
    const deskPayload = buildDeskPropertiesPayload({
      studio: {
        layout: createDefaultStudioLayoutSchema(),
      },
    }, 'qa-lead', qaState);
    assert.equal(Array.isArray(deskPayload.qa.investigations), true);
    assert.equal(deskPayload.qa.researchSummary.totalNotes, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}
