export const CADENCE_OBLIGATION_VERSION = 'field-fronts.runtime-cadence.registry.v0';

const DIRTY_KEYS = Object.freeze([
  'nav',
  'economy',
  'logistics',
  'construction',
  'combatTargets',
  'ai',
  'fields',
  'renderUi'
]);

const VERSION_KEYS = Object.freeze([
  'map',
  'structures',
  'nav',
  'economy',
  'squads',
  'construction',
  'logistics',
  'combatTargets',
  'ai',
  'fields',
  'renderUi'
]);

export const CADENCE_CLASSIFICATIONS = Object.freeze({
  decisionLoop: 'decision_loop',
  serviceLoop: 'service_loop',
  derivedField: 'derived_field',
  diagnosticProjection: 'diagnostic_projection'
});

export const CADENCE_SYSTEMS = deepFreeze({
  enemyAI: {
    id: 'enemyAI',
    owner: 'src/game/gameModel.js::advanceEnemyAIDirector',
    classification: CADENCE_CLASSIFICATIONS.decisionLoop,
    everyTicks: 4,
    dirtyKeys: [],
    versionKeys: [],
    forbiddenDirtyKeys: ['fields', 'combatTargets', 'logistics', 'economy', 'renderUi'],
    forbiddenVersionKeys: ['fields', 'combatTargets', 'logistics', 'economy', 'renderUi'],
    cadenceReason: 'Enemy command decisions are intentional state-machine updates, not a response to every economy, logistics, combat, or field churn event.',
    budgetRisk: 'high',
    mustUse: ['shouldRunScheduledSystem', 'completeScheduledSystem'],
    proof: [
      'runtimeEvents.test.mjs asserts enemyAI has no versionKeys',
      'run-sim-frame-budget-qa.mjs reports enemyAI runDelta',
      'playerControlEnemyDirector.test.mjs covers director behaviour under cadence'
    ]
  },
  logistics: {
    id: 'logistics',
    owner: 'src/game/logisticsSystem.js::advanceLogistics',
    classification: CADENCE_CLASSIFICATIONS.serviceLoop,
    everyTicks: 2,
    dirtyKeys: ['logistics'],
    versionKeys: ['economy', 'construction', 'logistics', 'squads', 'structures'],
    forbiddenDirtyKeys: ['fields', 'combatTargets', 'renderUi'],
    forbiddenVersionKeys: ['fields', 'combatTargets', 'renderUi'],
    cadenceReason: 'Supply assignment can wake for real logistics/economy/construction changes, but must not be dragged by render or field invalidation.',
    budgetRisk: 'medium',
    mustUse: ['shouldRunScheduledSystem', 'completeScheduledSystem'],
    proof: [
      'logisticsSystem.js gates idle demand assignment through shouldRunScheduledSystem',
      'constructionJobs.test.mjs checks logistics dirty/version effects',
      'runtimePerformanceQa.test.mjs checks logistics demotion remains scheduled'
    ]
  },
  fieldOverlay: {
    id: 'fieldOverlay',
    owner: 'src/game/runtimeEvents.js::RUNTIME_SCHEDULER_DEFAULTS',
    classification: CADENCE_CLASSIFICATIONS.diagnosticProjection,
    everyTicks: 8,
    dirtyKeys: [],
    versionKeys: ['map'],
    forbiddenDirtyKeys: ['fields', 'combatTargets', 'renderUi'],
    forbiddenVersionKeys: ['fields', 'combatTargets', 'renderUi'],
    cadenceReason: 'Debug field overlays are projections. They may follow map substrate changes but must not make generic field dirtiness self-amplifying.',
    budgetRisk: 'medium',
    mustUse: [],
    proof: [
      'runtimeEvents.test.mjs asserts no generic fields dirty subscription',
      'run-sim-frame-budget-qa.mjs reports scheduler run deltas'
    ]
  },
  aiAppraisal: {
    id: 'aiAppraisal',
    owner: 'src/game/gameModel.js::deriveRuntimeBehaviourFields',
    classification: CADENCE_CLASSIFICATIONS.derivedField,
    everyTicks: 6,
    dirtyKeys: ['ai'],
    versionKeys: [],
    forbiddenDirtyKeys: ['fields', 'combatTargets', 'logistics', 'economy', 'renderUi'],
    forbiddenVersionKeys: ['fields', 'combatTargets', 'logistics', 'economy', 'renderUi'],
    cadenceReason: 'Behaviour appraisal may wake for explicit AI intent/appraisal events only; ordinary world churn waits for cadence.',
    budgetRisk: 'high',
    mustUse: ['shouldRunScheduledSystem', 'completeScheduledSystem'],
    proof: [
      'runtimeEvents.test.mjs asserts aiAppraisal has no versionKeys',
      'behaviourFields.test.mjs covers derived behaviour fields',
      'run-sim-frame-budget-qa.mjs reports aiAppraisal runDelta'
    ]
  },
  weatherFields: {
    id: 'weatherFields',
    owner: 'src/game/gameModel.js::deriveCachedWeatherFields',
    classification: CADENCE_CLASSIFICATIONS.derivedField,
    everyTicks: 16,
    dirtyKeys: [],
    versionKeys: ['map'],
    forbiddenDirtyKeys: ['fields', 'combatTargets', 'ai', 'renderUi'],
    forbiddenVersionKeys: ['fields', 'combatTargets', 'ai', 'renderUi'],
    cadenceReason: 'Weather field generation is heavy and ambient. It follows its heartbeat or map/weather substrate changes, not generic field dirtiness.',
    budgetRisk: 'high',
    mustUse: ['shouldRunScheduledSystem', 'completeScheduledSystem'],
    proof: [
      'runtimeEvents.test.mjs asserts weatherFields ignores generic fields dirty',
      'run-sim-frame-budget-qa.mjs reports weatherCadenceRestored',
      'weatherFields.test.mjs covers weather derivation semantics'
    ]
  }
});

export function buildRuntimeSchedulerDefaultsFromCadenceRegistry() {
  return deepFreeze(Object.fromEntries(Object.entries(CADENCE_SYSTEMS).map(([id, contract]) => [id, {
    everyTicks: contract.everyTicks,
    nextTick: 0,
    dirtyKeys: [...contract.dirtyKeys],
    versionKeys: [...contract.versionKeys]
  }])));
}

export function getCadenceSystemContract(systemId) {
  return CADENCE_SYSTEMS[systemId] ?? null;
}

export function summarizeCadenceRegistry() {
  return {
    contractId: CADENCE_OBLIGATION_VERSION,
    systems: Object.fromEntries(Object.entries(CADENCE_SYSTEMS).map(([id, contract]) => [id, {
      owner: contract.owner,
      classification: contract.classification,
      everyTicks: contract.everyTicks,
      dirtyKeys: [...contract.dirtyKeys],
      versionKeys: [...contract.versionKeys],
      forbiddenDirtyKeys: [...(contract.forbiddenDirtyKeys ?? [])],
      forbiddenVersionKeys: [...(contract.forbiddenVersionKeys ?? [])],
      budgetRisk: contract.budgetRisk,
      cadenceReason: contract.cadenceReason,
      proof: [...(contract.proof ?? [])]
    }]))
  };
}

export function validateCadenceRegistry({ schedulerDefaults = buildRuntimeSchedulerDefaultsFromCadenceRegistry() } = {}) {
  const findings = [];
  const seenIds = new Set();

  for (const [id, contract] of Object.entries(CADENCE_SYSTEMS)) {
    if (seenIds.has(id)) {
      findings.push(finding('high', 'cadence_registry_duplicate_system', `${id} is declared more than once.`));
    }
    seenIds.add(id);

    if (contract.id !== id) {
      findings.push(finding('high', 'cadence_registry_id_mismatch', `${id} contract id is ${contract.id}.`));
    }
    if (typeof contract.owner !== 'string' || contract.owner.length < 8) {
      findings.push(finding('high', 'cadence_registry_missing_owner', `${id} has no useful owner.`));
    }
    if (!Number.isInteger(contract.everyTicks) || contract.everyTicks < 1) {
      findings.push(finding('high', 'cadence_registry_invalid_cadence', `${id} has invalid everyTicks: ${contract.everyTicks}.`));
    }
    validateKeyList(findings, id, 'dirtyKeys', contract.dirtyKeys, DIRTY_KEYS);
    validateKeyList(findings, id, 'versionKeys', contract.versionKeys, VERSION_KEYS);

    for (const key of contract.forbiddenDirtyKeys ?? []) {
      if ((contract.dirtyKeys ?? []).includes(key)) {
        findings.push(finding('high', 'cadence_forbidden_dirty_key', `${id} subscribes to forbidden dirty key ${key}.`));
      }
    }
    for (const key of contract.forbiddenVersionKeys ?? []) {
      if ((contract.versionKeys ?? []).includes(key)) {
        findings.push(finding('high', 'cadence_forbidden_version_key', `${id} subscribes to forbidden version key ${key}.`));
      }
    }
    if (!Array.isArray(contract.proof) || contract.proof.length === 0) {
      findings.push(finding('medium', 'cadence_registry_missing_proof', `${id} has no proof expectations.`));
    }

    const schedule = schedulerDefaults?.[id];
    if (!schedule) {
      findings.push(finding('high', 'cadence_registry_missing_scheduler_default', `${id} has no scheduler default.`));
      continue;
    }
    if (schedule.everyTicks !== contract.everyTicks) {
      findings.push(finding('high', 'cadence_scheduler_cadence_drift', `${id} scheduler everyTicks ${schedule.everyTicks} differs from registry ${contract.everyTicks}.`));
    }
    if (!sameArray(schedule.dirtyKeys, contract.dirtyKeys)) {
      findings.push(finding('high', 'cadence_scheduler_dirty_drift', `${id} scheduler dirtyKeys [${schedule.dirtyKeys}] differs from registry [${contract.dirtyKeys}].`));
    }
    if (!sameArray(schedule.versionKeys, contract.versionKeys)) {
      findings.push(finding('high', 'cadence_scheduler_version_drift', `${id} scheduler versionKeys [${schedule.versionKeys}] differs from registry [${contract.versionKeys}].`));
    }
  }

  for (const id of Object.keys(schedulerDefaults ?? {})) {
    if (!CADENCE_SYSTEMS[id]) {
      findings.push(finding('high', 'cadence_undeclared_scheduler_system', `${id} has scheduler defaults but no cadence registry contract.`));
    }
  }

  return {
    ok: !findings.some((entry) => entry.severity === 'high'),
    contractId: CADENCE_OBLIGATION_VERSION,
    findings
  };
}

function validateKeyList(findings, systemId, field, keys, allowed) {
  if (!Array.isArray(keys)) {
    findings.push(finding('high', 'cadence_registry_invalid_key_list', `${systemId}.${field} is not an array.`));
    return;
  }
  for (const key of keys) {
    if (!allowed.includes(key)) {
      findings.push(finding('high', 'cadence_registry_unknown_key', `${systemId}.${field} contains unknown key ${key}.`));
    }
  }
}

function finding(severity, code, message) {
  return { severity, code, message };
}

function sameArray(left = [], right = []) {
  return JSON.stringify([...(left ?? [])]) === JSON.stringify([...(right ?? [])]);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return value;
}
