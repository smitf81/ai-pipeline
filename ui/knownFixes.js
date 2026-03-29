const fs = require('fs');
const path = require('path');

const KNOWN_FIXES_RELATIVE_DIR = path.join('brain', 'context');
const KNOWN_FIXES_JSON_NAME = 'known_fixes.json';
const KNOWN_FIXES_MD_NAME = 'known_fixes.md';
const KNOWN_FIXES_CANDIDATES_JSON_NAME = 'known_fixes_candidates.json';
const KNOWN_FIXES_CANDIDATES_MD_NAME = 'known_fixes_candidates.md';
const KNOWN_FIXES_VERSION = 'ace/known-fixes.v1';
const KNOWN_FIX_CANDIDATES_VERSION = 'ace/known-fix-candidates.v1';

const DEFAULT_KNOWN_FIXES = [
  {
    id: 'path-quoting-windows',
    title: 'Quote Windows paths at the shell boundary',
    pattern: 'Path quoting',
    when: [
      'PowerShell parses paths with spaces or brackets',
      'A command uses literal filesystem paths',
      'A helper is feeding file paths into subprocess arguments',
    ],
    do: [
      'Pass command arguments as arrays where possible.',
      'Use `-LiteralPath` for PowerShell file operations.',
      'Normalize repo-relative paths with forward slashes before prompt serialization.',
    ],
    avoid: [
      'Building shell commands by string concatenation.',
      'Letting unquoted paths cross a shell boundary.',
    ],
    tags: ['windows', 'powershell', 'paths'],
    source: 'slice-2-known-fixes',
  },
  {
    id: 'branch-creation-safe-path',
    title: 'Create branches from a clean tracked worktree',
    pattern: 'Branch creation',
    when: [
      'ACE needs a disposable branch for apply or review',
      'The repo already has tracked edits',
      'Branch name collisions are possible',
    ],
    do: [
      'Verify tracked worktree cleanliness before branch creation.',
      "Prefer a `codex/` prefix or the repo's existing branch prefix rule.",
      'Derive a unique branch name before checkout.',
    ],
    avoid: [
      'Creating branches on top of unreviewed tracked edits.',
      'Reusing branch names that may already exist remotely or locally.',
    ],
    tags: ['git', 'branch', 'safety'],
    source: 'slice-2-known-fixes',
  },
  {
    id: 'patch-apply-failure-rollback',
    title: 'Treat patch apply failures as rollback events',
    pattern: 'Patch apply failure',
    when: [
      'A generated diff touches disallowed paths',
      'Git apply fails after branch creation',
      'The patch may have drifted from the current tree',
    ],
    do: [
      'Validate patch paths before applying.',
      'Apply with `git apply --index` on a clean branch.',
      'Rollback branch state immediately if apply fails.',
    ],
    avoid: [
      'Retrying the same broken patch without a rollback.',
      'Applying to a dirty tracked worktree.',
    ],
    tags: ['git', 'patch', 'rollback'],
    source: 'slice-2-known-fixes',
  },
  {
    id: 'test-command-resolution-explicit-cwd',
    title: 'Resolve test commands from explicit repo-local context',
    pattern: 'Test command resolution',
    when: [
      'npm scripts differ by workspace',
      'A command must be executed from a known project root',
      'The test harness should avoid guessing the current folder',
    ],
    do: [
      'Resolve the intended cwd explicitly before running a command.',
      'Prefer repo-local scripts over ambient global tools.',
      'Capture stdout and stderr together for diagnostics.',
    ],
    avoid: [
      'Assuming the current shell directory is already the project root.',
      'Hiding command selection inside a string-built shell pipeline.',
    ],
    tags: ['tests', 'cwd', 'scripts'],
    source: 'slice-2-known-fixes',
  },
  {
    id: 'windows-subprocess-array-args',
    title: 'Use array args for Windows subprocesses',
    pattern: 'Windows subprocess weirdness',
    when: [
      'A Node or Python subprocess fails only on Windows',
      'The command mixes shell quoting with file paths',
      'Spawn or EPERM errors appear in a local run',
    ],
    do: [
      'Keep subprocess arguments structured instead of shell-joined.',
      'Prefer direct executable paths and explicit `cwd` values.',
      'Log the command shape before execution when debugging.',
    ],
    avoid: [
      'Feeding Windows commands through `cmd /c` unless there is no alternative.',
      'Assuming POSIX shell quoting rules apply on Windows.',
    ],
    tags: ['windows', 'subprocess', 'node', 'python'],
    source: 'slice-2-known-fixes',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function normalizeRelativePath(relativePath = '') {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();
}

function libraryDir(rootPath) {
  return path.join(rootPath || process.cwd(), KNOWN_FIXES_RELATIVE_DIR);
}

function libraryJsonPath(rootPath) {
  return path.join(libraryDir(rootPath), KNOWN_FIXES_JSON_NAME);
}

function libraryMarkdownPath(rootPath) {
  return path.join(libraryDir(rootPath), KNOWN_FIXES_MD_NAME);
}

function candidateLibraryJsonPath(rootPath) {
  return path.join(libraryDir(rootPath), KNOWN_FIXES_CANDIDATES_JSON_NAME);
}

function candidateLibraryMarkdownPath(rootPath) {
  return path.join(libraryDir(rootPath), KNOWN_FIXES_CANDIDATES_MD_NAME);
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeKnownFixEntry(entry = {}, fallback = {}) {
  const id = normalizeRelativePath(entry.id || fallback.id || '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .toLowerCase() || `known-fix-${fallback.index || 1}`;
  const title = String(entry.title || fallback.title || '').trim() || id;
  return {
    id,
    title,
    pattern: String(entry.pattern || fallback.pattern || '').trim() || title,
    when: uniqueStrings(Array.isArray(entry.when) ? entry.when : fallback.when || []).slice(0, 5),
    do: uniqueStrings(Array.isArray(entry.do) ? entry.do : fallback.do || []).slice(0, 5),
    avoid: uniqueStrings(Array.isArray(entry.avoid) ? entry.avoid : fallback.avoid || []).slice(0, 5),
    tags: uniqueStrings(Array.isArray(entry.tags) ? entry.tags : fallback.tags || []).slice(0, 8),
    source: String(entry.source || fallback.source || 'manual').trim() || 'manual',
    updatedAt: String(entry.updatedAt || fallback.updatedAt || nowIso()).trim(),
  };
}

function normalizeKnownFixLibrary(library = {}) {
  const normalized = Array.isArray(library.entries) ? library.entries : [];
  return {
    version: String(library.version || KNOWN_FIXES_VERSION).trim() || KNOWN_FIXES_VERSION,
    updatedAt: library.updatedAt || null,
    entries: normalized.map((entry, index) => normalizeKnownFixEntry(entry, { index: index + 1 })),
  };
}

function normalizeKnownFixCandidateEntry(entry = {}, fallback = {}) {
  const normalizedBase = normalizeKnownFixEntry(entry, fallback);
  const failureKey = normalizeRelativePath(entry.failureKey || fallback.failureKey || '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .toLowerCase();
  return {
    ...normalizedBase,
    id: normalizeRelativePath(entry.id || fallback.id || `candidate-${failureKey || normalizedBase.id}`)
      .replace(/[^a-z0-9._-]+/gi, '-')
      .toLowerCase(),
    status: 'candidate',
    failureKey: failureKey || null,
    count: Number(entry.count ?? fallback.count ?? entry.evidenceCount ?? fallback.evidenceCount ?? 0) || 0,
    firstSeen: String(entry.firstSeen || fallback.firstSeen || '').trim() || null,
    lastSeen: String(entry.lastSeen || fallback.lastSeen || '').trim() || null,
    exampleMessages: uniqueStrings(Array.isArray(entry.exampleMessages) ? entry.exampleMessages : fallback.exampleMessages || []).slice(0, 5),
    relatedTools: uniqueStrings(Array.isArray(entry.relatedTools) ? entry.relatedTools : fallback.relatedTools || []).slice(0, 5),
    relatedStages: uniqueStrings(Array.isArray(entry.relatedStages) ? entry.relatedStages : fallback.relatedStages || []).slice(0, 5),
    source: String(entry.source || fallback.source || 'failure-history').trim() || 'failure-history',
  };
}

function normalizeKnownFixCandidateLibrary(library = {}) {
  const normalized = Array.isArray(library.entries) ? library.entries : [];
  return {
    version: String(library.version || KNOWN_FIX_CANDIDATES_VERSION).trim() || KNOWN_FIX_CANDIDATES_VERSION,
    updatedAt: library.updatedAt || null,
    entries: normalized.map((entry, index) => normalizeKnownFixCandidateEntry(entry, { index: index + 1 })),
  };
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function ensureKnownFixLibrarySeed(rootPath) {
  const existing = readKnownFixLibrary(rootPath);
  if (existing.exists) return existing.library;
  const library = normalizeKnownFixLibrary({
    version: KNOWN_FIXES_VERSION,
    updatedAt: nowIso(),
    entries: DEFAULT_KNOWN_FIXES,
  });
  writeKnownFixLibrary(rootPath, library);
  return library;
}

function readKnownFixLibrary(rootPath) {
  const jsonPath = libraryJsonPath(rootPath);
  const markdownPath = libraryMarkdownPath(rootPath);
  if (!fs.existsSync(jsonPath) && !fs.existsSync(markdownPath)) {
    return {
      exists: false,
      jsonPath,
      markdownPath,
      library: normalizeKnownFixLibrary({
        version: KNOWN_FIXES_VERSION,
        updatedAt: null,
        entries: DEFAULT_KNOWN_FIXES,
      }),
    };
  }
  const parsed = normalizeKnownFixLibrary(readJson(jsonPath, {
    version: KNOWN_FIXES_VERSION,
    updatedAt: null,
    entries: DEFAULT_KNOWN_FIXES,
  }) || {});
  return {
    exists: true,
    jsonPath,
    markdownPath,
    library: parsed,
  };
}

function readKnownFixCandidates(rootPath) {
  const jsonPath = candidateLibraryJsonPath(rootPath);
  const markdownPath = candidateLibraryMarkdownPath(rootPath);
  if (!fs.existsSync(jsonPath) && !fs.existsSync(markdownPath)) {
    return {
      exists: false,
      jsonPath,
      markdownPath,
      library: normalizeKnownFixCandidateLibrary({
        version: KNOWN_FIX_CANDIDATES_VERSION,
        updatedAt: null,
        entries: [],
      }),
    };
  }
  const parsed = normalizeKnownFixCandidateLibrary(readJson(jsonPath, {
    version: KNOWN_FIX_CANDIDATES_VERSION,
    updatedAt: null,
    entries: [],
  }) || {});
  return {
    exists: true,
    jsonPath,
    markdownPath,
    library: parsed,
  };
}

function renderKnownFixEntry(entry = {}) {
  const lines = [
    `### ${entry.title || entry.id}`,
    `- Pattern: ${entry.pattern || entry.title || entry.id}`,
  ];
  if ((entry.when || []).length) {
    lines.push('- When:');
    entry.when.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.do || []).length) {
    lines.push('- Do:');
    entry.do.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.avoid || []).length) {
    lines.push('- Avoid:');
    entry.avoid.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.tags || []).length) {
    lines.push(`- Tags: ${entry.tags.join(', ')}`);
  }
  lines.push(`- Source: ${entry.source || 'manual'}`);
  return lines.join('\n');
}

function renderKnownFixCandidateEntry(entry = {}) {
  const lines = [
    `### ${entry.title || entry.id}`,
    `- Status: ${entry.status || 'candidate'}`,
    `- Failure key: ${entry.failureKey || entry.pattern || entry.id}`,
    `- Pattern: ${entry.pattern || entry.title || entry.id}`,
    `- Evidence count: ${entry.count || 0}`,
  ];
  if (entry.firstSeen) lines.push(`- First seen: ${entry.firstSeen}`);
  if (entry.lastSeen) lines.push(`- Last seen: ${entry.lastSeen}`);
  if ((entry.relatedTools || []).length) lines.push(`- Related tools: ${entry.relatedTools.join(', ')}`);
  if ((entry.relatedStages || []).length) lines.push(`- Related stages: ${entry.relatedStages.join(', ')}`);
  if ((entry.exampleMessages || []).length) {
    lines.push('- Example messages:');
    entry.exampleMessages.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.when || []).length) {
    lines.push('- When:');
    entry.when.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.do || []).length) {
    lines.push('- Do:');
    entry.do.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.avoid || []).length) {
    lines.push('- Avoid:');
    entry.avoid.forEach((item) => lines.push(`  - ${item}`));
  }
  if ((entry.tags || []).length) {
    lines.push(`- Tags: ${entry.tags.join(', ')}`);
  }
  lines.push(`- Source: ${entry.source || 'failure-history'}`);
  return lines.join('\n');
}

function renderKnownFixLibraryMarkdown(library = {}) {
  const normalized = normalizeKnownFixLibrary(library);
  const lines = [
    '# Known Fixes Library',
    '',
    'Tiny, trusted fix patterns ACE can include in prompts before solving a familiar failure mode.',
    '',
    `Version: ${normalized.version}`,
    `Updated: ${normalized.updatedAt || nowIso()}`,
    '',
  ];
  normalized.entries.forEach((entry) => {
    lines.push(renderKnownFixEntry(entry));
    lines.push('');
  });
  return lines.join('\n').trimEnd() + '\n';
}

function renderKnownFixCandidatesMarkdown(library = {}) {
  const normalized = normalizeKnownFixCandidateLibrary(library);
  const lines = [
    '# Candidate Known Fixes',
    '',
    'Review-only proposals promoted from repeated failures. These are not prompt-fed by default.',
    '',
    `Version: ${normalized.version}`,
    `Updated: ${normalized.updatedAt || nowIso()}`,
    '',
  ];
  if (!normalized.entries.length) {
    lines.push('- (none yet)');
  } else {
    normalized.entries.forEach((entry) => {
      lines.push(renderKnownFixCandidateEntry(entry));
      lines.push('');
    });
  }
  return lines.join('\n').trimEnd() + '\n';
}

function writeKnownFixLibrary(rootPath, library = {}) {
  const normalized = normalizeKnownFixLibrary({
    ...library,
    updatedAt: nowIso(),
  });
  writeJson(libraryJsonPath(rootPath), normalized);
  fs.writeFileSync(libraryMarkdownPath(rootPath), renderKnownFixLibraryMarkdown(normalized), 'utf8');
  return normalized;
}

function writeKnownFixCandidates(rootPath, library = {}) {
  const normalized = normalizeKnownFixCandidateLibrary({
    ...library,
    updatedAt: nowIso(),
  });
  writeJson(candidateLibraryJsonPath(rootPath), normalized);
  fs.writeFileSync(candidateLibraryMarkdownPath(rootPath), renderKnownFixCandidatesMarkdown(normalized), 'utf8');
  return normalized;
}

function upsertKnownFix(rootPath, entry = {}) {
  const current = readKnownFixLibrary(rootPath).library;
  const normalizedEntry = normalizeKnownFixEntry(entry, {
    updatedAt: nowIso(),
  });
  const nextEntries = [...current.entries];
  const existingIndex = nextEntries.findIndex((item) => item.id === normalizedEntry.id);
  if (existingIndex >= 0) {
    nextEntries[existingIndex] = normalizedEntry;
  } else {
    nextEntries.unshift(normalizedEntry);
  }
  return writeKnownFixLibrary(rootPath, {
    version: KNOWN_FIXES_VERSION,
    updatedAt: nowIso(),
    entries: nextEntries,
  });
}

function upsertKnownFixCandidate(rootPath, entry = {}) {
  const current = readKnownFixCandidates(rootPath).library;
  const normalizedEntry = normalizeKnownFixCandidateEntry(entry, {
    updatedAt: nowIso(),
  });
  const nextEntries = [...current.entries];
  const existingIndex = nextEntries.findIndex((item) => item.id === normalizedEntry.id || item.failureKey === normalizedEntry.failureKey);
  if (existingIndex >= 0) {
    nextEntries[existingIndex] = normalizedEntry;
  } else {
    nextEntries.unshift(normalizedEntry);
  }
  return writeKnownFixCandidates(rootPath, {
    version: KNOWN_FIX_CANDIDATES_VERSION,
    updatedAt: nowIso(),
    entries: nextEntries,
  });
}

function buildKnownFixCandidateEntryFromFailureRecord(record = {}) {
  const failureKey = String(record.failureKey || record.failure_key || '').trim().toLowerCase() || 'unknown_failure';
  const templates = {
    windows_spawn_eperm: {
      title: 'Quote Windows subprocess arguments cleanly',
      pattern: 'Windows subprocess weirdness',
      when: [
        'Node or Python subprocesses fail only on Windows.',
        'The failure includes spawn EPERM or similar access denied output.',
      ],
      do: [
        'Pass subprocess arguments as arrays.',
        'Prefer direct executables and explicit cwd values.',
        'Avoid shell-joined commands unless unavoidable.',
      ],
      avoid: [
        'String-built shell pipelines for subprocess execution.',
        'POSIX quoting assumptions on Windows.',
      ],
      tags: ['windows', 'subprocess', 'node'],
    },
    ollama_unreachable: {
      title: 'Treat Ollama connectivity as a preflight dependency',
      pattern: 'Ollama unreachable',
      when: [
        'Context generation cannot reach the local Ollama service.',
        'The failure mentions unreachable, refused, timeout, or connection reset.',
      ],
      do: [
        'Check that Ollama is running before LLM work starts.',
        'Keep the backend and host explicit in the task payload.',
        'Fail fast with a deterministic connectivity message.',
      ],
      avoid: [
        'Retrying model calls without confirming service reachability.',
      ],
      tags: ['llm', 'ollama', 'connectivity'],
    },
    git_apply_check_failed: {
      title: 'Rebuild or rebase a patch that no longer applies cleanly',
      pattern: 'Git apply check failed',
      when: [
        'A patch no longer matches the current tree.',
        'git apply reports check failure or rejected hunks.',
      ],
      do: [
        'Recompute the diff against the current tree.',
        'Confirm the task folder still matches the target branch.',
        'Apply only after the patch has been regenerated or refreshed.',
      ],
      avoid: [
        'Retrying the same stale patch without refreshing it.',
      ],
      tags: ['git', 'patch', 'apply'],
    },
    dirty_repo_blocked: {
      title: 'Keep apply and build stages off dirty repositories',
      pattern: 'Dirty repo blocked',
      when: [
        'Tracked edits already exist before apply starts.',
        'The repo cleanliness check blocks the operation.',
      ],
      do: [
        'Clean or isolate the worktree before rebuilding.',
        'Preserve the current task artifacts and stop early.',
      ],
      avoid: [
        'Applying a new patch on top of unreviewed tracked edits.',
      ],
      tags: ['git', 'repository', 'safety'],
    },
    invalid_patch_diff: {
      title: 'Regenerate invalid or malformed patch diffs',
      pattern: 'Invalid patch diff',
      when: [
        'A diff is empty, malformed, or cannot be parsed.',
        'Patch generation produced unusable output.',
      ],
      do: [
        'Regenerate the patch from the current plan and context.',
        'Validate the diff before handing it to apply.',
      ],
      avoid: [
        'Treating a broken diff as reusable cache.',
      ],
      tags: ['patch', 'validation', 'cache'],
    },
    missing_project_key: {
      title: 'Resolve the project key before invoking expensive work',
      pattern: 'Missing project key',
      when: [
        'A task or worker cannot map a project key to a project path.',
        'The preflight fails before model execution.',
      ],
      do: [
        'Resolve the key to a concrete repo-local project path first.',
        'Block the expensive stage until the project target is known.',
      ],
      avoid: [
        'Guessing the project target from the current shell context.',
      ],
      tags: ['project', 'preflight', 'routing'],
    },
  };
  const template = templates[failureKey] || {
    title: `Review repeated ${failureKey.replace(/_/g, ' ')}`,
    pattern: failureKey,
    when: [
      'The same failure key has repeated enough to cross the proposal threshold.',
    ],
    do: [
      'Review the stored examples and decide whether a trusted fix should be added later.',
    ],
    avoid: [
      'Auto-promoting the candidate into the trusted library.',
    ],
    tags: ['candidate', 'review'],
  };
  return normalizeKnownFixCandidateEntry({
    id: `candidate-${failureKey}`,
    title: template.title,
    pattern: template.pattern,
    when: template.when,
    do: template.do,
    avoid: template.avoid,
    tags: template.tags,
    source: 'failure-history',
    failureKey,
    count: Number(record.count || 0),
    firstSeen: record.first_seen || record.firstSeen || null,
    lastSeen: record.last_seen || record.lastSeen || null,
    exampleMessages: Array.isArray(record.example_messages) ? record.example_messages : (record.exampleMessages || []),
    relatedTools: Array.isArray(record.related_tools) ? record.related_tools : (record.relatedTools || []),
    relatedStages: Array.isArray(record.related_stages) ? record.related_stages : (record.relatedStages || []),
    updatedAt: nowIso(),
  }, {
    failureKey,
    source: 'failure-history',
  });
}

function buildKnownFixCandidatePromptSection(rootPath, { limit = 3 } = {}) {
  const candidates = readKnownFixCandidates(rootPath).library.entries.slice(0, limit);
  if (!candidates.length) {
    return '## Candidate Fixes\nNo review-only candidates yet.';
  }
  const lines = ['## Candidate Fixes', 'Review-only. Not injected into normal worker prompts by default.'];
  candidates.forEach((entry) => {
    lines.push(`- ${entry.title}: ${entry.pattern}`);
    if ((entry.do || []).length) lines.push(`  - Do: ${entry.do.join(' | ')}`);
    if ((entry.avoid || []).length) lines.push(`  - Avoid: ${entry.avoid.join(' | ')}`);
  });
  return lines.join('\n');
}

function buildKnownFixesPromptSection(rootPath, { limit = 5, includeCandidates = false, candidateLimit = 3 } = {}) {
  const library = ensureKnownFixLibrarySeed(rootPath);
  const entries = (library.entries || []).slice(0, limit);
  const candidateSection = includeCandidates ? buildKnownFixCandidatePromptSection(rootPath, { limit: candidateLimit }) : '';
  if (!entries.length) {
    return candidateSection ? `## Known Fixes Library\nNo entries yet.\n\n${candidateSection}` : '## Known Fixes Library\nNo entries yet.';
  }
  const lines = ['## Known Fixes Library'];
  lines.push('Use these trusted fix patterns first when the same failure shape returns.');
  entries.forEach((entry) => {
    lines.push(`- ${entry.title}: ${entry.pattern}`);
    if ((entry.do || []).length) lines.push(`  - Do: ${entry.do.join(' | ')}`);
    if ((entry.avoid || []).length) lines.push(`  - Avoid: ${entry.avoid.join(' | ')}`);
  });
  if (candidateSection) {
    lines.push('', candidateSection);
  }
  return lines.join('\n');
}

module.exports = {
  DEFAULT_KNOWN_FIXES,
  KNOWN_FIXES_CANDIDATES_JSON_NAME,
  KNOWN_FIXES_CANDIDATES_MD_NAME,
  KNOWN_FIXES_JSON_NAME,
  KNOWN_FIXES_MD_NAME,
  KNOWN_FIXES_RELATIVE_DIR,
  KNOWN_FIXES_VERSION,
  KNOWN_FIX_CANDIDATES_VERSION,
  buildKnownFixCandidateEntryFromFailureRecord,
  buildKnownFixCandidatePromptSection,
  buildKnownFixesPromptSection,
  candidateLibraryJsonPath,
  candidateLibraryMarkdownPath,
  ensureKnownFixLibrarySeed,
  libraryJsonPath,
  libraryMarkdownPath,
  normalizeKnownFixEntry,
  normalizeKnownFixCandidateEntry,
  normalizeKnownFixCandidateLibrary,
  normalizeKnownFixLibrary,
  readKnownFixLibrary,
  readKnownFixCandidates,
  renderKnownFixLibraryMarkdown,
  renderKnownFixCandidatesMarkdown,
  upsertKnownFix,
  upsertKnownFixCandidate,
  writeKnownFixCandidates,
  writeKnownFixLibrary,
};
