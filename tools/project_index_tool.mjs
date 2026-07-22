#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const DEFAULT_MD = 'brain/context/master_index.md';
const DEFAULT_JSON = 'brain/context/master_index.json';
const DEFAULT_APPENDIX = 'brain/context/chat_appendix.md';

const IGNORE_DIRS = new Set([
  '.git',
  '.ace-local-agent-ide',
  '.ace-safeboot',
  '.npm-cache',
  '.playwright',
  '.playwright-cli',
  '.playwright-browsers',
  '.pytest_cache',
  '.python-tools',
  '.recovery',
  '.tmp.drivedownload',
  '.tmp.driveupload',
  '.venv',
  '__pycache__',
  'archives',
  'artifacts',
  'build',
  'coverage',
  'dist',
  'legacy',
  'node_modules',
  'output',
  'test-results'
]);

const IGNORE_PATH_PREFIXES = [
  '.codex/.skill-staging/',
  'dev/ai-pipeline/',
  '_A_Projects/2D_Sprite_Maker/',
  '_A_Projects/BLACK_SKY_BOUND_FFP/',
  '_A_Projects/BitmapForge/',
  '_A_Projects/Breach/',
  '_A_Projects/LocalLamaPanel_UE5_Plugin/',
  '_A_Projects/Moral_Distinction_Visualiser/',
  '_A_Projects/YouTubeScraper/',
  '_A_Projects/emergence/',
  '_A_Projects/voice-dojo-pwa/',
  'Projects/field-fronts-prototype_OLD/',
  'Projects/field-fronts-prototype/output/',
  'Projects/field-fronts-prototype/qa-output/',
  'Projects/field-fronts-prototype/playtests/',
  'Projects/field-fronts-prototype/artifacts/',
  'Projects/Breach/output/',
  'brain/topdown-slice/output/',
  'Animation_Embodied_Field_Entity_EFE_Plugin/.slice1_build/',
  'Animation_Embodied_Field_Entity_EFE_Plugin/output/',
  'AXIOM/apps/launcher/runtime/',
  'AXIOM/apps/launcher/Version history/',
  'legacy/runtime/',
  'data/spatial/qa/',
  'data/spatial/agent-runs/',
  'data/spatial/throughput/',
  'ui/public/qa-runs/'
];

const GENERATED_INDEX_FILES = new Set([
  normalizePath(DEFAULT_MD),
  normalizePath(DEFAULT_JSON)
]);

const ARCHIVE_EXTENSIONS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.zst']);
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.mov', '.wav', '.mp3', '.pdf']);
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.ps1', '.vbs', '.html', '.css', '.cpp', '.c', '.h', '.cs']);
const DATA_EXTENSIONS = new Set(['.json', '.jsonl', '.ndjson', '.schema']);
const DOC_EXTENSIONS = new Set(['.md', '.txt']);
const CONFIG_NAMES = new Set(['package.json', 'package-lock.json', '.gitignore', 'mcp.json']);
const MAX_TEXT_SAMPLE_BYTES = 12000;
const MAX_MARKDOWN_FILE_RECORDS = 300;
const LARGE_FILE_BYTES = 1_000_000;

function normalizePath(pathValue) {
  return pathValue.split(sep).join('/');
}

function parseArgs(argv) {
  const args = {
    out: DEFAULT_MD,
    json: DEFAULT_JSON,
    appendix: DEFAULT_APPENDIX,
    appendixFile: null,
    root: ROOT,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--out') {
      args.out = argv[++index];
    } else if (arg === '--json') {
      args.json = argv[++index];
    } else if (arg === '--appendix') {
      args.appendix = argv[++index];
    } else if (arg === '--appendix-file') {
      args.appendixFile = argv[++index];
    } else if (arg === '--root') {
      args.root = resolve(argv[++index]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`Project index tool

Usage:
  node tools/project_index_tool.mjs [--root <repo>] [--out <md>] [--json <json>]
  node tools/project_index_tool.mjs --appendix-file <chat-summary.md>

Outputs:
  ${DEFAULT_MD}
  ${DEFAULT_JSON}
  ${DEFAULT_APPENDIX} when --appendix-file is supplied

The tool scans project files, skips dependency/build/runtime noise, writes a compact master index,
and optionally appends an end-of-chat note before refreshing the index.
`);
}

function walk(root) {
  const files = [];
  const skipped = new Map();

  function markSkipped(reason) {
    skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  }

  function visit(absDir) {
    const entries = readdirSync(absDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absPath = join(absDir, entry.name);
      const relPath = normalizePath(relative(root, absPath));
      const pathForPrefix = entry.isDirectory() ? `${relPath}/` : relPath;
      const unrelatedProjectPath = relPath.startsWith('_A_Projects/') && !relPath.startsWith('_A_Projects/BLACK_SKY_BOUND_V2/');

      if (entry.isDirectory()) {
        if (unrelatedProjectPath || IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.git.') || IGNORE_PATH_PREFIXES.some((prefix) => pathForPrefix.startsWith(prefix))) {
          markSkipped('excluded-directory');
          continue;
        }
        visit(absPath);
        continue;
      }

      if (!entry.isFile()) {
        markSkipped('non-file');
        continue;
      }

      if (entry.name.startsWith('.tmp-') || entry.name.endsWith('.tmp')) {
        markSkipped('temporary-file');
        continue;
      }

      if (unrelatedProjectPath || ARCHIVE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        markSkipped('excluded-file');
        continue;
      }

      if (
        (relPath.startsWith('AXIOM/apps/plugin-builder/packages/') && relPath.endsWith('.axpkg')) ||
        (relPath.startsWith('AXIOM/apps/plugin-builder/docs/skills/') && relPath.endsWith('.audit.jsonl')) ||
        (relPath.startsWith('AXIOM/apps/launcher/public/') && relPath.endsWith('_DEGRADED.html'))
      ) {
        markSkipped('generated-or-runtime');
        continue;
      }

      if (GENERATED_INDEX_FILES.has(relPath) || IGNORE_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix))) {
        markSkipped('generated-or-runtime');
        continue;
      }

      files.push(absPath);
    }
  }

  visit(root);
  return { files, skipped };
}

function sha256(absPath) {
  const hash = createHash('sha256');
  hash.update(readFileSync(absPath));
  return hash.digest('hex');
}

function classify(relPath, stats) {
  const name = basename(relPath);
  const ext = extname(relPath).toLowerCase();
  const parts = relPath.split('/');
  const lower = relPath.toLowerCase();

  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (ASSET_EXTENSIONS.has(ext)) return 'asset';
  if (lower.startsWith('legacy/') || lower.startsWith('dev/') || parts.includes('output') || parts.includes('Version_History') || parts.includes('archives')) return 'historical';
  if (CONFIG_NAMES.has(name)) return 'config';
  if (relPath.includes('/tests/') || name.includes('.test.') || name.includes('_test.')) return 'test';
  if (DOC_EXTENSIONS.has(ext)) return 'doc';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (DATA_EXTENSIONS.has(ext) || name.endsWith('.schema.json')) return 'data';
  if (stats.size > LARGE_FILE_BYTES) return 'large';
  return 'other';
}

function isTextLike(category) {
  return ['code', 'config', 'data', 'doc', 'test', 'other'].includes(category);
}

function firstMeaningfulLine(absPath, category) {
  if (!isTextLike(category)) return '';

  const buffer = readFileSync(absPath);
  if (buffer.includes(0)) return '';

  const text = buffer.slice(0, MAX_TEXT_SAMPLE_BYTES).toString('utf8');
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line === '---') continue;
    if (line.startsWith('//') || line.startsWith('#!')) continue;
    if (line.length <= 2 && ['{', '[', '}', ']'].includes(line)) continue;
    return line.replace(/\s+/g, ' ').slice(0, 140);
  }
  return '';
}

function inferSummary(relPath, category, firstLine) {
  const name = basename(relPath);
  const lower = relPath.toLowerCase();

  if (lower === 'agents/agents.md') return 'Project instructions and canonical ACE context read order.';
  if (lower.startsWith('brain/emergence/')) return 'Canonical ACE brain artifact.';
  if (lower.startsWith('brain/context/')) return 'Operational planner-support context artifact.';
  if (lower.startsWith('context/')) return 'ContextOps tier or schema artifact.';
  if (lower.startsWith('axiom/')) return 'AXIOM runtime, docs, services, plugin-builder, or historical artifact.';
  if (lower.startsWith('ui/tests/')) return 'UI/runtime test coverage.';
  if (lower.startsWith('ui/')) return 'Spatial IDE browser/server runtime code.';
  if (lower.startsWith('qa/')) return 'QA runner, desk, registry, or evidence logic.';
  if (lower.startsWith('tools/')) return 'Operator tool, MCP helper, or local utility.';
  if (lower.startsWith('projects/')) return 'Project artifact or experiment outside the ACE core.';
  if (lower.startsWith('legacy/')) return 'Historical implementation retained for reference.';
  if (category === 'archive') return 'Archive file; do not read into chat unless recovering a snapshot.';
  if (category === 'asset') return 'Visual/audio/binary asset.';
  if (category === 'test') return 'Automated test file.';
  if (firstLine) return firstLine;
  return `${category} file`;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function topDirectory(relPath) {
  return relPath.includes('/') ? relPath.split('/')[0] : '.';
}

function secondLevel(relPath) {
  const parts = relPath.split('/');
  if (parts.length <= 1) return '.';
  return parts.slice(0, Math.min(2, parts.length - 1)).join('/');
}

function buildRecords(root, files) {
  return files.map((absPath) => {
    const relPath = normalizePath(relative(root, absPath));
    const stats = statSync(absPath);
    const category = classify(relPath, stats);
    const firstLine = firstMeaningfulLine(absPath, category);
    return {
      path: relPath,
      category,
      size_bytes: stats.size,
      modified_at: stats.mtime.toISOString(),
      sha256: sha256(absPath),
      summary: inferSummary(relPath, category, firstLine)
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function countBy(records, selector) {
  const counts = new Map();
  for (const record of records) {
    const key = selector(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function directorySummary(records) {
  const groups = new Map();
  for (const record of records) {
    const key = secondLevel(record.path);
    if (!groups.has(key)) {
      groups.set(key, { path: key, files: 0, bytes: 0, categories: new Map() });
    }
    const group = groups.get(key);
    group.files += 1;
    group.bytes += record.size_bytes;
    group.categories.set(record.category, (group.categories.get(record.category) ?? 0) + 1);
  }

  return [...groups.values()].sort((a, b) => a.path.localeCompare(b.path)).map((group) => ({
    path: group.path,
    files: group.files,
    size_bytes: group.bytes,
    categories: [...group.categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }));
}

function readAppendixEntries(absAppendixPath) {
  if (!existsSync(absAppendixPath)) return [];
  const text = readFileSync(absAppendixPath, 'utf8');
  return text
    .split(/\n(?=##\s)/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(-5);
}

function appendChatNote(root, appendixPath, appendixFile) {
  if (!appendixFile) return null;
  const absSource = resolve(root, appendixFile);
  if (!existsSync(absSource)) {
    throw new Error(`Appendix file not found: ${appendixFile}`);
  }

  const absAppendix = resolve(root, appendixPath);
  mkdirSync(dirname(absAppendix), { recursive: true });
  const sourceText = readFileSync(absSource, 'utf8').trim();
  const now = new Date().toISOString();
  const entry = `## ${now}\n\n${sourceText}\n\n`;
  const existing = existsSync(absAppendix) ? readFileSync(absAppendix, 'utf8') : '# Chat Appendix\n\n';
  atomicWrite(absAppendix, `${existing.replace(/\s*$/, '\n\n')}${entry}`);
  return normalizePath(relative(root, absAppendix));
}

function renderMarkdown({ root, records, skipped, appendixPath }) {
  const now = new Date().toISOString();
  const categories = countBy(records, (record) => record.category);
  const topDirs = countBy(records, (record) => topDirectory(record.path));
  const directories = directorySummary(records);
  const appendixEntries = readAppendixEntries(resolve(root, appendixPath));
  const canonicalAnchors = records.filter((record) => [
    'agents/AGENTS.md',
    'brain/emergence/project_brain.md',
    'brain/emergence/roadmap.md',
    'brain/emergence/plan.md',
    'brain/emergence/tasks.md',
    'brain/emergence/decisions.md',
    'brain/emergence/changelog.md',
    'brain/context/recent_change_digest.md',
    'brain/context/ui_backend_drift.md',
    'brain/context/next_slice.md',
    'context/README.md',
    'context/CONTEXTOPS.md',
    'AXIOM/README.md',
    'package.json'
  ].includes(record.path));

  const lines = [];
  lines.push('# Project Master Index');
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push(`Root: ${root}`);
  lines.push(`Indexed files: ${records.length}`);
  lines.push('');
  lines.push('Use this file to choose what to read next. It is an orientation map, not canonical truth.');
  lines.push('');
  lines.push('## Start Here');
  for (const anchor of canonicalAnchors) {
    lines.push(`- \`${anchor.path}\` - ${anchor.summary}`);
  }
  lines.push('');
  lines.push('## Category Counts');
  for (const [category, count] of categories) {
    lines.push(`- ${category}: ${count}`);
  }
  lines.push('');
  lines.push('## Top-Level Map');
  for (const [dir, count] of topDirs) {
    lines.push(`- \`${dir}\`: ${count} files`);
  }
  lines.push('');
  lines.push('## Directory Outline');
  for (const group of directories) {
    const cats = group.categories.map(([category, count]) => `${category}:${count}`).join(', ');
    lines.push(`- \`${group.path}\` - ${group.files} files, ${humanSize(group.size_bytes)} (${cats})`);
  }
  lines.push('');
  lines.push('## File Outline');
  lines.push('');
  lines.push(`The complete file inventory is in \`brain/context/master_index.json\`. This Markdown view lists the first ${MAX_MARKDOWN_FILE_RECORDS} high-signal code, test, data, config, and doc records.`);
  const highSignalRecords = records
    .filter((record) => ['code', 'config', 'data', 'doc', 'test'].includes(record.category))
    .slice(0, MAX_MARKDOWN_FILE_RECORDS);

  let currentTop = null;
  for (const record of highSignalRecords) {
    const top = topDirectory(record.path);
    if (top !== currentTop) {
      currentTop = top;
      lines.push('');
      lines.push(`### ${top}`);
    }
    lines.push(`- \`${record.path}\` [${record.category}, ${humanSize(record.size_bytes)}] - ${record.summary}`);
  }
  const omitted = records.filter((record) => ['code', 'config', 'data', 'doc', 'test'].includes(record.category)).length - highSignalRecords.length;
  if (omitted > 0) {
    lines.push('');
    lines.push(`Additional high-signal records omitted from Markdown: ${omitted}. Query \`brain/context/master_index.json\` for the full inventory.`);
  }
  lines.push('');
  lines.push('## Recent Chat Appendix');
  if (appendixEntries.length === 0) {
    lines.push('- No appendix entries yet. Add one with `node tools/project_index_tool.mjs --appendix-file <summary.md>`.');
  } else {
    for (const entry of appendixEntries) {
      const preview = entry.split(/\r?\n/).slice(0, 8).join('\n');
      lines.push(preview);
      lines.push('');
    }
  }
  lines.push('');
  lines.push('## Skipped Noise');
  if (skipped.size === 0) {
    lines.push('- None.');
  } else {
    for (const [reason, count] of [...skipped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- ${reason}: ${count}`);
    }
  }
  lines.push('');
  lines.push('## Refresh Command');
  lines.push('');
  lines.push('```bash');
  lines.push('node tools/project_index_tool.mjs');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function atomicWrite(absPath, content) {
  mkdirSync(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, absPath);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const root = resolve(args.root);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    throw new Error(`Root is not a directory: ${root}`);
  }

  const appendedPath = appendChatNote(root, args.appendix, args.appendixFile);
  const { files, skipped } = walk(root);
  const records = buildRecords(root, files);
  const payload = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    root,
    files_indexed: records.length,
    appendix_path: normalizePath(args.appendix),
    records
  };

  const absJson = resolve(root, args.json);
  const absMd = resolve(root, args.out);
  atomicWrite(absJson, `${JSON.stringify(payload, null, 2)}\n`);
  atomicWrite(absMd, renderMarkdown({ root, records, skipped, appendixPath: args.appendix }));

  process.stdout.write(`Indexed ${records.length} files into ${normalizePath(relative(root, absMd))} and ${normalizePath(relative(root, absJson))}.\n`);
  if (appendedPath) {
    process.stdout.write(`Appended chat note to ${appendedPath}.\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
