import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const require = createRequire(import.meta.url);
const aceConnectorPath = path.resolve(process.cwd(), 'public', 'spatial', 'aceConnector.js');
const studioLayoutSchemaPath = path.resolve(process.cwd(), 'studioLayoutSchema.js');
const {
  addDepartmentToLayout,
  addDeskToLayout,
  createDefaultStudioLayoutSchema,
  listStudioDeskIds,
} = require(studioLayoutSchemaPath);

export default async function runAceConnectorTests() {
  const { AceConnector } = await loadModuleCopy(aceConnectorPath, { label: 'aceConnector' });
  const connector = new AceConnector();
  const actionRequests = await connector.parseActionRequest('propose add desk for the QA lane');
  assert.equal(actionRequests.length, 1);
  assert.equal(actionRequests[0].type, 'propose_add_desk');
  assert.equal(actionRequests[0].mutationHelper, 'addDeskToDepartment');
  assert.equal(actionRequests[0].execution, 'blocked');
  const requests = [];
  const originalFetch = globalThis.fetch;
  const canonicalLayout = createDefaultStudioLayoutSchema();
  const seededDepartmentLayout = addDepartmentToLayout(canonicalLayout, { templateId: 'research' });
  const seededDepartmentId = seededDepartmentLayout.departments.find((entry) => entry.id.startsWith('dept-research-'))?.id || null;
  const seededDeskLayout = addDeskToLayout(seededDepartmentLayout, {
    departmentId: seededDepartmentId,
    templateId: 'analysis-node',
  });
  assert.equal(new Set(seededDeskLayout.departments.map((entry) => entry.id)).size, seededDeskLayout.departments.length);
  assert.equal(new Set(listStudioDeskIds(seededDeskLayout)).size, listStudioDeskIds(seededDeskLayout).length);
  let layoutState = canonicalLayout;
  globalThis.fetch = async (url, options = {}) => {
    requests.push({
      url,
      options,
    });
    if (url === '/api/projects') {
      return {
        ok: true,
        json: async () => ({
          projects: [{
            key: 'topdown-slice',
            projectType: 'static-web',
            launchable: true,
            supportedOrigin: 'http://127.0.0.1:4173/',
          }],
        }),
      };
    }
    if (url === '/api/projects/run') {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          projectType: 'static-web',
          url: 'http://127.0.0.1:4173/',
          supportedOrigin: 'http://127.0.0.1:4173/',
          reused: false,
        }),
      };
    }
    if (url === '/api/qa/run') {
      return {
        ok: true,
        json: async () => ({
          status: 'pass',
          summary: 'all desks passed',
          desks: [],
          metricDefinitions: {
            schema: 'qa.test-metric-definitions.v1',
            version: 1,
            metrics: {},
          },
        }),
      };
    }
    if (url === '/api/ta/department') {
      return {
        ok: true,
        json: async () => ({
          department: {
            name: 'Talent Acquisition',
            summary: '2 open roles across 9 staffing rules.',
            urgency: 'high',
          },
          coverage: [],
          gapModel: {
            openRoles: [],
            blockers: [],
            summary: {
              openRoleCount: 0,
              blockerCount: 0,
              missingLeadCount: 0,
              understaffedCount: 0,
              optionalHireCount: 0,
              urgency: 'low',
            },
          },
          hiredCandidates: [],
          roster: [],
          coverageSummary: {
            healthyCount: 0,
            openEntityCount: 0,
            total: 0,
            openRoleCount: 0,
            blockerCount: 0,
            missingLeadCount: 0,
            understaffedCount: 0,
            optionalHireCount: 0,
            urgency: 'low',
          },
        }),
      };
    }
    if (url === '/api/spatial/layout/actions') {
      const body = JSON.parse(options.body || '{}');
      if (body.action === 'add_department') {
        layoutState = addDepartmentToLayout(layoutState, { templateId: body.templateId });
        const createdDepartmentId = layoutState.departments.find((entry) => !canonicalLayout.departments.some((previous) => previous.id === entry.id))?.id || null;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: body.action,
            layout: layoutState,
            createdDepartmentId,
            createdDeskId: null,
            focusDeskId: null,
            catalog: { departmentTemplates: [], deskTemplates: [] },
          }),
        };
      }
      if (body.action === 'add_desk') {
        const priorDeskIds = new Set(listStudioDeskIds(layoutState));
        layoutState = addDeskToLayout(layoutState, { departmentId: body.departmentId, templateId: body.templateId });
        const createdDeskId = listStudioDeskIds(layoutState).find((deskId) => !priorDeskIds.has(deskId)) || null;
        return {
          ok: true,
          json: async () => ({
            ok: true,
            action: body.action,
            layout: layoutState,
            createdDepartmentId: null,
            createdDeskId,
            focusDeskId: createdDeskId,
            catalog: { departmentTemplates: [], deskTemplates: [] },
          }),
        };
      }
      throw new Error(`unexpected layout action: ${body.action}`);
    }
    if (url === '/api/spatial/executive/route') {
      const body = JSON.parse(options.body || '{}');
      const prompt = body.envelope?.entries?.[0]?.content || '';
      if (String(prompt).toLowerCase().includes('200x200 grass grid')) {
        return {
          ok: false,
          status: 422,
          json: async () => ({
            ok: false,
            route: 'world-scaffold',
            error: 'Grid dimensions must be 100x100 or smaller.',
            intent: {
              type: 'world_scaffold',
              shape: 'grid',
              summary: '200x200 grass grid',
              rawInput: "let's start with a 200x200 grass grid",
              width: 200,
              height: 200,
              material: 'grass',
              position: { x: 0, y: 0, z: 0 },
              tileType: 'grass',
              surface: 'ground',
              confidence: { label: 'low', score: 0.32 },
              validation: {
                ok: false,
                reason: 'Grid dimensions must be 100x100 or smaller.',
              },
            },
            validation: {
              ok: false,
              reason: 'Grid dimensions must be 100x100 or smaller.',
            },
            evaluation: {
              originalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '200x200 grass grid',
                rawInput: "let's start with a 200x200 grass grid",
                requestText: "let's start with a 200x200 grass grid",
                width: 200,
                height: 200,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              correctedCandidate: null,
              finalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '200x200 grass grid',
                rawInput: "let's start with a 200x200 grass grid",
                requestText: "let's start with a 200x200 grass grid",
                width: 200,
                height: 200,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              cues: [],
              accepted: false,
              reason: 'Grid dimensions must be 100x100 or smaller.',
              scorecard: {
                validity: 'fail',
                suitability: 'fail',
                sizeAdequacy: 'fail',
                materialSupport: 'pass',
                shapeSupport: 'pass',
                positionSanity: 'pass',
                correctionApplied: false,
                correctionReason: '',
                interpretationSource: 'deterministic',
                acceptedForMutationGeneration: false,
              },
            },
            mutationGeneration: {
              ok: false,
              mutationCount: 0,
              mode: 'none',
              reason: 'Grid dimensions must be 100x100 or smaller.',
            },
            interpretation: {
              source: 'deterministic',
              label: 'no accepted interpretation',
              attempted: false,
              accepted: false,
              fallbackUsed: false,
              status: 'rejected_validation',
              reason: 'Grid dimensions must be 100x100 or smaller.',
            },
          }),
        };
      }
      if (String(prompt).toLowerCase().includes('20x20 grass grid')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            route: 'world-scaffold',
            intent: {
              type: 'world_scaffold',
              shape: 'grid',
              summary: '20x20 grass grid',
              rawInput: "let's start with a 20x20 grass grid",
              width: 20,
              height: 20,
              material: 'grass',
              position: { x: 0, y: 0, z: 0 },
              tileType: 'grass',
              surface: 'ground',
              confidence: { label: 'high', score: 0.96 },
              validation: {
                ok: true,
                reason: '',
              },
            },
            validation: {
              ok: true,
              reason: '',
            },
            evaluation: {
              originalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '20x20 grass grid',
                rawInput: "let's start with a 20x20 grass grid",
                requestText: "let's start with a 20x20 grass grid",
                width: 20,
                height: 20,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              correctedCandidate: null,
              finalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '20x20 grass grid',
                rawInput: "let's start with a 20x20 grass grid",
                requestText: "let's start with a 20x20 grass grid",
                width: 20,
                height: 20,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              cues: [],
              accepted: true,
              reason: '',
              scorecard: {
                validity: 'pass',
                suitability: 'pass',
                sizeAdequacy: 'pass',
                materialSupport: 'pass',
                shapeSupport: 'pass',
                positionSanity: 'pass',
                correctionApplied: false,
                correctionReason: '',
                interpretationSource: 'deterministic',
                acceptedForMutationGeneration: true,
              },
            },
            mutationGeneration: {
              ok: true,
              mutationCount: 1,
              mode: 'create_node',
              reason: '',
            },
            interpretation: {
              source: 'deterministic',
              label: 'deterministic',
              attempted: false,
              accepted: true,
              fallbackUsed: false,
              status: 'accepted',
            },
            mutations: [{
              type: 'create_node',
              layer: 'world',
              node: { id: 'world_scaffold_ground_grid' },
            }],
          }),
        };
      }
      if (String(prompt).toLowerCase().includes('make a small stone platform to build on')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            route: 'world-scaffold',
            intent: {
              type: 'world_scaffold',
              shape: 'grid',
              summary: '12x8 stone grid',
              rawInput: 'make a small stone platform to build on',
              width: 12,
              height: 8,
              material: 'stone',
              position: { x: 0, y: 0, z: 0 },
              tileType: 'stone',
              surface: 'ground',
              confidence: null,
              validation: {
                ok: true,
                reason: '',
              },
            },
            validation: {
              ok: true,
              reason: '',
            },
            evaluation: {
              originalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '12x8 stone grid',
                rawInput: 'make a small stone platform to build on',
                requestText: 'make a small stone platform to build on',
                width: 12,
                height: 8,
                material: 'stone',
                position: { x: 0, y: 0, z: 0 },
              },
              correctedCandidate: null,
              finalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '12x8 stone grid',
                rawInput: 'make a small stone platform to build on',
                requestText: 'make a small stone platform to build on',
                width: 12,
                height: 8,
                material: 'stone',
                position: { x: 0, y: 0, z: 0 },
              },
              cues: ['build on'],
              accepted: true,
              reason: '',
              scorecard: {
                validity: 'pass',
                suitability: 'pass',
                sizeAdequacy: 'pass',
                materialSupport: 'pass',
                shapeSupport: 'pass',
                positionSanity: 'pass',
                correctionApplied: false,
                correctionReason: '',
                interpretationSource: 'model-assisted',
                acceptedForMutationGeneration: true,
              },
            },
            mutationGeneration: {
              ok: true,
              mutationCount: 1,
              mode: 'create_node',
              reason: '',
            },
            interpretation: {
              source: 'model-assisted',
              label: 'model-assisted',
              attempted: true,
              accepted: true,
              fallbackUsed: false,
              status: 'accepted',
              backend: 'ollama',
              model: 'mistral:latest',
            },
            mutations: [{
              type: 'create_node',
              layer: 'world',
              node: { id: 'world_scaffold_ground_grid' },
            }],
          }),
        };
      }
      if (String(prompt).toLowerCase().includes('set up a basic ground grid for a first village')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            route: 'world-scaffold',
            intent: {
              type: 'world_scaffold',
              shape: 'grid',
              summary: '8x8 grass grid',
              rawInput: 'set up a basic ground grid for a first village',
              requestText: 'set up a basic ground grid for a first village',
              width: 8,
              height: 8,
              material: 'grass',
              position: { x: 0, y: 0, z: 0 },
              tileType: 'grass',
              surface: 'ground',
              confidence: null,
              validation: {
                ok: true,
                reason: '',
              },
            },
            validation: {
              ok: true,
              reason: '',
            },
            evaluation: {
              originalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '5x5 grass grid',
                rawInput: 'set up a basic ground grid for a first village',
                requestText: 'set up a basic ground grid for a first village',
                width: 5,
                height: 5,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              correctedCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '8x8 grass grid',
                rawInput: 'set up a basic ground grid for a first village',
                requestText: 'set up a basic ground grid for a first village',
                width: 8,
                height: 8,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              finalCandidate: {
                type: 'world_scaffold',
                shape: 'grid',
                summary: '8x8 grass grid',
                rawInput: 'set up a basic ground grid for a first village',
                requestText: 'set up a basic ground grid for a first village',
                width: 8,
                height: 8,
                material: 'grass',
                position: { x: 0, y: 0, z: 0 },
              },
              cues: ['basic ground grid', 'first village'],
              accepted: true,
              reason: '',
              scorecard: {
                validity: 'pass',
                suitability: 'warn',
                sizeAdequacy: 'warn',
                materialSupport: 'pass',
                shapeSupport: 'pass',
                positionSanity: 'pass',
                correctionApplied: true,
                correctionReason: 'Raised undersized scaffold to the minimum starter grid size of 8x8.',
                interpretationSource: 'model-assisted',
                acceptedForMutationGeneration: true,
              },
            },
            mutationGeneration: {
              ok: true,
              mutationCount: 1,
              mode: 'create_node',
              reason: '',
            },
            interpretation: {
              source: 'model-assisted',
              label: 'model-assisted',
              attempted: true,
              accepted: true,
              fallbackUsed: false,
              status: 'accepted',
              backend: 'ollama',
              model: 'mistral:latest',
            },
            mutations: [{
              type: 'create_node',
              layer: 'world',
              node: { id: 'world_scaffold_ground_grid' },
            }],
          }),
        };
      }
      if (String(prompt).toLowerCase().includes('give me a decent grassy starter area')) {
        return {
          ok: false,
          status: 503,
          json: async () => ({
            ok: false,
            route: 'world-scaffold',
            error: 'No fetch implementation is available for callOllamaGenerate.',
            intent: null,
            validation: null,
            evaluation: {
              originalCandidate: null,
              correctedCandidate: null,
              finalCandidate: null,
              cues: ['starter area'],
              accepted: false,
              reason: 'No scaffold candidate to evaluate.',
              scorecard: {
                validity: 'fail',
                suitability: 'fail',
                sizeAdequacy: 'fail',
                materialSupport: 'fail',
                shapeSupport: 'fail',
                positionSanity: 'fail',
                correctionApplied: false,
                correctionReason: '',
                interpretationSource: 'model-assisted',
                acceptedForMutationGeneration: false,
              },
            },
            mutationGeneration: {
              ok: false,
              mutationCount: 0,
              mode: 'none',
              reason: 'World scaffold intent is missing.',
            },
            interpretation: {
              source: 'model-assisted',
              label: 'model-assisted rejected',
              attempted: true,
              accepted: false,
              fallbackUsed: false,
              status: 'model_unavailable',
              reason: 'No fetch implementation is available for callOllamaGenerate.',
              backend: 'ollama',
              model: 'mistral:latest',
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          route: 'module',
          preview: {
            artifact_type: 'material',
            confidence: 0.82,
          },
        }),
      };
    }
    if (url === '/api/spatial/mutations/apply') {
      const body = JSON.parse(options.body || '{}');
      const firstMutation = body.mutations?.[0] || {};
      if (firstMutation.type === 'create_node' && firstMutation.node?.id === 'world_scaffold_ground_grid') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: 'applied',
            confirmed: true,
            mutationResult: {
              status: 'applied',
              confirmed: true,
              requested: 1,
              applied: 1,
              queued: 0,
              blocked: 0,
              changedLayers: ['world'],
              reason: '',
            },
            recentWorldChange: {
              id: 'world_change_1',
              summary: 'World scaffold created | 20x20 grass grid | 400 cells added',
              scope: 'session-local',
              counts: {
                addedNodes: 1,
                modifiedNodes: 0,
                addedEdges: 0,
                addedCells: 400,
                modifiedCells: 0,
              },
              items: [{
                kind: 'scaffold',
                nodeId: 'world_scaffold_ground_grid',
                changeType: 'added',
                label: 'World scaffold created',
                detail: '20x20 grass grid | 400 cells added',
                counts: {
                  addedCells: 400,
                  modifiedCells: 0,
                },
                addedCells: [{ x: 0, y: 0, z: 0 }],
                modifiedCells: [],
              }],
            },
            runtime: {
              graphs: {
                system: {
                  nodes: [],
                  edges: [],
                },
                world: {
                  nodes: [{ id: 'world_scaffold_ground_grid' }],
                  edges: [],
                },
              },
            },
          }),
        };
      }
      if (firstMutation.type === 'modify_node' && firstMutation.id === 'protected-node') {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            status: 'queued',
            confirmed: false,
            mutationResult: {
              status: 'queued',
              confirmed: false,
              requested: 1,
              applied: 0,
              queued: 1,
              blocked: 0,
              changedLayers: [],
              reason: 'Target node is protected and requires approval before modification.',
              approvalQueueSize: 1,
            },
            runtime: {
              graphs: {
                system: {
                  nodes: [{ id: 'protected-node' }],
                  edges: [],
                },
                world: {
                  nodes: [],
                  edges: [],
                },
              },
              mutationGate: {
                activity: [{ id: 'mutation_activity_1', status: 'queued', summary: 'Modify node protected-node' }],
                approvalQueue: [{ id: 'mutation_queue_1', classification: 'needs_approval', summary: 'Modify node protected-node' }],
              },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          ok: true,
          status: 'applied',
          confirmed: true,
          mutationResult: {
            status: 'applied',
            confirmed: true,
            requested: 1,
            applied: 1,
            queued: 0,
            blocked: 0,
            changedLayers: ['system'],
            reason: '',
          },
          runtime: {
            graphs: {
              system: {
                nodes: [{ id: 'node_1' }],
                edges: [],
              },
              world: {
                nodes: [],
                edges: [],
              },
            },
          },
        }),
      };
    }
    if (url === '/api/spatial/mutations/apply/fail-fixture') {
      return {
        ok: false,
        json: async () => ({
          ok: false,
          error: 'Cannot modify missing node "ghost".',
          mutationResult: {
            status: 'failed',
            confirmed: false,
            requested: 1,
            applied: 0,
            changedLayers: [],
            reason: 'Cannot modify missing node "ghost".',
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        report: {
          summary: 'Executor assessment complete.',
          decision: 'ready-apply',
        },
      }),
    };
  };

  try {
    const ace = new AceConnector();
    const payload = await ace.runAgentWorker('executor', {
      cardId: '0007',
      mode: 'manual',
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.report.decision, 'ready-apply');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/api/spatial/agents/executor/run');
    assert.equal(requests[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      cardId: '0007',
      mode: 'manual',
    });

    const executivePayload = await ace.runExecutiveRoute({
      envelope: {
        entries: [
          { type: 'prompt', content: 'Generate a wet stone material' },
        ],
      },
    });
    assert.equal(executivePayload.ok, true);
    assert.equal(executivePayload.route, 'module');
    assert.equal(requests[1].url, '/api/spatial/executive/route');
    assert.equal(requests[1].options.method, 'POST');

    const scaffoldRoutePayload = await ace.runExecutiveRoute({
      envelope: {
        entries: [
          { type: 'prompt', content: "let's start with a 20x20 grass grid" },
        ],
      },
    });
    assert.equal(scaffoldRoutePayload.route, 'world-scaffold');
    assert.equal(scaffoldRoutePayload.intent.type, 'world_scaffold');
    assert.equal(scaffoldRoutePayload.intent.width, 20);
    assert.equal(scaffoldRoutePayload.intent.material, 'grass');
    assert.equal(scaffoldRoutePayload.validation.ok, true);
    assert.equal(scaffoldRoutePayload.interpretation.source, 'deterministic');
    assert.equal(scaffoldRoutePayload.interpretation.attempted, false);
    assert.equal(scaffoldRoutePayload.evaluation.scorecard.correctionApplied, false);
    assert.equal(scaffoldRoutePayload.evaluation.scorecard.acceptedForMutationGeneration, true);
    assert.equal(scaffoldRoutePayload.mutationGeneration.mode, 'create_node');
    assert.equal(scaffoldRoutePayload.mutations[0].type, 'create_node');

    const fuzzyScaffoldPayload = await ace.runExecutiveRoute({
      envelope: {
        entries: [
          { type: 'prompt', content: 'make a small stone platform to build on' },
        ],
      },
    });
    assert.equal(fuzzyScaffoldPayload.route, 'world-scaffold');
    assert.equal(fuzzyScaffoldPayload.intent.material, 'stone');
    assert.equal(fuzzyScaffoldPayload.interpretation.source, 'model-assisted');
    assert.equal(fuzzyScaffoldPayload.interpretation.attempted, true);
    assert.equal(fuzzyScaffoldPayload.interpretation.accepted, true);
    assert.equal(fuzzyScaffoldPayload.evaluation.scorecard.correctionApplied, false);
    assert.equal(fuzzyScaffoldPayload.evaluation.finalCandidate.width, 12);

    const correctedScaffoldPayload = await ace.runExecutiveRoute({
      envelope: {
        entries: [
          { type: 'prompt', content: 'set up a basic ground grid for a first village' },
        ],
      },
    });
    assert.equal(correctedScaffoldPayload.route, 'world-scaffold');
    assert.equal(correctedScaffoldPayload.interpretation.source, 'model-assisted');
    assert.equal(correctedScaffoldPayload.evaluation.scorecard.correctionApplied, true);
    assert.equal(correctedScaffoldPayload.evaluation.originalCandidate.width, 5);
    assert.equal(correctedScaffoldPayload.evaluation.correctedCandidate.width, 8);
    assert.equal(correctedScaffoldPayload.evaluation.finalCandidate.width, 8);
    assert.equal(correctedScaffoldPayload.intent.width, 8);

    await assert.rejects(
      () => ace.runExecutiveRoute({
        envelope: {
          entries: [
            { type: 'prompt', content: "let's start with a 200x200 grass grid" },
          ],
        },
      }),
      (error) => {
        assert.equal(error.message, 'Grid dimensions must be 100x100 or smaller.');
        assert.equal(error.payload.route, 'world-scaffold');
        assert.equal(error.payload.intent.width, 200);
        assert.equal(error.payload.validation.ok, false);
        assert.equal(error.payload.evaluation.scorecard.acceptedForMutationGeneration, false);
        return true;
      },
    );
    await assert.rejects(
      () => ace.runExecutiveRoute({
        envelope: {
          entries: [
            { type: 'prompt', content: 'give me a decent grassy starter area' },
          ],
        },
      }),
      (error) => {
        assert.equal(error.message, 'No fetch implementation is available for callOllamaGenerate.');
        assert.equal(error.payload.route, 'world-scaffold');
        assert.equal(error.payload.interpretation.status, 'model_unavailable');
        assert.equal(error.payload.interpretation.attempted, true);
        assert.equal(error.payload.evaluation.reason, 'No scaffold candidate to evaluate.');
        return true;
      },
    );

    const projectsPayload = await ace.getProjects();
    assert.equal(projectsPayload.projects[0].key, 'topdown-slice');
    assert.equal(requests.at(-1).url, '/api/projects');

    const launchPayload = await ace.runProject('topdown-slice');
    assert.equal(launchPayload.url, 'http://127.0.0.1:4173/');
    assert.equal(requests.at(-1).url, '/api/projects/run');
    assert.equal(requests.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      project: 'topdown-slice',
    });

    const qaPayload = await ace.runStructuredQA({ fixture: 'example' });
    assert.equal(qaPayload.status, 'pass');
    assert.equal(requests.at(-1).url, '/api/qa/run');
    assert.equal(requests.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      fixture: 'example',
    });

    const taDepartmentPayload = await ace.getTaDepartment();
    assert.equal(taDepartmentPayload.department.name, 'Talent Acquisition');
    assert.equal(requests.at(-1).url, '/api/ta/department');

    const departmentPayload = await ace.addDepartment({ templateId: 'research' });
    assert.equal(requests.at(-1).url, '/api/spatial/layout/actions');
    assert.equal(requests.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      action: 'add_department',
      templateId: 'research',
    });
    assert.equal(departmentPayload.action, 'add_department');
    assert.ok(departmentPayload.createdDepartmentId);
    assert.equal(new Set(departmentPayload.layout.departments.map((entry) => entry.id)).size, departmentPayload.layout.departments.length);

    const deskPayload = await ace.addDesk({
      departmentId: departmentPayload.createdDepartmentId,
      templateId: 'analysis-node',
    });
    assert.equal(requests.at(-1).url, '/api/spatial/layout/actions');
    assert.equal(requests.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      action: 'add_desk',
      departmentId: departmentPayload.createdDepartmentId,
      templateId: 'analysis-node',
    });
    assert.equal(deskPayload.action, 'add_desk');
    assert.equal(deskPayload.focusDeskId, deskPayload.createdDeskId);
    assert.ok(deskPayload.layout.desks[deskPayload.createdDeskId]);
    assert.equal(new Set(listStudioDeskIds(deskPayload.layout)).size, listStudioDeskIds(deskPayload.layout).length);

    const applyPayload = await ace.applyMutation([{ type: 'create_node', node: { id: 'node_1' } }]);
    assert.equal(applyPayload.confirmed, true);
    assert.equal(applyPayload.mutationResult.applied, 1);
    assert.equal(requests.at(-1).url, '/api/spatial/mutations/apply');
    assert.equal(requests.at(-1).options.method, 'POST');
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
      mutations: [{ type: 'create_node', node: { id: 'node_1' } }],
    });

    const scaffoldApplyPayload = await ace.applyMutation([{ type: 'create_node', layer: 'world', node: { id: 'world_scaffold_ground_grid' } }]);
    assert.equal(scaffoldApplyPayload.recentWorldChange.items[0].kind, 'scaffold');
    assert.equal(scaffoldApplyPayload.recentWorldChange.counts.addedCells, 400);
    assert.equal(requests.at(-1).url, '/api/spatial/mutations/apply');

    const queuedPayload = await ace.applyMutation([{ type: 'modify_node', id: 'protected-node', patch: { content: 'Review me' } }]);
    assert.equal(queuedPayload.confirmed, false);
    assert.equal(queuedPayload.mutationResult.status, 'queued');
    assert.equal(queuedPayload.mutationResult.queued, 1);
    assert.equal(queuedPayload.runtime.mutationGate.approvalQueue.length, 1);
    assert.equal(requests.at(-1).url, '/api/spatial/mutations/apply');

    const failingAce = new AceConnector();
    globalThis.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/spatial/mutations/apply') {
        return {
          ok: false,
          json: async () => ({
          ok: false,
          error: 'Cannot modify missing node "ghost".',
          mutationResult: {
            status: 'blocked',
            confirmed: false,
            requested: 1,
            applied: 0,
            queued: 0,
            blocked: 1,
            changedLayers: [],
            reason: 'Cannot modify missing node "ghost".',
          },
          runtime: {
            mutationGate: {
              activity: [{ id: 'mutation_activity_blocked', status: 'blocked', summary: 'Modify node ghost' }],
              approvalQueue: [],
            },
          },
        }),
      };
    }
      throw new Error(`Unexpected URL ${url}`);
    };
    await assert.rejects(
      () => failingAce.applyMutation([{ type: 'modify_node', id: 'ghost', patch: { content: 'Broken' } }]),
      (error) => {
        assert.equal(error.message, 'Cannot modify missing node "ghost".');
        assert.equal(error.payload.mutationResult.status, 'blocked');
        assert.equal(error.payload.runtime.mutationGate.activity[0].status, 'blocked');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
