import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { run } from 'node:test';
import { spec } from 'node:test/reporters';

const testsRoot = path.resolve('./tests');
const requested = process.argv.slice(2);
const files = requested.length > 0
  ? requested.map((entry) => resolveTestFile(entry))
  : listDefaultTestFiles(testsRoot);

const stream = run({
  files,
  isolation: 'none'
});

stream.on('test:fail', () => {
  process.exitCode = 1;
});

stream.pipe(spec()).pipe(process.stdout);

function listDefaultTestFiles(root) {
  return readdirSync(root)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(root, name));
}

function resolveTestFile(entry) {
  const candidates = [
    path.resolve(entry),
    path.resolve('./tests', entry)
  ];

  for (const candidate of candidates) {
    if (safeIsFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Test file not found: ${entry}`);
}

function safeIsFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}
