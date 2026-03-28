import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const actionRequestParserPath = path.resolve(process.cwd(), 'public', 'spatial', 'actionRequestParser.js');

export default async function runActionRequestParserTests() {
  const {
    ACTION_REQUEST_HELPERS,
    ACTION_REQUEST_TYPES,
    buildActionRequestSkeleton,
    parseActionRequest,
  } = await loadModuleCopy(actionRequestParserPath, { label: 'actionRequestParser' });

  assert.deepEqual(ACTION_REQUEST_TYPES, [
    'propose_add_department',
    'propose_add_desk',
    'propose_move_desk_to_department',
  ]);
  assert.equal(ACTION_REQUEST_HELPERS.propose_add_department, 'addDepartmentFromTemplate');
  assert.equal(ACTION_REQUEST_HELPERS.propose_add_desk, 'addDeskToDepartment');
  assert.equal(ACTION_REQUEST_HELPERS.propose_move_desk_to_department, 'moveDeskToDepartment');

  const departmentActions = parseActionRequest('propose add department for qa and governance');
  assert.equal(departmentActions.length, 1);
  assert.equal(departmentActions[0].type, 'propose_add_department');
  assert.equal(departmentActions[0].mutationHelper, 'addDepartmentFromTemplate');
  assert.equal(departmentActions[0].target.kind, 'department');
  assert.equal(departmentActions[0].target.templateId, 'governance');
  assert.equal(departmentActions[0].status, 'proposed');
  assert.equal(departmentActions[0].execution, 'blocked');
  assert.equal(departmentActions[0].routedTo, 'mutation-helper');

  const deskActions = parseActionRequest('propose add desk for the QA lane');
  assert.equal(deskActions.length, 1);
  assert.equal(deskActions[0].type, 'propose_add_desk');
  assert.equal(deskActions[0].mutationHelper, 'addDeskToDepartment');
  assert.equal(deskActions[0].target.kind, 'desk');
  assert.equal(deskActions[0].target.templateId, 'qa-lead');
  assert.equal(deskActions[0].parameters.departmentTemplateId, 'governance');

  const moveActions = parseActionRequest('propose move desk to department for the planner desk');
  assert.equal(moveActions.length, 1);
  assert.equal(moveActions[0].type, 'propose_move_desk_to_department');
  assert.equal(moveActions[0].mutationHelper, 'moveDeskToDepartment');
  assert.equal(moveActions[0].target.kind, 'desk');
  assert.equal(moveActions[0].parameters.departmentTemplateId, 'context-intake');

  const demoActions = parseActionRequest('', { mode: 'demo' });
  assert.equal(demoActions.length, 3);
  assert.deepEqual(demoActions.map((action) => action.type), [
    'propose_add_department',
    'propose_add_desk',
    'propose_move_desk_to_department',
  ]);
  assert.ok(demoActions.every((action) => action.mode === 'demo'));
  assert.ok(demoActions.every((action) => action.execution === 'blocked'));

  const skeleton = buildActionRequestSkeleton('propose_add_department', {
    sourceText: 'add department',
    departmentTemplateId: 'delivery',
    id: 'delivery-department',
  });
  assert.equal(skeleton.type, 'propose_add_department');
  assert.equal(skeleton.target.templateId, 'delivery');
  assert.equal(skeleton.target.departmentId, 'delivery-department');
  assert.equal(buildActionRequestSkeleton('unknown_type'), null);
}
