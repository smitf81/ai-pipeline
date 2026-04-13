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
    DEFAULT_PLANNER_TIMEOUT_MS,
    evaluatePlannerEligibility,
    getAgentWorkerConfig,
    buildPlannerPrompt,
    buildPlannerPromptProfile,
    runContextManagerWorker,
    runExecutorWorker,
    runPlannerWorker,
    buildCanonicalIntentContract,
    buildPlannerArtifactContract,
  } = require(agentWorkersPath);
  const {
    buildFixTaskPlannerHandoff,
  } = require(path.resolve(process.cwd(), 'fixTasks.js'));
  const {
    createDefaultCtoOverrideLedger,
    normalizeCtoOverrideLedger,
  } = require(path.resolve(process.cwd(), 'ctoOverrides.js'));
  const {
    readTaHireRequestQueue,
  } = require(path.resolve(process.cwd(), 'taHireRequests.js'));
  const {
    readPlannerOuttray,
  } = require(path.resolve(process.cwd(), 'plannerOuttray.js'));
  const { buildAnchorBundle } = require(anchorResolverPath);
  const { analyzeSpatialIntent, buildIntentProjectContext } = require(intentAnalysisPath);

  seedBrain(rootPath);
  seedAgents(rootPath);
  const anchorBundle = buildAnchorBundle({ rootPath });
  const workspace = createWorkspace();
  const readyIntentContract = buildCanonicalIntentContract({
    report: {
      summary: 'Planner handoff ready.',
      goal: 'Goal: add the planner worker.',
      requestedOutcomes: ['Create planner cards', 'Persist proposals'],
      tasks: ['Create planner cards', 'Persist proposals'],
      targets: ['planner'],
      constraints: ['Keep planner proposal-only'],
      urgency: 'normal',
      requestType: 'planning_request',
      nodeId: 'node_ctx_1',
      requestedBy: 'cto-user',
      priority: 'high',
      anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    },
    packet: {
      summary: 'Planner handoff ready.',
      goal: 'Goal: add the planner worker.',
      requestedOutcomes: ['Create planner cards', 'Persist proposals'],
      tasks: ['Create planner cards', 'Persist proposals'],
      targets: ['planner'],
      constraints: ['Keep planner proposal-only'],
      urgency: 'normal',
      requestType: 'planning_request',
      sourceType: 'cto-chat',
      sourceRef: 'chat-1',
      requestedBy: 'cto-user',
      priority: 'high',
      anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    },
    sourceType: 'cto-chat',
    sourceRef: 'chat-1',
    requestedBy: 'cto-user',
    priority: 'high',
    timestamp: '2026-03-23T07:05:00.000Z',
    provenance: { channel: 'cto-chat' },
    intentId: 'intent_cto_chat_1',
  });
  const readyHandoff = {
    id: 'handoff_ready',
    status: 'ready',
    summary: 'Planner handoff ready.',
    problemStatement: 'Goal: add the planner worker.',
    requestedOutcomes: ['Create planner cards', 'Persist proposals'],
    constraints: ['Keep planner proposal-only'],
    anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
    intentId: readyIntentContract.intentId,
    sourceType: readyIntentContract.sourceType,
    sourceRef: readyIntentContract.sourceRef,
    requestedBy: readyIntentContract.requestedBy,
    priority: readyIntentContract.priority,
    timestamp: readyIntentContract.timestamp,
    intentContract: readyIntentContract,
    contextLanes: {
      narrow: {
        lane: 'local',
        currentDesk: 'planner',
        currentTask: 'Create planner cards',
        activeIntent: {
          intentId: readyIntentContract.intentId,
          sourceType: readyIntentContract.sourceType,
          sourceRef: readyIntentContract.sourceRef,
          requestedBy: readyIntentContract.requestedBy,
          priority: readyIntentContract.priority,
          statement: readyIntentContract.canonicalIntent.statement,
          goal: readyIntentContract.canonicalIntent.goal,
        },
        selectedAnchorRefs: ['brain/emergence/plan.md'],
        taskId: 'task-0001',
      },
      department: {
        lane: 'department',
        departmentId: 'dept-delivery',
        currentFocus: 'Planner worker coverage',
        activeMilestone: 'Slice rollout',
        blockers: ['QA coverage is pending'],
        recentHandoff: {
          id: 'handoff_previous',
          sourceAgentId: 'context-manager',
          sourceNodeId: 'node-1',
          summary: 'Previous planner handoff.',
          status: 'ready',
          requestedOutcomes: ['Seed planner'],
        },
        recentHandoffs: ['handoff_previous'],
        orchestratorState: 'running',
        teamBoardSummary: { plan: 2, review: 1 },
      },
      broad: {
        lane: 'broad',
        brainRoot: 'brain/emergence',
        currentFocus: 'Planner worker coverage',
        activeMilestone: 'Slice rollout',
        projectBrain: [{ relativePath: 'brain/emergence/project_brain.md', summary: 'Project brain summary.' }],
        roadmap: [{ relativePath: 'brain/emergence/roadmap.md', summary: 'Roadmap summary.' }],
        recentDecisions: [{ relativePath: 'brain/emergence/decisions.md', summary: 'Decision summary.' }],
        truthSources: [{ relativePath: 'brain/emergence/project_brain.md', summary: 'Project brain summary.' }],
        anchorRefs: ['brain/emergence/plan.md', 'brain/emergence/tasks.md'],
        graphSummary: { nodes: 2, edges: 1 },
      },
    },
  };

  assert.equal(getAgentWorkerConfig(rootPath, 'planner').model, 'mistral:latest');
  assert.equal(getAgentWorkerConfig(rootPath, 'planner').timeoutMs, DEFAULT_PLANNER_TIMEOUT_MS);
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

  const fixTaskHandoff = buildFixTaskPlannerHandoff(rootPath, {
    taskId: '0009',
    parentTaskId: '0007',
    status: 'consumed',
    location: 'task',
    stage: 'planner',
    action: 'fix-task-intake',
    summary: 'Retry the bounded fix task.',
    problemStatement: 'Retry the bounded fix task.',
    reasons: ['Patch is empty or invalid.'],
    retry_count: 1,
    retry_limit: 2,
    projectKey: 'ace-self',
    changedFiles: ['brain/emergence/plan.md'],
    jsonPath: 'work/tasks/0009-fix-task/fix_task.json',
    markdownPath: 'work/tasks/0009-fix-task/fix_task.md',
    anchorRefs: ['work/tasks/0009-fix-task/fix_task.md'],
  });
  const plannerPrompt = buildPlannerPrompt({
    promptTemplate: 'planner-template',
    handoff: fixTaskHandoff,
    anchorBundle: { anchors: {} },
    board: { selectedCardId: null, cards: [] },
    rootPath,
    taskCache: null,
  });
  assert.match(plannerPrompt, /## Fix Task Intake/);
  assert.match(plannerPrompt, /Parent task: 0007/);
  assert.match(plannerPrompt, /Retry count: 1/);
  assert.match(plannerPrompt, /## Canonical Intent Contract/);
  assert.match(plannerPrompt, /"intentId": "intent_/);
  assert.match(plannerPrompt, /Treat this contract as the source of truth/i);
  assert.match(plannerPrompt, /## Planner Context Lanes/);
  assert.match(plannerPrompt, /immediate task context/i);
  assert.match(plannerPrompt, /## CTO Override Layer/);
  assert.match(plannerPrompt, /canonical truth/i);
  assert.match(plannerPrompt, /## Required Planner Output Contract/);
  assert.match(plannerPrompt, /planBundle/i);
  assert.match(plannerPrompt, /taskBundle/i);
  assert.match(plannerPrompt, /hireRequest/i);
  assert.match(plannerPrompt, /## Secondary Retrieval Availability/);

  const scopedPlannerProfile = buildPlannerPromptProfile({
    promptTemplate: 'planner-template',
    handoff: readyHandoff,
    anchorBundle,
    board: workspace.studio.teamBoard,
    rootPath,
    promptScope: 'scoped',
  });
  const broadPlannerProfile = buildPlannerPromptProfile({
    promptTemplate: 'planner-template',
    handoff: readyHandoff,
    anchorBundle,
    board: workspace.studio.teamBoard,
    rootPath,
    promptScope: 'broad',
  });
  assert.equal(scopedPlannerProfile.contextMode, 'scoped');
  assert.equal(broadPlannerProfile.contextMode, 'broad');
  assert.equal(scopedPlannerProfile.promptChars < broadPlannerProfile.promptChars, true);
  assert.match(scopedPlannerProfile.prompt, /Secondary Retrieval Availability/);
  assert.match(broadPlannerProfile.prompt, /Secondary Retrieval Context/);

  const talentAcquisition = {
    department: {
      summary: 'QA coverage is missing and needs an asynchronous hire request.',
      urgency: 'high',
    },
    plannerCoverage: {
      covered: true,
      urgency: 'low',
      blocker: false,
      canonical: { roleId: 'planner' },
    },
    qaLeadCoverage: {
      covered: false,
      urgency: 'high',
      blocker: true,
      reason: 'QA lead coverage is missing.',
      canonical: { roleId: 'qa-lead' },
    },
  };

  const successResult = await runPlannerWorker({
    rootPath,
    handoff: readyHandoff,
    workspace,
    anchorBundle,
    runId: 'planner_success',
    talentAcquisition,
    generator: async () => ({
      summary: 'Planner generated anchored cards.',
      planBundle: {
        planId: 'plan_bundle_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Planner output bundle for QA and archivist consumption.',
        items: [
          {
            planId: 'plan_1',
            intentId: readyHandoff.intentContract.intentId,
            status: 'ready',
            priority: 'high',
            summary: 'Create planner worker runtime',
            acceptanceCriteria: ['Planner runtime is available', 'Planner identity stays canonical'],
            dependencies: [],
            targetDesk: 'planner',
            targetRole: 'Planner',
            handoffState: 'ready',
            provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
            createdBy: 'planner',
            createdAt: '2026-03-23T07:06:00.000Z',
          },
          {
            planId: 'plan_2',
            intentId: readyHandoff.intentContract.intentId,
            status: 'ready',
            priority: 'normal',
            summary: 'Coordinate QA follow-up',
            acceptanceCriteria: ['QA can inspect structured planner output'],
            dependencies: ['plan_1'],
            targetDesk: 'qa-lead',
            targetRole: 'QA Lead',
            handoffState: 'ready',
            provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
            createdBy: 'planner',
            createdAt: '2026-03-23T07:06:00.000Z',
          },
        ],
      },
      taskBundle: {
        taskBundleId: 'task_bundle_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        tasks: [
          {
            taskId: 'task_1',
            planId: 'plan_1',
            intentId: readyHandoff.intentContract.intentId,
            status: 'planned',
            priority: 'high',
            summary: 'Create planner worker runtime',
            acceptanceCriteria: ['Planner runtime is available', 'Planner identity stays canonical'],
            dependencies: [],
            targetDesk: 'executor',
            targetRole: 'Executor',
            handoffState: 'ready',
            provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
            createdBy: 'planner',
            createdAt: '2026-03-23T07:06:00.000Z',
          },
          {
            taskId: 'task_2',
            planId: 'plan_2',
            intentId: readyHandoff.intentContract.intentId,
            status: 'planned',
            priority: 'normal',
            summary: 'Coordinate QA follow-up',
            acceptanceCriteria: ['QA can inspect structured planner output'],
            dependencies: ['plan_1'],
            targetDesk: 'qa-lead',
            targetRole: 'QA Lead',
            handoffState: 'ready',
            provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
            createdBy: 'planner',
            createdAt: '2026-03-23T07:06:00.000Z',
          },
        ],
      },
      dependencyMap: {
        dependencyMapId: 'dependency_map_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        edges: [
          {
            dependencyId: 'dependency_1',
            sourcePlanId: 'plan_1',
            targetPlanId: 'plan_2',
            type: 'depends_on',
            status: 'active',
            provenance: { sourceHandoffId: readyHandoff.id },
            createdBy: 'planner',
            createdAt: '2026-03-23T07:06:00.000Z',
          },
        ],
      },
      staffingRequest: {
        staffingRequestId: 'staffing_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'QA coverage request for planner output.',
        targetDesk: 'qa-lead',
        targetRole: 'QA Lead',
        requiredCoverage: ['QA review'],
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      qaRequest: {
        qaRequestId: 'qa_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'QA should validate the planner output contract.',
        acceptanceCriteria: ['QA can inspect structured planner output'],
        targetDesk: 'qa-lead',
        targetRole: 'QA Lead',
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      archivalSummary: {
        archivalSummaryId: 'archive_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Archive planner output with provenance.',
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      contextUpdatePacket: {
        contextUpdatePacketId: 'context_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Context manager can index planner output against the current scope.',
        requestedOutcomes: ['Create planner worker runtime', 'Coordinate QA follow-up'],
        constraints: ['Keep planner proposal-only'],
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
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
  assert.equal(successResult.planBundle.items.length, 2);
  assert.equal(successResult.taskBundle.tasks.length, 2);
  assert.equal(successResult.dependencyMap.edges.length, 1);
  assert.equal(successResult.staffingRequest.targetDesk, 'qa-lead');
  assert.equal(successResult.qaRequest.acceptanceCriteria[0], 'QA can inspect structured planner output');
  assert.equal(successResult.archivalSummary.summary, 'Archive planner output with provenance.');
  assert.deepEqual(successResult.contextUpdatePacket.requestedOutcomes, ['Create planner worker runtime', 'Coordinate QA follow-up']);
  assert.equal(successResult.qaStatus, 'pending');
  assert.equal(successResult.qaCoverageRequired, true);
  assert.equal(successResult.qaBlocker, false);
  assert.equal(successResult.releaseBlocker, false);
  assert.ok(successResult.outtray);
  assert.equal(successResult.outtray.entryCount, 1);
  assert.equal(successResult.outtray.depositedCount, 1);
  assert.ok(successResult.hireRequest);
  assert.equal(successResult.hireRequest.requestedRoleId, 'qa-lead');
  assert.equal(successResult.hireRequest.originDeskId, 'planner');
  assert.equal(successResult.hireRequest.originDepartmentId, 'dept-delivery');
  assert.equal(successResult.hireRequest.status, 'queued');
  assert.equal(successResult.hireRequest.blockingLevel, 'handoff_risk');
  assert.match(successResult.hireRequest.reason, /QA lead coverage is missing|QA coverage is missing/);
  assert.ok(successResult.hireRequestQueue);
  assert.equal(successResult.hireRequestQueue.entryCount, 1);
  assert.equal(successResult.hireRequestQueue.queuedCount, 1);
  const hireQueue = readTaHireRequestQueue(rootPath);
  assert.equal(hireQueue.entries.length, 1);
  assert.equal(hireQueue.entries[0].hireRequestId, successResult.hireRequest.hireRequestId);
  const outtrayQueue = readPlannerOuttray(rootPath);
  assert.equal(outtrayQueue.entries.length, 1);
  assert.equal(outtrayQueue.entries[0].status, 'deposited');
  assert.equal(outtrayQueue.entries[0].items.length, 5);
  assert.equal(outtrayQueue.entries[0].items[0].status, 'ready_for_handoff');
  assert.equal(successResult.proposalArtifactRefs.length, 2);
  assert.ok(successResult.proposalArtifactRefs.every((artifactRef) => fs.existsSync(path.join(rootPath, ...artifactRef.split('/')))));
  assert.equal(fs.existsSync(path.join(rootPath, 'brain', 'emergence', 'plan.md')), true);
  assert.equal(successResult.run.intentId, readyHandoff.intentContract.intentId);
  assert.ok(successResult.run.intentContract);
  assert.ok(successResult.run.planBundle);
  assert.ok(successResult.run.contextLanes);
  assert.equal(successResult.run.contextLanes.narrow.currentDesk, 'planner');
  assert.equal(successResult.run.contextLanes.department.departmentId, 'dept-delivery');
  assert.equal(successResult.run.contextLanes.broad.projectBrain[0].relativePath, 'brain/emergence/project_brain.md');
  assert.equal(successResult.run.archivalSummary.contextLanes.broad.brainRoot, 'brain/emergence');
  assert.equal(successResult.run.contextUpdatePacket.contextLanes.narrow.currentTask, 'Create planner cards');
  assert.equal(successResult.run.qaStatus, 'pending');
  assert.equal(successResult.run.qaCoverageRequired, true);
  assert.equal(successResult.run.qaBlocker, false);
  assert.equal(successResult.run.releaseBlocker, false);
  assert.equal(successResult.run.hireRequest.hireRequestId, successResult.hireRequest.hireRequestId);
  assert.equal(successResult.run.hireRequestQueue.entryCount, 1);
  assert.ok(successResult.run.outtray);
  assert.equal(successResult.run.outtray.entryCount, 1);
  assert.equal(successResult.run.outtray.depositedCount, 1);
  assert.equal(successResult.run.outtray.latestEntry.status, 'deposited');
  assert.equal(successResult.run.outtray.latestEntry.items.length, 5);
  assert.ok(successResult.run.qaQueue);
  assert.equal(successResult.run.qaQueue.queue.entries[0].qaStatus, 'pending');
  assert.equal(successResult.run.qaQueue.queue.entries[0].qaBlocker, false);
  assert.equal(successResult.run.planBundle.items[0].planId, 'plan_1');
  assert.equal(successResult.run.taskBundle.tasks[0].taskId, 'task_1');
  assert.equal(successResult.run.dependencyMap.edges[0].targetPlanId, 'plan_2');
  assert.equal(successResult.run.qaRequest.targetDesk, 'qa-lead');
  assert.equal(successResult.run.archivalSummary.archivalSummaryId, 'archive_1');
  assert.equal(successResult.run.contextUpdatePacket.contextUpdatePacketId, 'context_1');
  assert.equal(successResult.run.planBundle.items.length, 2);
  assert.equal(successResult.run.taskBundle.tasks.length, 2);
  assert.equal(successResult.run.dependencyMap.edges.length, 1);
  assert.equal(successResult.cognitionDiagnostics.context_mode, 'scoped');
  assert.equal(successResult.cognitionDiagnostics.used_live_call, false);
  assert.equal(successResult.cognitionDiagnostics.failure_reason, null);
  assert.equal(successResult.run.cognitionDiagnostics.context_mode, 'scoped');
  assert.equal(successResult.run.cognitionDiagnostics.used_fallback, false);
  assert.equal(successResult.run.cognitionDiagnostics.prompt_chars > 0, true);
  assert.equal(Array.isArray(successResult.run.llmTrace.steps), true);
  assert.equal(successResult.run.llmTrace.steps[0].contextMode, 'scoped');

  const overrideWorkspace = {
    ...workspace,
    studio: {
      ...workspace.studio,
      ctoOverrides: normalizeCtoOverrideLedger({
        ...createDefaultCtoOverrideLedger(),
        entries: [{
          overrideId: 'override_force_planner_1',
          kind: 'force-plan-generation',
          requestedBy: 'cto',
          reason: 'Force a new planner pass even though this handoff already ran.',
          target: {
            deskId: 'planner',
            planId: 'plan_bundle_override',
            handoffId: readyHandoff.id,
            intentId: readyHandoff.intentContract.intentId,
          },
          canonicalTruth: {
            staffing: { state: 'absent', note: 'Planner coverage is still missing.' },
            handoff: { state: 'blocked', note: 'Planner has already seen this handoff.' },
          },
          provenance: {
            sourceType: 'cto-chat',
            sourceRef: 'override-console',
            sourceActionId: 'force-plan-generation',
          },
        }],
      }),
    },
  };
  const overrideResult = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_override', status: 'ready' },
    workspace: overrideWorkspace,
    anchorBundle,
    mode: 'manual',
    runId: 'planner_override',
    generator: async () => ({
      summary: 'Planner forced run with override provenance.',
      planBundle: {
        planId: 'plan_bundle_override',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Forced planner bundle.',
        items: [{
          planId: 'plan_override_1',
          intentId: readyHandoff.intentContract.intentId,
          status: 'ready',
          priority: 'high',
          summary: 'Planner forced run.',
          acceptanceCriteria: ['Override provenance is visible'],
          dependencies: [],
          targetDesk: 'planner',
          targetRole: 'Planner',
          handoffState: 'ready',
          provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
          createdBy: 'planner',
          createdAt: '2026-03-23T07:06:00.000Z',
        }],
      },
      taskBundle: {
        taskBundleId: 'task_bundle_override',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        tasks: [{
          taskId: 'task_override_1',
          planId: 'plan_override_1',
          intentId: readyHandoff.intentContract.intentId,
          status: 'planned',
          priority: 'high',
          summary: 'Planner forced run.',
          acceptanceCriteria: ['Override provenance is visible'],
          dependencies: [],
          targetDesk: 'executor',
          targetRole: 'Executor',
          handoffState: 'ready',
          provenance: { sourceHandoffId: readyHandoff.id, sourceIntentId: readyHandoff.intentContract.intentId },
          createdBy: 'planner',
          createdAt: '2026-03-23T07:06:00.000Z',
        }],
      },
      qaRequest: {
        qaRequestId: 'qa_override_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'QA should see override provenance.',
        acceptanceCriteria: ['Override provenance is visible'],
        targetDesk: 'qa-lead',
        targetRole: 'QA Lead',
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      archivalSummary: {
        archivalSummaryId: 'archive_override_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Archive forced run.',
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      contextUpdatePacket: {
        contextUpdatePacketId: 'context_override_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        summary: 'Context packet for forced planning.',
        requestedOutcomes: ['Planner forced run.'],
        constraints: ['Keep override provenance visible'],
        provenance: { sourceHandoffId: readyHandoff.id },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:06:00.000Z',
      },
      overrideLayer: overrideWorkspace.studio.ctoOverrides ? {
        ...overrideWorkspace.studio.ctoOverrides,
        planningMode: 'forced',
      } : null,
      planningMode: 'forced',
    }),
  });
  assert.equal(overrideResult.ok, true);
  assert.equal(overrideResult.outcome, 'completed');
  assert.equal(overrideResult.planningMode, 'forced');
  assert.equal(overrideResult.overrideLayer.planningMode, 'forced');
  assert.equal(overrideResult.run.overrideLayer.planningMode, 'forced');
  assert.equal(overrideResult.run.planBundle.overrideLayer.planningMode, 'forced');
  assert.equal(overrideResult.run.planBundle.items[0].summary, 'Planner forced run.');
  assert.equal(overrideResult.run.taskBundle.tasks[0].summary, 'Planner forced run.');

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
  assert.equal(degraded.cognitionDiagnostics.context_mode, 'scoped');
  assert.equal(degraded.cognitionDiagnostics.used_live_call, false);
  assert.equal(degraded.cognitionDiagnostics.used_fallback, true);
  assert.equal(degraded.cognitionDiagnostics.failure_reason, 'model_unavailable');

  const livePlannerPayload = {
    summary: 'Planner live call produced a compact plan.',
    planBundle: {
      planId: 'plan_bundle_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      summary: 'Live planner bundle.',
      items: [{
        planId: 'plan_live_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'ready',
        priority: 'high',
        summary: 'Ship the bounded planner repair',
        acceptanceCriteria: ['Planner records cognition diagnostics'],
        dependencies: [],
        targetDesk: 'planner',
        targetRole: 'Planner',
        handoffState: 'ready',
        provenance: { sourceHandoffId: 'handoff_live', sourceIntentId: readyHandoff.intentContract.intentId },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:10:00.000Z',
      }],
    },
    taskBundle: {
      taskBundleId: 'task_bundle_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      tasks: [{
        taskId: 'task_live_1',
        planId: 'plan_live_1',
        intentId: readyHandoff.intentContract.intentId,
        status: 'planned',
        priority: 'high',
        summary: 'Verify live planner path',
        acceptanceCriteria: ['Planner uses Ollama generate'],
        dependencies: [],
        targetDesk: 'executor',
        targetRole: 'Executor',
        handoffState: 'ready',
        provenance: { sourceHandoffId: 'handoff_live', sourceIntentId: readyHandoff.intentContract.intentId },
        createdBy: 'planner',
        createdAt: '2026-03-23T07:10:00.000Z',
      }],
    },
    dependencyMap: {
      dependencyMapId: 'dependency_map_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      edges: [],
    },
    staffingRequest: {
      staffingRequestId: 'staffing_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      summary: 'No additional staffing needed.',
      targetDesk: 'qa-lead',
      targetRole: 'QA Lead',
      requiredCoverage: ['QA review'],
      provenance: { sourceHandoffId: 'handoff_live' },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:10:00.000Z',
    },
    qaRequest: {
      qaRequestId: 'qa_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      summary: 'QA review the bounded planner repair.',
      acceptanceCriteria: ['Planner output is grounded'],
      targetDesk: 'qa-lead',
      targetRole: 'QA Lead',
      provenance: { sourceHandoffId: 'handoff_live' },
      createdBy: 'planner',
      createdAt: '2026-03-23T07:10:00.000Z',
    },
    outtray: {
      queueKey: 'outtray_live',
      plannerRunId: 'planner_live_http',
      planBundleId: 'plan_bundle_live',
      taskBundleId: 'task_bundle_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'deposited',
      summary: 'Live planner bundle deposited.',
      items: [],
    },
    archivalSummary: {
      archivalSummaryId: 'archive_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      summary: 'Archive the live planner bundle.',
      createdBy: 'planner',
      createdAt: '2026-03-23T07:10:00.000Z',
    },
    contextUpdatePacket: {
      contextUpdatePacketId: 'context_live',
      intentId: readyHandoff.intentContract.intentId,
      status: 'ready',
      summary: 'Carry bounded cognition diagnostics forward.',
      requestedOutcomes: ['Carry bounded cognition diagnostics forward'],
      constraints: ['Keep planner prompt scoped by default'],
      createdBy: 'planner',
      createdAt: '2026-03-23T07:10:00.000Z',
    },
    cards: [
      {
        title: 'Verify live planner path',
        summary: 'Ensure the planner call uses the live Ollama path.',
        anchorRefs: ['brain/emergence/plan.md'],
      },
    ],
    brainProposals: [],
    needsContextRetry: false,
    retryReason: '',
  };
  const plannerFetchCalls = [];
  const livePlanner = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_live' },
    workspace,
    anchorBundle,
    runId: 'planner_live_http',
    promptScope: 'broad',
    fetchImpl: async (url, options = {}) => {
      plannerFetchCalls.push({
        url,
        body: JSON.parse(options.body || '{}'),
      });
      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify(livePlannerPayload),
        }),
      };
    },
  });
  assert.equal(livePlanner.ok, true);
  assert.equal(plannerFetchCalls.length, 1);
  assert.equal(plannerFetchCalls[0].url, 'http://127.0.0.1:11434/api/generate');
  assert.equal(plannerFetchCalls[0].body.model, 'mistral:latest');
  assert.equal(typeof plannerFetchCalls[0].body.prompt, 'string');
  assert.equal(livePlanner.cognitionDiagnostics.used_live_call, true);
  assert.equal(livePlanner.cognitionDiagnostics.used_fallback, false);
  assert.equal(livePlanner.cognitionDiagnostics.context_mode, 'broad');

  const timeoutPlanner = await runPlannerWorker({
    rootPath,
    handoff: { ...readyHandoff, id: 'handoff_timeout' },
    workspace,
    anchorBundle,
    runId: 'planner_timeout',
    promptScope: 'broad',
    timeoutMs: 20,
    fetchImpl: async (url, options = {}) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error(`aborted ${url}`), { name: 'AbortError' }));
      }, { once: true });
    }),
  });
  assert.equal(timeoutPlanner.ok, false);
  assert.equal(timeoutPlanner.outcome, 'degraded');
  assert.equal(timeoutPlanner.cognitionDiagnostics.used_live_call, true);
  assert.equal(timeoutPlanner.cognitionDiagnostics.used_fallback, true);
  assert.equal(['timeout', 'overscoped_context'].includes(timeoutPlanner.cognitionDiagnostics.failure_reason), true);
  assert.equal(timeoutPlanner.run.cognitionDiagnostics.timeout_ms, 20);
  assert.equal(Array.isArray(timeoutPlanner.run.llmTrace.steps), true);

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
  assert.ok(contextSuccess.report.intentContract);
  assert.ok(contextSuccess.report.canonicalIntent);
  assert.ok(contextSuccess.extractedIntent);
  assert.equal(contextSuccess.extractedIntent.provenance.usedFallback, false);
  assert.equal(contextSuccess.extractedIntent.status, 'live_valid');
  assert.ok(['medium', 'high'].includes(contextSuccess.extractedIntent.confidence));
  assert.ok(contextSuccess.report.extractedIntent);
  assert.ok(contextSuccess.report.extractedIntent.candidateNodes.length >= 3);
  assert.equal(contextSuccess.report.extractedIntent.inferredClaims.length, 1);
  assert.equal(contextSuccess.report.extractedIntent.candidateEdges.length, 1);
  assert.equal(contextSuccess.report.extractedIntent.audit.classification.role, contextSuccess.report.classification.role);
  assert.equal(contextSuccess.handoff.sourceAgentId, 'context-manager');
  assert.equal(contextSuccess.handoff.targetAgentId, 'planner');
  assert.ok(contextSuccess.handoff.intentContract);
  assert.equal(contextSuccess.handoff.intentContract.intentId, contextSuccess.report.intentContract.intentId);
  assert.deepEqual(contextSuccess.handoff.requestedOutcomes, ['Clarify planner acceptance criteria', 'Expose review state in Studio']);
  assert.ok(contextSuccess.handoff.constraints.includes('Keep planner proposal-only'));
  assert.ok(contextSuccess.handoff.problemStatement.includes('Still unclear: Need an explicit success signal'));
  assert.equal(contextSuccess.run.handoffId, contextSuccess.handoff.id);
  assert.equal(contextSuccess.run.intentId, contextSuccess.handoff.intentContract.intentId);
  assert.ok(contextSuccess.run.intentContract);
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
  assert.equal(contextFallback.extractedIntent.status, 'fallback_used');
  assert.equal(contextFallback.extractedIntent.confidence, 'failed');
  assert.equal(contextFallback.extractedIntent.inferredClaims.length, 0);
  assert.ok(contextFallback.extractedIntent.candidateNodes.every((node) => node.basis === 'explicit'));
  assert.match(contextFallback.run.reason || '', /Ollama unavailable/);

  const contextWeakLive = await runContextManagerWorker({
    rootPath,
    text: 'Maybe improve planner visibility somehow.',
    sourceNodeId: 'node_ctx_weak',
    source: 'context-intake',
    workspace,
    anchorBundle,
    dashboardState: {},
    runId: 'context_weak_live',
    generator: async () => ({
      packet: {
        summary: 'Planner visibility needs attention.',
        statement: 'Make planner visibility better.',
        goal: 'Make planner visibility better.',
        requestedOutcomes: ['Improve planner visibility'],
        targets: ['planner'],
        constraints: [],
        urgency: 'normal',
        requestType: 'planning_request',
        signals: { actionSignals: 1 },
        clarifications: ['Need a concrete representation target'],
        focusTerms: ['planner', 'visibility'],
        suggestedAnchorRefs: ['brain/emergence/plan.md'],
      },
      extractedIntent: {
        summary: 'Planner visibility may need a clearer representation.',
        explicitClaims: ['Planner visibility should improve'],
        inferredClaims: ['A clearer planner state surface may help'],
        candidateNodes: [],
        candidateEdges: [],
        gaps: ['No concrete node candidate was identified'],
      },
    }),
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(contextWeakLive.ok, true);
  assert.equal(contextWeakLive.outcome, 'completed');
  assert.equal(contextWeakLive.usedFallback, false);
  assert.ok(contextWeakLive.extractedIntent);
  assert.equal(contextWeakLive.extractedIntent.provenance.usedFallback, false);
  assert.equal(contextWeakLive.extractedIntent.provenance.liveResultPreserved, true);
  assert.equal(contextWeakLive.extractedIntent.status, 'live_valid_no_candidates');
  assert.equal(contextWeakLive.extractedIntent.confidence, 'low');
  assert.equal(contextWeakLive.extractedIntent.reason, 'no_candidates');
  assert.equal(contextWeakLive.extractedIntent.candidateNodes.length, 0);
  assert.equal(contextWeakLive.extractedIntent.audit.extractedIntentAssessment.actionability, 'none');
  assert.equal(contextWeakLive.report.extractedIntent.status, 'live_valid_no_candidates');
  assert.equal(contextWeakLive.report.extractedIntent.provenance.liveAssessmentReason, 'no_candidates');

  const contextMissingLive = await runContextManagerWorker({
    rootPath,
    text: 'Keep planner routing concise.',
    sourceNodeId: 'node_ctx_missing',
    source: 'context-intake',
    workspace,
    anchorBundle,
    dashboardState: {},
    runId: 'context_missing_live',
    generator: async () => ({
      packet: {
        summary: 'Keep planner routing concise.',
        statement: 'Keep planner routing concise.',
        goal: 'Keep planner routing concise.',
        requestedOutcomes: ['Keep planner routing concise'],
        targets: ['planner'],
        constraints: [],
        urgency: 'normal',
        requestType: 'planning_request',
        signals: {},
        clarifications: [],
        focusTerms: ['planner', 'routing'],
        suggestedAnchorRefs: ['brain/emergence/plan.md'],
      },
    }),
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(contextMissingLive.ok, false);
  assert.equal(contextMissingLive.outcome, 'degraded');
  assert.equal(contextMissingLive.usedFallback, true);
  assert.equal(contextMissingLive.reason, 'no_response');
  assert.equal(contextMissingLive.extractedIntent.provenance.usedFallback, true);
  assert.equal(contextMissingLive.extractedIntent.status, 'fallback_used');
  assert.equal(contextMissingLive.extractedIntent.confidence, 'failed');

  const contextInvalidLive = await runContextManagerWorker({
    rootPath,
    text: 'Route planner review details.',
    sourceNodeId: 'node_ctx_invalid',
    source: 'context-intake',
    workspace,
    anchorBundle,
    dashboardState: {},
    runId: 'context_invalid_live',
    generator: async () => ({
      packet: {
        summary: 'Route planner review details.',
        statement: 'Route planner review details.',
        goal: 'Route planner review details.',
        requestedOutcomes: ['Route planner review details'],
        targets: ['planner'],
        constraints: [],
        urgency: 'normal',
        requestType: 'planning_request',
        signals: {},
        clarifications: [],
        focusTerms: ['planner'],
        suggestedAnchorRefs: ['brain/emergence/plan.md'],
      },
      extractedIntent: 'not-json-object',
    }),
    fallbackAnalyze: (text, currentWorkspace) => analyzeSpatialIntent(text, buildIntentProjectContext({
      workspace: currentWorkspace,
      rootPath,
    })),
  });

  assert.equal(contextInvalidLive.ok, false);
  assert.equal(contextInvalidLive.outcome, 'degraded');
  assert.equal(contextInvalidLive.usedFallback, true);
  assert.equal(contextInvalidLive.extractedIntent.provenance.usedFallback, true);
  assert.equal(contextInvalidLive.extractedIntent.status, 'fallback_used');
  assert.equal(contextInvalidLive.extractedIntent.confidence, 'failed');

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
