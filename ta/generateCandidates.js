const path = require('path');

const NAME_BANK = [
  'Avery Cross',
  'Jordan Vale',
  'Morgan Hale',
  'Riley Quinn',
  'Casey Rowan',
  'Drew Mercer',
  'Taylor Pike',
  'Alex Sloane',
];

const ARCHETYPES = {
  integration_auditor: {
    role: 'Integration Auditor',
    department: 'Talent Acquisition',
    summary: 'Maps claimed system behavior against actual execution paths and integration seams.',
    strengths: [
      'Traces UI intent through backend execution paths',
      'Identifies broken handoffs between surfaces and services',
      'Produces concrete mismatch reports instead of vague observations',
    ],
    weaknesses: [
      'Less suited to greenfield product ideation',
      'Can over-index on audit depth when rapid shipping is the priority',
    ],
    recommended_tools: ['network inspector', 'request logs', 'route map', 'contract checklist'],
    recommended_skills: ['integration analysis', 'API tracing', 'systems debugging', 'evidence synthesis'],
    model_policy: {
      preferred: 'hybrid',
      reason: 'Combines deterministic checks with higher-level reasoning across cross-system behavior.',
    },
    risk_notes: ['Needs current endpoint and workflow visibility to avoid stale conclusions.'],
    confidence: 0.82,
  },
  contract_steward: {
    role: 'Contract Steward',
    department: 'Talent Acquisition',
    summary: 'Owns interface contracts so data shapes and handoffs remain consistent across layers.',
    strengths: [
      'Clarifies payload expectations between services and UI surfaces',
      'Reduces drift by turning assumptions into explicit contracts',
      'Improves schema discipline for fast-moving teams',
    ],
    weaknesses: [
      'Less effective when the main gap is operational rather than interface-driven',
      'Can surface many schema fixes without prioritizing rollout order',
    ],
    recommended_tools: ['JSON schema validator', 'contract diff', 'fixture library', 'API examples'],
    recommended_skills: ['schema design', 'contract testing', 'payload review', 'backward compatibility analysis'],
    model_policy: {
      preferred: 'local',
      reason: 'Contract validation is strongest when grounded in deterministic schemas and repeatable checks.',
    },
    risk_notes: ['May not resolve runtime behavior gaps without complementary execution tracing.'],
    confidence: 0.79,
  },
  delivery_analyst: {
    role: 'Delivery Analyst',
    department: 'Talent Acquisition',
    summary: 'Connects system gaps to delivery impact, rollout friction, and execution bottlenecks.',
    strengths: [
      'Translates technical drift into delivery risk',
      'Highlights missing ownership across workflows',
      'Prioritizes the smallest intervention that restores flow',
    ],
    weaknesses: [
      'Not ideal for deep code-level root-cause work',
      'Can depend on team process signals that are incomplete',
    ],
    recommended_tools: ['run history', 'incident timeline', 'handoff board', 'dependency map'],
    recommended_skills: ['delivery diagnostics', 'workflow analysis', 'risk triage', 'operational reporting'],
    model_policy: {
      preferred: 'codex',
      reason: 'Cross-cutting workflow interpretation benefits from richer reasoning over multiple signals.',
    },
    risk_notes: ['Recommendations can stay high-level unless paired with implementation owners.'],
    confidence: 0.74,
  },
  pipeline_observer: {
    role: 'Pipeline Observer',
    department: 'Talent Acquisition',
    summary: 'Monitors task and execution pipelines for dropped signals, stalled transitions, and missing feedback.',
    strengths: [
      'Finds silent failures in asynchronous flows',
      'Surfaces queue, event, and state transition blind spots',
      'Improves observability around execution progress',
    ],
    weaknesses: [
      'May be too infrastructure-focused for purely UX gaps',
      'Requires instrumentation to reach full value quickly',
    ],
    recommended_tools: ['event log', 'queue inspector', 'metrics dashboard', 'pipeline replay'],
    recommended_skills: ['pipeline debugging', 'observability design', 'event modeling', 'state transition analysis'],
    model_policy: {
      preferred: 'hybrid',
      reason: 'Needs deterministic event inspection plus reasoning about systemic failure patterns.',
    },
    risk_notes: ['Limited when the system lacks reliable telemetry or state history.'],
    confidence: 0.77,
  },
  runtime_cartographer: {
    role: 'Runtime Cartographer',
    department: 'Talent Acquisition',
    summary: 'Builds a concrete map of runtime components, ownership boundaries, and execution dependencies.',
    strengths: [
      'Clarifies affected components and hidden dependencies',
      'Reduces ambiguity in complex multi-surface systems',
      'Improves scoping for subsequent specialist roles',
    ],
    weaknesses: [
      'Often frames the space without fully solving the defect',
      'Can feel indirect if the gap is already well localized',
    ],
    recommended_tools: ['component inventory', 'runtime diagram', 'dependency crawler', 'ownership matrix'],
    recommended_skills: ['system mapping', 'runtime analysis', 'dependency tracing', 'architecture review'],
    model_policy: {
      preferred: 'codex',
      reason: 'Complex system-context synthesis benefits from broader architectural reasoning.',
    },
    risk_notes: ['Best used early; value drops if architecture is already well documented.'],
    confidence: 0.72,
  },
  feedback_liaison: {
    role: 'Feedback Liaison',
    department: 'Talent Acquisition',
    summary: 'Turns ambiguous user-visible failures into actionable technical signals and acceptance checks.',
    strengths: [
      'Bridges user-facing symptoms to engineering diagnostics',
      'Creates acceptance criteria around visible behavior',
      'Keeps remediation tied to observed outcomes',
    ],
    weaknesses: [
      'Not optimized for low-level platform diagnostics',
      'Needs access to clear user reports or reproduction steps',
    ],
    recommended_tools: ['repro checklist', 'behavior log', 'acceptance matrix', 'issue clustering'],
    recommended_skills: ['symptom triage', 'acceptance design', 'cross-functional communication', 'behavior analysis'],
    model_policy: {
      preferred: 'hybrid',
      reason: 'Works best when structured evidence is combined with interpretation of ambiguous symptoms.',
    },
    risk_notes: ['Can mis-prioritize if user-facing evidence is anecdotal or incomplete.'],
    confidence: 0.7,
  },
};

const KEYWORD_SIGNALS = [
  { key: 'integration_auditor', words: ['frontend', 'backend', 'ui', 'api', 'server', 'disconnect', 'drift', 'execution'] },
  { key: 'contract_steward', words: ['schema', 'contract', 'payload', 'interface', 'field', 'response'] },
  { key: 'delivery_analyst', words: ['delivery', 'handoff', 'workflow', 'ownership', 'rollout', 'coordination'] },
  { key: 'pipeline_observer', words: ['pipeline', 'queue', 'event', 'worker', 'async', 'job', 'run'] },
  { key: 'runtime_cartographer', words: ['system', 'runtime', 'component', 'architecture', 'context', 'dependency'] },
  { key: 'feedback_liaison', words: ['user', 'action', 'behavior', 'feedback', 'visible', 'experience'] },
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48) || 'candidate';
}

function tokenizeGap(gap = {}) {
  const description = String(gap.description || '').toLowerCase();
  const systemContext = String(gap.system_context || '').toLowerCase();
  const components = Array.isArray(gap.affected_components)
    ? gap.affected_components.map((component) => String(component || '').toLowerCase())
    : [];
  const corpus = [description, systemContext, components.join(' ')].join(' ');
  return {
    description,
    systemContext,
    components,
    corpus,
    tokens: corpus.split(/[^a-z0-9]+/).filter(Boolean),
  };
}

function chooseArchetypes(parsedGap) {
  const scores = KEYWORD_SIGNALS.map((signal) => {
    const score = signal.words.reduce((total, word) => total + (parsedGap.corpus.includes(word) ? 1 : 0), 0);
    return { key: signal.key, score };
  }).sort((left, right) => right.score - left.score);

  const chosen = scores.filter((entry) => entry.score > 0).map((entry) => entry.key);
  const preferredCount = Math.min(5, Math.max(3, 3 + Math.min(parsedGap.components.length, 2)));
  const fallbackOrder = [
    'integration_auditor',
    'contract_steward',
    'pipeline_observer',
    'delivery_analyst',
    'runtime_cartographer',
    'feedback_liaison',
  ];

  for (const key of fallbackOrder) {
    if (!chosen.includes(key)) chosen.push(key);
    if (chosen.length >= preferredCount) break;
  }

  return chosen.slice(0, preferredCount);
}

function buildFocusLine(archetypeKey, parsedGap) {
  const componentText = parsedGap.components.length
    ? `across ${parsedGap.components.slice(0, 3).join(', ')}`
    : 'across the affected system surfaces';

  switch (archetypeKey) {
    case 'integration_auditor':
      return `Focuses on execution mismatches ${componentText}.`;
    case 'contract_steward':
      return `Focuses on explicit interface and data contracts ${componentText}.`;
    case 'delivery_analyst':
      return `Focuses on workflow friction and delivery risk ${componentText}.`;
    case 'pipeline_observer':
      return `Focuses on silent failures and stalled transitions ${componentText}.`;
    case 'runtime_cartographer':
      return `Focuses on runtime boundaries and dependencies ${componentText}.`;
    default:
      return `Focuses on user-visible symptoms and feedback loops ${componentText}.`;
  }
}

function buildWhyThisRole(archetype, parsedGap) {
  const context = parsedGap.systemContext ? ` within ${parsedGap.systemContext}` : '';
  const gapSummary = parsedGap.description || 'the reported system gap';
  return `${archetype.role} is a fit because "${gapSummary}" suggests a need to ${archetype.summary.toLowerCase()}${context}.`;
}

function createCandidateProfile(archetypeKey, parsedGap, index) {
  const archetype = ARCHETYPES[archetypeKey];
  const focusLine = buildFocusLine(archetypeKey, parsedGap);
  const nameIndex = (parsedGap.tokens.length + index * 2) % NAME_BANK.length;
  const gapSeed = slugify(parsedGap.description || parsedGap.systemContext || `gap-${index + 1}`);

  return {
    id: `${gapSeed}-${slugify(archetype.role)}`,
    name: NAME_BANK[nameIndex],
    role: archetype.role,
    department: archetype.department,
    summary: `${archetype.summary} ${focusLine}`,
    strengths: archetype.strengths,
    weaknesses: archetype.weaknesses,
    recommended_tools: archetype.recommended_tools,
    recommended_skills: archetype.recommended_skills,
    model_policy: archetype.model_policy,
    why_this_role: buildWhyThisRole(archetype, parsedGap),
    risk_notes: archetype.risk_notes,
    confidence: archetype.confidence,
  };
}

function validateGap(gap) {
  if (!gap || typeof gap !== 'object' || Array.isArray(gap)) {
    throw new Error('gap must be an object.');
  }
  if (!String(gap.description || '').trim()) {
    throw new Error('gap.description is required.');
  }
}

function generateCandidates(gap) {
  validateGap(gap);
  const parsedGap = tokenizeGap(gap);
  const archetypes = chooseArchetypes(parsedGap);

  return archetypes.map((archetypeKey, index) => createCandidateProfile(archetypeKey, parsedGap, index));
}

module.exports = {
  ARCHETYPES,
  NAME_BANK,
  generateCandidates,
  validateGap,
  candidateSchemaPath: path.join(__dirname, 'candidateSchema.json'),
};
