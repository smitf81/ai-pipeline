import { createSafeWriteProjectFileTool, integrationContract } from '../src/index.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'safe-write-project-file-'));
const tool = createSafeWriteProjectFileTool({ rootDir: root });

if (tool.name !== 'safe_write_project_file') throw new Error('tool name mismatch');
if (!integrationContract.modes.includes('core_patch')) throw new Error('contract missing core_patch');

const target = 'sample.js';
writeFileSync(path.join(root, target), 'const value = 1;\n', 'utf8');

const dry = await tool.handler({ mode: 'core_patch', target_path: target, expected_find: 'const value = 1;', replacement: 'const value = 2;', dry_run: true });
if (!dry.ok || dry.applied) throw new Error('dry run should validate without applying');
if (readFileSync(path.join(root, target), 'utf8').includes('2')) throw new Error('dry run changed file');

const applied = await tool.handler({ mode: 'core_patch', target_path: target, expected_find: 'const value = 1;', replacement: 'const value = 2;', dry_run: false });
if (!applied.ok || !applied.applied || !applied.backup_path) throw new Error('patch did not apply with backup');
if (!readFileSync(path.join(root, target), 'utf8').includes('const value = 2;')) throw new Error('replacement missing');

const blocked = await tool.handler({ mode: 'core_patch', target_path: '../escape.js', expected_find: 'x', replacement: 'y', dry_run: true });
if (blocked.ok || blocked.blocked_reason !== 'path_outside_project_root') throw new Error('path escape not blocked');

rmSync(root, { recursive: true, force: true });
console.log('safe-write-project-file safe_write_project_file proposal exports OK');
