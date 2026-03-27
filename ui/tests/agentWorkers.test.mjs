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
    model: 'mistral:latest',
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
    model: 'mistral:latest',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 30000,
    autoRun: false,
  }, null, 2));
  writeFile(rootPath, 'agents/context-manager/prompt.md', 'Context prompt');
  writeFile(rootPath, 'agents/executor/agent.json', JSON.stringify({
    id: 'executor',
    name: 'Executor',
    deskId: 'executor',
    runtime: 'ollama-json',
    backend: 'ollama',
    model: 'mistral:latest',
    host: 'http://127.0.0.1:11434',
    timeoutMs: 30000,
    autoRun: false,
  }, null, 2));
  writeFile(rootPath, 'agents/executor/prompt.md', 'Executor prompt');
}

function createWorkspace() {
  return {
    studio: {
      handoffs: {},
      teamBoard: { cards: [], summary: {} },
      selfUpgrade: {
        preflight: {
          ok: true,
          taskId: '0007',
          summary: 'ACE self-upgrade preflight passed.',
        },
        apply: {
          ok: true,
          taskId: '0007',
        },
      },
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
        executor: {
          status: 'idle',
          currentRunId: null,
          lastRunId: null,
          lastBlockedReason: null,
          lastCardId: null,
          lastTaskId: null,
          lastDecision: null,
          lastAssessmentSummary: null,
          lastAssessmentBlockers: [],
          lastVerifiedCardId: null,
          lastAppliedCardId: null,
          lastDeployCardId: null,
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
    runExecutorWorker,
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
    requestedOutcomes: ['Create planner cards', 'Persist proposals'],
    constraints: ['Keep planner proposal-only'],
    anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
  };

  assert.equal(getAgentWorkerConfig(rootPath, 'planner').model, 'mistral:latest');
  assert.equal(getAgentWorkerConfig(rootPath, 'context-manager').backend, 'ollama');
  assert.equal(getAgentWorkerConfig(rootPath, 'executor').model, 'mistral:latest');
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
    handoff: { ...readyHandoff, id: 'handoff_retry', requestedOutcomes: ['Clarify planner output'] },
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
    handoff: { ...readyHandoff, id: 'handoff_retry', requestedOutcomes: ['Clarify planner output'] },
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

  const executorCard = {
    id: '0007',
    title: 'Ship executor verification state',
    status: 'complete',
    approvalState: 'approved',
    riskLevel: 'low',
    targetProjectKey: 'ace-self',
    builderTaskId: '0007',
    sourceAnchorRefs: ['brain/emergence/plan.md'],
    verifyRequired: true,
    verifyStatus: 'passed',
    applyStatus: 'queued',
    deployStatus: 'idle',
    executionPackage: {
      status: 'ready',
      taskId: '0007',
      patchPath: 'work/tasks/0007-ship-executor-verification/patch.diff',
      changedFiles: ['ui/agentWorkers.js'],
      expectedAction: 'apply',
      verificationPlan: {
        required: true,
        summary: 'Run compile checks before apply.',
        signature: 'verify_0007',
        commands: [{ preset: 'runner_compile' }],
        qaScenarios: [{ scenario: 'layout-pass' }],
      },
    },
  };

  const executorResult = await runExecutorWorker({
    rootPath,
    card: executorCard,
    workspace: {
      ...workspace,
      studio: {
        ...workspace.studio,
        teamBoard: {
          cards: [executorCard],
          summary: { complete: 1 },
          selectedCardId: executorCard.id,
        },
      },
    },
    runId: 'executor_success',
    generator: async ({ fallbackReport }) => ({
      summary: 'Executor confirms apply readiness.',
      notes: ['Review compile output before apply.'],
      verificationPlan: fallbackReport.verificationPlan,
    }),
  });

  assert.equal(executorResult.ok, true);
  assert.equal(executorResult.outcome, 'completed');
  assert.equal(executorResult.report.decision, 'ready-apply');
  assert.equal(executorResult.report.applyReady, true);
  assert.equal(executorResult.report.verificationPlan.commandPresets[0], 'runner_compile');
  assert.ok(executorResult.report.notes.includes('Review compile output before apply.'));
  assert.equal(fs.existsSync(path.join(rootPath, 'data', 'spatial', 'agent-runs', 'executor', 'executor_success.json')), true);

  const executorFallback = await runExecutorWorker({
    rootPath,
    card: {
      ...executorCard,
      id: '0008',
      builderTaskId: '0008',
      approvalState: 'pending',
      verifyStatus: 'queued',
      executionPackage: {
        ...executorCard.executionPackage,
        taskId: '0008',
      },
      executorBlocker: {
        code: 'approval-required',
        message: 'Approval is still required before apply can run.',
      },
    },
    workspace: {
      ...workspace,
      studio: {
        ...workspace.studio,
        selfUpgrade: {
          ...workspace.studio.selfUpgrade,
          preflight: {
            ok: true,
            taskId: '9999',
            summary: 'stale preflight',
          },
        },
      },
    },
    runId: 'executor_fallback',
    generator: async () => {
      throw new Error('Ollama unavailable');
    },
  });

  assert.equal(executorFallback.ok, false);
  assert.equal(executorFallback.outcome, 'degraded');
  assert.equal(executorFallback.usedFallback, true);
  assert.equal(executorFallback.report.decision, 'blocked');
  assert.ok(executorFallback.report.blockers.includes('Approval is still required before apply can run.'));
  assert.ok(executorFallback.report.blockers.includes('Self-upgrade preflight is missing or stale for this task.'));

  const previousHandoff = {
    id: 'handoff_ctx',
    sourceNodeId: 'node_ctx',
    summary: 'Need a tighter planner brief.',
    requestedOutcomes: ['Clarify planner acceptance criteria'],
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
        packet: {
          summary: 'Tighten the planner brief before execution expands.',
          statement: 'Clarify planner acceptance criteria and expose review state in Studio.',
          goal: 'Clarify planner acceptance criteria and expose review state in Studio.',
          requestedOutcomes: ['Clarify planner acceptance criteria', 'Expose review state in Studio'],
          targets: ['planner', 'studio'],
          constraints: ['Keep planner proposal-only'],
          urgency: 'normal',
          requestType: 'planning_request',
          signals: { actionSignals: 3, constraintSignals: 1 },
          clarifications: ['Need an explicit success signal for planner cards'],
          focusTerms: ['planner', 'review', 'acceptance'],
          suggestedAnchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
        },
        extractedIntent: {
          summary: 'Planner review state needs a clearer system representation.',
          explicitClaims: ['Planner acceptance criteria need to be clarified', 'Review state should be visible in Studio'],
          inferredClaims: ['Expose review state near planner handoff artifacts'],
          candidateNodes: [
            { id: 'candidate_acceptance', label: 'Clarify planner acceptance criteria', kind: 'task', basis: 'explicit', rationale: 'Directly requested in the packet.', confidence: 0.88 },
            { id: 'candidate_review', label: 'Expose review state in Studio', kind: 'module', basis: 'explicit', rationale: 'Directly requested in the packet.', confidence: 0.83 },
            { id: 'candidate_trace', label: 'Trace planner handoff review signals', kind: 'task', basis: 'inferred', rationale: 'Small inferred graph step.', confidence: 0.64 },
          ],
          candidateEdges: [
            { sourceCandidateId: 'candidate_acceptance', targetCandidateId: 'candidate_review', kind: 'relates_to', basis: 'explicit', rationale: 'Review state depends on clarified acceptance.' },
          ],
          gaps: ['Need an explicit success signal for planner cards'],
        },
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
  assert.deepEqual(contextSuccess.report.requestedOutcomes, ['Clarify planner acceptance criteria', 'Expose review state in Studio']);
  assert.ok(contextSuccess.extractedIntent);
  assert.equal(contextSuccess.extractedIntent.provenance.usedFallback, false);
  assert.ok(contextSuccess.report.extractedIntent);
  assert.ok(contextSuccess.report.extractedIntent.candidateNodes.length >= 3);
  assert.equal(contextSuccess.report.extractedIntent.inferredClaims.length, 1);
  assert.equal(contextSuccess.report.extractedIntent.candidateEdges.length, 1);
  assert.equal(contextSuccess.report.extractedIntent.audit.classification.role, contextSuccess.report.classification.role);
  assert.equal(contextSuccess.handoff.sourceAgentId, 'context-manager');
  assert.equal(contextSuccess.handoff.targetAgentId, 'planner');
  assert.deepEqual(contextSuccess.handoff.requestedOutcomes, ['Clarify planner acceptance criteria', 'Expose review state in Studio']);
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

  assert.equal(contextFallback.ok, false);
  assert.equal(contextFallback.outcome, 'degraded');
  assert.equal(contextFallback.usedFallback, true);
  assert.equal(contextFallback.run.usedFallback, true);
  assert.equal(contextFallback.run.outcome, 'degraded');
  assert.ok(contextFallback.report);
  assert.ok(contextFallback.handoff);
  assert.ok(contextFallback.extractedIntent);
  assert.equal(contextFallback.extractedIntent.provenance.usedFallback, true);
  assert.equal(contextFallback.extractedIntent.inferredClaims.length, 0);
  assert.ok(contextFallback.extractedIntent.candidateNodes.every((node) => node.basis === 'explicit'));
  assert.match(contextFallback.run.reason || '', /Ollama unavailable/);

  const normalizedGraphContext = await runContextManagerWorker({
    rootPath,
    text: 'Normalize the planner handoff around the graph bundle.',
    sourceNodeId: 'node_graph_bundle',
    source: 'context-intake',
    workspace: {
      ...workspace,
      graphs: {
        system: {
          nodes: [
            {
              id: 'node_system_graph',
              type: 'module',
              content: 'System graph anchor',
              metadata: { role: 'module' },
            },
          ],
          edges: [
            { source: 'node_system_graph', target: 'node_world_graph', relationship_type: 'relates_to' },
          ],
        },
        world: {
          nodes: [
            {
              id: 'node_world_graph',
              type: 'text',
              content: 'World graph context-manager anchor',
              metadata: { agentId: 'context-manager' },
            },
          ],
          edges: [],
        },
      },
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
    runId: 'context_graph_bundle',
    generator: async ({ plannerFeedback: activeFeedback }) => {
      assert.equal(activeFeedback.action, 'retry-handoff');
      return {
        packet: {
          summary: 'Bridge normalized graph bundle into context manager output.',
          statement: 'Carry graph-aware context into planner-facing handoff data.',
          goal: 'Carry graph-aware context into planner-facing handoff data.',
          requestedOutcomes: ['Carry graph-aware context into planner-facing handoff data'],
          targets: ['planner'],
          constraints: ['Keep graph bridging narrow'],
          urgency: 'normal',
          requestType: 'planning_request',
          signals: { graphSignals: 2 },
          clarifications: [],
          focusTerms: ['graph', 'bundle'],
          suggestedAnchorRefs: ['brain/emergence/plan.md'],
        },
        extractedIntent: {
          summary: 'Graph bundle bridge needs planner visibility.',
          explicitClaims: ['Carry graph-aware context into planner-facing handoff data'],
          inferredClaims: [],
          candidateNodes: [
            { id: 'candidate_graph', label: 'Carry graph-aware context into planner-facing handoff data', kind: 'module', basis: 'explicit', rationale: 'Derived from the normalized graph bundle path.', confidence: 0.91 },
          ],
          candidateEdges: [],
          gaps: [],
        },
      };
    },
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(normalizedGraphContext.ok, true);
  assert.deepEqual(normalizedGraphContext.handoff.requestedOutcomes, ['Carry graph-aware context into planner-facing handoff data']);
  assert.equal(normalizedGraphContext.report.projectContext.graphBundle.system.nodes[0].id, 'node_system_graph');
  assert.equal(normalizedGraphContext.report.projectContext.graphBundle.world.nodes[0].id, 'node_world_graph');
  assert.equal(normalizedGraphContext.report.projectContext.graphBundle.system.edges[0].source, 'node_system_graph');
  assert.equal(normalizedGraphContext.handoff.graphBundle.world.nodes[0].id, 'node_world_graph');

  const legacyGraphContext = await runContextManagerWorker({
    rootPath,
    text: 'Preserve legacy graph input handling.',
    sourceNodeId: 'node_legacy_graph',
    source: 'context-intake',
    workspace: {
      ...workspace,
      graph: {
        nodes: [
          {
            id: 'node_legacy_ctx',
            type: 'text',
            content: 'Legacy graph context-manager node',
            metadata: { agentId: 'context-manager' },
          },
        ],
        edges: [
          { source: 'node_legacy_ctx', target: 'node_legacy_link', relationship_type: 'relates_to' },
        ],
      },
    },
    anchorBundle,
    dashboardState: {},
    runId: 'context_legacy_graph',
    generator: async () => ({
      packet: {
        summary: 'Legacy graph fallback should still work.',
        statement: 'Use the old graph shape when normalized graphs are absent.',
        goal: 'Use the old graph shape when normalized graphs are absent.',
        requestedOutcomes: ['Use the old graph shape when normalized graphs are absent'],
        targets: ['planner'],
        constraints: ['Keep legacy fallback alive'],
        urgency: 'normal',
        requestType: 'planning_request',
        signals: { graphSignals: 1 },
        clarifications: [],
        focusTerms: ['legacy'],
        suggestedAnchorRefs: ['brain/emergence/tasks.md'],
      },
      extractedIntent: {
        summary: 'Legacy graph fallback remains supported.',
        explicitClaims: ['Use the old graph shape when normalized graphs are absent'],
        inferredClaims: [],
        candidateNodes: [
          { id: 'candidate_legacy', label: 'Use the old graph shape when normalized graphs are absent', kind: 'module', basis: 'explicit', rationale: 'Derived from legacy workspace.graph input.', confidence: 0.9 },
        ],
        candidateEdges: [],
        gaps: [],
      },
    }),
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(legacyGraphContext.ok, true);
  assert.equal(legacyGraphContext.report.projectContext.graphBundle.system.nodes[0].id, 'node_legacy_ctx');
  assert.equal(legacyGraphContext.report.projectContext.graphBundle.world.nodes.length, 0);
  assert.equal(legacyGraphContext.handoff.graphBundle.system.nodes[0].id, 'node_legacy_ctx');

  const partialGraphContext = await runContextManagerWorker({
    rootPath,
    text: 'Handle partial graph bundle input safely.',
    sourceNodeId: 'node_partial_graph',
    source: 'context-intake',
    workspace: {
      ...workspace,
      graphs: {
        system: {
          nodes: null,
          edges: null,
        },
        world: {
          nodes: [],
          edges: null,
        },
      },
    },
    anchorBundle,
    dashboardState: {},
    runId: 'context_partial_graph',
    generator: async () => ({
      packet: {
        summary: 'Partial graph data should not break the handoff path.',
        statement: 'Normalize missing graph arrays safely.',
        goal: 'Normalize missing graph arrays safely.',
        requestedOutcomes: ['Normalize missing graph arrays safely'],
        targets: ['planner'],
        constraints: ['Keep fallback safe'],
        urgency: 'normal',
        requestType: 'planning_request',
        signals: { graphSignals: 0 },
        clarifications: [],
        focusTerms: ['partial'],
        suggestedAnchorRefs: ['brain/emergence/plan.md'],
      },
      extractedIntent: {
        summary: 'Partial graph data must fail safely.',
        explicitClaims: ['Normalize missing graph arrays safely'],
        inferredClaims: [],
        candidateNodes: [
          { id: 'candidate_partial', label: 'Normalize missing graph arrays safely', kind: 'task', basis: 'explicit', rationale: 'Derived from partial workspace graph input.', confidence: 0.87 },
        ],
        candidateEdges: [],
        gaps: [],
      },
    }),
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(partialGraphContext.ok, true);
  assert.ok(Array.isArray(partialGraphContext.report.projectContext.graphBundle.system.nodes));
  assert.ok(Array.isArray(partialGraphContext.report.projectContext.graphBundle.system.edges));
  assert.ok(Array.isArray(partialGraphContext.report.projectContext.graphBundle.world.nodes));
  assert.ok(Array.isArray(partialGraphContext.report.projectContext.graphBundle.world.edges));
  assert.equal(partialGraphContext.report.projectContext.graphBundle.system.nodes.length, 0);
  assert.equal(partialGraphContext.report.projectContext.graphBundle.world.edges.length, 0);
  assert.equal(partialGraphContext.handoff.graphBundle.system.nodes.length, 0);
}
