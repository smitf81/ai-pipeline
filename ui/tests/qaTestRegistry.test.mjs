import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildQATestRegistry } = require('../../qa/testRegistry.js');

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

export default async function runQATestRegistryTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-registry-'));
  const now = '2026-04-01T12:00:00.000Z';

  writeFile(rootPath, 'qa/desks/plannerQA.js', `
function makeTest(name, ok, reason = null) {
  return { name, status: ok ? 'pass' : 'fail', reason };
}

const tests = [];
tests.push(makeTest('contract_check', true));
tests.push(makeTest('file_scope', false, 'missing endpoint /api/spatial/planner/properties'));
tests.push(makeTest('syntax_load', true));
// @deprecated
tests.push(makeTest('legacy_check', true));

module.exports = {
  runTests: async () => ({ desk: 'planner', status: 'pass', tests }),
};
`);

  writeFile(rootPath, 'qa/desks/opsQA.js', `
function makeTest(name, ok, reason = null) {
  return { name, status: ok ? 'pass' : 'fail', reason };
}

const tests = [];
tests.push(makeTest('contract_check', true));

module.exports = {
  runTests: async () => ({ desk: 'ops', status: 'pass', tests }),
};
`);

  writeFile(rootPath, 'data/spatial/qa/structured/latest.json', JSON.stringify({
    status: 'pass',
    summary: 'fixture QA report',
    finishedAt: now,
    desks: [
      {
        desk: 'planner',
        status: 'pass',
        tests: [
          {
            name: 'contract_check',
            status: 'pass',
            qualityCard: {
              updatedAt: now,
            },
          },
          {
            name: 'file_scope',
            status: 'fail',
            reason: 'missing endpoint /api/spatial/planner/properties',
          },
        ],
      },
      {
        desk: 'ops',
        status: 'pass',
        tests: [
          {
            name: 'contract_check',
            status: 'pass',
          },
        ],
      },
    ],
  }, null, 2));

  const registry = buildQATestRegistry({
    rootPath,
    now: Date.parse(now),
  });

  assert.equal(registry.schema, 'qa.test-registry.v1');
  assert.equal(registry.entries.length, 5);
  assert.equal(registry.summary.total, 5);
  assert.equal(registry.summary.executable, 1);
  assert.equal(registry.summary.missingDependency, 1);
  assert.equal(registry.summary.staleTarget, 1);
  assert.equal(registry.summary.deprecated, 1);
  assert.equal(registry.summary.unknownOwner, 1);

  const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));
  assert.equal(byId.get('planner.contract_check').validityClass, 'executable');
  assert.equal(byId.get('planner.contract_check').lastExecutionAt, now);
  assert.equal(byId.get('planner.file_scope').validityClass, 'missing_dependency');
  assert.equal(byId.get('planner.syntax_load').validityClass, 'stale_target');
  assert.equal(byId.get('planner.legacy_check').validityClass, 'deprecated');
  assert.equal(byId.get('opsQA.contract_check').validityClass, 'unknown_owner');
  assert.equal(byId.get('opsQA.contract_check').owner.kind, 'unknown');
  assert.equal(byId.get('opsQA.contract_check').source.modulePath, 'qa/desks/opsQA.js');
  assert.equal(byId.get('planner.contract_check').source.runtimePath, 'data/spatial/qa/structured/latest.json');
}
