import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export default async function runKnownFixesTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-known-fixes-'));
  const modulePath = path.resolve(process.cwd(), 'knownFixes.js');
  const {
    DEFAULT_KNOWN_FIXES,
    writeKnownFixCandidates,
    buildKnownFixesPromptSection,
    ensureKnownFixLibrarySeed,
    readKnownFixLibrary,
    readKnownFixCandidates,
    renderKnownFixLibraryMarkdown,
    upsertKnownFix,
  } = require(modulePath);

  const seeded = ensureKnownFixLibrarySeed(rootPath);
  assert.equal(seeded.entries.length, DEFAULT_KNOWN_FIXES.length);

  const library = readKnownFixLibrary(rootPath).library;
  assert.equal(library.entries[0].id, 'path-quoting-windows');
  assert.equal(library.entries[4].id, 'windows-subprocess-array-args');

  const markdown = renderKnownFixLibraryMarkdown(library);
  assert.match(markdown, /# Known Fixes Library/);
  assert.match(markdown, /Quote Windows paths at the shell boundary/);
  assert.match(markdown, /Use array args for Windows subprocesses/);

  const promptSection = buildKnownFixesPromptSection(rootPath, { limit: 3 });
  assert.match(promptSection, /## Known Fixes Library/);
  assert.match(promptSection, /Path quoting/);
  assert.match(promptSection, /Branch creation/);
  assert.match(promptSection, /Patch apply failure/);

  writeKnownFixCandidates(rootPath, {
    version: 'ace/known-fix-candidates.v1',
    entries: [{
      id: 'candidate-windows_spawn_eperm',
      title: 'Quote Windows subprocess arguments cleanly',
      pattern: 'Windows subprocess weirdness',
      when: ['Repeated Windows subprocess failures'],
      do: ['Use array args.'],
      avoid: ['String-built shell commands.'],
      tags: ['windows'],
      source: 'failure-history',
      status: 'candidate',
      failureKey: 'windows_spawn_eperm',
      count: 3,
      firstSeen: '2026-03-29T00:00:00.000Z',
      lastSeen: '2026-03-29T01:00:00.000Z',
      exampleMessages: ['spawn EPERM'],
      relatedTools: ['node'],
      relatedStages: ['apply'],
    }],
  });
  const candidateLibrary = readKnownFixCandidates(rootPath).library;
  assert.equal(candidateLibrary.entries[0].failureKey, 'windows_spawn_eperm');
  assert.equal(candidateLibrary.entries[0].status, 'candidate');

  const normalPromptSection = buildKnownFixesPromptSection(rootPath);
  assert.doesNotMatch(normalPromptSection, /Candidate Fixes/);
  assert.doesNotMatch(normalPromptSection, /Quote Windows subprocess arguments cleanly/);
  const reviewPromptSection = buildKnownFixesPromptSection(rootPath, { includeCandidates: true });
  assert.match(reviewPromptSection, /Candidate Fixes/);
  assert.match(reviewPromptSection, /Quote Windows subprocess arguments cleanly/);

  upsertKnownFix(rootPath, {
    id: 'path-quoting-windows',
    title: 'Quote Windows paths at the shell boundary',
    pattern: 'Path quoting, updated',
    when: ['PowerShell still parses literal paths'],
    do: ['Keep using arrays.'],
    avoid: ['String-built shell commands.'],
    tags: ['windows'],
    source: 'test',
  });

  const updated = readKnownFixLibrary(rootPath).library;
  assert.equal(updated.entries[0].pattern, 'Path quoting, updated');
  assert.deepEqual(updated.entries[0].when, ['PowerShell still parses literal paths']);
  assert.deepEqual(updated.entries[0].do, ['Keep using arrays.']);

  const jsonPath = path.join(rootPath, 'brain', 'context', 'known_fixes.json');
  const mdPath = path.join(rootPath, 'brain', 'context', 'known_fixes.md');
  assert.ok(fs.existsSync(jsonPath));
  assert.ok(fs.existsSync(mdPath));
  assert.match(readFile(mdPath), /Updated:/);
}
