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

function buildChiefOfStaffFixture(rootPath, { includeCanonicalRegistry = true } = {}) {
  writeJson(rootPath, 'brain/context/failure_history.json', {
    version: 'ace/failure-memory.v1',
    updated_at: '2026-04-10T09:09:36.829Z',
    entries: [
      {
        failure_key: 'dirty_repo_blocked',
        stage: 'planner',
        agent_id: 'planner',
        agent_version: 'ace/agent-attribution.v0',
        count: 12,
        first_seen: '2026-04-10T08:00:00.000Z',
        last_seen: '2026-04-10T09:09:36.829Z',
        example_messages: ['Repository has uncommitted tracked changes.'],
        related_tools: ['git'],
        related_stages: ['planner'],
        related_runs: [],
        related_projects: ['ace-self'],
        related_agents: ['planner'],
        source_count: 12,
        failure_class: 'panel_degraded',
        last_error: {
          timestamp: '2026-04-10T09:09:36.829Z',
          message: 'Repository has uncommitted tracked changes.',
          stack: 'Error: Repository has uncommitted tracked changes.',
          failure_class: 'panel_degraded',
          route: null,
          method: null,
          stage: 'planner',
          source: 'builder-preflight',
          ui_response: {
            failureClass: 'panel_degraded',
          },
        },
      },
    ],
  });

  if (!includeCanonicalRegistry) return;

  writeJson(rootPath, 'brain/emergence/canonical_truth_domains.json', {
    contractVersion: 'canonical-truth-domains.v0',
    domains: [
      {
        domainId: 'workspace',
        label: 'Spatial Workspace',
        classificationDefault: 'canonical',
        systemOfRecord: 'data/spatial/workspace.json',
        canonicalOwner: 'ui/server.js::readSpatialWorkspace',
        mutationAuthority: 'read-only',
        allowedProjections: ['workspace'],
      },
    ],
  });
  writeJson(rootPath, 'brain/emergence/canonical_truth_projections.json', {
    contractVersion: 'canonical-truth-projections.v0',
    projections: [
      {
        projectionId: 'workspace',
        sourceDomain: 'workspace',
        builder: 'buildWorkspaceProjectionPayload',
        route: '/api/spatial/workspace',
        consumers: ['tests'],
        classification: 'projection',
        readOnly: true,
        readinessSemantics: 'available',
      },
    ],
  });
  writeJson(rootPath, 'data/spatial/workspace.json', {
    studio: {
      agentWorkers: {
        planner: { id: 'planner' },
        'cto-chief-of-staff': { id: 'cto-chief-of-staff' },
      },
      layout: {
        desks: {
          planner: { id: 'planner' },
          'cto-architect': { id: 'cto-architect' },
        },
      },
    },
  });
  writeJson(rootPath, 'data/spatial/qa/structured/latest.json', {
    status: 'needs_attention',
    summary: 'Planner is currently blocked by repo hygiene.',
  });
  fs.mkdirSync(path.join(rootPath, 'agents', 'cto-chief-of-staff'), { recursive: true });
  writeJson(rootPath, 'agents/cto-chief-of-staff/agent.json', {
    id: 'cto-chief-of-staff',
    name: 'Chief of Staff',
    deskId: 'cto-architect',
    runtime: 'ollama-shell',
    backend: 'ollama',
    model: 'qwen2.5-coder:1.5b',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 4500,
    autoRun: false,
    type: 'advisory',
    authority: 'read-only',
    reports_to: 'cto',
    inputs: [
      'brain/context/failure_history.json',
      'brain/context/canonical_truth.json',
      'brain/emergence/canonical_truth_domains.json',
      'brain/emergence/canonical_truth_projections.json',
      'data/spatial/qa/structured/latest.json',
      'data/spatial/workspace.json',
    ],
    outputs: ['advisory-response'],
    writesCanonicalBrain: false,
  });
  fs.writeFileSync(
    path.join(rootPath, 'agents', 'cto-chief-of-staff', 'prompt.md'),
    'You are CTO Chief of Staff.\n',
    'utf8',
  );
}

function withWriteGuards(callback) {
  const guardedMethods = [
    'appendFileSync',
    'copyFileSync',
    'mkdirSync',
    'renameSync',
    'rmSync',
    'unlinkSync',
    'writeFileSync',
  ];
  const originals = new Map();
  const writes = [];

  for (const method of guardedMethods) {
    originals.set(method, fs[method]);
    fs[method] = (...args) => {
      writes.push({ method, args });
      throw new Error(`Unexpected filesystem write via fs.${method}`);
    };
  }

  return Promise.resolve()
    .then(() => callback(writes))
    .finally(() => {
      for (const [method, original] of originals.entries()) {
        fs[method] = original;
      }
    });
}

export default async function runChiefOfStaffTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-chief-of-staff-'));
  buildChiefOfStaffFixture(rootPath);

  const {
    DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS,
    buildChiefOfStaffPosture,
    buildChiefOfStaffPromptProfile,
    clearLatestChiefOfStaffAdvisory,
    buildRecommendation,
    ensureChiefOfStaffReadiness,
    queryChiefOfStaff,
    readChiefOfStaffReadiness,
    readLatestChiefOfStaffAdvisory,
    requestChiefOfStaffModelReply,
    resolveChiefOfStaffRuntime,
    runChiefOfStaffAgent,
  } = require(path.resolve(process.cwd(), 'ctoChiefOfStaff.js'));
  clearLatestChiefOfStaffAdvisory();
  assert.equal(DEFAULT_CHIEF_OF_STAFF_TIMEOUT_MS >= 20000, true);

  const httpCalls = [];
  const httpReply = await requestChiefOfStaffModelReply({
    prompt: 'Summarize current system state.',
    host: 'http://127.0.0.1:11434',
    fetchImpl: async (url, options = {}) => {
      httpCalls.push({
        url,
        body: JSON.parse(options.body || '{}'),
      });
      return {
        ok: true,
        json: async () => ({
          response: 'HTTP grounded reply.',
        }),
      };
    },
  });
  assert.equal(httpReply, 'HTTP grounded reply.');
  assert.equal(httpCalls.length, 1);
  assert.equal(httpCalls[0].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(httpCalls[0].body.model, 'qwen2.5-coder:1.5b');
  assert.equal(httpCalls[0].body.stream, false);

  const response = await withWriteGuards(async (writes) => {
    const posture = buildChiefOfStaffPosture(rootPath);
    const recommendation = buildRecommendation(posture);
    const chatProfile = buildChiefOfStaffPromptProfile(posture, recommendation, 'hey there');
    const reportProfile = buildChiefOfStaffPromptProfile(posture, recommendation, 'write a summary report for the current blocker');
    const runtime = resolveChiefOfStaffRuntime(rootPath);
    assert.equal(chatProfile.contextMode, 'scoped');
    assert.equal(chatProfile.scopeTier, 'targeted');
    assert.equal(reportProfile.contextMode, 'broad');
    assert.equal(reportProfile.scopeTier, 'broad');
    assert.equal(chatProfile.promptChars < reportProfile.promptChars, true);
    assert.match(chatProfile.prompt, /USER QUESTION:/);
    assert.match(reportProfile.prompt, /Secondary Retrieval Summary/);
    const modelCalls = [];
    const chiefFetch = async (url) => {
      if (String(url).endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'qwen2.5-coder:1.5b' },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    };
    const reply = await queryChiefOfStaff(rootPath, 'why is planning failing?', {
      callModel: async (payload) => {
        modelCalls.push(payload);
        return {
          text: `System state: ${posture.blocker.failure_key} at ${posture.blocker.stage}. Next: ${recommendation.recommendation_text}.`,
        };
      },
      fetchImpl: chiefFetch,
    });

    assert.equal(writes.length, 0);
    assert.equal(runtime.model, 'qwen2.5-coder:1.5b');
    assert.equal(runtime.timeoutMs, 4500);
    assert.equal(modelCalls.length, 2);
    assert.equal(modelCalls[0].prompt, 'Reply with READY.');
    assert.equal(modelCalls.at(-1).model, 'qwen2.5-coder:1.5b');
    assert.equal(modelCalls.at(-1).expectJson, false);
    assert.equal(typeof modelCalls.at(-1).prompt, 'string');
    assert.equal(posture.blocked, true);
    assert.equal(posture.blocker.failure_key, 'dirty_repo_blocked');
    assert.equal(posture.canonical_available, true);
    assert.deepEqual(posture.canonical_summary.known_desks, ['planner', 'cto-architect']);
    assert.equal(recommendation.blocker, 'dirty_repo_blocked');
    assert.equal(reply.posture.blocked, true);
    assert.equal(reply.recommendation.blocker, 'dirty_repo_blocked');
    assert.equal(reply.reply_source, 'model_live');
    assert.equal(reply.model_backend, 'ollama_http');
    assert.equal(reply.model_name, 'qwen2.5-coder:1.5b');
    assert.equal(reply.model_status, 'ok');
    assert.equal(reply.execution_ready, false);
    assert.equal(reply.cognition_diagnostics.agent_id, 'cto-chief-of-staff');
    assert.equal(reply.cognition_diagnostics.used_live_call, true);
    assert.equal(reply.cognition_diagnostics.used_fallback, false);
    assert.equal(reply.cognition_diagnostics.context_mode, 'scoped');
    assert.equal(reply.cognition_diagnostics.context_scope_tier, 'targeted');
    assert.equal(reply.cognition_diagnostics.failure_reason, null);
    assert.equal(reply.cognition_diagnostics.timeout_ms, 4500);
    assert.equal(reply.live_status, 'live');
    assert.equal(reply.agent_readiness.status, 'live');
    assert.equal(reply.cognition_diagnostics.prompt_chars > 0, true);
    assert.equal(typeof reply.advisory_generated_at, 'string');
    assert.equal(typeof reply.reply_text, 'string');
    assert.match(reply.reply_text, /dirty_repo_blocked|repo/i);
    return reply;
  });

  assert.equal(response.posture.system_confidence, 0.9);
  const latest = readLatestChiefOfStaffAdvisory();
  assert.equal(latest.advisory_available, true);
  assert.equal(latest.reply_source, 'model_live');
  assert.equal(latest.model_status, 'ok');
  assert.equal(latest.live_status, 'live');
  assert.equal(latest.execution_ready, false);
  assert.equal(latest.recommendation.blocker, 'dirty_repo_blocked');
  assert.equal(latest.cognition_diagnostics.used_live_call, true);
  assert.equal(latest.cognition_diagnostics.context_mode, 'scoped');
  assert.equal(latest.agent_readiness.status, 'live');

  const noCanonicalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-chief-of-staff-lite-'));
  buildChiefOfStaffFixture(noCanonicalRoot, { includeCanonicalRegistry: false });
  const noCanonicalPosture = buildChiefOfStaffPosture(noCanonicalRoot);
  assert.equal(noCanonicalPosture.canonical_available, false);
  assert.equal(noCanonicalPosture.canonical_summary, null);

  clearLatestChiefOfStaffAdvisory();
  const warmingReadiness = await ensureChiefOfStaffReadiness({
    rootPath,
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen2.5-coder:1.5b' }],
          }),
        };
      }
      throw new Error(`Unexpected fetch url: ${url}`);
    },
    callModel: async () => {
      throw new Error('Ollama generate timed out after 4500ms.');
    },
    warmIfNeeded: true,
  });
  assert.equal(warmingReadiness.status, 'warming');
  assert.equal(readChiefOfStaffReadiness().status, 'warming');

  const fallbackReply = await runChiefOfStaffAgent(buildChiefOfStaffPosture(rootPath), buildRecommendation(buildChiefOfStaffPosture(rootPath)), 'write a summary report for the current blocker', {
    callModel: async () => {
      throw new Error('Ollama generate timed out after 4500ms.');
    },
    rootPath,
  });
  assert.equal(fallbackReply.reply_source, 'deterministic_fallback');
  assert.equal(fallbackReply.model_backend, 'ollama_http');
  assert.equal(fallbackReply.model_name, 'qwen2.5-coder:1.5b');
  assert.equal(fallbackReply.model_status, 'timeout');
  assert.equal(fallbackReply.live_status, 'degraded');
  assert.equal(fallbackReply.cognition_diagnostics.used_fallback, true);
  assert.equal(fallbackReply.cognition_diagnostics.failure_reason, 'overscoped_context');
  assert.equal(fallbackReply.cognition_diagnostics.context_mode, 'broad');
  assert.equal(typeof fallbackReply.reply_text, 'string');
  assert.match(fallbackReply.reply_text, /dirty_repo_blocked|repo/i);

  const warmingFallbackReply = await runChiefOfStaffAgent(buildChiefOfStaffPosture(rootPath), buildRecommendation(buildChiefOfStaffPosture(rootPath)), 'why is planning failing?', {
    callModel: async () => {
      throw new Error('Ollama generate timed out after 4500ms.');
    },
    rootPath,
    readiness: warmingReadiness,
  });
  assert.equal(warmingFallbackReply.model_status, 'warming');
  assert.equal(warmingFallbackReply.live_status, 'warming');
  assert.equal(warmingFallbackReply.cognition_diagnostics.context_mode, 'scoped');

  const { app } = require(path.resolve(process.cwd(), 'server.js'));
  app.locals.chiefOfStaffRootPath = rootPath;
  app.locals.chiefOfStaffCallModel = async () => ({
    text: 'Planning is blocked by dirty_repo_blocked. Resolve the repo blocker before further execution.',
  });
  app.locals.chiefOfStaffFetchImpl = async (url) => {
    if (String(url).endsWith('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [{ name: 'qwen2.5-coder:1.5b' }],
        }),
      };
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };
  const server = app.listen(3237);
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    const apiResponse = await fetch('http://localhost:3237/api/cto-chief-of-staff/query?q=why%20is%20planning%20failing%3F');
    const payload = await apiResponse.json();
    assert.equal(apiResponse.status, 200);
    assert.equal(payload.posture.blocked, true);
    assert.equal(payload.posture.blocker.failure_key, 'dirty_repo_blocked');
    assert.equal(payload.recommendation.blocker, 'dirty_repo_blocked');
    assert.equal(payload.reply_source, 'model_live');
    assert.equal(payload.model_backend, 'ollama_http');
    assert.equal(payload.model_name, 'qwen2.5-coder:1.5b');
    assert.equal(payload.model_status, 'ok');
    assert.equal(payload.live_status, 'live');
    assert.equal(payload.execution_ready, false);
    assert.equal(payload.cognition_diagnostics.used_live_call, true);
    assert.equal(payload.cognition_diagnostics.context_mode, 'scoped');
    assert.equal(typeof payload.advisory_generated_at, 'string');

    const latestResponse = await fetch('http://localhost:3237/api/cto-chief-of-staff/latest');
    const latestPayload = await latestResponse.json();
    assert.equal(latestResponse.status, 200);
    assert.equal(latestPayload.advisory_available, true);
    assert.equal(latestPayload.reply_source, 'model_live');
    assert.equal(latestPayload.recommendation.blocker, 'dirty_repo_blocked');
    assert.equal(latestPayload.cognition_diagnostics.used_live_call, true);
    assert.equal(latestPayload.agent_readiness.status, 'live');
  } finally {
    delete app.locals.chiefOfStaffRootPath;
    delete app.locals.chiefOfStaffCallModel;
    delete app.locals.chiefOfStaffFetchImpl;
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}
