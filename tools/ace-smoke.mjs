#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  process.stdout.write(`ACE smoke runner

Usage:
  node tools/ace-smoke.mjs [--scope repo|skills|ui|all]

Scopes:
  repo    Syntax-check index tool, refresh master index, parse index JSON.
  skills  Validate every skill under brain/skills.
  ui      Run the ui package test gate through run.cmd.
  all     Run repo, skills, then ui.

Default scope: repo + skills.
`);
}

function run(label, command, args, options = {}) {
  process.stdout.write(`\n[smoke] ${label}\n`);
  process.stdout.write(`[smoke] ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
    ...options
  });
  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}`);
  }
}

function nodeArgs(script, ...args) {
  return [script, ...args];
}

function cmdPath(pathValue) {
  return process.platform === 'win32' ? pathValue.replaceAll('/', '\\') : pathValue;
}

function runRepoScope() {
  run('project index syntax', 'node', nodeArgs('tools/project_index_tool.mjs', '--help'));
  run('refresh project index', cmdPath('.\\run.cmd'), ['index:project']);
  JSON.parse(readFileSync(resolve(repoRoot, 'brain/context/master_index.json'), 'utf8'));
  process.stdout.write('[smoke] master_index.json parsed successfully\n');
}

function runSkillsScope() {
  const skillsDir = resolve(repoRoot, 'brain/skills');
  if (!existsSync(skillsDir)) {
    process.stdout.write('[smoke] no brain/skills directory found\n');
    return;
  }

  const skillNames = readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const skillName of skillNames) {
    run(`validate skill ${skillName}`, cmdPath('.\\tools\\skill-validator.cmd'), [`brain\\skills\\${skillName}`]);
  }
}

function runUiScope() {
  run('ui completion gate', cmdPath('.\\run.cmd'), ['--cwd', 'ui', 'test']);
}

function parseScope(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return 'help';
  const scopeIndex = argv.indexOf('--scope');
  if (scopeIndex === -1) return 'default';
  const scope = argv[scopeIndex + 1];
  if (!scope) throw new Error('Missing value after --scope.');
  if (!['repo', 'skills', 'ui', 'all'].includes(scope)) {
    throw new Error(`Unknown scope: ${scope}`);
  }
  return scope;
}

try {
  const scope = parseScope(process.argv.slice(2));
  if (scope === 'help') {
    usage();
    process.exit(0);
  }

  if (scope === 'repo' || scope === 'default' || scope === 'all') runRepoScope();
  if (scope === 'skills' || scope === 'default' || scope === 'all') runSkillsScope();
  if (scope === 'ui' || scope === 'all') runUiScope();

  process.stdout.write('\n[smoke] passed\n');
} catch (error) {
  process.stderr.write(`\n[smoke] ${error.message}\n`);
  process.exit(1);
}
