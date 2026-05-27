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

function buildFatCtoContext() {
  return {
    workspace: {
      giant: 'x'.repeat(4000),
      nested: {
        more: 'y'.repeat(4000),
      },
      pages: [{ id: 'page_1', title: 'Planner page' }],
      activePageId: 'page_1',
      graphs: {
        system: { nodes: Array.from({ length: 12 }, (_, index) => ({ id: `s${index}` })), edges: [] },
        world: { nodes: Array.from({ length: 8 }, (_, index) => ({ id: `w${index}` })), edges: [] },
      },
      studio: {
        teamBoard: {
          selectedCardId: 'card_1',
          cards: Array.from({ length: 5 }, (_, index) => ({ id: `card_${index}`, status: 'active' })),
        },
        orchestrator: {
          activeDeskIds: ['planner', 'executor'],
        },
      },
    },
    pipeline: {
      roleIndex: 1,
      stage: 'planning',
    },
    desks: Array.from({ length: 6 }, (_, index) => ({
      deskId: index === 0 ? 'planner' : (index === 1 ? 'executor' : `desk-${index}`),
      label: index === 0 ? 'Planner' : (index === 1 ? 'Executor' : `Desk ${index}`),
      departmentLabel: 'Delivery',
      assignedAgentIds: [`agent-${index}`],
      liveAgentCount: 1,
      liveAgentStatuses: [`agent-${index}:running`],
      taskCount: 3 + index,
      reportCount: 1,
      readOnly: false,
      manualRunRoute: `/api/desks/${index}/run`,
      routeNote: 'Desk route available.',
      truthContext: 'truth '.repeat(120),
      taCoverage: {
        covered: index < 2,
        urgency: index < 2 ? 'low' : 'high',
      },
    })),
    ta: {
      summary: 'TA summary '.repeat(80),
      urgency: 'high',
      plannerCoverage: { covered: true },
      qaLeadCoverage: { covered: false },
      rosterCount: 3,
      openRoles: Array.from({ length: 8 }, (_, index) => ({
        roleId: `role-${index}`,
        roleLabel: `Role ${index}`,
        urgency: index < 2 ? 'high' : 'normal',
        blocker: index === 0,
      })),
    },
    cto: {
      overrides: {
        entryCount: 2,
        activeCount: 1,
      },
      overrideLayer: {
        planningMode: 'normal',
      },
      governedRepair: {
        repair_job_id: 'repair_1',
        truth_application_status: 'verified_healthy',
        summary: 'repair '.repeat(120),
      },
      chiefOfStaff: {
        advisory_available: true,
        execution_ready: false,
        recommendation: {
          recommendation_text: 'chief '.repeat(120),
        },
      },
    },
  };
}

export default async function runCtoCognitionDiagnosticsTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-cognition-'));
  const previousCwd = process.cwd();
  process.chdir(rootPath);

  try {
    const serverPath = path.resolve(previousCwd, 'server.js');
    delete require.cache[serverPath];
    const {
      buildCtoChatPromptProfile,
      buildCtoPromptContext,
      createDefaultStudioLayoutSchema,
      resolveCtoGovernanceConfig,
      runCtoGovernanceChat,
    } = require(serverPath);

    const fatContext = buildFatCtoContext();
    const casualProfile = buildCtoChatPromptProfile({
      text: 'why is planner blocked?',
      history: [],
      context: fatContext,
      availableActions: [{
        id: 'request-plan',
        kind: 'request-plan',
        label: 'Request plan',
        available: true,
        requiresConfirmation: true,
        status: 'pending',
        reason: 'Planner desk is ready.',
        targetDeskId: 'planner',
      }],
    });
    const reportProfile = buildCtoChatPromptProfile({
      text: 'give me a full context summary of everything across all desks',
      history: [],
      context: fatContext,
      availableActions: [{
        id: 'request-plan',
        kind: 'request-plan',
        label: 'Request plan',
        available: true,
        requiresConfirmation: true,
        status: 'pending',
        reason: 'Planner desk is ready.',
        targetDeskId: 'planner',
      }],
    });
    assert.equal(casualProfile.contextMode, 'scoped');
    assert.equal(reportProfile.contextMode, 'broad');
    assert.equal(casualProfile.promptChars < reportProfile.promptChars, true);

    const scopedContext = buildCtoPromptContext(fatContext, {
      contextMode: 'scoped',
      roleHint: 'planner',
      availableActions: [],
      execution: null,
    });
    const scopedContextJson = JSON.stringify(scopedContext);
    assert.equal(scopedContextJson.includes('x'.repeat(300)), false);
    assert.equal(scopedContext.workspace.active_page_id, 'page_1');
    assert.equal(Array.isArray(scopedContext.desks), true);
    assert.equal(scopedContext.desks.length <= 3, true);

    writeJson(rootPath, 'data/spatial/ta-department.json', {
      hiredCandidates: [],
      updatedAt: null,
      lastGeneratedGap: null,
    });

    const layout = createDefaultStudioLayoutSchema();
    const workspace = {
      graph: { nodes: [], edges: [] },
      graphs: {
        system: { nodes: [], edges: [] },
        world: { nodes: [], edges: [] },
      },
      pages: [{ id: 'page_1', title: 'Planner page' }],
      activePageId: 'page_1',
      studio: {
        layout,
        handoffs: { contextToPlanner: null, history: [] },
        teamBoard: { cards: [], selectedCardId: null },
        orchestrator: { desks: {}, activeDeskIds: ['planner'], conflicts: [] },
        ctoOverrides: { version: 'ace/cto-overrides.v1', entries: [] },
        deskProperties: {},
        agentWorkers: {
          planner: { backend: 'ollama', model: 'mistral:latest' },
          executor: { backend: 'ollama', model: 'mistral:latest' },
          evaluator: { backend: 'ollama', model: 'mistral:latest' },
        },
      },
    };
    writeJson(rootPath, 'data/spatial/workspace.json', workspace);

    const configured = resolveCtoGovernanceConfig();
    assert.equal(configured.timeoutMs >= 30000, true);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const target = String(url);
      if (target.endsWith('/api/tags')) {
        return {
          ok: true,
          json: async () => ({
            models: [{ name: 'mistral:latest' }],
          }),
        };
      }
      if (target.endsWith('/api/generate')) {
        throw new Error('Ollama generate timed out after 30000ms.');
      }
      throw new Error(`Unexpected URL ${target}`);
    };

    try {
      const result = await runCtoGovernanceChat({
        text: 'give me a full context summary of everything across all desks',
        history: [],
        workspace,
        backend: 'ollama',
        model: 'mistral:latest',
        timeoutMs: 30000,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 'degraded');
      assert.equal(result.diagnostic.failure_reason, 'overscoped_context');
      assert.equal(result.diagnostic.context_mode, 'broad');
      assert.equal(result.diagnostic.used_live_call, true);
      assert.equal(result.diagnostic.used_fallback, true);
      assert.equal(result.diagnostic.prompt_chars > 0, true);
      assert.equal(result.diagnostic.timeout_ms, 30000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    process.chdir(previousCwd);
  }
}
