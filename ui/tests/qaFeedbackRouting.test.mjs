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

function createLinkedCard(createTeamBoardCard, {
  id,
  title,
  intakeId,
  intentId,
  handoffId,
}) {
  return {
    ...createTeamBoardCard({
      cards: [],
      pageId: 'page_1',
      handoffId,
      sourceNodeId: `${id}-prompt`,
      sourceIntentId: intentId,
      sourceIntakeId: intakeId,
      sourceAnchorRefs: ['brain/emergence/tasks.md'],
      title,
      createdAt: '2026-04-06T15:00:00.000Z',
    }),
    id,
    desk: 'Executor',
    status: 'active',
    state: 'Awaiting QA',
    taskFlow: {
      phase: 'qa-review',
      assignmentState: 'assigned',
      ownerDeskId: 'executor',
      assigneeDeskId: 'executor',
      sourceIntentId: intentId,
      sourceHandoffId: handoffId,
      lastTransitionAt: '2026-04-06T15:05:00.000Z',
      lastTransitionLabel: 'Waiting for QA',
      history: [],
    },
    updatedAt: '2026-04-06T15:05:00.000Z',
  };
}

export default function runQaFeedbackRoutingTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-feedback-'));
  const {
    buildDeskPropertiesPayload,
    buildGovernedLoopContract,
    collectDeskTasks,
    createDefaultStudioLayoutSchema,
  } = require('../server.js');
  const {
    createTeamBoardCard,
  } = require('../orchestratorState.js');

  writeJson(rootPath, 'data/spatial/workspace.json', {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    pages: [{ id: 'page_1', title: 'QA routing page' }],
    activePageId: 'page_1',
    studio: {},
  });
  writeJson(rootPath, 'data/spatial/pages.json', {
    activePageId: 'page_1',
    pages: [{ id: 'page_1', title: 'QA routing page' }],
  });
  writeJson(rootPath, 'data/spatial/intent-state.json', {
    registry: { currentIntentId: 'intent_qa_1', latestIntentId: 'intent_qa_1', byId: {}, records: [] },
    currentIntentId: 'intent_qa_1',
    summary: 'Route QA follow-up canonically.',
    status: 'ready',
  });
  writeJson(rootPath, 'data/spatial/studio-state.json', {
    handoffs: { contextToPlanner: null, history: [] },
    teamBoard: { cards: [], selectedCardId: null },
  });

  const passCard = createLinkedCard(createTeamBoardCard, {
    id: 'card_pass',
    title: 'QA pass card',
    intakeId: 'intake_pass',
    intentId: 'intent_pass',
    handoffId: 'handoff_pass',
  });
  const failCard = createLinkedCard(createTeamBoardCard, {
    id: 'card_fail',
    title: 'QA fail card',
    intakeId: 'intake_fail',
    intentId: 'intent_fail',
    handoffId: 'handoff_fail',
  });
  const verifyCard = createLinkedCard(createTeamBoardCard, {
    id: 'card_verify',
    title: 'QA verification card',
    intakeId: 'intake_verify',
    intentId: 'intent_verify',
    handoffId: 'handoff_verify',
  });
  const approvalCard = createLinkedCard(createTeamBoardCard, {
    id: 'card_cto',
    title: 'QA CTO approval card',
    intakeId: 'intake_cto',
    intentId: 'intent_cto',
    handoffId: 'handoff_cto',
  });

  writeJson(rootPath, 'data/spatial/qa/structured/latest.json', {
    status: 'fail',
    summary: 'Governed QA follow-up decisions recorded.',
    desks: [{
      desk: 'qa-lead',
      status: 'fail',
      tests: [
        {
          name: 'pass_case',
          status: 'pass',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.pass_case',
            desk: 'qa-lead',
            testId: 'pass_case',
            testName: 'Pass case',
            status: 'pass',
            sourceCardId: 'card_pass',
            sourceIntentId: 'intent_pass',
            sourceHandoffId: 'handoff_pass',
            summary: 'QA passed without follow-up.',
          },
        },
        {
          name: 'fail_case',
          status: 'fail',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.fail_case',
            desk: 'qa-lead',
            testId: 'fail_case',
            testName: 'Fail case',
            status: 'fail',
            sourceCardId: 'card_fail',
            sourceIntentId: 'intent_fail',
            sourceHandoffId: 'handoff_fail',
            summary: 'Planner must revise the bounded slice.',
          },
        },
        {
          name: 'verify_case',
          status: 'needs_verification',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.verify_case',
            desk: 'qa-lead',
            testId: 'verify_case',
            testName: 'Verification case',
            status: 'needs_verification',
            sourceCardId: 'card_verify',
            sourceIntentId: 'intent_verify',
            sourceHandoffId: 'handoff_verify',
            summary: 'Planner must add verification coverage.',
          },
        },
        {
          name: 'cto_case',
          status: 'needs_cto_approval',
          qualityCard: {
            schema: 'qa.test-attribute-card.v1',
            id: 'qa.cto_case',
            desk: 'qa-lead',
            testId: 'cto_case',
            testName: 'CTO approval case',
            status: 'needs_cto_approval',
            sourceCardId: 'card_cto',
            sourceIntentId: 'intent_cto',
            sourceHandoffId: 'handoff_cto',
            summary: 'CTO approval is required before proceeding.',
          },
        },
      ],
    }],
  });
  writeJson(rootPath, 'data/spatial/qa/qa_run_fail_1.json', {
    id: 'qa_run_fail_1',
    scenario: 'throughput-visual-pass',
    mode: 'interactive',
    trigger: 'executor-verification',
    status: 'completed',
    verdict: 'failed',
    createdAt: '2026-04-06T15:10:00.000Z',
    finishedAt: '2026-04-06T15:12:00.000Z',
    findings: [{ severity: 'error', summary: 'Planner follow-up required.' }],
    linked: {
      cardId: 'card_fail',
      sourceIntentId: 'intent_fail',
      sourceHandoffId: 'handoff_fail',
      qaStatus: 'fail',
      summary: 'QA run confirmed the planner blocker.',
    },
    artifacts: { screenshots: [] },
    steps: [],
  });

  const workspace = {
    graph: { nodes: [], edges: [] },
    graphs: { system: { nodes: [], edges: [] }, world: { nodes: [], edges: [] } },
    pages: [{ id: 'page_1', title: 'QA routing page' }],
    activePageId: 'page_1',
    intentState: { currentIntentId: 'intent_qa_1', registry: { currentIntentId: 'intent_qa_1', latestIntentId: 'intent_qa_1', byId: {}, records: [] } },
    studio: {
      handoffs: {
        contextToPlanner: {
          id: 'handoff_fail',
          sourceIntentId: 'intent_fail',
          sourceIntakeId: 'intake_fail',
          intentId: 'intent_fail',
          summary: 'QA routed follow-up back into planner.',
          status: 'ready',
        },
      },
      teamBoard: {
        cards: [passCard, failCard, verifyCard, approvalCard],
        selectedCardId: 'card_fail',
      },
      orchestrator: { desks: {}, activeDeskIds: [], conflicts: [] },
      layout: createDefaultStudioLayoutSchema(),
      deskProperties: {},
      agentWorkers: {},
      ctoPipeline: {
        id: 'cto_pipeline_feedback_1',
        roleIndex: 2,
        step: 'request-qa',
        qaRunId: 'qa_run_fail_1',
        updatedAt: '2026-04-06T15:12:00.000Z',
      },
    },
  };

  const plannerTasks = collectDeskTasks(workspace, 'planner', { rootPath });
  const ctoTasks = collectDeskTasks(workspace, 'cto-architect', { rootPath });
  const passTask = plannerTasks.find((task) => task.id === 'card_pass');
  const failTask = plannerTasks.find((task) => task.id === 'card_fail');
  const verifyTask = plannerTasks.find((task) => task.id === 'card_verify');
  const approvalTask = ctoTasks.find((task) => task.id === 'card_cto');

  assert.equal(passTask.qaState.status, 'pass');
  assert.equal(passTask.qaState.followup, null);

  assert.equal(failTask.qaState.status, 'fail');
  assert.equal(failTask.qaState.scorecardId, 'qa.fail_case');
  assert.equal(failTask.qaState.qaRunId, 'qa_run_fail_1');
  assert.equal(failTask.qaState.followup.deskId, 'planner');
  assert.equal(failTask.nextOwnerDeskId, 'planner');

  assert.equal(verifyTask.qaState.status, 'needs_verification');
  assert.equal(verifyTask.qaState.followup.deskId, 'planner');
  assert.equal(verifyTask.ownerDeskId, 'planner');

  assert.equal(ctoTasks.length, 1);
  assert.equal(approvalTask.qaState.status, 'needs_cto_approval');
  assert.equal(approvalTask.qaState.followup.deskId, 'cto-architect');
  assert.equal(approvalTask.nextOwnerDeskId, 'cto-architect');

  const plannerPayload = buildDeskPropertiesPayload(workspace, 'planner', null, { rootPath });
  const ctoPayload = buildDeskPropertiesPayload(workspace, 'cto-architect', null, { rootPath });
  assert.equal(plannerPayload.tasks.find((task) => task.id === 'card_fail').qaState.status, 'fail');
  assert.equal(plannerPayload.tasks.find((task) => task.id === 'card_verify').qaState.followup.deskId, 'planner');
  assert.equal(ctoPayload.tasks.find((task) => task.id === 'card_cto').qaState.followup.deskId, 'cto-architect');

  const contract = buildGovernedLoopContract(workspace, { rootPath });
  const contractPlannerFail = contract.domains.planner.visibleWork.find((task) => task.id === 'card_fail');
  const contractCtoApproval = contract.domains.cto.pendingApprovals.find((task) => task.id === 'card_cto');
  assert.equal(contractPlannerFail.qaState.status, 'fail');
  assert.equal(contractPlannerFail.qaState.followup.deskId, 'planner');
  assert.equal(contractCtoApproval.qaState.status, 'needs_cto_approval');
  assert.equal(contractCtoApproval.qaState.followup.deskId, 'cto-architect');
  assert.ok(contract.domains.cto.sources.some((source) => source.route === '/api/spatial/desks/cto-architect/properties'));
}
