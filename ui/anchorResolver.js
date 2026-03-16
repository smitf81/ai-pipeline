const fs = require('fs');
const path = require('path');

const DEFAULT_DOMAIN_KEY = 'emergence';
const CANONICAL_BRAIN_ROOT = 'brain';
const LEGACY_BRAIN_ROOT = 'projects';
const CANONICAL_TARGETS_FILE = 'targets.json';
const LEGACY_TARGETS_FILE = 'projects.json';
const CANONICAL_AUTHORITY = 'canonical-anchor';
const DERIVED_AUTHORITY = 'derived-state';

const ANCHOR_DEFINITIONS = Object.freeze([
  { id: 'project_brain', fileName: 'project_brain.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 3, keywordWeight: 3, required: true },
  { id: 'roadmap', fileName: 'roadmap.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 5, keywordWeight: 5, required: true },
  { id: 'plan', fileName: 'plan.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 4, keywordWeight: 4, required: true },
  { id: 'tasks', fileName: 'tasks.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 4, keywordWeight: 4, required: true },
  { id: 'decisions', fileName: 'decisions.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 2, keywordWeight: 2, required: true },
  { id: 'changelog', fileName: 'changelog.md', type: 'markdown', authority: CANONICAL_AUTHORITY, weight: 2, keywordWeight: 2, required: true },
  { id: 'state', fileName: 'state.json', type: 'json', authority: DERIVED_AUTHORITY, weight: 1, keywordWeight: 0, required: true },
]);

const ANCHOR_BY_ID = Object.freeze(Object.fromEntries(ANCHOR_DEFINITIONS.map((definition) => [definition.id, definition])));
const ANCHOR_FILE_NAMES = Object.freeze(new Set(ANCHOR_DEFINITIONS.map((definition) => definition.fileName)));

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

function canonicalBrainRoot(domainKey = DEFAULT_DOMAIN_KEY) {
  return `${CANONICAL_BRAIN_ROOT}/${domainKey}`;
}

function legacyBrainRoot(domainKey = DEFAULT_DOMAIN_KEY) {
  return `${LEGACY_BRAIN_ROOT}/${domainKey}`;
}

function canonicalAnchorRelativePath(domainKey, fileName) {
  return `${canonicalBrainRoot(domainKey)}/${fileName}`;
}

function legacyAnchorRelativePath(domainKey, fileName) {
  return `${legacyBrainRoot(domainKey)}/${fileName}`;
}

function anchorAliasesForPath(relativePath, domainKey = DEFAULT_DOMAIN_KEY) {
  const normalized = normalizeRelativePath(relativePath);
  const canonicalPrefix = `${canonicalBrainRoot(domainKey)}/`;
  const legacyPrefix = `${legacyBrainRoot(domainKey)}/`;
  if (!normalized.startsWith(canonicalPrefix) && !normalized.startsWith(legacyPrefix)) {
    return [normalized];
  }
  const fileName = normalized.split('/').pop();
  if (!ANCHOR_FILE_NAMES.has(fileName)) return [normalized];
  const canonical = canonicalAnchorRelativePath(domainKey, fileName);
  const legacy = legacyAnchorRelativePath(domainKey, fileName);
  return normalized.startsWith(canonicalPrefix) ? [canonical, legacy] : [canonical, legacy];
}

function relativeToAbsolute(rootPath, relativePath) {
  return path.join(rootPath, ...normalizeRelativePath(relativePath).split('/'));
}

function readFsEntry(rootPath, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = relativeToAbsolute(rootPath, normalized);
  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const parsed = normalized.endsWith('.json') ? JSON.parse(content) : null;
    const stat = fs.statSync(absolutePath);
    return {
      exists: true,
      path: normalized,
      absPath: absolutePath,
      content,
      parsed,
      mtime: stat.mtime.toISOString(),
      error: null,
    };
  } catch (error) {
    return {
      exists: false,
      path: normalized,
      absPath: absolutePath,
      content: '',
      parsed: null,
      mtime: null,
      error: error.code === 'ENOENT' ? 'File not found' : String(error.message || error),
    };
  }
}

function normalizeEntry(entry, relativePath) {
  if (!entry) {
    return {
      exists: false,
      path: normalizeRelativePath(relativePath),
      content: '',
      parsed: null,
      mtime: null,
      error: 'File not found',
    };
  }

  const content = typeof entry.content === 'string'
    ? entry.content
    : entry.parsed != null
      ? `${JSON.stringify(entry.parsed, null, 2)}\n`
      : '';
  const parsed = Object.prototype.hasOwnProperty.call(entry, 'parsed') ? entry.parsed : null;
  const inferredExists = entry.error
    ? false
    : Boolean(
      (typeof content === 'string' && content.trim().length > 0)
      || (
        parsed != null
        && (typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 0)
      ),
    );
  return {
    exists: typeof entry.exists === 'boolean' ? entry.exists : inferredExists,
    path: normalizeRelativePath(entry.path || relativePath),
    absPath: entry.absPath || null,
    content,
    parsed,
    mtime: entry.mtime || null,
    error: entry.error || (typeof entry.exists === 'boolean' && !entry.exists ? 'File not found' : null),
  };
}

function entryReaderFor({ rootPath = null, readEntry = null } = {}) {
  if (typeof readEntry === 'function') {
    return (relativePath) => normalizeEntry(readEntry(normalizeRelativePath(relativePath)), relativePath);
  }
  if (!rootPath) {
    throw new Error('rootPath or readEntry is required to resolve anchor files.');
  }
  return (relativePath) => normalizeEntry(readFsEntry(rootPath, relativePath), relativePath);
}

function resolveAnchorEntry({ reader, domainKey = DEFAULT_DOMAIN_KEY, definition }) {
  const canonicalRelativePath = canonicalAnchorRelativePath(domainKey, definition.fileName);
  const legacyRelativePath = legacyAnchorRelativePath(domainKey, definition.fileName);
  const canonicalEntry = reader(canonicalRelativePath);
  if (canonicalEntry.exists) {
    return {
      ...definition,
      canonicalRelativePath,
      legacyRelativePaths: [legacyRelativePath],
      relativePath: canonicalRelativePath,
      sourceRelativePath: canonicalEntry.path || canonicalRelativePath,
      source: 'canonical',
      exists: true,
      content: canonicalEntry.content || '',
      parsed: canonicalEntry.parsed,
      mtime: canonicalEntry.mtime || null,
      error: canonicalEntry.error || null,
    };
  }

  const legacyEntry = reader(legacyRelativePath);
  if (legacyEntry.exists) {
    return {
      ...definition,
      canonicalRelativePath,
      legacyRelativePaths: [legacyRelativePath],
      relativePath: canonicalRelativePath,
      sourceRelativePath: legacyEntry.path || legacyRelativePath,
      source: 'legacy',
      exists: true,
      content: legacyEntry.content || '',
      parsed: legacyEntry.parsed,
      mtime: legacyEntry.mtime || null,
      error: legacyEntry.error || null,
    };
  }

  return {
    ...definition,
    canonicalRelativePath,
    legacyRelativePaths: [legacyRelativePath],
    relativePath: canonicalRelativePath,
    sourceRelativePath: canonicalRelativePath,
    source: 'missing',
    exists: false,
    content: '',
    parsed: null,
    mtime: null,
    error: canonicalEntry.error || legacyEntry.error || 'File not found',
  };
}

function stripMarkdownDecorators(value = '') {
  return String(value || '')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeKeywordSource(value = '') {
  return stripMarkdownDecorators(value)
    .toLowerCase()
    .match(/[a-z][a-z0-9_-]{2,}/g) || [];
}

function topKeywordsFromCounts(counts = new Map(), limit = 24) {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function extractStructuredStateText(parsed = {}) {
  return [
    ...(Array.isArray(parsed.blockers) ? parsed.blockers : []),
    ...(Array.isArray(parsed.drift_flags) ? parsed.drift_flags : []),
    ...(Array.isArray(parsed.runtime_counters) ? parsed.runtime_counters : []),
  ].filter(Boolean).join('\n');
}

function extractMarkdownSectionLines(content = '', headings = [], limit = 6) {
  const normalizedHeadings = new Set((headings || []).map((heading) => String(heading || '').trim().toLowerCase()).filter(Boolean));
  if (!normalizedHeadings.size) return [];
  const lines = String(content || '').split(/\r?\n/);
  let inSection = false;
  const collected = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      const headingLabel = stripMarkdownDecorators(headingMatch[1]).toLowerCase();
      if (normalizedHeadings.has(headingLabel)) {
        inSection = true;
        continue;
      }
      if (inSection) break;
    }
    if (!inSection) continue;
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      collected.push(trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim());
    } else if (trimmed && !/^#+\s+/.test(trimmed)) {
      collected.push(stripMarkdownDecorators(trimmed));
    }
    if (collected.length >= limit) break;
  }
  return collected.filter(Boolean);
}

function firstAvailableLine(...groups) {
  for (const group of groups) {
    const value = Array.isArray(group) ? group.find(Boolean) : group;
    if (value) return String(value).trim();
  }
  return '';
}

function comparableText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparableTokens(value = '') {
  return comparableText(value).split(' ').filter((token) => token.length >= 3);
}

function hasComparableOverlap(left, right) {
  const leftTokens = new Set(comparableTokens(left));
  if (!leftTokens.size) return false;
  return comparableTokens(right).some((token) => leftTokens.has(token));
}

function buildMarkdownSummary(anchorMap) {
  const roadmapNow = extractMarkdownSectionLines(anchorMap.roadmap?.content || '', ['now'], 6);
  const planGoal = extractMarkdownSectionLines(anchorMap.plan?.content || '', ['goal'], 4);
  const projectFocus = extractMarkdownSectionLines(anchorMap.project_brain?.content || '', ['current focus', 'focus'], 4);
  const taskActions = extractActionLines(anchorMap.tasks?.content || '', 6);
  const planActions = extractActionLines(anchorMap.plan?.content || '', 6);
  return {
    currentFocus: firstAvailableLine(planGoal, projectFocus, roadmapNow, firstMeaningfulLine(anchorMap.project_brain?.content || '')),
    activeMilestone: firstAvailableLine(roadmapNow, planGoal, firstMeaningfulLine(anchorMap.roadmap?.content || '')),
    nextActions: uniqueStrings([...planActions, ...taskActions, ...roadmapNow]).slice(0, 7),
  };
}

function extractActionLines(content = '', limit = 6) {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function firstMeaningfulLine(content = '') {
  return String(content || '')
    .split(/\r?\n/)
    .map((line) => stripMarkdownDecorators(line))
    .find(Boolean) || '';
}

function buildAnchorKeywordMap(anchorMap) {
  const aggregate = new Map();
  const enrichedAnchors = {};
  Object.values(anchorMap).forEach((anchor) => {
    const sourceText = anchor.id === 'state'
      ? extractStructuredStateText(anchor.parsed || {})
      : anchor.content || '';
    const localCounts = new Map();
    tokenizeKeywordSource(sourceText).forEach((token) => {
      const keywordWeight = Number(anchor.keywordWeight || 0);
      if (keywordWeight <= 0) return;
      localCounts.set(token, (localCounts.get(token) || 0) + keywordWeight);
      aggregate.set(token, (aggregate.get(token) || 0) + keywordWeight);
    });
    enrichedAnchors[anchor.id] = {
      ...anchor,
      sourceText,
      keywords: topKeywordsFromCounts(localCounts, 24),
    };
  });
  return {
    aggregateKeywords: topKeywordsFromCounts(aggregate, 28),
    anchors: enrichedAnchors,
  };
}

function uniqueStrings(values = []) {
  return [...new Set((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function buildDriftFlags(anchorMap, markdownSummary = {}) {
  const flags = [];
  Object.values(anchorMap).forEach((anchor) => {
    if (anchor.required && !anchor.exists) {
      flags.push({
        id: `missing-${anchor.id}`,
        severity: 'high',
        summary: `${anchor.fileName} is missing from the canonical brain bundle.`,
        anchorRef: anchor.relativePath,
      });
    }
    if (anchor.exists && anchor.source === 'legacy') {
      flags.push({
        id: `legacy-${anchor.id}`,
        severity: 'medium',
        summary: `${anchor.fileName} is still being resolved from the deprecated projects/ path.`,
        anchorRef: anchor.relativePath,
        sourceRef: anchor.sourceRelativePath,
      });
    }
  });

  const planActions = extractActionLines(anchorMap.plan?.content || '', 6);
  const taskActions = extractActionLines(anchorMap.tasks?.content || '', 6);
  if (!planActions.length) {
    flags.push({
      id: 'empty-plan',
      severity: 'high',
      summary: 'plan.md is present but does not expose an active execution slice.',
      anchorRef: anchorMap.plan?.relativePath || canonicalAnchorRelativePath(DEFAULT_DOMAIN_KEY, 'plan.md'),
    });
  }
  if (!taskActions.length) {
    flags.push({
      id: 'empty-tasks',
      severity: 'medium',
      summary: 'tasks.md does not currently expose actionable backlog items.',
      anchorRef: anchorMap.tasks?.relativePath || canonicalAnchorRelativePath(DEFAULT_DOMAIN_KEY, 'tasks.md'),
    });
  }

  const roadmapKeywords = new Set(anchorMap.roadmap?.keywords || []);
  const executionKeywords = uniqueStrings([...(anchorMap.plan?.keywords || []), ...(anchorMap.tasks?.keywords || [])]);
  const overlap = executionKeywords.filter((token) => roadmapKeywords.has(token));
  if ((anchorMap.roadmap?.exists && (anchorMap.plan?.exists || anchorMap.tasks?.exists)) && overlap.length === 0) {
    flags.push({
      id: 'roadmap-execution-divergence',
      severity: 'medium',
      summary: 'Roadmap priorities and active execution anchors have no detectable keyword overlap.',
      anchorRef: anchorMap.roadmap?.relativePath || canonicalAnchorRelativePath(DEFAULT_DOMAIN_KEY, 'roadmap.md'),
    });
  }

  const state = anchorMap.state?.parsed || {};
  if (state.current_focus && markdownSummary.currentFocus && !hasComparableOverlap(state.current_focus, markdownSummary.currentFocus)) {
    flags.push({
      id: 'state-focus-divergence',
      severity: 'medium',
      summary: 'state.json current_focus diverges from the markdown-derived project focus.',
      anchorRef: anchorMap.state?.relativePath || canonicalAnchorRelativePath(DEFAULT_DOMAIN_KEY, 'state.json'),
      sourceRef: anchorMap.plan?.relativePath || anchorMap.project_brain?.relativePath || null,
    });
  }
  if (state.active_milestone && markdownSummary.activeMilestone && !hasComparableOverlap(state.active_milestone, markdownSummary.activeMilestone)) {
    flags.push({
      id: 'state-milestone-divergence',
      severity: 'medium',
      summary: 'state.json active_milestone diverges from the markdown-derived milestone.',
      anchorRef: anchorMap.state?.relativePath || canonicalAnchorRelativePath(DEFAULT_DOMAIN_KEY, 'state.json'),
      sourceRef: anchorMap.roadmap?.relativePath || anchorMap.plan?.relativePath || null,
    });
  }
  return flags;
}

function buildManagerSummary(anchorMap, driftFlags, markdownSummary = {}) {
  const state = anchorMap.state?.parsed || {};
  const nextActions = uniqueStrings(markdownSummary.nextActions || []).slice(0, 7);
  return {
    current_focus: markdownSummary.currentFocus || state.current_focus || '',
    active_milestone: markdownSummary.activeMilestone || state.active_milestone || '',
    active_plan_slice: extractActionLines(anchorMap.plan?.content || '', 4),
    next_actions: nextActions,
    blockers: uniqueStrings(Array.isArray(state.blockers) ? state.blockers : []).slice(0, 7),
    drift_flags: uniqueStrings([
      ...driftFlags.map((flag) => flag.id),
      ...(Array.isArray(state.drift_flags) ? state.drift_flags : []),
    ]),
    last_manager_sync: state.last_manager_sync || state.last_updated || nowIso(),
  };
}

function buildAnchorBundle({ rootPath = null, domainKey = DEFAULT_DOMAIN_KEY, readEntry = null } = {}) {
  const reader = entryReaderFor({ rootPath, readEntry });
  const resolvedAnchors = Object.fromEntries(
    ANCHOR_DEFINITIONS.map((definition) => [definition.id, resolveAnchorEntry({ reader, domainKey, definition })]),
  );
  const keywordSummary = buildAnchorKeywordMap(resolvedAnchors);
  const anchorMap = keywordSummary.anchors;
  const markdownSummary = buildMarkdownSummary(anchorMap);
  const drift = buildDriftFlags(anchorMap, markdownSummary);
  const managerSummary = buildManagerSummary(anchorMap, drift, markdownSummary);
  const truthSources = Object.values(anchorMap).map((anchor) => ({
    id: anchor.id,
    relativePath: anchor.relativePath,
    sourceRelativePath: anchor.sourceRelativePath,
    source: anchor.source,
    authority: anchor.authority || CANONICAL_AUTHORITY,
    exists: anchor.exists,
    required: Boolean(anchor.required),
    canonicalRelativePath: anchor.canonicalRelativePath,
    legacyRelativePaths: [...anchor.legacyRelativePaths],
  }));
  return {
    domainKey,
    brainRoot: canonicalBrainRoot(domainKey),
    legacyBrainRoot: legacyBrainRoot(domainKey),
    anchors: anchorMap,
    managerSummary,
    drift,
    anchorRefs: truthSources.filter((source) => source.exists).map((source) => source.relativePath),
    truthSources,
    aggregateKeywords: keywordSummary.aggregateKeywords,
  };
}

function readAnchorBundle(rootPath, domainKey = DEFAULT_DOMAIN_KEY) {
  return buildAnchorBundle({ rootPath, domainKey });
}

function listCanonicalAnchorPaths(domainKey = DEFAULT_DOMAIN_KEY) {
  return ANCHOR_DEFINITIONS.map((definition) => canonicalAnchorRelativePath(domainKey, definition.fileName));
}

function readAnchorFile(rootPath, relativePath, domainKey = DEFAULT_DOMAIN_KEY) {
  const reader = entryReaderFor({ rootPath });
  const aliases = anchorAliasesForPath(relativePath, domainKey);
  const canonicalRelativePath = aliases[0];
  const preferred = reader(canonicalRelativePath);
  if (preferred.exists) {
    return {
      ...preferred,
      path: canonicalRelativePath,
      sourcePath: preferred.path || canonicalRelativePath,
      aliases,
    };
  }
  if (aliases.length > 1) {
    const legacy = reader(aliases[1]);
    if (legacy.exists) {
      return {
        ...legacy,
        path: canonicalRelativePath,
        sourcePath: legacy.path || aliases[1],
        aliases,
      };
    }
  }
  return {
    ...preferred,
    path: canonicalRelativePath,
    sourcePath: preferred.path || canonicalRelativePath,
    aliases,
  };
}

function resolveTargetsConfig(rootPath) {
  const canonicalPath = CANONICAL_TARGETS_FILE;
  const legacyPath = LEGACY_TARGETS_FILE;
  const canonicalEntry = readFsEntry(rootPath, canonicalPath);
  if (canonicalEntry.exists) {
    return {
      relativePath: canonicalPath,
      sourceRelativePath: canonicalPath,
      source: 'canonical',
      targets: canonicalEntry.parsed || {},
      exists: true,
    };
  }
  const legacyEntry = readFsEntry(rootPath, legacyPath);
  if (legacyEntry.exists) {
    return {
      relativePath: canonicalPath,
      sourceRelativePath: legacyPath,
      source: 'legacy',
      targets: legacyEntry.parsed || {},
      exists: true,
    };
  }
  return {
    relativePath: canonicalPath,
    sourceRelativePath: canonicalPath,
    source: 'missing',
    targets: {},
    exists: false,
  };
}

module.exports = {
  ANCHOR_BY_ID,
  ANCHOR_DEFINITIONS,
  CANONICAL_BRAIN_ROOT,
  CANONICAL_AUTHORITY,
  CANONICAL_TARGETS_FILE,
  DERIVED_AUTHORITY,
  DEFAULT_DOMAIN_KEY,
  LEGACY_BRAIN_ROOT,
  LEGACY_TARGETS_FILE,
  buildAnchorBundle,
  canonicalAnchorRelativePath,
  canonicalBrainRoot,
  legacyAnchorRelativePath,
  legacyBrainRoot,
  listCanonicalAnchorPaths,
  normalizeRelativePath,
  readAnchorBundle,
  readAnchorFile,
  resolveTargetsConfig,
  topKeywordsFromCounts,
  tokenizeKeywordSource,
};
