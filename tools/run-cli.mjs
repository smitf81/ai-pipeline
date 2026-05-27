#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  process.stdout.write(`Usage:
  run.cmd <script> [args...]
  run.cmd --cwd <dir> <script> [args...]
  run.cmd npm <npm-args...>

Examples:
  run.cmd index:project
  run.cmd qa
  run.cmd --cwd ui test
  run.cmd npm install
`);
}

function parse(argv) {
  let cwd = repoRoot;
  const args = [...argv];

  if (args[0] === '--cwd') {
    if (!args[1]) {
      throw new Error('Missing directory after --cwd.');
    }
    cwd = resolve(repoRoot, args[1]);
    args.splice(0, 2);
  }

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { help: true, cwd, npmArgs: [] };
  }

  if (args[0].toLowerCase() === 'npm') {
    return { help: false, cwd, npmArgs: args.slice(1) };
  }

  const [scriptName, ...scriptArgs] = args;
  const npmArgs = ['run', scriptName];
  if (scriptArgs.length > 0) {
    npmArgs.push('--', ...scriptArgs);
  }
  return { help: false, cwd, npmArgs };
}

try {
  const parsed = parse(process.argv.slice(2));
  if (parsed.help) {
    usage();
    process.exit(0);
  }

  const cacheDir = resolve(repoRoot, '.npm-cache');
  mkdirSync(cacheDir, { recursive: true });

  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', parsed.npmArgs, {
    cwd: parsed.cwd,
    env: {
      ...process.env,
      npm_config_cache: cacheDir,
      npm_config_update_notifier: 'false'
    },
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
} catch (error) {
  process.stderr.write(`[run] ${error.message}\n`);
  process.exit(2);
}
