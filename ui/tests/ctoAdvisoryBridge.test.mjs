import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runCtoAdvisoryBridgeTests() {
  const {
    buildCtoAvailableActions,
  } = require(path.resolve(process.cwd(), 'server.js'));
  const {
    clearLatestChiefOfStaffAdvisory,
    recordLatestChiefOfStaffAdvisory,
  } = require(path.resolve(process.cwd(), 'ctoChiefOfStaff.js'));
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.js'), 'utf8');

  const buildQaContext = (chiefOfStaff) => ({
    pipeline: {
      roleIndex: 2,
      step: 'request-qa',
      roleId: 'qa-lead',
      roleLabel: 'QA Lead',
      deskId: 'qa-lead',
      deskLabel: 'QA Lead',
    },
    workspace: {
      studio: {
        ctoPipeline: {
          roleIndex: 2,
          step: 'request-qa',
          roleId: 'qa-lead',
          roleLabel: 'QA Lead',
          deskId: 'qa-lead',
          deskLabel: 'QA Lead',
        },
      },
    },
    desks: [{ deskId: 'qa-lead', label: 'QA Lead', readOnly: false }],
    ta: {
      plannerCoverage: { covered: true },
      qaLeadCoverage: { covered: true },
      canonicalSeats: [],
    },
    cto: {
      chiefOfStaff,
    },
  });

  const buildPlannerCoverageContext = (chiefOfStaff) => ({
    pipeline: {
      roleIndex: 0,
      step: 'request-plan',
      roleId: 'planner',
      roleLabel: 'Planner',
      deskId: 'planner',
      deskLabel: 'Planner',
    },
    workspace: {
      studio: {
        ctoPipeline: {
          roleIndex: 0,
          step: 'request-plan',
          roleId: 'planner',
          roleLabel: 'Planner',
          deskId: 'planner',
          deskLabel: 'Planner',
        },
      },
    },
    desks: [{ deskId: 'planner', label: 'Planner', readOnly: false }],
    ta: {
      plannerCoverage: { covered: true },
      qaLeadCoverage: { covered: true },
      canonicalSeats: [],
    },
    cto: {
      chiefOfStaff,
    },
  });

  try {
    clearLatestChiefOfStaffAdvisory();
    assert.match(serverSource, /const chiefOfStaff = normalizeChiefOfStaffContext\(readLatestChiefOfStaffAdvisory\(\)\);/);
    assert.match(serverSource, /chiefOfStaff,/);
    assert.match(serverSource, /Chief of Staff context is advisory-only support\./);
    assert.match(serverSource, /If context\.cto\.chiefOfStaff\.execution_ready is false, do not present the Chief of Staff recommendation itself as directly executable\./);
    assert.match(serverSource, /If Chief of Staff recommendation conflicts with canonical action availability, canonical availability wins and you must explain the mismatch\./);
    assert.match(serverSource, /if \(matched\?\.advisory\?\.compatibility === 'not_directly_executable'\) \{\s*return null;\s*\}/);

    recordLatestChiefOfStaffAdvisory({
      reply_text: 'Chief of Staff advises resolving the blocker before direct execution.',
      reply_source: 'model_live',
      model_backend: 'ollama_http',
      model_name: 'qwen2.5-coder:1.5b',
      model_status: 'ok',
      advisory_generated_at: '2026-04-10T10:00:00.000Z',
      execution_ready: false,
      recommendation: {
        id: 'resolve_blocker',
        title: 'Resolve system blocker',
        category: 'unblock',
        blocker: 'dirty_repo_blocked',
        stage: 'planner',
        why_now: 'System execution is currently blocked',
        recommendation_text: 'Resolve the underlying issue before attempting further execution',
        execution_ready: false,
        confidence: 0.9,
        canonical_action_id: 'request-qa',
      },
      posture: {
        blocked: true,
        blocker: {
          failure_key: 'dirty_repo_blocked',
          stage: 'planner',
          count: 12,
        },
        canonical_available: true,
        canonical_summary: null,
        system_confidence: 0.9,
      },
    });

    const blockedActions = buildCtoAvailableActions({
      text: 'run a QA smoke test',
      context: buildQaContext({
        advisory_available: true,
        advisory_only: true,
        reply_source: 'model_live',
        model_status: 'ok',
        generated_at: '2026-04-10T10:00:00.000Z',
        execution_ready: false,
        blocker: {
          failure_key: 'dirty_repo_blocked',
          stage: 'planner',
          count: 12,
        },
        confidence: 0.9,
        why_now: 'System execution is currently blocked',
        recommended_action_id: 'request-qa',
        recommendation: {
          execution_ready: false,
          confidence: 0.9,
          canonical_action_id: 'request-qa',
        },
      }),
    });
    assert.equal(blockedActions.length, 1);
    assert.equal(blockedActions[0].id, 'request-qa');
    assert.equal(blockedActions[0].advisory.source, 'chief_of_staff');
    assert.equal(blockedActions[0].advisory.compatibility, 'not_directly_executable');
    assert.equal(blockedActions[0].advisory.execution_ready, false);
    assert.match(blockedActions[0].reason, /advisory-only until execution preconditions are met/i);

    recordLatestChiefOfStaffAdvisory({
      reply_text: 'Chief of Staff confirms QA can proceed once canonical action is selected.',
      reply_source: 'model_live',
      model_backend: 'ollama_http',
      model_name: 'qwen2.5-coder:1.5b',
      model_status: 'ok',
      advisory_generated_at: '2026-04-10T10:05:00.000Z',
      execution_ready: true,
      recommendation: {
        id: 'run_qa',
        title: 'Run QA',
        category: 'quality',
        why_now: 'QA is ready to validate the current build',
        recommendation_text: 'Request one smoke test from QA.',
        execution_ready: true,
        confidence: 0.8,
        canonical_action_id: 'request-qa',
      },
      posture: {
        blocked: false,
        blocker: null,
        canonical_available: true,
        canonical_summary: null,
        system_confidence: 0.6,
      },
    });

    const readyActions = buildCtoAvailableActions({
      text: 'run a QA smoke test',
      context: buildQaContext({
        advisory_available: true,
        advisory_only: true,
        reply_source: 'model_live',
        model_status: 'ok',
        generated_at: '2026-04-10T10:05:00.000Z',
        execution_ready: true,
        blocker: null,
        confidence: 0.8,
        why_now: 'QA is ready to validate the current build',
        recommended_action_id: 'request-qa',
        recommendation: {
          execution_ready: true,
          confidence: 0.8,
          canonical_action_id: 'request-qa',
        },
      }),
    });
    assert.equal(readyActions[0].id, 'request-qa');
    assert.equal(readyActions[0].advisory.compatibility, 'aligned');
    assert.equal(readyActions[0].advisory.matched, true);
    assert.match(readyActions[0].reason, /aligns with this canonical action/i);

    recordLatestChiefOfStaffAdvisory({
      reply_text: 'Chief of Staff wants planner hiring, but canonical state does not allow it.',
      reply_source: 'model_live',
      model_backend: 'ollama_http',
      model_name: 'qwen2.5-coder:1.5b',
      model_status: 'ok',
      advisory_generated_at: '2026-04-10T10:10:00.000Z',
      execution_ready: true,
      recommendation: {
        id: 'hire_planner',
        title: 'Hire planner coverage',
        category: 'staffing',
        why_now: 'Planner staffing looks constrained',
        recommendation_text: 'Hire planner coverage.',
        execution_ready: true,
        confidence: 0.7,
        canonical_action_id: 'hire-role',
      },
      posture: {
        blocked: false,
        blocker: null,
        canonical_available: true,
        canonical_summary: null,
        system_confidence: 0.6,
      },
    });

    const canonicalWinsActions = buildCtoAvailableActions({
      text: 'We need planner coverage. Should TA hire for the planner desk?',
      context: buildPlannerCoverageContext({
        advisory_available: true,
        advisory_only: true,
        reply_source: 'model_live',
        model_status: 'ok',
        generated_at: '2026-04-10T10:10:00.000Z',
        execution_ready: true,
        blocker: null,
        confidence: 0.7,
        why_now: 'Planner staffing looks constrained',
        recommended_action_id: 'hire-role',
        recommendation: {
          execution_ready: true,
          confidence: 0.7,
          canonical_action_id: 'hire-role',
        },
      }),
    });
    assert.equal(canonicalWinsActions.some((action) => action.id === 'hire-role' && action.targetDeskId === 'planner'), false);
  } finally {
    clearLatestChiefOfStaffAdvisory();
  }
}
