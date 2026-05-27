import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

export default async function runConstrainedAutoFixTests() {
  const {
    buildConstrainedAutoFixBundle,
    inferImplicatedFiles,
    runConstrainedAutoFixExecutor,
  } = require(path.resolve(process.cwd(), 'constrainedAutoFix.js'));

  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-auto-fix-'));
  const implicatedFile = 'ui/public/spatial/spatialApp.js';
  writeFile(rootPath, implicatedFile, [
    'export function renderExample(items, entries) {',
    '  const visibleCount = items.length;',
    '  const entryCount = entries.map((entry) => entry.name).length;',
    '  return visibleCount + entryCount;',
    '}',
    '',
  ].join('\n'));

  const bundle = buildConstrainedAutoFixBundle({
    reason: 'Cannot read properties of undefined (reading \'length\')',
    criticalErrors: [{
      message: 'Cannot read properties of undefined (reading \'length\')',
      stack: `TypeError: Cannot read properties of undefined (reading 'length')\n    at renderRosterUtility (${path.join(rootPath, implicatedFile)}:12:3)`,
      failureClass: 'panel_degraded',
    }],
    failingTestNames: ['spatialAppSmoke'],
    changedFiles: [implicatedFile],
  }, {
    rootPath,
    stage: 'safe-mode',
    taskId: 'safe-mode',
    artifactRefs: ['brain/context/safe_mode/diagnosis.json'],
  });

  assert.equal(inferImplicatedFiles(rootPath, bundle)[0], implicatedFile);
  const applied = runConstrainedAutoFixExecutor(rootPath, bundle, {
    validate: () => ({
      ok: true,
      checks: [
        { id: 'npm-test', ok: true },
        { id: 'qa-smoke', ok: true },
      ],
      summary: 'Validation passed before auto-fix application.',
    }),
  });
  assert.equal(applied.ok, true);
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.appliedFiles, [implicatedFile]);
  const updatedText = fs.readFileSync(path.join(rootPath, ...implicatedFile.split('/')), 'utf8');
  assert.match(updatedText, /items\?\.length \?\? 0/);
  assert.match(updatedText, /\(entries \?\? \[\]\)\.map/);

  const blockedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-auto-fix-blocked-'));
  writeFile(blockedRoot, implicatedFile, [
    'export function renderExample(items) {',
    '  return items.length;',
    '}',
    '',
  ].join('\n'));
  const blockedBundle = buildConstrainedAutoFixBundle({
    reason: 'Cannot read properties of undefined (reading \'length\')',
    criticalErrors: [{
      message: 'Cannot read properties of undefined (reading \'length\')',
      stack: `TypeError: Cannot read properties of undefined (reading 'length')\n    at renderRosterUtility (${path.join(blockedRoot, implicatedFile)}:12:3)`,
      failureClass: 'panel_degraded',
    }],
    changedFiles: [implicatedFile],
  }, { stage: 'safe-mode' });
  const blocked = runConstrainedAutoFixExecutor(blockedRoot, blockedBundle, {
    validate: () => ({
      ok: false,
      checks: [{ id: 'npm-test', ok: false }],
      summary: 'Validation failed before auto-fix application.',
    }),
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.applied, false);
  assert.equal(fs.readFileSync(path.join(blockedRoot, ...implicatedFile.split('/')), 'utf8').includes('items.length'), true);
}
