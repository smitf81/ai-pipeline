const AGENT_ATTRIBUTION_VERSION = 'ace/agent-attribution.v0';
const AGENT_ATTRIBUTION_DEFAULT_ID = 'dave';

const STAGE_AGENT_IDS = Object.freeze({
  planner: 'planner',
  'context-manager': 'context-manager',
  builder: 'builder',
  executor: 'executor',
  validator: 'validator',
  validate: 'validator',
  preflight: 'validator',
  apply: 'executor',
  rebuild: 'builder',
  'self-upgrade': 'executor',
  'autonomy-policy': 'autonomy-policy',
  'fix-task': 'autonomy-policy',
});

const ARTIFACT_AGENT_IDS = Object.freeze({
  'idea.txt': 'planner',
  'context.md': 'planner',
  'plan.md': 'planner',
  'patch.diff': 'builder',
  'apply_result.json': 'executor',
  'fix_task.json': 'autonomy-policy',
  'fix_task.md': 'autonomy-policy',
  'agent_attribution.json': 'dave',
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeAgentIdentity(agent = {}, fallback = {}) {
  const source = typeof agent === 'string' ? { agent_id: agent } : (agent && typeof agent === 'object' ? agent : {});
  const fallbackSource = typeof fallback === 'string' ? { agent_id: fallback } : (fallback && typeof fallback === 'object' ? fallback : {});
  const agentId = String(
    source.agent_id
    || source.agentId
    || fallbackSource.agent_id
    || fallbackSource.agentId
    || AGENT_ATTRIBUTION_DEFAULT_ID,
  ).trim().toLowerCase() || AGENT_ATTRIBUTION_DEFAULT_ID;
  const agentVersion = String(
    source.agent_version
    || source.agentVersion
    || fallbackSource.agent_version
    || fallbackSource.agentVersion
    || AGENT_ATTRIBUTION_VERSION,
  ).trim() || AGENT_ATTRIBUTION_VERSION;
  return {
    agent_id: agentId,
    agent_version: agentVersion,
  };
}

function resolveStageAgentIdentity(stage = '', fallback = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  return normalizeAgentIdentity({
    agent_id: STAGE_AGENT_IDS[normalizedStage] || fallback.agent_id || fallback.agentId || AGENT_ATTRIBUTION_DEFAULT_ID,
    agent_version: fallback.agent_version || fallback.agentVersion || AGENT_ATTRIBUTION_VERSION,
  }, fallback);
}

function resolveArtifactAgentIdentity(artifactName = '', fallback = {}) {
  const normalizedArtifact = String(artifactName || '').trim().toLowerCase();
  return normalizeAgentIdentity({
    agent_id: ARTIFACT_AGENT_IDS[normalizedArtifact] || fallback.agent_id || fallback.agentId || AGENT_ATTRIBUTION_DEFAULT_ID,
    agent_version: fallback.agent_version || fallback.agentVersion || AGENT_ATTRIBUTION_VERSION,
  }, fallback);
}

function attachAgentAttribution(payload = {}, attribution = {}) {
  const normalized = normalizeAgentIdentity(attribution);
  return {
    ...payload,
    agent_id: normalized.agent_id,
    agent_version: normalized.agent_version,
    attribution: normalized,
  };
}

function renderAgentAttributionBlock(attribution = {}, { title = 'Agent Attribution' } = {}) {
  const normalized = normalizeAgentIdentity(attribution);
  return [
    `## ${title}`,
    `- agent_id: ${normalized.agent_id}`,
    `- agent_version: ${normalized.agent_version}`,
  ].join('\n');
}

function buildTaskArtifactAttributionMap({
  taskId = null,
  taskDir = null,
  rootPath = null,
  createdAt = null,
  updatedAt = null,
  artifactNames = [],
} = {}) {
  const artifacts = {};
  const names = Array.isArray(artifactNames) ? artifactNames : [];
  for (const artifactName of names) {
    artifacts[artifactName] = {
      ...resolveArtifactAgentIdentity(artifactName),
      stage: String(artifactName || '').toLowerCase() === 'plan.md'
        ? 'planner'
        : (String(artifactName || '').toLowerCase() === 'patch.diff'
          ? 'builder'
          : (String(artifactName || '').toLowerCase() === 'apply_result.json'
            ? 'executor'
            : (String(artifactName || '').toLowerCase().startsWith('fix_task')
              ? 'autonomy-policy'
              : 'planner'))),
    };
  }
  return attachAgentAttribution({
    version: AGENT_ATTRIBUTION_VERSION,
    taskId: taskId || null,
    taskDir: taskDir || null,
    created_utc: createdAt || nowIso(),
    updated_utc: updatedAt || createdAt || nowIso(),
    artifacts,
  }, resolveStageAgentIdentity('planner'));
}

module.exports = {
  AGENT_ATTRIBUTION_DEFAULT_ID,
  AGENT_ATTRIBUTION_VERSION,
  ARTIFACT_AGENT_IDS,
  STAGE_AGENT_IDS,
  attachAgentAttribution,
  buildTaskArtifactAttributionMap,
  normalizeAgentIdentity,
  resolveArtifactAgentIdentity,
  resolveStageAgentIdentity,
  renderAgentAttributionBlock,
};
