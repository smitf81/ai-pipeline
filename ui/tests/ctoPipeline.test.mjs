import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildCtoAvailableActions,
  executeCtoConfirmedAction,
  normalizeCtoPipelineState,
  summarizeCtoPipelineState,
  getCtoRoleLabel,
  createDefaultStudioLayoutSchema,
} = require('../server.js');
const { createDefaultTeamBoard } = require('../orchestratorState.js');

function createTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-cto-pipeline-'));
}

function createWorkspace(text = 'We need planner coverage.') {
  return {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] } },
    notebook: { activePageId: 'page-1' },
    pages: [{ id: 'page-1', title: 'Studio Page' }],
    activePageId: 'page-1',
    studio: {
      layout: createDefaultStudioLayoutSchema(),
      teamBoard: createDefaultTeamBoard(),
      deskProperties: {},
      agentWorkers: {},
      handoffs: {},
      ctoPipeline: normalizeCtoPipelineState(null, { text }),
    },
  };
}

function buildDeskContext(roleId, hiredCandidates = []) {
  return {
    workspace: {
      orchestratorStatus: 'idle',
      activeDeskIds: [],
      teamBoardCardCount: 0,
      pageTitle: 'Studio Page',
    },
    pipeline: null,
    desks: ['planner', 'executor', 'qa-lead'].map((deskId) => ({
      deskId,
      label: getCtoRoleLabel(deskId),
      taCoverage: {
        openRoles: deskId === roleId
          ? [{ roleId: deskId, roleLabel: getCtoRoleLabel(deskId), kind: 'understaffed', urgency: 'high', blocker: true }]
          : [],
        blockers: [],
      },
    })),
    ta: {
      hiredCandidates,
      openRoles: [],
      roster: hiredCandidates,
    },
  };
}

function makeCandidate(roleId) {
  const roleLabel = getCtoRoleLabel(roleId);
  const department = roleId === 'qa-lead' ? 'Quality' : 'Delivery';
  return {
    ok: true,
    candidate: {
      id: `${roleId}-candidate`,
      name: `${roleLabel} Candidate`,
      roleId,
      role: roleLabel,
      department,
      departmentId: roleId === 'qa-lead' ? 'dept-quality' : 'dept-delivery',
      deskTargets: [roleId],
      primaryDeskTarget: roleId,
      assignedModel: 'mistral:latest',
      model_locked: true,
      modelLocked: true,
      summary: `${roleLabel} coverage candidate.`,
      strengths: ['coverage'],
      weaknesses: [],
      recommendedTools: [],
      recommendedSkills: [],
      whyThisRole: `${roleLabel} coverage is required for the CTO pipeline.`,
      riskNotes: [],
      confidence: 0.9,
      allowedDepartmentIds: [],
      allowedDeskIds: [roleId],
      leadRoleIds: [],
      capabilities: [roleId],
      cvCard: {
        title: `${roleLabel} candidate`,
        headline: `${roleLabel} coverage`,
        summary: `${roleLabel} coverage candidate.`,
        evidence: [],
        controls: [],
        contract: {
          input: ['one role at a time'],
          output: ['single confirmation-gated action'],
        },
      },
      contract: {
        input: ['one role at a time'],
        output: ['single confirmation-gated action'],
      },
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export default async function runCtoPipelineTests() {
  const tempRoot = createTempRoot();
  const taDepartmentFile = path.join(tempRoot, 'ta-department.json');
  fs.writeFileSync(taDepartmentFile, JSON.stringify({
    hiredCandidates: [],
    updatedAt: null,
    lastGeneratedGap: null,
  }, null, 2));

  let latestWorkspace = createWorkspace();
  const persistWorkspace = (mutator) => {
    const nextWorkspace = typeof mutator === 'function' ? mutator(latestWorkspace) : mutator;
    latestWorkspace = nextWorkspace;
    return nextWorkspace;
  };
  const persistBoardWorkspace = (nextWorkspace) => {
    latestWorkspace = nextWorkspace;
    return nextWorkspace;
  };
  const createTaskFolder = ({ title }) => {
    const taskId = '0001';
    const folderName = `${taskId}-${String(title || 'cto-task').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const taskDir = path.join(tempRoot, 'tasks', folderName);
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'idea.txt'), `${title || 'CTO task'}\n`, 'utf8');
    return { taskId, taskDir };
  };
  const applyWrites = [];
  const runQaCalls = [];
  const runQa = async (payload) => {
    runQaCalls.push(payload);
    return {
      id: 'qa-run-0001',
      verdict: 'pass',
      summary: 'QA smoke check passed.',
      scenario: payload.scenario,
      linked: payload.linked,
      artifacts: { screenshots: [] },
    };
  };
  const selectTaCandidateForDesk = (candidateAction) => makeCandidate(candidateAction.targetDeskId || candidateAction.params?.roleId || 'planner');
  const writeApplyResult = (taskDir, payload) => {
    applyWrites.push({ taskDir, payload });
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(path.join(taskDir, 'apply_result.json'), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  };
  const executionOptions = {
    baseUrl: 'http://127.0.0.1:3000',
    taDepartmentFile,
    persistWorkspace,
    persistBoardWorkspace,
    createTaskFolder,
    runQa,
    writeApplyResult,
    selectTaCandidateForDesk,
  };
  const runExecute = (action) => executeCtoConfirmedAction(action, {
    ...executionOptions,
    workspace: latestWorkspace,
  });

  let context = buildDeskContext('planner');
  let actions = buildCtoAvailableActions({
    text: 'We need planner coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'hire-role');
  assert.equal(actions[0].params.roleId, 'planner');

  let result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'executed');
  assert.equal(result.pipeline.step, 'assign-agent-to-desk');
  assert.equal(readJson(taDepartmentFile).hiredCandidates.length, 1);

  context = buildDeskContext('planner', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need planner coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'assign-agent-to-desk');
  assert.equal(actions[0].params.roleId, 'planner');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'request-plan');
  assert.ok(latestWorkspace.studio.layout.desks.planner.assignedAgentIds.length >= 1);
  assert.ok((latestWorkspace.studio.deskProperties.planner.managedAgents || []).length >= 1);

  context = buildDeskContext('planner', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need planner coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'request-plan');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.planTaskId, '0001');
  assert.equal(result.planCardId, latestWorkspace.studio.teamBoard.selectedCardId);
  assert.equal(latestWorkspace.studio.teamBoard.cards.length, 1);
  assert.equal(result.pipeline.roleId, 'executor');
  assert.equal(result.pipeline.step, 'hire-role');

  context = buildDeskContext('executor', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need executor coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'hire-role');
  assert.equal(actions[0].params.roleId, 'executor');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'assign-agent-to-desk');

  context = buildDeskContext('executor', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need executor coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'assign-agent-to-desk');
  assert.equal(actions[0].params.roleId, 'executor');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'request-execution');

  context = buildDeskContext('executor', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need executor coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'request-execution');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.roleId, 'qa-lead');
  assert.equal(result.pipeline.step, 'hire-role');
  assert.equal(applyWrites.length, 1);
  assert.equal(applyWrites[0].payload.status, 'passed');
  assert.equal(latestWorkspace.studio.teamBoard.cards[0].applyStatus, 'applied');

  context = buildDeskContext('qa-lead', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need QA coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'hire-role');
  assert.equal(actions[0].params.roleId, 'qa-lead');

  result = await runExecute(actions[0]);
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'assign-agent-to-desk');

  context = buildDeskContext('qa-lead', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need QA coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'assign-agent-to-desk');

  result = await executeCtoConfirmedAction(actions[0], {
    ...executionOptions,
  });
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'request-qa');

  context = buildDeskContext('qa-lead', readJson(taDepartmentFile).hiredCandidates.map((entry) => ({
    id: entry.id,
    name: entry.name,
    roleId: entry.roleId,
    hiredDeskId: entry.hiredDeskId,
    primaryDeskTarget: entry.primaryDeskTarget,
    assignedModel: entry.assignedModel,
  })));
  actions = buildCtoAvailableActions({
    text: 'We need QA coverage.',
    context,
    workspace: latestWorkspace,
  });
  assert.equal(actions[0].id, 'request-qa');

  result = await executeCtoConfirmedAction(actions[0], {
    workspace: latestWorkspace,
    baseUrl: 'http://127.0.0.1:3000',
    taDepartmentFile,
    persistWorkspace,
    persistBoardWorkspace,
    createTaskFolder,
    runQa,
    writeApplyResult,
  });
  assert.equal(result.ok, true);
  assert.equal(result.pipeline.step, 'complete');
  assert.equal(runQaCalls.length, 1);
  assert.equal(runQaCalls[0].linked.cardId, latestWorkspace.studio.teamBoard.cards[0].id);
  assert.equal(latestWorkspace.studio.teamBoard.cards[0].verifyStatus, 'passed');
  assert.equal(buildCtoAvailableActions({
    text: 'We need QA coverage.',
    context,
    workspace: latestWorkspace,
  }).length, 0);

  const invalid = await executeCtoConfirmedAction({
    id: 'hire-planner',
    kind: 'hire-planner',
    label: 'Fake action',
  }, {
    ...executionOptions,
    workspace: latestWorkspace,
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, 'blocked');
  assert.match(invalid.reason, /Unsupported CTO action id/);

  assert.equal(summarizeCtoPipelineState(latestWorkspace.studio.ctoPipeline).step, 'complete');
}
