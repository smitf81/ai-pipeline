const INTENT_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'have', 'will',
  'about', 'would', 'should', 'could', 'there', 'their', 'them', 'then', 'than', 'when',
  'what', 'where', 'while', 'were', 'been', 'being', 'also', 'just', 'over', 'under',
  'onto', 'need', 'needs', 'want', 'wants', 'able', 'make', 'lets',
]);
const {
  DEFAULT_DOMAIN_KEY,
  buildAnchorBundle,
  resolveAnchorIntentWeight,
  tokenizeKeywordSource,
  topKeywordsFromCounts,
} = require('./anchorResolver');

const LEGACY_ACTION_PATTERN = /\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable|support)\b/gi;
const CURRENT_ACTION_PATTERN = /\b(build|fix|create|implement|wire|connect|review|scan|plan|design|update|remove|delete|disable|support|add|introduce|expose|enable|allow|test|verify|document)\b/gi;
const FEATURE_REQUEST_PATTERN = /\b(we should|should add|let's add|add a desk|add an agent|add a qa agent|introduce a desk|introduce an agent|support a qa desk|allow a qa agent)\b/gi;
const EXECUTION_HINT_PATTERN = /\b(file|patch|build|deploy|restart|compile|test|apply|execute|run)\b/gi;
const ARCHITECTURE_PATTERN = /\b(agent|desk|context|planner|executor|memory|archivist|studio|canvas|node|backend|frontend|api|service|module|architecture|overlay|orchestrator|kanban|board|qa)\b/gi;
const CONSTRAINT_PATTERN = /\b(must|should|avoid|blocker|needs|review|constraint|guardrail|boundary|approval|permission|deploy)\b/gi;

function nowIso() {
  return new Date().toISOString();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function averageScores(items = []) {
  if (!items.length) return 0;
  return Number((items.reduce((sum, item) => sum + Number(item.score || 0), 0) / items.length).toFixed(2));
}

function countMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function tokenizeIntentText(text) {
  return [...new Set((String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []).filter((token) => !INTENT_STOPWORDS.has(token)))];
}

function topKeywords(text, limit = 24) {
  const counts = new Map();
  for (const token of tokenizeIntentText(text)) counts.set(token, (counts.get(token) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([token]) => token);
}

function inferIntentLabels(text) {
  const value = String(text || '').toLowerCase();
  const labels = [];
  if (/context|brief|constraint|intent|memory/.test(value)) labels.push('context');
  if (/plan|task|roadmap|sequence|todo|queue|desk|agent|workflow|kanban|board/.test(value)) labels.push('plan');
  if (/build|fix|implement|patch|wire|connect|ship|code|module|service|deploy|restart|compile|test/.test(value)) labels.push('execution');
  if (/ui|ux|canvas|studio|node|overlay|panel/.test(value)) labels.push('ux');
  if (/review|guardrail|architect|rule|boundary|ace|approval|permission|orchestrator/.test(value)) labels.push('governance');
  return labels.length ? labels : ['general'];
}

function inferIntentRole(text, labels) {
  const value = String(text || '').toLowerCase();
  if (/rule|constraint|must|never|guardrail|approval|permission/.test(value)) return 'constraint';
  if (/desk|agent|api|service|module|architecture|system|orchestrator|planner|executor|studio/.test(value)) return 'module';
  if (/file|patch|fix|implement|build|wire|deploy|restart|compile/.test(value) || labels.includes('execution')) return 'task';
  if (/ux|ui|screen|flow|overlay|panel/.test(value)) return 'ux';
  return 'thought';
}

function buildIntentTasksFromPattern(text, pattern) {
  const fragments = String(text || '')
    .split(/[\n,.!?;:]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const actionFirst = fragments.filter((entry) => pattern.test(entry));
  pattern.lastIndex = 0;
  const chosen = [...actionFirst, ...fragments].slice(0, 4);
  return chosen.length ? chosen : ['analyze requirements', 'decompose tasks', 'prepare implementation plan'];
}

function buildIntentTasks(text) {
  return buildIntentTasksFromPattern(text, CURRENT_ACTION_PATTERN);
}

function buildLegacyIntentTasks(text) {
  return buildIntentTasksFromPattern(text, LEGACY_ACTION_PATTERN);
}

function buildWeightedKeywordCounts(anchorBundle, contextNode) {
  const counts = new Map();
  const canonicalSeeds = new Map();
  Object.values(anchorBundle?.anchors || {}).forEach((anchor) => {
    const intentWeight = resolveAnchorIntentWeight(anchor);
    const seededKeywords = [];
    (anchor?.keywords || []).forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + intentWeight);
      if (seededKeywords.length < 3) seededKeywords.push(token);
    });
    if (anchor?.authority === 'canonical-anchor' && seededKeywords.length > 0) {
      canonicalSeeds.set(anchor.id, seededKeywords);
    }
  });
  tokenizeKeywordSource(contextNode?.content || '').forEach((token) => {
    counts.set(token, (counts.get(token) || 0) + 4);
  });
  return { counts, canonicalSeeds };
}

function buildBalancedProjectKeywords({ counts, canonicalSeeds }, limit = 28) {
  const prioritized = [];
  (canonicalSeeds instanceof Map ? [...canonicalSeeds.values()] : []).forEach((tokens) => {
    tokens.forEach((token) => {
      if (!prioritized.includes(token)) prioritized.push(token);
    });
  });
  const weighted = topKeywordsFromCounts(counts, limit * 2);
  const merged = [...prioritized, ...weighted];
  return [...new Set(merged)].slice(0, limit);
}

function buildAnchorCatalog(anchorBundle) {
  return Object.values(anchorBundle?.anchors || {})
    .filter((anchor) => anchor?.exists)
    .map((anchor) => ({
      id: anchor.id,
      relativePath: anchor.relativePath,
      sourceRelativePath: anchor.sourceRelativePath,
      source: anchor.source,
      weight: anchor.weight,
      intentWeight: resolveAnchorIntentWeight(anchor),
      authority: anchor.authority || 'canonical-anchor',
      keywords: (anchor.keywords || []).slice(0, 24),
    }));
}

function buildIntentProjectContext({
  workspace = {},
  readDashboardFile = null,
  rootPath = null,
  domainKey = DEFAULT_DOMAIN_KEY,
}) {
  const anchorBundle = buildAnchorBundle({
    rootPath,
    domainKey,
    readEntry: readDashboardFile,
  });
  const contextNode = (workspace.graph?.nodes || []).find((node) => node.metadata?.agentId === 'context-manager');
  const weightedKeywords = buildWeightedKeywordCounts(anchorBundle, contextNode);
  const managerSummary = anchorBundle.managerSummary || {};
  return {
    domainKey,
    brainRoot: anchorBundle.brainRoot,
    currentFocus: managerSummary.current_focus || '',
    activeMilestone: managerSummary.active_milestone || '',
    blockers: managerSummary.blockers || [],
    keywords: buildBalancedProjectKeywords(weightedKeywords, 28),
    sourcesRead: [
      ...anchorBundle.truthSources.filter((source) => source.exists).map((source) => source.relativePath),
      ...(contextNode ? ['workspace.graph.context-manager-node'] : []),
    ],
    anchorRefs: anchorBundle.anchorRefs || [],
    anchorCatalog: buildAnchorCatalog(anchorBundle),
    truthSources: anchorBundle.truthSources || [],
    drift: anchorBundle.drift || [],
    managerSummary,
  };
}

function buildAnchorMatches(tokens = [], project = {}) {
  const tokenSet = new Set(tokens || []);
  const catalog = Array.isArray(project.anchorCatalog) ? project.anchorCatalog : [];
  const matches = catalog
    .map((anchor) => {
      const matchedTerms = (anchor.keywords || []).filter((token) => tokenSet.has(token)).slice(0, 8);
      const intentWeight = Number(anchor.intentWeight || anchor.weight || 1);
      const canonicalBonus = anchor.authority === 'canonical-anchor' ? 1 : 0;
      return {
        anchorRef: anchor.relativePath,
        sourceRef: anchor.sourceRelativePath,
        source: anchor.source,
        weight: anchor.weight,
        intentWeight,
        matchedTerms,
        score: matchedTerms.length ? Number((matchedTerms.length * intentWeight + canonicalBonus).toFixed(2)) : 0,
      };
    })
    .filter((entry) => entry.matchedTerms.length > 0)
    .sort((left, right) => right.score - left.score || right.matchedTerms.length - left.matchedTerms.length || right.intentWeight - left.intentWeight);
  return matches;
}

function buildLegacyCriteria({ source, project, labels, tokens, sentences, matchedTerms }) {
  const actionMatches = countMatches(source, LEGACY_ACTION_PATTERN);
  const constraintMatches = countMatches(source, CONSTRAINT_PATTERN);
  const architectureMatches = countMatches(source, ARCHITECTURE_PATTERN);
  const legacyTasks = buildLegacyIntentTasks(source);
  return [
    {
      id: 'project-alignment',
      label: 'Project alignment',
      score: clamp01((matchedTerms.length + ((project.currentFocus && source.toLowerCase().includes(String(project.currentFocus).toLowerCase())) ? 2 : 0)) / 6),
      reason: matchedTerms.length ? `Matched project terms: ${matchedTerms.slice(0, 5).join(', ')}` : 'Few direct overlaps with current project context.',
    },
    {
      id: 'actionability',
      label: 'Actionability',
      score: clamp01((actionMatches + legacyTasks.length) / 6),
      reason: actionMatches ? `Detected ${actionMatches} implementation/planning verb signals.` : 'Input reads more like a note than a concrete action.',
    },
    {
      id: 'architecture-fit',
      label: 'Architecture fit',
      score: clamp01((architectureMatches + labels.length) / 7),
      reason: architectureMatches ? 'References ACE system structure, agents, or implementation surfaces.' : 'Little direct architecture language found.',
    },
    {
      id: 'constraint-coverage',
      label: 'Constraint coverage',
      score: clamp01((constraintMatches + (project.blockers.length ? 1 : 0)) / 5),
      reason: constraintMatches ? 'Includes guardrails, blockers, or review-oriented language.' : 'No clear constraints or review gates were stated.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      score: clamp01((Math.min(tokens.length, 14) / 14 + Math.min(sentences.length, 3) / 3) / 2),
      reason: tokens.length >= 6 ? 'Input includes enough detail to classify intent reliably.' : 'Short input limits confidence.',
    },
  ];
}

function buildCurrentCriteria({ source, project, labels, tokens, sentences, matchedTerms, tasks }) {
  const actionMatches = countMatches(source, CURRENT_ACTION_PATTERN);
  const featureRequestSignals = countMatches(source, FEATURE_REQUEST_PATTERN);
  const executionHints = countMatches(source, EXECUTION_HINT_PATTERN);
  const constraintMatches = countMatches(source, CONSTRAINT_PATTERN);
  const architectureMatches = countMatches(source, ARCHITECTURE_PATTERN);
  const currentFocusMatch = project.currentFocus && source.toLowerCase().includes(String(project.currentFocus).toLowerCase());
  return [
    {
      id: 'project-alignment',
      label: 'Project alignment',
      score: clamp01((matchedTerms.length + (currentFocusMatch ? 2 : 0) + (labels.includes('plan') ? 1 : 0)) / 7),
      reason: matchedTerms.length ? `Matched project terms: ${matchedTerms.slice(0, 5).join(', ')}` : 'Few direct overlaps with current project context.',
    },
    {
      id: 'actionability',
      label: 'Actionability',
      score: clamp01((actionMatches + featureRequestSignals * 2 + Math.min(tasks.length, 3) + executionHints) / 8),
      reason: featureRequestSignals
        ? 'Feature-request phrasing reads like actionable planning work.'
        : actionMatches
          ? `Detected ${actionMatches} implementation/planning verb signals.`
          : 'Input still reads more like a note than a concrete action.',
    },
    {
      id: 'architecture-fit',
      label: 'Architecture fit',
      score: clamp01((architectureMatches + labels.length + (/\bqa\b/i.test(source) ? 1 : 0)) / 9),
      reason: architectureMatches ? 'References ACE desks, agents, architecture surfaces, or orchestration flow.' : 'Little direct architecture language found.',
    },
    {
      id: 'constraint-coverage',
      label: 'Constraint coverage',
      score: clamp01((constraintMatches + (project.blockers.length ? 1 : 0) + (/\breview|approval|guardrail|deploy\b/i.test(source) ? 1 : 0)) / 6),
      reason: constraintMatches ? 'Includes guardrails, blockers, or review-oriented language.' : 'No clear constraints or review gates were stated.',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      score: clamp01((Math.min(tokens.length, 18) / 18 + Math.min(sentences.length, 3) / 3 + Math.min(tasks.length, 3) / 3) / 3),
      reason: tokens.length >= 6 ? 'Input includes enough detail to classify intent reliably.' : 'Short input limits confidence.',
    },
  ];
}

function buildIntentReadinessScores({ confidence, criteria, tasks, source, labels, projectContext, classification }) {
  const criterionMap = Object.fromEntries((criteria || []).map((criterion) => [criterion.id, Number(criterion.score || 0)]));
  const taskCount = Math.min((tasks || []).length, 3);
  const featureSignals = countMatches(source, FEATURE_REQUEST_PATTERN);
  const executionHints = countMatches(source, EXECUTION_HINT_PATTERN);
  const reviewSignals = countMatches(source, /\b(review|approval|deploy|permission)\b/gi);
  const matchedTerms = Math.min((projectContext?.matchedTerms || []).length, 3);
  return {
    intentConfidence: Number(confidence.toFixed(2)),
    executionReadiness: Number(clamp01((
      (criterionMap.actionability || 0)
      + (criterionMap.clarity || 0)
      + Math.min(taskCount / 3, 1)
      + Math.min(executionHints / 2, 1)
    ) / 4).toFixed(2)),
    plannerUsefulness: Number(clamp01((
      (criterionMap['project-alignment'] || 0)
      + (criterionMap['architecture-fit'] || 0)
      + (criterionMap.clarity || 0)
      + Math.min((taskCount + featureSignals + matchedTerms) / 5, 1)
    ) / 4).toFixed(2)),
    deployReadiness: Number(clamp01((
      (criterionMap.actionability || 0)
      + (criterionMap['constraint-coverage'] || 0)
      + Math.min(executionHints / 2, 1)
      + (reviewSignals ? 0.25 : 0)
      + (classification?.role === 'task' ? 0.25 : 0)
    ) / 4.5).toFixed(2)),
  };
}

function buildIntentTruth({ source, summary, tasks, criteria, classification, projectContext, scores }) {
  const requestedOutcomes = (tasks || []).slice(0, 4);
  const anchorRefs = Array.isArray(projectContext?.anchorRefs) ? projectContext.anchorRefs.slice(0, 8) : [];
  const unresolved = (criteria || [])
    .filter((criterion) => Number(criterion.score || 0) < 0.55)
    .map((criterion) => `${criterion.label}: ${criterion.reason || 'Needs clarification.'}`);
  if (!requestedOutcomes.length) unresolved.push('No concrete requested outcomes were extracted yet.');
  if (!(projectContext?.matchedTerms || []).length) unresolved.push('Project alignment is weak, so the request may still need anchoring to current ACE work.');
  const evidence = (criteria || [])
    .slice()
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, 3)
    .map((criterion) => `${criterion.label}: ${criterion.reason || `${Math.round((criterion.score || 0) * 100)}%`}`);
  const intentType = classification?.role === 'module'
    ? 'ACE architecture / capability request'
    : classification?.role === 'task'
      ? 'Direct implementation request'
      : classification?.role === 'constraint'
        ? 'Constraint / guardrail request'
        : 'General context signal';
  return {
    rawInput: source,
    statement: summary || source || 'Intent capture is empty.',
    intentType,
    requestedOutcomes,
    unresolved,
    evidence,
    anchorRefs,
    plannerBrief: requestedOutcomes.length
      ? `Planner should treat this as: ${requestedOutcomes.join('; ')}`
      : 'Planner should clarify the request before expanding execution.',
    readiness: {
      intentConfidence: Number(scores?.intentConfidence || 0),
      plannerUsefulness: Number(scores?.plannerUsefulness || 0),
      executionReadiness: Number(scores?.executionReadiness || 0),
      deployReadiness: Number(scores?.deployReadiness || 0),
    },
  };
}

function analyzeSpatialIntent(text, project) {
  const source = String(text || '').trim();
  const safeProject = project || {
    currentFocus: '',
    blockers: [],
    keywords: [],
    sourcesRead: [],
    anchorRefs: [],
    anchorCatalog: [],
    truthSources: [],
    drift: [],
    managerSummary: null,
  };
  const labels = inferIntentLabels(source);
  const role = inferIntentRole(source, labels);
  const tokens = tokenizeIntentText(source);
  const projectTerms = new Set(safeProject.keywords || []);
  const matchedTerms = tokens.filter((token) => projectTerms.has(token));
  const anchorMatches = buildAnchorMatches(tokens, safeProject);
  const sentences = source.split(/[.!?\n]+/).map((entry) => entry.trim()).filter(Boolean);
  const tasks = buildIntentTasks(source);
  const legacyCriteria = buildLegacyCriteria({
    source,
    project: safeProject,
    labels,
    tokens,
    sentences,
    matchedTerms,
  });
  const criteria = buildCurrentCriteria({
    source,
    project: safeProject,
    labels,
    tokens,
    sentences,
    matchedTerms,
    tasks,
  });
  const legacyConfidence = averageScores(legacyCriteria);
  const confidence = averageScores(criteria);
  const summary = source.length > 140 ? `${source.slice(0, 137).trim()}...` : (source || 'Intent capture is empty.');
  const scores = buildIntentReadinessScores({
    confidence,
    criteria,
    tasks,
    source,
    labels,
    projectContext: {
      ...safeProject,
      matchedTerms,
    },
    classification: { role, labels },
  });
  const truth = buildIntentTruth({
    source,
    summary,
    tasks,
    criteria,
    classification: { role, labels },
    projectContext: {
      ...safeProject,
      matchedTerms,
    },
    scores,
  });
  const anchorRefs = anchorMatches.length
    ? anchorMatches.map((entry) => entry.anchorRef)
    : (safeProject.anchorRefs || []).slice(0, 8);
  return {
    agent: {
      id: 'context-manager',
      name: 'Context Manager',
      criteriaVersion: 'ace-intent-v2',
      legacyCriteriaVersion: 'ace-intent-v1',
      remit: 'Judge incoming notes against ACE project context and surface confidence-scored intent for the frontend.',
    },
    summary,
    confidence,
    legacyConfidence,
    criteria,
    legacyCriteria,
    scores,
    truth,
    tasks,
    anchorRefs,
    provenance: {
      anchors: anchorMatches,
      managerSummary: safeProject.managerSummary || null,
    },
    classification: {
      role,
      labels,
    },
    metrics: {
      tokenCount: tokens.length,
      sentenceCount: sentences.length,
      matchedProjectTerms: matchedTerms,
      actionSignals: countMatches(source, CURRENT_ACTION_PATTERN),
      featureRequestSignals: countMatches(source, FEATURE_REQUEST_PATTERN),
      architectureSignals: countMatches(source, ARCHITECTURE_PATTERN),
      constraintSignals: countMatches(source, CONSTRAINT_PATTERN),
      executionSignals: countMatches(source, EXECUTION_HINT_PATTERN),
    },
    projectContext: {
      domainKey: safeProject.domainKey || DEFAULT_DOMAIN_KEY,
      brainRoot: safeProject.brainRoot || '',
      currentFocus: safeProject.currentFocus,
      activeMilestone: safeProject.activeMilestone || '',
      blockers: safeProject.blockers.slice(0, 3),
      matchedTerms: matchedTerms.slice(0, 8),
      referenceKeywords: (safeProject.keywords || []).slice(0, 8),
      sourcesRead: (safeProject.sourcesRead || []).slice(0, 8),
      anchorRefs,
      truthSources: (safeProject.truthSources || []).slice(0, 8),
      drift: (safeProject.drift || []).slice(0, 8),
      managerSummary: safeProject.managerSummary || null,
    },
    judgedAt: nowIso(),
  };
}

module.exports = {
  buildIntentProjectContext,
  buildIntentTasks,
  buildIntentTruth,
  inferIntentLabels,
  inferIntentRole,
  tokenizeIntentText,
  topKeywords,
  analyzeSpatialIntent,
};
