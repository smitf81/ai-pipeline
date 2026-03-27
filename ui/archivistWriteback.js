const fs = require('fs');
const path = require('path');
const { buildTasksCompatibilityStub, DEFAULT_DOMAIN_KEY, readSliceStore } = require('./sliceRepository');
const { listQARuns, summarizeQARun } = require('./qaRunner');
const { listThroughputSessions, summarizeSession } = require('./throughputDebug');
const { upsertArchivistWritebackBlock } = require('./archivistWritebackMarkers');

const RECENT_THROUGHPUT_WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

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
  const includeTasks = options.includeTasks !== false;
  const changelogDate = isoDateOnly(snapshot.generatedAt);
  const changelogHeading = `## ${changelogDate}`;
  const changelogLines = changelogWritebackLines(snapshot);
  const tasksLines = tasksWritebackLines(snapshot);
  const changelogEntry = upsertArchivistWritebackBlock('', changelogLines, { sectionHeading: changelogHeading }).trim();
  const tasksBlock = includeTasks ? upsertArchivistWritebackBlock('', tasksLines).trim() : '';
  const tasksDocument = includeTasks ? buildTasksCompatibilityStub(snapshot.domainKey, { generatedBlock: tasksBlock }) : '';
  const writes = {
    changelog: changelogPaths(rootPath, snapshot.domainKey),
    tasks: includeTasks ? tasksPaths(rootPath, snapshot.domainKey) : [],
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
  }

  return {
    generatedAt: snapshot.generatedAt,
    summary: snapshot.summary,
    snapshot,
    changelogEntry,
    tasksDocument,
    writes,
  };
}

module.exports = {
  applyArchivistWriteback,
  buildArchivistSessionSnapshot,
  changelogWritebackLines,
  tasksWritebackLines,
};
