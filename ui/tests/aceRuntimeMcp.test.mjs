import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const aceRuntimeMcpPath = path.resolve(process.cwd(), 'aceRuntimeMcp.js');
const {
  createAceRuntimeMcpServer,
  createAceFetchClient,
  callAceTool,
  listAceResources,
  readAceResource,
  resolveAceBaseUrl,
} = require(aceRuntimeMcpPath);

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

export default async function runAceRuntimeMcpTests() {
  assert.equal(resolveAceBaseUrl('http://localhost:3000///'), 'http://localhost:3000');
  const resources = listAceResources();
  assert.equal(resources.length, 6);
  assert.ok(resources.some((resource) => resource.uri === 'ace://runtime'));
  assert.ok(resources.some((resource) => resource.uri === 'ace://qa/latest'));

  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method || 'GET',
      body: init.body ? JSON.parse(init.body) : null,
    });
    const pathname = new URL(url).pathname;
    if (pathname === '/api/spatial/runtime') {
      return createJsonResponse({
        status: 'ok',
        manager: {
          current_focus: 'Canonical anchor rollout',
          active_milestone: 'Repo anchors',
          drift_flags: [],
        },
        truthSources: [{ relativePath: 'brain/emergence/roadmap.md', source: 'canonical', exists: true }],
        drift: [],
        anchorRefs: ['brain/emergence/roadmap.md'],
        agentWorkers: {
          'context-manager': {
            status: 'idle',
            lastRunId: 'context_1',
            lastUsedFallback: false,
          },
          planner: {
            status: 'idle',
            lastRunId: 'planner_1',
            proposalArtifactRefs: ['data/spatial/agent-runs/planner/planner_1.proposal.01.brain-emergence-plan-md.md'],
          },
        },
        teamBoard: { cards: [] },
      });
    }
    if (pathname === '/api/spatial/workspace') {
      return createJsonResponse({
        activePageId: 'page_1',
        studio: {
          teamBoard: {
            cards: [{ id: '0001', title: 'Fix ACE desk', state: 'Ready' }],
          },
        },
      });
    }
    if (pathname === '/api/spatial/debug/throughput') {
      if ((init.method || 'GET') === 'POST') {
        return createJsonResponse({
          ok: true,
          session: { id: 'throughput_1', prompt: 'test prompt' },
        });
      }
      return createJsonResponse({
        latestSession: { id: 'throughput_1' },
        sessions: [{ id: 'throughput_1' }],
      });
    }
    if (pathname === '/api/spatial/debug/throughput/throughput_1') {
      return createJsonResponse({
        session: { id: 'throughput_1', verdict: 'pass' },
      });
    }
    if (pathname === '/api/spatial/qa/runs') {
      return createJsonResponse({
        latestRun: { id: 'qa_1' },
        runs: [{ id: 'qa_1' }],
      });
    }
    if (pathname === '/api/spatial/qa/run') {
      return createJsonResponse({
        ok: true,
        run: { id: 'qa_1', scenario: 'layout-pass' },
      });
    }
    if (pathname === '/api/spatial/qa/runs/qa_1') {
      return createJsonResponse({
        run: { id: 'qa_1', verdict: 'pass' },
      });
    }
    if (pathname === '/api/spatial/team-board/action') {
      return createJsonResponse({
        ok: true,
        runtime: { teamBoard: { cards: [{ id: '0001', status: 'review' }] } },
      });
    }
    if (pathname === '/api/health') {
      return createJsonResponse({ ok: true, server: 'healthy' });
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  const client = createAceFetchClient({
    baseUrl: 'http://localhost:3000/',
    fetchImpl,
    timeoutMs: 5000,
  });

  const runtimePayload = await readAceResource('ace://runtime', { client });
  assert.equal(runtimePayload.status, 'ok');
  assert.equal(runtimePayload.manager.current_focus, 'Canonical anchor rollout');
  assert.ok(runtimePayload.anchorRefs.includes('brain/emergence/roadmap.md'));
  assert.equal(runtimePayload.agentWorkers['context-manager'].lastRunId, 'context_1');
  assert.equal(runtimePayload.agentWorkers.planner.lastRunId, 'planner_1');

  const boardPayload = await readAceResource('ace://team-board', { client });
  assert.equal(boardPayload.activePageId, 'page_1');
  assert.equal(boardPayload.teamBoard.cards[0].id, '0001');

  const latestThroughput = await readAceResource('ace://throughput/latest', { client });
  assert.equal(latestThroughput.latestSession.id, 'throughput_1');

  const latestQa = await readAceResource('ace://qa/latest', { client });
  assert.equal(latestQa.latestRun.id, 'qa_1');

  const throughputRun = await callAceTool(
    'run_throughput_debug',
    {
      prompt: 'I think we should add a desk to the studio for a QA agent',
      project: 'ace-self',
      mode: 'fixture',
      runQa: true,
      confirmDeploy: false,
      simulate: true,
    },
    { client },
  );
  assert.equal(throughputRun.session.id, 'throughput_1');

  const browserRun = await callAceTool(
    'run_browser_pass',
    {
      scenario: 'layout-pass',
      mode: 'interactive',
      trigger: 'manual',
      prompt: 'Check the studio room',
      actions: [{ kind: 'click', target: 'planner-desk' }],
      linked: { throughputSessionId: 'throughput_1' },
    },
    { client },
  );
  assert.equal(browserRun.run.id, 'qa_1');

  const boardAction = await callAceTool(
    'team_board_action',
    {
      action: 'approve-apply',
      cardId: '0001',
    },
    { client },
  );
  assert.equal(boardAction.ok, true);

  const runtimeServer = createAceRuntimeMcpServer({
    baseUrl: 'http://localhost:3000',
    fetchImpl,
  });
  assert.ok(runtimeServer.mcpServer);
  assert.ok(runtimeServer.mcpServer._registeredResources['ace://runtime']);
  assert.ok(runtimeServer.mcpServer._registeredTools.get_runtime);

  const postCalls = calls.filter((call) => call.method === 'POST');
  assert.ok(postCalls.some((call) => call.url.endsWith('/api/spatial/debug/throughput')));
  assert.ok(postCalls.some((call) => call.url.endsWith('/api/spatial/qa/runs') || call.url.endsWith('/api/spatial/qa/run')));
  assert.ok(postCalls.some((call) => call.url.endsWith('/api/spatial/team-board/action')));
}
