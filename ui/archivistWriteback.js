const fs = require('fs');
const path = require('path');
const { buildTasksCompatibilityStub, DEFAULT_DOMAIN_KEY, readSliceStore } = require('./sliceRepository');
const { listQARuns, summarizeQARun } = require('./qaRunner');
const { listThroughputSessions, summarizeSession } = require('./throughputDebug');
const { upsertArchivistWritebackBlock } = require('./archivistWritebackMarkers');
const { refreshCandidateKnownFixesFromFailureHistory, summarizeFailureHistory } = require('./failureMemory');

const RECENT_THROUGHPUT_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;
const ARCHIVIST_CONTEXT_BUNDLE_BASENAME = 'archivist_context_bundle';
const ARCHIVIST_CONTEXT_BUNDLE_DIR = path.join('brain', 'context');
const ARCHIVIST_CONTEXT_BUNDLE_PATHS = [
  path.join(ARCHIVIST_CONTEXT_BUNDLE_DIR, `${ARCHIVIST_CONTEXT_BUNDLE_BASENAME}.md`),
  path.join(ARCHIVIST_CONTEXT_BUNDLE_DIR, `${ARCHIVIST_CONTEXT_BUNDLE_BASENAME}.json`),
];
const FAILURE_HISTORY_DOCS = [
  path.join('brain', 'context', 'failure_history.md'),
  path.join('brain', 'context', 'failure_history.json'),
  path.join('brain', 'context', 'known_fixes_candidates.md'),
  path.join('brain', 'context', 'known_fixes_candidates.json'),
];
const CONTEXT_TREE_SKIP_DIRS = new Set([
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  'node_modules',
  'Binaries',
  'Intermediate',
  'Saved',
  'DerivedDataCache',
  '.mypy_cache',
  '.pytest_cache',
  '.idea',
  '.vscode',
]);
const CANONICAL_CONTEXT_DOCS = [
  path.join('brain', 'emergence', 'project_brain.md'),
  path.join('brain', 'emergence', 'roadmap.md'),
  path.join('brain', 'emergence', 'plan.md'),
  path.join('brain', 'emergence', 'tasks.md'),
  path.join('brain', 'emergence', 'decisions.md'),
  path.join('brain', 'emergence', 'changelog.md'),
  path.join('brain', 'emergence', 'slices.md'),
  path.join('brain', 'context', 'next_slice.md'),
  path.join('brain', 'context', 'recent_change_digest.md'),
  ...FAILURE_HISTORY_DOCS,
  path.join('brain', 'context', 'ui_backend_drift.md'),
  'README_CORE.md',
  'AGENTS.md',
  'targets.json',
  'projects.json',
];

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function workspacePath(rootPath) {
  return path.join(rootPath, 'data', 'spatial', 'workspace.json');
}

function changelogPaths(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return [
    path.join(rootPath, 'brain', domainKey, 'changelog.md'),
    path.join(rootPath, 'projects', domainKey, 'changelog.md'),
  ];
}

function tasksPaths(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return [
    path.join(rootPath, 'brain', domainKey, 'tasks.md'),
    path.join(rootPath, 'projects', domainKey, 'tasks.md'),
  ];
}

function contextBundlePaths(rootPath) {
  return ARCHIVIST_CONTEXT_BUNDLE_PATHS.map((relativePath) => path.join(rootPath, relativePath));
}

function ledgerDir(rootPath, agentId = 'dave') {
  return path.join(rootPath, 'data', 'spatial', 'learning-ledger', agentId);
}

function readWorkspace(rootPath) {
  return readJson(workspacePath(rootPath), {}) || {};
}

function countItems(value) {
  return Array.isArray(value) ? value.length : 0;
}

function firstLine(value = '') {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function truncate(value = '', limit = 120) {
  const text = String(value || '').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}...`;
}

function relativePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).replace(/\\/g, '/');
}

function normalizeWorkspacePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/{2,}/g, '/');
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function shouldSkipTreeEntry(entryName) {
  return CONTEXT_TREE_SKIP_DIRS.has(entryName);
}

function buildRepoTreePreview(rootPath, depth = 2, maxEntries = 160) {
  const root = path.resolve(rootPath);
  const out = [path.basename(root) + '/'];
  let count = 0;

  function walk(dirPath, prefix, remainingDepth) {
    if (count >= maxEntries) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    entries
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
        return left.name.localeCompare(right.name);
      })
      .forEach((entry) => {
        if (count >= maxEntries) return;
        if (shouldSkipTreeEntry(entry.name)) return;
        out.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`);
        count += 1;
        if (entry.isDirectory() && remainingDepth > 0) {
          walk(path.join(dirPath, entry.name), `${prefix}  `, remainingDepth - 1);
        }
      });
  }

  walk(root, '  ', depth);
  if (count >= maxEntries) out.push('  ... (truncated)');
  return out.join('\n');
}

function findTaskDir(rootPath, taskId) {
  const normalized = String(taskId || '').trim();
  if (!normalized) return null;
  const tasksRoot = path.join(rootPath, 'work', 'tasks');
  if (!fs.existsSync(tasksRoot)) return null;
  const prefix = /^\d+$/.test(normalized) ? normalized.padStart(4, '0') : normalized.slice(0, 4);
  const matches = fs.readdirSync(tasksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${prefix}-`))
    .map((entry) => path.join(tasksRoot, entry.name));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    return matches.sort((left, right) => left.localeCompare(right))[0];
  }
  const direct = path.join(tasksRoot, prefix);
  return fs.existsSync(direct) ? direct : null;
}

function selectActiveSlice(snapshot = {}) {
  const slices = Array.isArray(snapshot?.slices?.store?.slices) ? snapshot.slices.store.slices : [];
  return slices.find((slice) => String(slice?.status || '').toLowerCase() === 'active')
    || slices.find((slice) => String(slice?.status || '').toLowerCase() !== 'binned')
    || null;
}

function extractAcceptanceCriteria(planText = '') {
  const lines = String(planText || '').split(/\r?\n/);
  const criteria = [];
  let inSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = /^#{2,6}\s+(.+?)\s*$/.exec(line.trim());
    if (headingMatch) {
      const heading = headingMatch[1].toLowerCase();
      if (inSection && heading !== 'acceptance criteria') break;
      inSection = heading === 'acceptance criteria';
      continue;
    }
    if (!inSection) continue;
    const cleaned = line.replace(/^\s*[-*]\s+\[.\]\s*/, '').replace(/^\s*[-*]\s+/, '').trim();
    if (cleaned) criteria.push(cleaned);
  }
  return criteria;
}

function readTaskBundle(rootPath, snapshot = {}) {
  const activeSlice = selectActiveSlice(snapshot);
  const taskId = activeSlice?.runnerTaskId || activeSlice?.builderTaskId || activeSlice?.id || null;
  const taskDir = taskId ? findTaskDir(rootPath, taskId) : null;
  const metaPath = taskDir ? path.join(taskDir, 'meta.json') : null;
  const planPath = taskDir ? path.join(taskDir, 'plan.md') : null;
  const meta = metaPath ? safeReadJson(metaPath, {}) || {} : {};
  const planText = planPath && fs.existsSync(planPath) ? readText(planPath, '') : '';
  const acceptanceCriteria = extractAcceptanceCriteria(planText);
  return {
    activeSlice: activeSlice ? {
      id: activeSlice.id || null,
      title: activeSlice.title || '',
      status: activeSlice.status || '',
      phase: activeSlice.phase || activeSlice.taskFlow?.phase || '',
      owner: activeSlice.taskFlow?.ownerDeskId || null,
      assignee: activeSlice.taskFlow?.assigneeDeskId || null,
      targetProjectKey: activeSlice.targetProjectKey || null,
      taskId: taskId || null,
    } : null,
    taskDir: taskDir ? relativePath(rootPath, taskDir) : null,
    taskMeta: meta,
    acceptanceCriteria,
    planPath: planPath ? relativePath(rootPath, planPath) : null,
    metaPath: metaPath ? relativePath(rootPath, metaPath) : null,
    contextFiles: taskDir ? [
      metaPath,
      planPath,
      path.join(taskDir, 'context.md'),
      path.join(taskDir, 'intent_handoff.json'),
      path.join(taskDir, 'patch.diff'),
    ].filter((filePath) => filePath && fs.existsSync(filePath)).map((filePath) => relativePath(rootPath, filePath)) : [],
  };
}

function buildContextWindowSets(rootPath, taskBundle = {}) {
  const tier1 = [
    ...(taskBundle.contextFiles || []),
    ...(taskBundle.planPath ? [taskBundle.planPath] : []),
    'brain/emergence/plan.md',
    'brain/emergence/tasks.md',
  ];
  const tier2 = [
    ...CANONICAL_CONTEXT_DOCS.filter((filePath) => normalizeWorkspacePath(filePath).startsWith('brain/emergence/') || normalizeWorkspacePath(filePath).startsWith('brain/context/')),
    'README_CORE.md',
    'AGENTS.md',
  ];
  const tier3 = [
    'targets.json',
    'projects.json',
    'work/tasks/',
    'runtime/',
    'data/spatial/',
  ];

  return {
    tier1: [...new Set(tier1.filter(Boolean).map(normalizeWorkspacePath))],
    tier2: [...new Set(tier2.filter(Boolean).map(normalizeWorkspacePath))],
    tier3: [...new Set(tier3.filter(Boolean).map(normalizeWorkspacePath))],
  };
}

function buildDocumentTrustReport(rootPath, taskBundle = {}) {
  const selectedDocs = [
    ...CANONICAL_CONTEXT_DOCS,
    ...(taskBundle.contextFiles || []),
  ];
  const seen = new Set();
  const documents = [];
  let newestModifiedAt = null;

  selectedDocs.forEach((relativeFile) => {
    const normalized = String(relativeFile || '').replace(/\\/g, '/');
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    const absolute = path.join(rootPath, normalized);
    const exists = fs.existsSync(absolute);
    const stat = exists ? fs.statSync(absolute) : null;
    const modifiedAt = stat ? stat.mtime.toISOString() : null;
    if (modifiedAt && (!newestModifiedAt || modifiedAt > newestModifiedAt)) {
      newestModifiedAt = modifiedAt;
    }
    const ageHours = stat ? Math.max(0, (Date.now() - stat.mtimeMs) / (1000 * 60 * 60)) : null;
    const isCanonicalBrain = normalized.startsWith('brain/emergence/');
    const isPlannerFuel = normalized.startsWith('brain/context/');
    const isTaskArtifact = normalized.startsWith('work/tasks/');
    documents.push({
      path: normalized,
      exists,
      role: isCanonicalBrain ? 'canonical' : (isPlannerFuel ? 'planner-context' : (isTaskArtifact ? 'task-artifact' : 'support')),
      modifiedAt,
      ageHours: ageHours == null ? null : Number(ageHours.toFixed(1)),
      staleCandidate: Boolean(exists && ageHours != null && ageHours > 24 * 14 && (isCanonicalBrain || isPlannerFuel)),
      redundantCandidate: Boolean(exists && /deprecated compatibility view/i.test(fs.readFileSync(absolute, 'utf8'))),
    });
  });

  return {
    documents,
    newestModifiedAt,
    missingCount: documents.filter((doc) => !doc.exists).length,
    staleCandidateCount: documents.filter((doc) => doc.staleCandidate).length,
    redundantCandidateCount: documents.filter((doc) => doc.redundantCandidate).length,
  };
}

function buildArchivistContextBundle(rootPath, snapshot = {}, options = {}) {
  const taskBundle = readTaskBundle(rootPath, snapshot);
  const repoTree = buildRepoTreePreview(rootPath, options.treeDepth || 2, options.maxTreeEntries || 160);
  const targetFiles = [
    ...new Set([
      ...CANONICAL_CONTEXT_DOCS,
      ...(taskBundle.contextFiles || []),
      ...(taskBundle.taskDir ? [taskBundle.taskDir] : []),
    ].map(normalizeWorkspacePath)),
  ];
  const contextWindows = buildContextWindowSets(rootPath, taskBundle);
  const trust = buildDocumentTrustReport(rootPath, taskBundle);
  return {
    generatedAt: snapshot.generatedAt || nowIso(),
    summary: snapshot.summary || '',
    repoRoot: path.resolve(rootPath),
    repoTree,
    targetFiles,
    taskMetadata: taskBundle,
    acceptanceCriteria: taskBundle.acceptanceCriteria,
    contextWindows,
    trust,
    readOnlyTargets: [
      ...contextWindows.tier2,
      ...contextWindows.tier3,
    ].filter((value) => value && !value.startsWith('work/tasks/')),
    validatedLoop: {
      enabled: true,
      note: 'Archivist writes the bundle locally, marks freshness, and keeps canonical brain docs read-mostly.',
    },
  };
}

function renderArchivistContextBundle(bundle = {}) {
  const lines = [
    '# Archivist Context Bundle',
    '',
    `Generated: ${bundle.generatedAt || nowIso()}`,
    '',
    '## Repo Tree',
    '```',
    bundle.repoTree || '(unavailable)',
    '```',
    '',
    '## Target Files',
    ...(bundle.targetFiles || []).map((filePath) => `- ${filePath}`),
    '',
    '## Task Metadata',
    '```json',
    JSON.stringify(bundle.taskMetadata || {}, null, 2),
    '```',
    '',
    '## Acceptance Criteria',
    ...(Array.isArray(bundle.acceptanceCriteria) && bundle.acceptanceCriteria.length
      ? bundle.acceptanceCriteria.map((criterion) => `- ${criterion}`)
      : ['- (none found)']),
    '',
    '## Context Windows',
    '### Tier 1',
    ...(bundle.contextWindows?.tier1 || []).map((filePath) => `- ${filePath}`),
    '### Tier 2',
    ...(bundle.contextWindows?.tier2 || []).map((filePath) => `- ${filePath}`),
    '### Tier 3',
    ...(bundle.contextWindows?.tier3 || []).map((filePath) => `- ${filePath}`),
    '',
    '## Trust Signals',
    '```json',
    JSON.stringify(bundle.trust || {}, null, 2),
    '```',
    '',
    '## Validated Loop',
    `- ${bundle.validatedLoop?.note || 'Archivist keeps the bundle local and validated.'}`,
  ];
  return lines.join('\n').trim() + '\n';
}

function isoDateOnly(value = '') {
  const timestamp = String(value || '').trim();
  if (!timestamp) return nowIso().slice(0, 10);
  return timestamp.slice(0, 10);
}

function normalizeWorkspaceSummary(workspace = {}) {
  const graph = workspace.graph || workspace.graphs?.system || {};
  const teamBoard = workspace?.studio?.teamBoard || {};
  return {
    activePageId: workspace.activePageId || null,
    nodeCount: countItems(graph.nodes),
    edgeCount: countItems(graph.edges),
    annotationCount: countItems(workspace.annotations),
    sketchCount: countItems(workspace.sketches),
    teamBoardCardCount: countItems(teamBoard.cards),
    teamBoardSummary: teamBoard.summary && typeof teamBoard.summary === 'object' ? teamBoard.summary : {},
    teamBoardUpdatedAt: teamBoard.updatedAt || null,
  };
}

function normalizeSliceSummary(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  const store = readSliceStore(rootPath, domainKey).store;
  const activeSlices = (store.slices || []).filter((slice) => slice.status !== 'binned');
  return {
    updatedAt: store.updatedAt || null,
    activeCount: activeSlices.length,
    activeTitles: activeSlices.slice(0, 3).map((slice) => slice.title),
    store,
  };
}

function normalizeQASummary(rootPath) {
  const latest = summarizeQARun(listQARuns(rootPath)[0] || null);
  if (!latest) return null;
  const fullRun = readJson(path.join(rootPath, 'data', 'spatial', 'qa', `${latest.id}.json`), {});
  const findingSummary = latest.findingCount
    ? `${latest.findingCount} findings (${latest.highestSeverity || 'info'})`
    : '';
  return {
    ...latest,
    errorLine: truncate(firstLine(fullRun.error || fullRun.steps?.find((step) => step?.error)?.error || '')),
    findingSummary,
  };
}

function normalizeThroughputSummary(rootPath, nowValue = nowIso()) {
  const latest = summarizeSession(listThroughputSessions(rootPath)[0] || null);
  if (!latest) return null;
  const finishedAt = latest.finishedAt || latest.createdAt || null;
  const ageMs = finishedAt ? (Date.parse(nowValue) - Date.parse(finishedAt)) : Number.POSITIVE_INFINITY;
  return {
    ...latest,
    recent: Number.isFinite(ageMs) && ageMs <= RECENT_THROUGHPUT_WINDOW_MS,
    ageMs,
  };
}

function normalizeLedgerSummary(rootPath, agentId = 'dave') {
  const dir = ledgerDir(rootPath, agentId);
  if (!fs.existsSync(dir)) {
    return {
      agentId,
      entryCount: 0,
      failedCount: 0,
      approvedFixCount: 0,
      datasetReadyCount: 0,
      latestTimestamp: null,
    };
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(dir, entry.name), null))
    .filter(Boolean)
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')));
  return {
    agentId,
    entryCount: entries.length,
    failedCount: entries.filter((entry) => String(entry.responseStatus || '').trim() !== 'live').length,
    approvedFixCount: entries.filter((entry) => Boolean(entry.approvedFix)).length,
    datasetReadyCount: entries.filter((entry) => Boolean(entry.datasetReady)).length,
    latestTimestamp: entries[0]?.timestamp || null,
  };
}

function buildSliceSeeds(snapshot) {
  const cues = [];
  if (!snapshot.slices.activeCount && snapshot.qa?.status === 'failed') {
    cues.push(`Capture the latest QA failure as a bounded slice: ${snapshot.qa.scenario || 'studio-smoke'} is blocked by ${snapshot.qa.errorLine || snapshot.qa.findingSummary || 'an unresolved runtime issue'}.`);
  }
  if (!snapshot.slices.activeCount && !snapshot.workspace.teamBoardCardCount) {
    cues.push('Seed the next slice directly from the next planner/context handoff so `slices.md` stops reporting an empty backlog.');
  }
  if (!snapshot.ledger.entryCount) {
    cues.push('Record the next failed or approved Dave run into the learning ledger so archive summaries have operational evidence.');
  }
  return cues.slice(0, 2);
}

function buildSessionSummary(snapshot) {
  const base = `Spatial page ${snapshot.workspace.activePageId || 'unknown'} has ${snapshot.workspace.nodeCount} nodes / ${snapshot.workspace.edgeCount} edges, ${snapshot.workspace.teamBoardCardCount} team-board cards, and ${snapshot.slices.activeCount} active slices.`;
  if (snapshot.qa) {
    const qaDetail = snapshot.qa.errorLine || snapshot.qa.findingSummary || '';
    return `${base} Latest QA ${snapshot.qa.id} ${snapshot.qa.verdict || snapshot.qa.status} for ${snapshot.qa.scenario || 'unknown'}${qaDetail ? `: ${qaDetail}` : '.'}`;
  }
  return base;
}

function buildArchivistSessionSnapshot(rootPath, options = {}) {
  const generatedAt = options.now || nowIso();
  const domainKey = options.domainKey || DEFAULT_DOMAIN_KEY;
  const workspace = options.workspace || readWorkspace(rootPath);
  const snapshot = {
    generatedAt,
    domainKey,
    workspace: normalizeWorkspaceSummary(workspace),
    slices: normalizeSliceSummary(rootPath, domainKey),
    qa: normalizeQASummary(rootPath),
    throughput: normalizeThroughputSummary(rootPath, generatedAt),
    ledger: normalizeLedgerSummary(rootPath, 'dave'),
  };
  snapshot.sliceSeeds = buildSliceSeeds(snapshot);
  snapshot.summary = buildSessionSummary(snapshot);
  return snapshot;
}

function changelogWritebackLines(snapshot) {
  const lines = [
    '- Synced repo docs from the live spatial runtime snapshot.',
    `- Runtime snapshot: page \`${snapshot.workspace.activePageId || 'unknown'}\` has ${snapshot.workspace.nodeCount} nodes / ${snapshot.workspace.edgeCount} edges; team board has ${snapshot.workspace.teamBoardCardCount} cards and \`slices.md\` reports ${snapshot.slices.activeCount} active slices.`,
  ];
  if (snapshot.qa) {
    const qaDetail = snapshot.qa.errorLine || snapshot.qa.findingSummary || '';
    lines.push(`- Latest QA evidence: \`${snapshot.qa.id}\` (${snapshot.qa.scenario || 'unknown'}) ${snapshot.qa.verdict || snapshot.qa.status}${snapshot.qa.finishedAt ? ` at ${snapshot.qa.finishedAt}` : ''}${qaDetail ? `; ${qaDetail}` : ''}.`);
  }
  if (!snapshot.slices.activeCount && !snapshot.workspace.teamBoardCardCount) {
    lines.push('- No active slices or team-board cards are currently recorded, so the backlog still needs its next bounded seed.');
  } else if (snapshot.slices.activeTitles.length) {
    lines.push(`- Active slice focus: ${snapshot.slices.activeTitles.join(', ')}.`);
  }
  return lines;
}

function tasksWritebackLines(snapshot) {
  const lines = [
    '## Latest Session Snapshot',
    '',
    `Generated: ${snapshot.generatedAt}`,
    '',
    `- Active slices: ${snapshot.slices.activeCount}`,
    `- Team-board cards: ${snapshot.workspace.teamBoardCardCount}`,
    `- Workspace graph: ${snapshot.workspace.nodeCount} nodes / ${snapshot.workspace.edgeCount} edges on page \`${snapshot.workspace.activePageId || 'unknown'}\``,
    `- Dave ledger entries: ${snapshot.ledger.entryCount}`,
  ];
  if (snapshot.qa) {
    const qaDetail = snapshot.qa.errorLine || snapshot.qa.findingSummary || '';
    lines.push(`- Latest QA: \`${snapshot.qa.id}\` (${snapshot.qa.scenario || 'unknown'}) ${snapshot.qa.verdict || snapshot.qa.status}${qaDetail ? `: ${qaDetail}` : ''}`);
  }
  if (snapshot.throughput?.recent) {
    lines.push(`- Recent throughput session: \`${snapshot.throughput.id}\` ${snapshot.throughput.verdict || snapshot.throughput.status}`);
  }
  if (snapshot.sliceSeeds.length) {
    lines.push('', '## Suggested Slice Seeds', '');
    snapshot.sliceSeeds.forEach((line) => lines.push(`- ${line}`));
  }
  return lines;
}

function applyArchivistWriteback(rootPath, options = {}) {
  const snapshot = buildArchivistSessionSnapshot(rootPath, options);
  const failureReview = refreshCandidateKnownFixesFromFailureHistory(rootPath);
  const includeTasks = options.includeTasks !== false;
  const changelogDate = isoDateOnly(snapshot.generatedAt);
  const changelogHeading = `## ${changelogDate}`;
  const changelogLines = changelogWritebackLines(snapshot);
  const tasksLines = tasksWritebackLines(snapshot);
  const contextBundle = buildArchivistContextBundle(rootPath, snapshot, options);
  const contextBundleDocument = renderArchivistContextBundle(contextBundle);
  const changelogEntry = upsertArchivistWritebackBlock('', changelogLines, { sectionHeading: changelogHeading }).trim();
  const tasksBlock = includeTasks ? upsertArchivistWritebackBlock('', tasksLines).trim() : '';
  const tasksDocument = includeTasks ? buildTasksCompatibilityStub(snapshot.domainKey, { generatedBlock: tasksBlock }) : '';
  const writes = {
    changelog: changelogPaths(rootPath, snapshot.domainKey),
    tasks: includeTasks ? tasksPaths(rootPath, snapshot.domainKey) : [],
    contextBundle: contextBundlePaths(rootPath),
  };

  if (!options.dryRun) {
    writes.changelog.forEach((filePath) => {
      const nextText = upsertArchivistWritebackBlock(readText(filePath, '# Changelog\n'), changelogLines, { sectionHeading: changelogHeading });
      writeText(filePath, nextText);
    });
    if (includeTasks) {
      writes.tasks.forEach((filePath) => {
        writeText(filePath, tasksDocument);
      });
    }
    writeText(writes.contextBundle[0], contextBundleDocument);
    writeText(writes.contextBundle[1], `${JSON.stringify(contextBundle, null, 2)}\n`);
  }

  return {
    generatedAt: snapshot.generatedAt,
    summary: snapshot.summary,
    snapshot,
    failureReview: {
      ...failureReview,
      summary: summarizeFailureHistory(rootPath),
    },
    contextBundle,
    contextBundleDocument,
    changelogEntry,
    tasksDocument,
    writes,
  };
}

module.exports = {
  applyArchivistWriteback,
  buildArchivistSessionSnapshot,
  buildArchivistContextBundle,
  changelogWritebackLines,
  contextBundlePaths,
  renderArchivistContextBundle,
  tasksWritebackLines,
};
