import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content) {
  const target = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

function seedBrain(rootPath) {
  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Brain\n\n## Current Focus\n- Planner worker rollout\n');
  writeFile(rootPath, 'brain/emergence/roadmap.md', '# Roadmap\n\n## Now\n- Add planner worker\n');
  writeFile(rootPath, 'brain/emergence/plan.md', '# Plan\n\n## Goal\n- Add planner worker runtime\n');
  writeFile(rootPath, 'brain/emergence/tasks.md', '# Tasks\n- Create bounded planner cards\n- Persist proposal artifacts\n');
  writeFile(rootPath, 'brain/emergence/decisions.md', '# Decisions\n- Planner stays proposal-only\n');
  writeFile(rootPath, 'brain/emergence/changelog.md', '# Changelog\n- Planner worker scaffolded\n');
  writeFile(rootPath, 'brain/emergence/state.json', JSON.stringify({
    last_manager_sync: '2026-03-15T12:00:00.000Z',
    blockers: [],
  }, null, 2));
}

function seedAgents(rootPath) {
  writeFile(rootPath, 'agents/planner/agent.json', JSON.stringify({
    id: 'planner',
    name: 'Planner',
    deskId: 'planner',
    runtime: 'ollama-json',
    backend: 'ollama',
    model: 'mixtral',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 30000,
    autoRun: true,
  }, null, 2));
  writeFile(rootPath, 'agents/planner/prompt.md', 'Planner prompt');
  writeFile(rootPath, 'agents/context-manager/agent.json', JSON.stringify({
    id: 'context-manager',
    name: 'Context Manager',
    deskId: 'context-manager',
    runtime: 'ollama-json',
    backend: 'ollama',
    model: 'mixtral',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 30000,
    autoRun: false,
  }, null, 2));
  writeFile(rootPath, 'agents/context-manager/prompt.md', 'Context prompt');
}

function createWorkspace() {
  return {
    studio: {
      handoffs: {},
      teamBoard: { cards: [], summary: {} },
      agentWorkers: {
        'context-manager': {
          status: 'idle',
          currentRunId: null,
          lastRunId: null,
          lastSourceNodeId: null,
          lastHandoffId: null,
          lastReportNodeId: null,
          lastBlockedReason: null,
          lastUsedFallback: false,
          lastPlannerFeedbackAction: null,
        },
        planner: {
          status: 'idle',
          currentRunId: null,
          lastRunId: null,
          lastSourceHandoffId: null,
          lastBlockedReason: null,
          lastProducedCardIds: [],
          proposalArtifactRefs: [],
        },
      },
    },
  };
}

export default async function runAgentWorkersTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-agent-workers-'));
  const agentWorkersPath = path.resolve(process.cwd(), 'agentWorkers.js');
  const anchorResolverPath = path.resolve(process.cwd(), 'anchorResolver.js');
  const intentAnalysisPath = path.resolve(process.cwd(), 'intentAnalysis.js');
  const {
    evaluatePlannerEligibility,
    getAgentWorkerConfig,
    runContextManagerWorker,
    runPlannerWorker,
  } = require(agentWorkersPath);
  const { buildAnchorBundle } = require(anchorResolverPath);
  const { analyzeSpatialIntent, buildIntentProjectContext } = require(intentAnalysisPath);

  seedBrain(rootPath);
  seedAgents(rootPath);
  const anchorBundle = buildAnchorBundle({ rootPath });
  const workspace = createWorkspace();
  const readyHandoff = {
    id: 'handoff_ready',
    status: 'ready',
    summary: 'Planner handoff ready.',
    problemStatement: 'Goal: add the planner worker.',
    tasks: ['Create planner cards', 'Persist proposals'],
    constraints: ['Keep planner proposal-only'],
    anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
  };

  assert.equal(getAgentWorkerConfig(rootPath, 'planner').model, 'mixtral');
  assert.equal(getAgentWorkerConfig(rootPath, 'context-manager').backend, 'ollama');
  assert.equal(evaluatePlannerEligibility({ workspace, handoff: readyHandoff, mode: 'auto', runs: [] }).eligible, true);
  assert.equal(evaluatePlannerEligibility({
    workspace,
    handoff: { ...readyHandoff, status: 'needs-clarification' },
    mode: 'auto',
    runs: [],
  }).eligible, false);
  assert.equal(evaluatePlannerEligibility({
    workspace,
    handoff: { ...readyHandoff, anchorRefs: [] },
    mode: 'auto',
    runs: [],
  }).eligible, false);

  const successResult = await runPlannerWorker({
    rootPath,
    handoff: readyHandoff,
    workspace,
    anchorBundle,
    runId: 'planner_success',
    generator: async () => ({
      summary: 'Planner generated anchored cards.',
      cards: [
        { title: 'Create planner worker runtime', summary: 'Add the worker runtime shell.', anchorRefs: ['brain/emergence/plan.md'] },
        { title: 'Persist planner proposals', summary: 'Store proposal artifacts beside the run.', anchorRefs: ['brain/emergence/tasks.md'] },
        { title: 'Drop this unanchored item', summary: 'Should be filtered out.', anchorRefs: ['brain/emergence/roadmap.md'] },
        { title: 'Expose planner status in runtime', summary: 'Surface planner worker state.', anchorRefs: ['brain/emergence/plan.md'] },
      ],
      brainProposals: [
        {
          targetPath: 'brain/emergence/plan.md',
          summary: 'Plan proposal',
          content: '# Proposal\n- Update planner slice\n',
        },
        {
          targetPath: 'brain/emergence/tasks.md',
          summary: 'Task proposal',
          content: '# Proposal\n- Add worker tests\n',
        },
        {
          targetPath: 'brain/emergence/roadmap.md',
          summary: 'Invalid proposal',
          content: '# Ignore\n',
        },
      ],
      needsContextRetry: false,
      retryReason: '',
    }),
  });

  assert.equal(successResult.ok, true);
  assert.equal(successResult.outcome, 'completed');
  assert.equal(successResult.run.outcome, 'completed');
  assert.equal(successResult.cards.length, 3);
  assert.equal(successResult.proposalArtifactRefs.length, 2);
  assert.ok(successResult.proposalArtifactRefs.every((artifactRef) => fs.existsSync(path.join(rootPath, ...artifactRef.split('/')))));
  assert.equal(fs.existsSync(path.join(rootPath, 'brain', 'emergence', 'plan.md')), true);

  const blockedFirst = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_retry', tasks: ['Clarify planner output'] },
    workspace,
    anchorBundle,
    runId: 'planner_blocked_1',
    generator: async () => ({
      summary: 'Need a tighter handoff.',
      cards: [],
      brainProposals: [],
      needsContextRetry: true,
      retryReason: 'Need clearer acceptance criteria.',
    }),
  });
  assert.equal(blockedFirst.ok, false);
  assert.equal(blockedFirst.outcome, 'blocked');
  assert.equal(blockedFirst.plannerToContext.action, 'retry-handoff');

  const blockedSecond = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_retry', tasks: ['Clarify planner output'] },
    workspace,
    anchorBundle,
    runId: 'planner_blocked_2',
    generator: async () => ({
      summary: 'Still not enough context.',
      cards: [],
      brainProposals: [],
      needsContextRetry: true,
      retryReason: 'Still missing concrete acceptance criteria.',
    }),
  });
  assert.equal(blockedSecond.ok, false);
  assert.equal(blockedSecond.outcome, 'blocked');
  assert.equal(blockedSecond.plannerToContext.action, 'bin-candidate');

  const degraded = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_outage' },
    workspace,
    anchorBundle,
    runId: 'planner_degraded',
    generator: async () => {
      throw new Error('Ollama unavailable');
    },
  });
  assert.equal(degraded.ok, false);
  assert.equal(degraded.outcome, 'degraded');
  assert.equal(degraded.cards.length, 0);
  assert.equal(degraded.proposalArtifactRefs.length, 0);

  const previousHandoff = {
    id: 'handoff_ctx',
    sourceNodeId: 'node_ctx',
    summary: 'Need a tighter planner brief.',
    tasks: ['Clarify planner acceptance criteria'],
    anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    status: 'needs-clarification',
  };
  const plannerFeedback = {
    id: 'feedback_ctx',
    sourceHandoffId: 'handoff_ctx',
    action: 'retry-handoff',
    detail: 'Need clearer acceptance criteria before planning.',
    anchorRefs: ['brain/emergence/plan.md'],
  };

  const contextSuccess = await runContextManagerWorker({
    rootPath,
    text: 'We should tighten the planner brief and make review state visible.',
    sourceNodeId: 'node_ctx',
    source: 'context-intake',
    workspace: {
      ...workspace,
      studio: {
        ...workspace.studio,
        handoffs: {
          contextToPlanner: previousHandoff,
          plannerToContext: plannerFeedback,
        },
      },
    },
    anchorBundle,
    dashboardState: { blockers: ['Keep planner proposal-only'] },
    previousHandoff,
    plannerFeedback,
    runId: 'context_success',
    generator: async ({ plannerFeedback: activeFeedback }) => {
      assert.equal(activeFeedback.action, 'retry-handoff');
      return {
        summary: 'Tighten the planner brief before execution expands.',
        statement: 'Clarify planner acceptance criteria and expose review state in Studio.',
        tasks: ['Clarify planner acceptance criteria', 'Expose review state in Studio'],
        constraints: ['Keep planner proposal-only'],
        clarifications: ['Need an explicit success signal for planner cards'],
        focusTerms: ['planner', 'review', 'acceptance'],
        suggestedAnchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
      };
    },
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(contextSuccess.ok, true);
  assert.equal(contextSuccess.outcome, 'completed');
  assert.equal(contextSuccess.usedFallback, false);
  assert.equal(contextSuccess.report.contextPacket.constraints[0], 'Keep planner proposal-only');
  assert.equal(contextSuccess.handoff.sourceAgentId, 'context-manager');
  assert.equal(contextSuccess.handoff.targetAgentId, 'planner');
  assert.ok(contextSuccess.handoff.constraints.includes('Keep planner proposal-only'));
  assert.ok(contextSuccess.handoff.problemStatement.includes('Still unclear: Need an explicit success signal'));
  assert.equal(contextSuccess.run.handoffId, contextSuccess.handoff.id);
  assert.equal(fs.existsSync(path.join(rootPath, 'data', 'spatial', 'agent-runs', 'context-manager', 'context_success.json')), true);

  const contextFallback = await runContextManagerWorker({
    rootPath,
    text: 'Add a clearer plan slice for planner review.',
    sourceNodeId: 'node_ctx_2',
    source: 'context-intake',
    workspace,
    anchorBundle,
    dashboardState: {},
    runId: 'context_fallback',
    generator: async () => {
      throw new Error('Ollama unavailable');
    },
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(contextFallback.ok, true);
  assert.equal(contextFallback.outcome, 'completed');
  assert.equal(contextFallback.usedFallback, true);
  assert.equal(contextFallback.run.usedFallback, true);
  assert.ok(contextFallback.report);
  assert.ok(contextFallback.handoff);
  assert.match(contextFallback.run.reason || '', /Ollama unavailable/);
}
