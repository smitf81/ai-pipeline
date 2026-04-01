const fs = require('fs');
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

const ASSIGNED_MODEL = 'mistral:latest';
const ROLE_TAXONOMY_PATH = path.join(__dirname, '..', 'ui', 'public', 'spatial', 'roleTaxonomy.mjs');
let cachedRoleTaxonomy = null;

function loadRoleTaxonomy() {
  if (cachedRoleTaxonomy) return cachedRoleTaxonomy;
  const source = fs.readFileSync(ROLE_TAXONOMY_PATH, 'utf8');
  const match = source.match(/export const ROLE_TAXONOMY_JSON = String\.raw`([\s\S]*?)`;/);
  if (!match) {
    throw new Error('roleTaxonomy.mjs is missing the ROLE_TAXONOMY_JSON export.');
  }
  cachedRoleTaxonomy = JSON.parse(match[1]);
  return cachedRoleTaxonomy;
}

const ROLE_TAXONOMY = loadRoleTaxonomy();
const ARCHETYPES = Object.fromEntries(
  ROLE_TAXONOMY.roles
    .filter((role) => role.kind === 'talent')
    .map((role) => [role.id, {
      id: role.id,
      role: role.label,
      department: role.starterTemplate?.department || 'Talent Acquisition',
      desk_targets: Array.isArray(role.allowedDeskIds) ? [...role.allowedDeskIds] : [],
      summary: role.summary,
      strengths: Array.isArray(role.strengths) ? [...role.strengths] : [],
      weaknesses: Array.isArray(role.weaknesses) ? [...role.weaknesses] : [],
      recommended_tools: Array.isArray(role.recommendedTools) ? [...role.recommendedTools] : [],
      recommended_skills: Array.isArray(role.recommendedSkills) ? [...role.recommendedSkills] : [],
      model_policy: role.modelPolicy ? { ...role.modelPolicy } : null,
      risk_notes: Array.isArray(role.riskNotes) ? [...role.riskNotes] : [],
      confidence: Number(role.confidence || 0),
      gapSignals: Array.isArray(role.gapSignals) ? [...role.gapSignals] : [],
      capabilities: Array.isArray(role.capabilities) ? [...role.capabilities] : [],
      allowed_department_ids: Array.isArray(role.allowedDepartmentIds) ? [...role.allowedDepartmentIds] : [],
      lead_role_ids: Array.isArray(role.leadOfDepartmentIds) ? [...role.leadOfDepartmentIds] : [],
    }]),
);
const TALENT_ROLE_ORDER = ROLE_TAXONOMY.roles.filter((role) => role.kind === 'talent').map((role) => role.id);

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
  const scores = TALENT_ROLE_ORDER.map((key) => {
    const archetype = ARCHETYPES[key];
    const score = archetype.gapSignals.reduce((total, word) => total + (parsedGap.corpus.includes(word) ? 1 : 0), 0);
    return { key, score };
  }).sort((left, right) => right.score - left.score);

  const chosen = scores.filter((entry) => entry.score > 0).map((entry) => entry.key);
  const preferredCount = Math.min(5, Math.max(3, 3 + Math.min(parsedGap.components.length, 2)));
  const fallbackOrder = [...TALENT_ROLE_ORDER];

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
  const assignedModel = ASSIGNED_MODEL;
  const deskTargets = Array.isArray(archetype.desk_targets) ? [...archetype.desk_targets] : [];
  const primaryDeskTarget = deskTargets[0] || null;
  const cvCard = {
    title: `${NAME_BANK[nameIndex]} :: ${archetype.role}`,
    headline: primaryDeskTarget ? `${archetype.role} for ${primaryDeskTarget}` : archetype.role,
    summary: `${archetype.summary} ${focusLine}`,
    evidence: [
      `Gap signal: ${parsedGap.description || parsedGap.systemContext || 'unspecified'}`,
      `Assigned model: ${assignedModel}`,
      `Desk targets: ${deskTargets.length ? deskTargets.join(', ') : 'none'}`,
    ],
    controls: [
      'Model is locked after hiring.',
      'No fallback model path is allowed.',
      'Role and desk targets are fixed on the card.',
    ],
    contract: {
      input: [
        'A concrete desk gap or workflow issue.',
        'A target desk or department needing coverage.',
        'Evidence that the candidate improves the line of work.',
      ],
      output: [
        'A hire-ready CV card.',
        'An immutable model binding.',
        'A desk-ready contract for the roster.',
      ],
    },
  };

  return {
    id: `${gapSeed}-${slugify(archetype.role)}`,
    name: NAME_BANK[nameIndex],
    role_id: archetype.id,
    roleId: archetype.id,
    role: archetype.role,
    department: archetype.department,
    department_id: 'talent-acquisition',
    departmentId: 'talent-acquisition',
    allowed_department_ids: archetype.allowed_department_ids,
    allowedDepartmentIds: archetype.allowed_department_ids,
    allowed_desk_ids: deskTargets,
    allowedDeskIds: deskTargets,
    lead_role_ids: archetype.lead_role_ids,
    leadRoleIds: archetype.lead_role_ids,
    capabilities: archetype.capabilities,
    desk_targets: deskTargets,
    primary_desk_target: primaryDeskTarget,
    assigned_model: assignedModel,
    model_locked: true,
    summary: `${archetype.summary} ${focusLine}`,
    strengths: archetype.strengths,
    weaknesses: archetype.weaknesses,
    recommended_tools: archetype.recommended_tools,
    recommended_skills: archetype.recommended_skills,
    model_policy: archetype.model_policy,
    why_this_role: buildWhyThisRole(archetype, parsedGap),
    risk_notes: archetype.risk_notes,
    confidence: archetype.confidence,
    cv_card: cvCard,
    contract: cvCard.contract,
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
