import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const aceConnectorPath = path.resolve(process.cwd(), 'public', 'spatial', 'aceConnector.js');

export default async function runAceConnectorTests() {
  const { AceConnector } = await loadModuleCopy(aceConnectorPath, { label: 'aceConnector' });
  const requests = [];
  const originalFetch = globalThis.fetch;
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
    if (url === '/api/spatial/mutations/apply') {
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
    assert.equal(requests[1].url, '/api/spatial/executive/route');
    assert.equal(requests[1].options.method, 'POST');

    const projectsPayload = await ace.getProjects();
    assert.equal(projectsPayload.projects[0].key, 'topdown-slice');
    assert.equal(requests[2].url, '/api/projects');

    const launchPayload = await ace.runProject('topdown-slice');
    assert.equal(launchPayload.url, 'http://127.0.0.1:4173/');
    assert.equal(requests[3].url, '/api/projects/run');
    assert.equal(requests[3].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[3].options.body), {
      project: 'topdown-slice',
    });

    const qaPayload = await ace.runStructuredQA({ fixture: 'example' });
    assert.equal(qaPayload.status, 'pass');
    assert.equal(requests[4].url, '/api/qa/run');
    assert.equal(requests[4].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[4].options.body), {
      fixture: 'example',
    });

    const applyPayload = await ace.applyMutation([{ type: 'create_node', node: { id: 'node_1' } }]);
    assert.equal(applyPayload.confirmed, true);
    assert.equal(applyPayload.mutationResult.applied, 1);
    assert.equal(requests[5].url, '/api/spatial/mutations/apply');
    assert.equal(requests[5].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[5].options.body), {
      mutations: [{ type: 'create_node', node: { id: 'node_1' } }],
    });

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
      throw new Error(`Unexpected URL ${url}`);
    };
    await assert.rejects(
      () => failingAce.applyMutation([{ type: 'modify_node', id: 'ghost', patch: { content: 'Broken' } }]),
      (error) => {
        assert.equal(error.message, 'Cannot modify missing node "ghost".');
        assert.equal(error.payload.mutationResult.status, 'failed');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}
