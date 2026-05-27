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

export default async function runDebugSuiteTests() {
  const debugSuitePath = path.resolve(process.cwd(), '..', 'qa', 'shared', 'debugSuite.js');
  const { validateJavaScriptFiles } = require(debugSuitePath);

  const stringLiteralRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-debug-suite-pass-'));
  writeFile(
    stringLiteralRoot,
    'ui/fixtureText.js',
    [
      'const fixtureResponse = "import { createTilemap } from \'./world/tilemap.js\';";',
      'module.exports = fixtureResponse;',
      '',
    ].join('\n'),
  );
  const stringLiteralResult = validateJavaScriptFiles(stringLiteralRoot, ['ui']);
  assert.equal(stringLiteralResult.ok, true);

  const missingImportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-debug-suite-fail-'));
  writeFile(
    missingImportRoot,
    'ui/badImport.mjs',
    [
      "import { createTilemap } from './world/tilemap.js';",
      'export default createTilemap;',
      '',
    ].join('\n'),
  );
  const missingImportResult = validateJavaScriptFiles(missingImportRoot, ['ui']);
  assert.equal(missingImportResult.ok, false);
  assert.match(missingImportResult.reason, /ui\/badImport\.mjs: missing import \.\/world\/tilemap\.js/);
}
