const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { pathToFileURL } = require('url');
const { writeJsonIfChanged } = require('./changeHygiene');
const {
  readOpenQaInvestigations,
  readQaInvestigations,
  normalizeQaInvestigationRecord,
  getQaInvestigationsFilePath,
} = require('./externalQaProbe');
const {
  buildConstrainedAutoFixBundle,
  runConstrainedAutoFixExecutor,
} = require('./constrainedAutoFix');
const {
  UI_BOOT_INTEGRITY_LANE,
  UI_BOOT_MISSING_ASSET_TRIGGER,
  UI_BOOT_SCOPED_TARGETS,
  applyUiBootIntegrityRepair,
} = require('./uiBootIntegrity');
const {
  buildRepairLaneTrustPolicySummary,
  evaluateRepairLaneTrustPolicyCompliance,
  getRepairLaneTrustPolicy,
  getRepairLaneTrustPolicyRegistry,
} = require('./repairLaneTrustPolicy');

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean))];
}

function normalizeQaRepairValidationCheck(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const command = Array.isArray(source.command)
    ? source.command.map((entry) => normalizeText(entry)).filter(Boolean)
    : [];
  const testFile = normalizeText(source.test_file || source.testFile || source.file || source.path) || null;
  return {
    id: normalizeText(source.id) || null,
    kind: normalizeText(source.kind) || (testFile ? 'test-file' : 'syntax'),
    label: normalizeText(source.label) || (testFile ? path.basename(testFile) : 'Scoped syntax check'),
    test_file: testFile,
    command,
    required: source.required !== false,
    description: normalizeText(source.description) || '',
  };
}

function normalizeQaRepairRetryPolicy(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  return {
    max_attempts: Math.max(1, Number(source.max_attempts ?? source.maxAttempts ?? 2) || 2),
    stop_status: normalizeText(source.stop_status || source.stopStatus) || 'stalled_after_retries',
    allow_retry_verdicts: uniqueStrings(source.allow_retry_verdicts || source.allowRetryVerdicts || ['rejected', 'inconclusive']),
  };
}

function normalizeQaRepairLaneConfig(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const laneId = normalizeText(source.lane_id || source.laneId) || 'validation_seam';
  const trustPolicy = getRepairLaneTrustPolicy(source.trust_policy_id || source.trustPolicyId || laneId);
  const label = normalizeText(source.label) || (laneId === 'route_contract_health' ? 'Route + Contract Health' : 'Validation Seam');
  const ownerDepartment = normalizeText(source.owner_department || source.ownerDepartment) || 'QA';
  const allowedTriggerClasses = uniqueStrings(source.allowed_trigger_classes || source.allowedTriggerClasses || trustPolicy?.allowed_failure_classes || []);
  const scopedTargets = uniqueStrings(source.scoped_targets || source.scopedTargets || trustPolicy?.allowed_file_scope || []);
  const eligibilitySource = source.eligibility && typeof source.eligibility === 'object' ? source.eligibility : {};
  const validationChecks = Array.isArray(source.validation_checks || source.validationChecks)
    ? (source.validation_checks || source.validationChecks).map((check) => normalizeQaRepairValidationCheck(check))
    : [];
  const retryPolicy = normalizeQaRepairRetryPolicy(source.retry_policy || source.retryPolicy);
  return {
    lane_id: laneId,
    trust_policy_id: trustPolicy?.lane_id || laneId,
    label,
    owner_department: ownerDepartment,
    allowed_trigger_classes: allowedTriggerClasses,
    scoped_targets: scopedTargets,
    eligibility: {
      requires_open_status: eligibilitySource.requires_open_status !== false,
      min_repeat_count: Math.max(1, Number(eligibilitySource.min_repeat_count ?? eligibilitySource.minRepeatCount ?? 1) || 1),
      policy_hook: normalizeText(eligibilitySource.policy_hook || eligibilitySource.policyHook || source.policy_hook || source.policyHook) || null,
    },
    validation_checks: validationChecks,
    retry_policy: {
      ...retryPolicy,
      max_attempts: Math.max(1, Number(source.retry_policy?.max_attempts ?? source.retryPolicy?.maxAttempts ?? retryPolicy.max_attempts ?? trustPolicy?.retry_budget ?? 1) || trustPolicy?.retry_budget || 1),
    },
    trust_level: normalizeText(trustPolicy?.trust_level || source.trust_level || source.trustLevel) || 'medium',
    trust_reason: normalizeText(trustPolicy?.trust_reason || source.trust_reason || source.trustReason) || '',
    auto_apply_allowed: trustPolicy
      ? trustPolicy.auto_apply_allowed !== false
      : (source.auto_apply_allowed !== undefined ? source.auto_apply_allowed !== false : true),
    human_review_required_on_ambiguity: trustPolicy
      ? trustPolicy.human_review_required_on_ambiguity !== false
      : (source.human_review_required_on_ambiguity !== undefined ? source.human_review_required_on_ambiguity !== false : true),
    allowed_action_types: uniqueStrings(trustPolicy?.allowed_action_types || source.allowed_action_types || source.allowedActionTypes || ['inspect', 'patch', 'validate']),
    required_validation_gate_ids: uniqueStrings(trustPolicy?.required_validation_gate_ids || source.required_validation_gate_ids || source.requiredValidationGateIds || []),
    policy_block_status: normalizeText(trustPolicy?.policy_block_status || source.policy_block_status || source.policyBlockStatus) || 'policy_blocked',
    observability: {
      label: normalizeText(source.observability?.label || source.observabilityLabel) || label,
      status_label: normalizeText(source.observability?.status_label || source.observabilityStatusLabel) || 'watching',
    },
    truth_source: normalizeText(source.truth_source || source.truthSource) || null,
    repair_focus: normalizeText(source.repair_focus || source.repairFocus) || label,
    acceptance_criteria: uniqueStrings(source.acceptance_criteria || source.acceptanceCriteria || []),
    prohibited_actions: uniqueStrings(source.prohibited_actions || source.prohibitedActions || []),
    failing_test_names: uniqueStrings(source.failing_test_names || source.failingTestNames || []),
    failure_class: normalizeText(source.failure_class || source.failureClass) || null,
    lane_family: normalizeText(source.lane_family || source.laneFamily) || 'qa',
    trust_policy: trustPolicy,
  };
}

const QA_REPAIR_LANES = Object.freeze([
  normalizeQaRepairLaneConfig({
    lane_id: UI_BOOT_INTEGRITY_LANE,
    label: 'UI Boot Integrity',
    owner_department: 'QA',
    lane_family: 'boot',
    allowed_trigger_classes: [UI_BOOT_MISSING_ASSET_TRIGGER],
    scoped_targets: [...UI_BOOT_SCOPED_TARGETS],
    eligibility: {
      min_repeat_count: 1,
      requires_open_status: true,
      policy_hook: 'blocking_missing_client_asset_gate',
    },
    validation_checks: [
      {
        id: 'ui-boot-syntax',
        kind: 'syntax',
        label: 'UI boot integrity syntax checks',
      },
      {
        id: 'ui-boot-canary',
        kind: 'test-file',
        label: 'UI boot canary test',
        test_file: 'tests/qaUiBootCanary.test.mjs',
      },
      {
        id: 'ui-boot-lane',
        kind: 'test-file',
        label: 'UI boot integrity lane test',
        test_file: 'tests/uiBootIntegrityLane.test.mjs',
      },
      {
        id: 'ui-boot-contract',
        kind: 'test-file',
        label: 'Boot contract smoke test',
        test_file: 'tests/bootIntegrity.test.mjs',
      },
    ],
    retry_policy: {
      max_attempts: 2,
      stop_status: 'stalled_after_retries',
      allow_retry_verdicts: ['rejected', 'inconclusive'],
    },
    trust_level: 'high',
    observability: {
      label: 'UI boot integrity',
      status_label: 'watching',
    },
    truth_source: 'studio boot contract and mounted marker',
    repair_focus: 'Keep browser boot assets and mount flow canonical.',
    acceptance_criteria: [
      'Required boot assets resolve without a blocking 404',
      'Health snapshot no longer reports missing_client_asset',
      'Spatial app mount marker appears in smoke validation',
      'Focused UI boot validation passes',
    ],
    prohibited_actions: [
      'no unrestricted self-modification',
      'no changes outside declared scope',
      'no secrets/env/token handling',
      'no destructive file operations outside allowed targets',
      'no dependency install or removal unless explicitly permitted',
      'no network use beyond local validation and approved boot probes',
      'no bypassing QA gates',
      'no auto-merge / auto-accept without validation pass',
      'no planner, staffing, or route-contract edits',
    ],
    failing_test_names: ['bootIntegrity', 'uiBootIntegrityLane'],
    failure_class: 'ui_boot_integrity',
  }),
  normalizeQaRepairLaneConfig({
    lane_id: 'validation_seam',
    label: 'Validation Seam',
    owner_department: 'QA',
    lane_family: 'validation',
    allowed_trigger_classes: ['external_mismatch', 'probe_failure', 'freshness_unknown'],
    scoped_targets: [
      'ui/externalQaProbe.js',
      'ui/server.js',
      'ui/tests/externalValidation.test.mjs',
    ],
    eligibility: {
      min_repeat_count: 2,
      requires_open_status: true,
      policy_hook: 'open_repeat_external_validation_gate',
    },
    validation_checks: [
      {
        id: 'validation-seam-syntax',
        kind: 'syntax',
        label: 'Validation seam syntax checks',
      },
      {
        id: 'validation-seam-contract',
        kind: 'test-file',
        label: 'External validation contract test',
        test_file: 'tests/externalValidation.test.mjs',
      },
    ],
    retry_policy: {
      max_attempts: 2,
      stop_status: 'stalled_after_retries',
      allow_retry_verdicts: ['rejected', 'inconclusive'],
    },
    trust_level: 'high',
    observability: {
      label: 'External validation seam',
      status_label: 'watching',
    },
    truth_source: 'external QA probe',
    repair_focus: 'Keep the external probe contract stable and truthful.',
    acceptance_criteria: [
      'External probe result remains parseable',
      'Comparison payload keeps stable pass/fail fields',
      'Investigation inbox still reflects the contradiction state',
      'Focused QA validation passes',
    ],
    prohibited_actions: [
      'no unrestricted self-modification',
      'no changes outside declared scope',
      'no secrets/env/token handling',
      'no destructive file operations outside allowed targets',
      'no dependency install or removal unless explicitly permitted',
      'no network use unless explicitly part of approved QA research tooling',
      'no bypassing QA gates',
      'no auto-merge / auto-accept without validation pass',
      'no architectural rewrites',
    ],
    failing_test_names: ['externalValidation'],
    failure_class: 'qa_validation_seam',
  }),
  normalizeQaRepairLaneConfig({
    lane_id: 'route_contract_health',
    label: 'Route + Contract Health',
    owner_department: 'QA',
    lane_family: 'contract',
    allowed_trigger_classes: [
      'route_contract_mismatch',
      'payload_contract_mismatch',
      'response_shape_regression',
      'required_field_omission',
      'contract_field_omission',
      'undefined_drift',
      'null_drift',
    ],
    scoped_targets: [
      'ui/server.js',
      'ui/public/spatial/spatialApp.js',
      'ui/public/spatial/studioData.js',
      'ui/public/spatial/aceConnector.js',
      'ui/tests/qaRepairLaneContracts.test.mjs',
    ],
    eligibility: {
      min_repeat_count: 2,
      requires_open_status: true,
      policy_hook: 'open_repeat_route_contract_gate',
    },
    validation_checks: [
      {
        id: 'route-contract-syntax',
        kind: 'syntax',
        label: 'Route contract syntax checks',
      },
      {
        id: 'route-contract-canary',
        kind: 'test-file',
        label: 'Route contract canary test',
        test_file: 'tests/qaRouteContractCanary.test.mjs',
      },
      {
        id: 'route-contract-check',
        kind: 'test-file',
        label: 'Route contract health test',
        test_file: 'tests/qaRepairLaneContracts.test.mjs',
      },
    ],
    retry_policy: {
      max_attempts: 2,
      stop_status: 'stalled_after_retries',
      allow_retry_verdicts: ['rejected', 'inconclusive'],
    },
    trust_level: 'medium',
    observability: {
      label: 'Route + contract health',
      status_label: 'watching',
    },
    truth_source: 'QA state and desk contract',
    repair_focus: 'Keep backend and QA desk payloads in contract.',
    acceptance_criteria: [
      'QA state payload retains the lane registry and repair loop shape',
      'QA desk payload preserves contract fields and lane observability',
      'Required QA fields remain present and non-null where expected',
      'Focused route/contract validation passes',
    ],
    prohibited_actions: [
      'no unrestricted self-modification',
      'no changes outside declared scope',
      'no secrets/env/token handling',
      'no destructive file operations outside allowed targets',
      'no dependency install or removal unless explicitly permitted',
      'no network use unless explicitly part of approved QA research tooling',
      'no bypassing QA gates',
      'no auto-merge / auto-accept without validation pass',
      'no cross-lane repo edits unless explicitly scoped',
      'no architectural rewrites',
    ],
    failing_test_names: ['qaRepairLaneContracts'],
    failure_class: 'qa_route_contract_health',
  }),
  normalizeQaRepairLaneConfig({
    lane_id: 'planner_canonical_integrity',
    label: 'Planner Canonical Integrity',
    owner_department: 'Delivery',
    lane_family: 'planner',
    allowed_trigger_classes: [
      'planner_identity_mismatch',
      'planner_staffing_mismatch',
      'planner_target_mismatch',
      'planner_packaging_mismatch',
      'planner_truth_stale',
    ],
    scoped_targets: [
      'ui/server.js',
      'ui/studioLayoutSchema.js',
      'ui/agentWorkers.js',
      'ui/public/spatial/staffingRules.js',
      'ui/public/spatial/roleTaxonomy.mjs',
      'ui/tests/plannerCanonicalIntegrity.test.mjs',
    ],
    eligibility: {
      min_repeat_count: 2,
      requires_open_status: true,
      policy_hook: 'open_repeat_planner_canonical_integrity_gate',
    },
    validation_checks: [
      {
        id: 'planner-canonical-syntax',
        kind: 'syntax',
        label: 'Planner canonical integrity syntax checks',
      },
      {
        id: 'planner-canonical-canary',
        kind: 'test-file',
        label: 'Planner canonical canary test',
        test_file: 'tests/qaPlannerCanonicalCanary.test.mjs',
      },
      {
        id: 'planner-canonical-contract',
        kind: 'test-file',
        label: 'Planner canonical integrity test',
        test_file: 'tests/plannerCanonicalIntegrity.test.mjs',
      },
      {
        id: 'planner-regression-pack',
        kind: 'test-file',
        label: 'Planner regression pack test',
        test_file: 'tests/plannerRegressionPack.test.mjs',
      },
      {
        id: 'planner-staffing-rules',
        kind: 'test-file',
        label: 'Planner staffing rules test',
        test_file: 'tests/staffingRules.test.mjs',
      },
    ],
    retry_policy: {
      max_attempts: 2,
      stop_status: 'stalled_after_retries',
      allow_retry_verdicts: ['rejected', 'inconclusive'],
    },
    trust_level: 'high',
    observability: {
      label: 'Planner canonical integrity',
      status_label: 'watching',
    },
    truth_source: 'planner canonical identity and contract state',
    repair_focus: 'Keep planner identity, staffing, and action packaging canonical.',
    acceptance_criteria: [
      'Planner identity snapshot stays canonical',
      'Planner staffing truth stays aligned with delivery ownership',
      'Planner-generated artifacts resolve to the right target desks',
      'Planner validation checks pass',
    ],
    prohibited_actions: [
      'no unrestricted self-modification',
      'no changes outside declared scope',
      'no secrets/env/token handling',
      'no destructive file operations outside allowed targets',
      'no dependency install or removal unless explicitly permitted',
      'no network use unless explicitly part of approved QA research tooling',
      'no bypassing QA gates',
      'no auto-merge / auto-accept without validation pass',
      'no planner redesign',
      'no cross-department orchestration',
    ],
    failing_test_names: ['plannerCanonicalIntegrity', 'plannerRegressionPack', 'staffingRules'],
    failure_class: 'qa_planner_canonical_integrity',
  }),
]);

function getQaRepairLaneRegistry() {
  return QA_REPAIR_LANES.map((lane) => normalizeQaRepairLaneConfig(lane));
}

function getQaRepairLaneConfig(laneId = '') {
  const normalizedLaneId = normalizeText(laneId);
  return getQaRepairLaneRegistry().find((lane) => lane.lane_id === normalizedLaneId) || null;
}

const VALIDATION_SEAM_LANE = 'validation_seam';
const VALIDATION_SEAM_MAX_ATTEMPTS = getQaRepairLaneConfig(VALIDATION_SEAM_LANE)?.retry_policy?.max_attempts || 2;
const VALIDATION_SEAM_TARGETS = getQaRepairLaneConfig(VALIDATION_SEAM_LANE)?.scoped_targets || [
  'ui/externalQaProbe.js',
  'ui/server.js',
  'ui/tests/externalValidation.test.mjs',
];
const DEFAULT_QA_REPAIR_JOBS_PATH = path.join(__dirname, '..', 'data', 'spatial', 'qa', 'repair-jobs.json');
const DEFAULT_QA_REPAIR_ATTEMPTS_PATH = path.join(__dirname, '..', 'data', 'spatial', 'qa', 'repair-attempts.json');

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeUiRootRelativePath(relativePath = '') {
  return normalizeText(relativePath)
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^ui\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function resolveValidationTargetPath(rootPath = null, relativePath = '') {
  const uiRoot = path.join(rootPath || process.cwd(), 'ui');
  const normalized = normalizeUiRootRelativePath(relativePath);
  return normalized ? path.join(uiRoot, normalized) : uiRoot;
}

function getRepairJobsFilePath(rootPath = null) {
  return rootPath
    ? path.join(rootPath, 'data', 'spatial', 'qa', 'repair-jobs.json')
    : DEFAULT_QA_REPAIR_JOBS_PATH;
}

function getRepairAttemptsFilePath(rootPath = null) {
  return rootPath
    ? path.join(rootPath, 'data', 'spatial', 'qa', 'repair-attempts.json')
    : DEFAULT_QA_REPAIR_ATTEMPTS_PATH;
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(filePath, value = []) {
  writeJsonIfChanged(filePath, Array.isArray(value) ? value : [], {});
}

function appendJsonArrayRecord(filePath, record = {}) {
  const next = [...readJsonArray(filePath), record];
  writeJsonArray(filePath, next);
  return record;
}

function runNodeSyntaxCheck(targetPath = '') {
  const normalizedTargetPath = normalizeText(targetPath);
  if (!normalizedTargetPath) {
    return {
      id: 'syntax:missing',
      label: 'missing syntax target',
      ok: false,
      code: 1,
      stdout: '',
      stderr: 'Missing syntax target.',
    };
  }
  let source = '';
  try {
    source = fs.readFileSync(normalizedTargetPath, 'utf8');
  } catch (error) {
    return {
      id: `syntax:${normalizeUiRootRelativePath(normalizedTargetPath) || normalizedTargetPath}`,
      label: normalizeUiRootRelativePath(normalizedTargetPath) || normalizedTargetPath,
      ok: false,
      code: 1,
      stdout: '',
      stderr: String(error?.message || error),
    };
  }
  const resultFile = path.join(os.tmpdir(), `qa-syntax-result-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const isModuleLike = path.extname(normalizedTargetPath) === '.mjs' || /\bexport\s+|\bimport\s+/m.test(source);
  const worker = new Worker(`
    const fs = require('fs');
    const { workerData } = require('worker_threads');
    const signal = new Int32Array(workerData.signalBuffer);
    const reactHooks = {
      createElement: () => null,
      Fragment: Symbol.for('react.fragment'),
      Component: class {},
      PureComponent: class {},
      useState: (initial) => [initial, () => {}],
      useEffect: () => {},
      useMemo: (factory) => factory(),
      useRef: (initial) => ({ current: initial }),
      useCallback: (factory) => factory,
      useContext: () => null,
      useReducer: (reducer, initial) => [initial, () => {}],
      useLayoutEffect: () => {},
      useInsertionEffect: () => {},
      useSyncExternalStore: () => null,
      useDeferredValue: (value) => value,
      useTransition: () => [false, () => {}],
      memo: (component) => component,
      forwardRef: (render) => render,
    };
    globalThis.window = globalThis;
    globalThis.navigator = globalThis.navigator || {};
    globalThis.document = globalThis.document || {
      body: { appendChild: () => {} },
      createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} } }),
      getElementById: () => null,
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    globalThis.React = globalThis.React || reactHooks;
    globalThis.ReactDOM = globalThis.ReactDOM || {
      createRoot: () => ({ render: () => {}, unmount: () => {} }),
      render: () => {},
    };
    globalThis.fetch = globalThis.fetch || (async () => ({ ok: true, status: 200, json: async () => ({}) }));
    (async () => {
      let payload = {
        ok: false,
        code: 1,
        stdout: '',
        stderr: '',
      };
      try {
        if (workerData.mode === 'import') {
          await import(workerData.moduleUrl);
        } else {
          require(workerData.filePath);
        }
        payload = {
          ok: true,
          code: 0,
          stdout: '',
          stderr: '',
        };
      } catch (error) {
        payload = {
          ok: false,
          code: 1,
          stdout: '',
          stderr: String(error?.stack || error?.message || error || ''),
        };
      }
      try {
        fs.writeFileSync(workerData.resultFile, JSON.stringify(payload), 'utf8');
      } catch {
        // Ignore result write errors; the caller will surface a generic failure.
      }
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0, 1);
    })();
  `, {
    eval: true,
    workerData: {
      mode: isModuleLike ? 'import' : 'require',
      moduleUrl: isModuleLike ? pathToFileURL(normalizedTargetPath).href : null,
      filePath: normalizedTargetPath,
      resultFile,
      signalBuffer: signal.buffer,
    },
  });
  Atomics.wait(signal, 0, 0);
  let result = {
    ok: false,
    code: 1,
    stdout: '',
    stderr: 'Syntax target did not report a result.',
  };
  try {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch (error) {
    result = {
      ok: false,
      code: 1,
      stdout: '',
      stderr: String(error?.message || error || 'Failed to read syntax result.'),
    };
  } finally {
    try {
      fs.unlinkSync(resultFile);
    } catch {
      // Ignore cleanup failures.
    }
  }
  worker.terminate().catch(() => {});
  return {
    id: `syntax:${normalizeUiRootRelativePath(normalizedTargetPath) || normalizedTargetPath}`,
    label: normalizeUiRootRelativePath(normalizedTargetPath) || normalizedTargetPath,
    ok: Boolean(result.ok),
    code: Number.isFinite(Number(result.code)) ? Number(result.code) : (result.ok ? 0 : 1),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function normalizeRepairJobRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  const laneConfig = getQaRepairLaneConfig(source.lane || source.lane_id || VALIDATION_SEAM_LANE) || getQaRepairLaneConfig(VALIDATION_SEAM_LANE);
  const laneScopedTargets = Array.isArray(source.scoped_targets)
    ? source.scoped_targets.map((entry) => normalizeText(entry)).filter(Boolean)
    : [...(laneConfig?.scoped_targets || [])];
  const laneValidationChecks = Array.isArray(source.validation_checks)
    ? source.validation_checks.map((entry) => normalizeQaRepairValidationCheck(entry))
    : [...(laneConfig?.validation_checks || [])];
  const laneProhibitedActions = Array.isArray(source.prohibited_actions)
    ? source.prohibited_actions.map((entry) => normalizeText(entry)).filter(Boolean)
    : [...(laneConfig?.prohibited_actions || [])];
  const laneAcceptanceCriteria = Array.isArray(source.acceptance_criteria)
    ? source.acceptance_criteria.map((entry) => normalizeText(entry)).filter(Boolean)
    : [...(laneConfig?.acceptance_criteria || [])];
  return {
    id: normalizeText(source.id) || null,
    type: normalizeText(source.type) || 'qa_repair_job',
    lane: normalizeText(source.lane || source.lane_id) || VALIDATION_SEAM_LANE,
    trust_policy_id: normalizeText(source.trust_policy_id || source.trustPolicyId || laneConfig?.trust_policy_id) || laneConfig?.trust_policy_id || null,
    lane_label: normalizeText(source.lane_label || source.laneLabel || laneConfig?.label) || laneConfig?.label || 'Validation Seam',
    owner_department: normalizeText(source.owner_department || source.ownerDepartment || laneConfig?.owner_department) || laneConfig?.owner_department || 'QA',
    trust_level: normalizeText(source.trust_level || source.trustLevel || laneConfig?.trust_level) || laneConfig?.trust_level || 'medium',
    trust_reason: normalizeText(source.trust_reason || source.trustReason || laneConfig?.trust_reason) || laneConfig?.trust_reason || '',
    auto_apply_allowed: source.auto_apply_allowed !== undefined
      ? source.auto_apply_allowed !== false
      : laneConfig?.auto_apply_allowed !== false,
    human_review_required_on_ambiguity: source.human_review_required_on_ambiguity !== undefined
      ? source.human_review_required_on_ambiguity !== false
      : laneConfig?.human_review_required_on_ambiguity !== false,
    policy_block_status: normalizeText(source.policy_block_status || source.policyBlockStatus || laneConfig?.policy_block_status) || laneConfig?.policy_block_status || 'policy_blocked',
    observability_label: normalizeText(source.observability_label || source.observabilityLabel || laneConfig?.observability?.label) || laneConfig?.observability?.label || null,
    observability_status: normalizeText(source.observability_status || source.observabilityStatus || laneConfig?.observability?.status_label) || laneConfig?.observability?.status_label || 'watching',
    repair_focus: normalizeText(source.repair_focus || source.repairFocus || laneConfig?.repair_focus) || laneConfig?.repair_focus || null,
    truth_source: normalizeText(source.truth_source || source.truthSource || laneConfig?.truth_source) || laneConfig?.truth_source || null,
    investigation_id: normalizeText(source.investigation_id || source.investigationId) || null,
    source_signature: normalizeText(source.source_signature || source.signature) || null,
    trigger: normalizeText(source.trigger) || 'external_mismatch',
    summary: normalizeText(source.summary) || laneConfig?.repair_focus || 'QA repair job',
    scoped_targets: laneScopedTargets,
    acceptance_criteria: laneAcceptanceCriteria,
    prohibited_actions: laneProhibitedActions,
    allowed_actions: Array.isArray(source.allowed_actions)
      ? source.allowed_actions.map((entry) => normalizeText(entry)).filter(Boolean)
      : [...(laneConfig?.allowed_action_types || [])],
    allowed_action_types: Array.isArray(source.allowed_action_types || source.allowedActionTypes)
      ? (source.allowed_action_types || source.allowedActionTypes).map((entry) => normalizeText(entry)).filter(Boolean)
      : [...(laneConfig?.allowed_action_types || [])],
    max_attempts: Math.max(1, Number(source.max_attempts ?? source.maxAttempts ?? laneConfig?.retry_policy?.max_attempts ?? VALIDATION_SEAM_MAX_ATTEMPTS) || VALIDATION_SEAM_MAX_ATTEMPTS),
    attempt_count: Math.max(0, Number(source.attempt_count ?? source.attemptCount ?? 0) || 0),
    status: normalizeText(source.status) || 'open',
    created_at: normalizeText(source.created_at || source.createdAt) || null,
    updated_at: normalizeText(source.updated_at || source.updatedAt || source.created_at || source.createdAt) || null,
    allowed_trigger_classes: Array.isArray(source.allowed_trigger_classes)
      ? source.allowed_trigger_classes.map((entry) => normalizeText(entry)).filter(Boolean)
      : [...(laneConfig?.allowed_trigger_classes || [])],
    validation_checks: laneValidationChecks,
    required_validation_gate_ids: Array.isArray(source.required_validation_gate_ids || source.requiredValidationGateIds)
      ? (source.required_validation_gate_ids || source.requiredValidationGateIds).map((entry) => normalizeText(entry)).filter(Boolean)
      : [...(laneConfig?.required_validation_gate_ids || [])],
    failure_class: normalizeText(source.failure_class || source.failureClass || laneConfig?.failure_class) || laneConfig?.failure_class || null,
    latest_attempt_id: normalizeText(source.latest_attempt_id || source.latestAttemptId) || null,
    latest_attempt_at: normalizeText(source.latest_attempt_at || source.latestAttemptAt) || null,
    latest_verdict: normalizeText(source.latest_verdict || source.latestVerdict) || null,
    latest_validation_evidence: source.latest_validation_evidence && typeof source.latest_validation_evidence === 'object'
      ? source.latest_validation_evidence
      : null,
    latest_policy_check: source.latest_policy_check && typeof source.latest_policy_check === 'object'
      ? source.latest_policy_check
      : null,
    policy_block_reason: normalizeText(source.policy_block_reason || source.policyBlockReason) || null,
    evidence_bundle: source.evidence_bundle && typeof source.evidence_bundle === 'object'
      ? source.evidence_bundle
      : {},
    trust_policy: source.trust_policy && typeof source.trust_policy === 'object'
      ? source.trust_policy
      : (laneConfig?.trust_policy || null),
    executor_brief: source.executor_brief && typeof source.executor_brief === 'object'
      ? source.executor_brief
      : null,
    retry_budget: Math.max(0, Number(source.retry_budget ?? (Math.max(1, Number(source.max_attempts ?? laneConfig?.retry_policy?.max_attempts ?? VALIDATION_SEAM_MAX_ATTEMPTS) || VALIDATION_SEAM_MAX_ATTEMPTS) - Math.max(0, Number(source.attempt_count ?? 0) || 0))) || 0),
  };
}

function normalizeRepairAttemptRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  return {
    attempt_id: normalizeText(source.attempt_id || source.attemptId) || null,
    repair_job_id: normalizeText(source.repair_job_id || source.repairJobId) || null,
    investigation_id: normalizeText(source.investigation_id || source.investigationId) || null,
    lane: normalizeText(source.lane || source.lane_id || source.laneId) || null,
    lane_label: normalizeText(source.lane_label || source.laneLabel) || null,
    timestamp: normalizeText(source.timestamp || source.created_at || source.createdAt) || null,
    changed_files: Array.isArray(source.changed_files || source.changedFiles)
      ? (source.changed_files || source.changedFiles).map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    proposed_fix_summary: normalizeText(source.proposed_fix_summary || source.proposedFixSummary) || '',
    validation_verdict: normalizeText(source.validation_verdict || source.validationVerdict) || 'inconclusive',
    validation_evidence_summary: normalizeText(source.validation_evidence_summary || source.validationEvidenceSummary) || '',
    policy_block_reason: normalizeText(source.policy_block_reason || source.policyBlockReason) || null,
    status: normalizeText(source.status) || normalizeText(source.validation_verdict || source.validationVerdict) || 'inconclusive',
    executor_summary: normalizeText(source.executor_summary || source.executorSummary) || '',
    created_at: normalizeText(source.created_at || source.createdAt) || null,
  };
}

function sortByUpdatedAtDesc(left = null, right = null) {
  const leftTime = Date.parse(normalizeText(left?.updated_at || left?.latest_attempt_at || left?.created_at) || '');
  const rightTime = Date.parse(normalizeText(right?.updated_at || right?.latest_attempt_at || right?.created_at) || '');
  const leftKnown = Number.isFinite(leftTime);
  const rightKnown = Number.isFinite(rightTime);
  if (leftKnown && rightKnown && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }
  return String(normalizeText(right?.id) || '').localeCompare(String(normalizeText(left?.id) || ''));
}

function sortAttemptsDesc(left = null, right = null) {
  const leftTime = Date.parse(normalizeText(left?.timestamp || left?.created_at || left?.createdAt) || '');
  const rightTime = Date.parse(normalizeText(right?.timestamp || right?.created_at || right?.createdAt) || '');
  const leftKnown = Number.isFinite(leftTime);
  const rightKnown = Number.isFinite(rightTime);
  if (leftKnown && rightKnown && leftTime !== rightTime) {
    return rightTime - leftTime;
  }
  if (leftKnown !== rightKnown) {
    return leftKnown ? -1 : 1;
  }
  return String(normalizeText(right?.attempt_id) || '').localeCompare(String(normalizeText(left?.attempt_id) || ''));
}

function readQaRepairJobs(rootPath = null) {
  return readJsonArray(getRepairJobsFilePath(rootPath)).map((record) => normalizeRepairJobRecord(record));
}

function readQaRepairAttempts(rootPath = null) {
  return readJsonArray(getRepairAttemptsFilePath(rootPath)).map((record) => normalizeRepairAttemptRecord(record));
}

function doesInvestigationQualifyForLane(investigation = null, lane = null) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  const laneConfig = normalizeQaRepairLaneConfig(lane || {});
  if (!record || record.status !== 'open') {
    return false;
  }
  if (laneConfig.eligibility?.requires_open_status !== false && record.status !== 'open') {
    return false;
  }
  if (!laneConfig.allowed_trigger_classes.includes(record.trigger)) {
    return false;
  }
  if (Number(record.repeat_count || 0) < Number(laneConfig.eligibility?.min_repeat_count || 1)) {
    return false;
  }
  return true;
}

function selectQaRepairLaneForInvestigation(investigation = null, lanes = getQaRepairLaneRegistry()) {
  const record = normalizeQaInvestigationRecord(investigation || {});
  return (Array.isArray(lanes) ? lanes : []).find((lane) => doesInvestigationQualifyForLane(record, lane)) || null;
}

function buildQaRepairLaneEligibilitySummary(lane = null) {
  const laneConfig = normalizeQaRepairLaneConfig(lane || {});
  const triggerSummary = laneConfig.allowed_trigger_classes.length
    ? laneConfig.allowed_trigger_classes.join(', ')
    : 'any trigger';
  const repeatSummary = `repeat_count >= ${Number(laneConfig.eligibility?.min_repeat_count || 1)}`;
  const statusSummary = laneConfig.eligibility?.requires_open_status === false ? 'open or closed' : 'open only';
  return `${statusSummary} | ${repeatSummary} | triggers: ${triggerSummary}`;
}

function buildQaRepairLaneTrustSummary(lane = null) {
  const laneConfig = normalizeQaRepairLaneConfig(lane || {});
  return `${buildRepairLaneTrustPolicySummary(laneConfig.trust_policy || laneConfig)} | ${laneConfig.truth_source || laneConfig.observability?.label || laneConfig.label}`;
}

function buildQaRepairLaneState(rootPath = null, lane = null, investigations = [], jobs = [], attempts = []) {
  const laneConfig = normalizeQaRepairLaneConfig(lane || {});
  const laneInvestigations = (Array.isArray(investigations) ? investigations : [])
    .map((entry) => normalizeQaInvestigationRecord(entry))
    .filter((entry) => doesInvestigationQualifyForLane(entry, laneConfig));
  const laneJobs = (Array.isArray(jobs) ? jobs : [])
    .map((entry) => normalizeRepairJobRecord(entry))
    .filter((entry) => entry.lane === laneConfig.lane_id)
    .sort(sortByUpdatedAtDesc);
  const laneAttempts = (Array.isArray(attempts) ? attempts : [])
    .map((entry) => normalizeRepairAttemptRecord(entry))
    .filter((entry) => laneJobs.some((job) => job.id && job.id === entry.repair_job_id))
    .sort(sortAttemptsDesc);
  const openJobCount = laneJobs.filter((job) => ['open', 'retry_queued'].includes(job.status)).length;
  const stalledJobCount = laneJobs.filter((job) => ['stalled_after_retries', 'needs_human_review'].includes(job.status)).length;
  const policyBlockedCount = laneJobs.filter((job) => job.status === (laneConfig.policy_block_status || 'policy_blocked')).length;
  const acceptedJobCount = laneJobs.filter((job) => job.status === 'accepted').length;
  const latestJob = laneJobs[0] || null;
  const latestAttempt = laneAttempts[0] || null;
  const latestAttemptVerdict = latestAttempt?.validation_verdict || latestJob?.latest_verdict || null;
  let status = 'idle';
  if (openJobCount > 0) {
    status = 'active';
  } else if (stalledJobCount > 0) {
    status = 'stalled';
  } else if (policyBlockedCount > 0) {
    status = 'blocked';
  } else if (acceptedJobCount > 0 && laneInvestigations.length === 0) {
    status = 'healthy';
  } else if (laneInvestigations.length > 0) {
    status = 'watching';
  }
  return {
    lane_id: laneConfig.lane_id,
    trust_policy_id: laneConfig.trust_policy_id,
    label: laneConfig.label,
    owner_department: laneConfig.owner_department,
    status,
    open_investigations: laneInvestigations.length,
    repair_job_count: laneJobs.length,
    open_job_count: openJobCount,
    latest_attempt_verdict: latestAttemptVerdict,
    latest_job_status: latestJob?.status || null,
    policy_blocked_job_count: policyBlockedCount,
    latest_policy_block_reason: normalizeText(latestJob?.policy_block_reason || latestJob?.latest_validation_evidence?.policy_block_reason) || null,
    latest_attempt_at: latestAttempt?.timestamp || latestAttempt?.created_at || null,
    trust_level: laneConfig.trust_level,
    trust_reason: laneConfig.trust_reason,
    trust_summary: buildQaRepairLaneTrustSummary(laneConfig),
    eligibility_summary: buildQaRepairLaneEligibilitySummary(laneConfig),
    auto_apply_allowed: laneConfig.auto_apply_allowed,
    human_review_required_on_ambiguity: laneConfig.human_review_required_on_ambiguity,
    allowed_action_types: [...laneConfig.allowed_action_types],
    required_validation_gate_ids: [...laneConfig.required_validation_gate_ids],
    observability_label: laneConfig.observability?.label || laneConfig.label,
    observability_status: laneConfig.observability?.status_label || 'watching',
    allowed_trigger_classes: [...laneConfig.allowed_trigger_classes],
    scoped_targets: [...laneConfig.scoped_targets],
    max_attempts: laneConfig.retry_policy?.max_attempts || VALIDATION_SEAM_MAX_ATTEMPTS,
    latest_job: latestJob,
    latest_attempt: latestAttempt,
    investigations: laneInvestigations,
    jobs: laneJobs,
    attempts: laneAttempts,
    source_root: normalizeText(rootPath) || null,
  };
}

function writeQaRepairJobs(rootPath = null, jobs = []) {
  const filePath = getRepairJobsFilePath(rootPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonArray(filePath, jobs);
  return jobs;
}

function upsertQaRepairJob(rootPath = null, job = null) {
  if (!job || typeof job !== 'object') return null;
  const filePath = getRepairJobsFilePath(rootPath);
  const existing = readQaRepairJobs(rootPath);
  const normalized = normalizeRepairJobRecord(job);
  const laneConfig = getQaRepairLaneConfig(normalized.lane || VALIDATION_SEAM_LANE) || getQaRepairLaneConfig(VALIDATION_SEAM_LANE);
  const matchedIndex = existing.findIndex((entry) => {
    const candidate = normalizeRepairJobRecord(entry);
    return candidate.id === normalized.id
      || (candidate.investigation_id && candidate.investigation_id === normalized.investigation_id && candidate.lane === normalized.lane);
  });
  const updatedAt = normalized.updated_at || nowIso();
  const next = existing.slice();
  const nextRecord = matchedIndex >= 0
    ? {
        ...existing[matchedIndex],
        ...normalized,
        created_at: existing[matchedIndex].created_at || normalized.created_at || updatedAt,
        updated_at: updatedAt,
      }
    : {
        ...normalized,
        created_at: normalized.created_at || updatedAt,
        updated_at: updatedAt,
      };
  if (!nextRecord.id) {
    nextRecord.id = `qa_repair_${String(existing.length + 1).padStart(3, '0')}`;
  }
  if (!nextRecord.scoped_targets.length) {
    nextRecord.scoped_targets = [...(laneConfig?.scoped_targets || VALIDATION_SEAM_TARGETS)];
  }
  if (!nextRecord.allowed_actions.length) {
    nextRecord.allowed_actions = [...(laneConfig?.allowed_action_types || ['inspect', 'patch', 'validate'])];
  }
  if (!nextRecord.prohibited_actions.length) {
    nextRecord.prohibited_actions = [...(laneConfig?.prohibited_actions || [
      'no unrestricted self-modification',
      'no changes outside declared scope',
      'no secrets/env/token handling',
      'no destructive file operations outside allowed targets',
      'no dependency install or removal unless explicitly permitted',
      'no network use unless explicitly part of approved QA research tooling',
      'no bypassing QA gates',
      'no auto-merge / auto-accept without validation pass',
    ])];
  }
  if (!nextRecord.acceptance_criteria.length) {
    nextRecord.acceptance_criteria = [...(laneConfig?.acceptance_criteria || [
      'Relevant QA checks pass',
      'Repair scope remains within declared files',
      'Investigation pressure is reduced or explained',
    ])];
  }
  if (!nextRecord.validation_checks.length) {
    nextRecord.validation_checks = [...(laneConfig?.validation_checks || [])];
  }
  if (!nextRecord.allowed_trigger_classes.length) {
    nextRecord.allowed_trigger_classes = [...(laneConfig?.allowed_trigger_classes || [])];
  }
  if (!nextRecord.lane_label) {
    nextRecord.lane_label = laneConfig?.label || 'Validation Seam';
  }
  if (!nextRecord.owner_department) {
    nextRecord.owner_department = laneConfig?.owner_department || 'QA';
  }
  if (!nextRecord.trust_level) {
    nextRecord.trust_level = laneConfig?.trust_level || 'medium';
  }
  if (!nextRecord.trust_reason) {
    nextRecord.trust_reason = laneConfig?.trust_reason || '';
  }
  if (nextRecord.auto_apply_allowed === undefined) {
    nextRecord.auto_apply_allowed = laneConfig?.auto_apply_allowed !== false;
  }
  if (nextRecord.human_review_required_on_ambiguity === undefined) {
    nextRecord.human_review_required_on_ambiguity = laneConfig?.human_review_required_on_ambiguity !== false;
  }
  if (!nextRecord.policy_block_status) {
    nextRecord.policy_block_status = laneConfig?.policy_block_status || 'policy_blocked';
  }
  if (!nextRecord.allowed_action_types?.length) {
    nextRecord.allowed_action_types = [...(laneConfig?.allowed_action_types || ['inspect', 'patch', 'validate'])];
  }
  if (!nextRecord.required_validation_gate_ids?.length) {
    nextRecord.required_validation_gate_ids = [...(laneConfig?.required_validation_gate_ids || [])];
  }
  if (!nextRecord.trust_policy) {
    nextRecord.trust_policy = laneConfig?.trust_policy || null;
  }
  if (!nextRecord.observability_label) {
    nextRecord.observability_label = laneConfig?.observability?.label || nextRecord.lane_label;
  }
  if (!nextRecord.observability_status) {
    nextRecord.observability_status = laneConfig?.observability?.status_label || 'watching';
  }
  if (!nextRecord.repair_focus) {
    nextRecord.repair_focus = laneConfig?.repair_focus || nextRecord.summary;
  }
  if (!nextRecord.truth_source) {
    nextRecord.truth_source = laneConfig?.truth_source || null;
  }
  if (!nextRecord.failure_class) {
    nextRecord.failure_class = laneConfig?.failure_class || null;
  }
  nextRecord.max_attempts = Math.max(1, Number(nextRecord.max_attempts) || laneConfig?.retry_policy?.max_attempts || VALIDATION_SEAM_MAX_ATTEMPTS);
  if (laneConfig?.trust_policy?.retry_budget) {
    nextRecord.max_attempts = Math.min(nextRecord.max_attempts, laneConfig.trust_policy.retry_budget);
  }
  nextRecord.attempt_count = Math.max(0, Number(nextRecord.attempt_count) || 0);
  nextRecord.retry_budget = Math.max(0, nextRecord.max_attempts - nextRecord.attempt_count);
  if (matchedIndex >= 0) {
    next[matchedIndex] = {
      ...existing[matchedIndex],
      ...nextRecord,
      created_at: existing[matchedIndex].created_at || nextRecord.created_at,
      updated_at: updatedAt,
    };
  } else {
    next.push(nextRecord);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonArray(filePath, next);
  return normalizeRepairJobRecord(nextRecord);
}

function buildValidationSeamRepairJobFromInvestigation(rootPath = null, investigation = null, options = {}) {
  return buildQaRepairJobFromInvestigation(rootPath, investigation, {
    ...options,
    laneId: VALIDATION_SEAM_LANE,
  });
}

function buildQaRepairJobFromInvestigation(rootPath = null, investigation = null, options = {}) {
  const source = normalizeQaInvestigationRecord(investigation);
  if (!source || source.status !== 'open') {
    return null;
  }
  const laneConfig = options.laneId
    ? getQaRepairLaneConfig(options.laneId)
    : selectQaRepairLaneForInvestigation(source);
  if (!laneConfig) {
    return null;
  }
  if (!doesInvestigationQualifyForLane(source, laneConfig)) {
    return null;
  }
  const createdAt = options.createdAt || nowIso();
  return normalizeRepairJobRecord({
    id: options.id || `qa_repair_${source.id || String(Date.now())}`,
    type: 'qa_repair_job',
    lane: laneConfig.lane_id,
    trust_policy_id: laneConfig.trust_policy_id,
    lane_label: laneConfig.label,
    owner_department: laneConfig.owner_department,
    trust_level: laneConfig.trust_level,
    trust_reason: laneConfig.trust_reason,
    auto_apply_allowed: laneConfig.auto_apply_allowed,
    human_review_required_on_ambiguity: laneConfig.human_review_required_on_ambiguity,
    policy_block_status: laneConfig.policy_block_status,
    observability_label: laneConfig.observability?.label || laneConfig.label,
    observability_status: laneConfig.observability?.status_label || 'watching',
    repair_focus: laneConfig.repair_focus,
    truth_source: laneConfig.truth_source,
    investigation_id: source.id,
    source_signature: source.signature || null,
    trigger: source.trigger,
    summary: source.summary || laneConfig.repair_focus || 'QA repair job',
    scoped_targets: options.scopedTargets || [...laneConfig.scoped_targets],
    acceptance_criteria: options.acceptanceCriteria || [...laneConfig.acceptance_criteria],
    prohibited_actions: options.prohibitedActions || [...laneConfig.prohibited_actions],
    allowed_actions: options.allowedActions || [...laneConfig.allowed_action_types],
    allowed_action_types: [...laneConfig.allowed_action_types],
    max_attempts: Math.min(
      Number(options.maxAttempts || laneConfig.retry_policy?.max_attempts || VALIDATION_SEAM_MAX_ATTEMPTS) || VALIDATION_SEAM_MAX_ATTEMPTS,
      Number(laneConfig.trust_policy?.retry_budget || laneConfig.retry_policy?.max_attempts || VALIDATION_SEAM_MAX_ATTEMPTS),
    ),
    attempt_count: Number(options.attemptCount || 0) || 0,
    status: 'open',
    created_at: createdAt,
    updated_at: createdAt,
    allowed_trigger_classes: [...laneConfig.allowed_trigger_classes],
    validation_checks: [...laneConfig.validation_checks],
    required_validation_gate_ids: [...laneConfig.required_validation_gate_ids],
    failure_class: laneConfig.failure_class,
    evidence_bundle: {
      investigation: source,
      lane: laneConfig,
      rootPath: normalizeText(rootPath) || null,
    },
    trust_policy: laneConfig.trust_policy,
  });
}

function maybeBridgeOpenInvestigationsToRepairJobs(rootPath = null, options = {}) {
  const investigations = Array.isArray(options.investigations)
    ? options.investigations
    : readOpenQaInvestigations(rootPath, options.limit || 10);
  const bridged = [];
  for (const investigation of investigations) {
    const job = buildQaRepairJobFromInvestigation(rootPath, investigation, options);
    if (!job) continue;
    bridged.push(upsertQaRepairJob(rootPath, job));
  }
  return bridged.filter(Boolean);
}

function buildQaRepairExecutorBrief(job = null, investigation = null) {
  const normalizedJob = normalizeRepairJobRecord(job);
  const normalizedInvestigation = normalizeQaInvestigationRecord(investigation || {});
  const allowedFiles = [...normalizedJob.scoped_targets];
  const brief = {
    id: normalizedJob.id,
    type: 'qa_repair_brief',
    lane: normalizedJob.lane,
    lane_label: normalizedJob.lane_label,
    owner_department: normalizedJob.owner_department,
    trust_level: normalizedJob.trust_level,
    trust_reason: normalizedJob.trust_reason,
    trust_policy_id: normalizedJob.trust_policy_id,
    trust_summary: buildQaRepairLaneTrustSummary(normalizedJob.trust_policy || normalizedJob),
    observability_label: normalizedJob.observability_label,
    observability_status: normalizedJob.observability_status,
    repair_focus: normalizedJob.repair_focus,
    truth_source: normalizedJob.truth_source,
    repair_job_id: normalizedJob.id,
    investigation_id: normalizedJob.investigation_id || normalizedInvestigation.id || null,
    summary: normalizedJob.summary,
    failure_summary: normalizedInvestigation.summary || normalizedJob.summary,
    evidence_bundle: normalizedJob.evidence_bundle || {
      investigation: normalizedInvestigation,
    },
    allowed_files: allowedFiles,
    allowed_directories: [...new Set(allowedFiles.map((file) => path.posix.dirname(normalizeText(file)).replace(/^\.$/, '')))].filter(Boolean),
    acceptance_criteria: [...normalizedJob.acceptance_criteria],
    prohibited_actions: [...normalizedJob.prohibited_actions],
    allowed_action_types: [...normalizedJob.allowed_action_types],
    validation_checks: [...normalizedJob.validation_checks],
    required_validation_gate_ids: [...normalizedJob.required_validation_gate_ids],
    allowed_trigger_classes: [...normalizedJob.allowed_trigger_classes],
    max_attempts: normalizedJob.max_attempts,
    attempt_count: normalizedJob.attempt_count,
    retry_budget: normalizedJob.retry_budget,
    current_status: normalizedJob.status,
    auto_apply_allowed: normalizedJob.auto_apply_allowed,
    human_review_required_on_ambiguity: normalizedJob.human_review_required_on_ambiguity,
  };
  if (normalizedJob.lane === UI_BOOT_INTEGRITY_LANE) {
    brief.boot_asset = normalizeText(
      normalizedJob.evidence_bundle?.investigation?.evidence?.comparison?.asset
      || normalizedInvestigation.evidence?.comparison?.asset
      || normalizedInvestigation.evidence?.external?.asset,
    ) || null;
    brief.boot_failure_class = normalizeText(
      normalizedJob.evidence_bundle?.investigation?.evidence?.comparison?.failure_class
      || normalizedInvestigation.evidence?.comparison?.failure_class
      || normalizedJob.trigger,
    ) || null;
    brief.boot_failure_stage = normalizeText(
      normalizedJob.evidence_bundle?.investigation?.evidence?.comparison?.failure_stage
      || normalizedInvestigation.evidence?.comparison?.failure_stage,
    ) || null;
  }
  return brief;
}

function recordRepairAttempt(rootPath = null, attempt = null) {
  if (!attempt || typeof attempt !== 'object') return null;
  const filePath = getRepairAttemptsFilePath(rootPath);
  const record = normalizeRepairAttemptRecord({
    ...attempt,
    timestamp: attempt.timestamp || nowIso(),
    created_at: attempt.created_at || attempt.timestamp || nowIso(),
  });
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  appendJsonArrayRecord(filePath, record);
  return record;
}

function runNodeTestFile(uiRoot = null, testFile = '') {
  const normalizedTestFile = normalizeUiRootRelativePath(testFile);
  if (!normalizedTestFile) {
    return {
      id: 'test-file:missing',
      label: 'missing test file',
      ok: false,
      code: 1,
      stdout: '',
      stderr: 'Missing test file.',
    };
  }
  const moduleUrl = pathToFileURL(path.join(uiRoot, normalizedTestFile)).href;
  const resultFile = path.join(os.tmpdir(), `qa-test-result-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(`
    const fs = require('fs');
    const { workerData } = require('worker_threads');
    const signal = new Int32Array(workerData.signalBuffer);
    (async () => {
      let payload = {
        ok: false,
        code: 1,
        stdout: '',
        stderr: '',
      };
      try {
        const module = await import(workerData.moduleUrl);
        if (typeof module.default !== 'function') {
          throw new Error('test runner missing');
        }
        await module.default();
        payload = {
          ok: true,
          code: 0,
          stdout: '',
          stderr: '',
        };
      } catch (error) {
        payload = {
          ok: false,
          code: 1,
          stdout: '',
          stderr: String(error?.stack || error?.message || error || ''),
        };
      }
      try {
        fs.writeFileSync(workerData.resultFile, JSON.stringify(payload), 'utf8');
      } catch {
        // Ignore result write errors; the main thread will surface a generic failure.
      }
      Atomics.store(signal, 0, 1);
      Atomics.notify(signal, 0, 1);
    })();
  `, {
    eval: true,
    workerData: {
      moduleUrl,
      resultFile,
      signalBuffer: signal.buffer,
    },
  });
  Atomics.wait(signal, 0, 0);
  let result = {
    ok: false,
    code: 1,
    stdout: '',
    stderr: 'Planner test runner did not report a result.',
  };
  try {
    result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  } catch (error) {
    result = {
      ok: false,
      code: 1,
      stdout: '',
      stderr: String(error?.message || error || 'Failed to read test runner result.'),
    };
  } finally {
    try {
      fs.unlinkSync(resultFile);
    } catch {
      // Ignore cleanup failures.
    }
  }
  worker.terminate().catch(() => {});
  return {
    id: `test-file:${normalizedTestFile}`,
    label: normalizedTestFile,
    ok: Boolean(result.ok),
    code: Number.isFinite(Number(result.code)) ? Number(result.code) : (result.ok ? 0 : 1),
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function runQaRepairLaneValidationChecks(rootPath = null, job = null, options = {}) {
  const normalizedJob = normalizeRepairJobRecord(job || {});
  const laneConfig = getQaRepairLaneConfig(normalizedJob.lane || options.laneId || VALIDATION_SEAM_LANE) || getQaRepairLaneConfig(VALIDATION_SEAM_LANE);
  const uiRoot = path.join(rootPath || process.cwd(), 'ui');
  const changedFiles = uniqueStrings([
    ...(Array.isArray(options.changedFiles) ? options.changedFiles : []),
    ...normalizedJob.scoped_targets,
  ]);
  const checks = [];
  const syntaxCheck = laneConfig.validation_checks.find((check) => check.kind === 'syntax');
  if (syntaxCheck) {
    for (const file of changedFiles) {
      const targetPath = resolveValidationTargetPath(rootPath, file);
      const check = runNodeSyntaxCheck(targetPath);
      checks.push({
        id: `syntax:${file}`,
        label: `syntax ${normalizeUiRootRelativePath(file) || file}`,
        ok: check.ok,
        code: check.code,
        stdout: check.stdout || '',
        stderr: check.stderr || '',
      });
    }
  }
  for (const validationCheck of laneConfig.validation_checks.filter((check) => check.kind === 'test-file')) {
    const testResult = runNodeTestFile(uiRoot, validationCheck.test_file);
    checks.push({
      ...testResult,
      id: validationCheck.id || testResult.id,
      label: validationCheck.label || testResult.label,
    });
  }
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    verdict: ok ? 'accepted' : 'rejected',
    checks,
    summary: ok
      ? `${laneConfig.label} checks passed.`
      : `${laneConfig.label} checks failed.`,
    lane: laneConfig.lane_id,
    lane_label: laneConfig.label,
  };
}

function runValidationSeamChecks(rootPath = null, options = {}) {
  const job = normalizeRepairJobRecord({
    lane: VALIDATION_SEAM_LANE,
    scoped_targets: Array.isArray(options.changedFiles) ? options.changedFiles : VALIDATION_SEAM_TARGETS,
  });
  return runQaRepairLaneValidationChecks(rootPath, job, options);
}

function runRouteContractHealthChecks(rootPath = null, options = {}) {
  const lane = getQaRepairLaneConfig('route_contract_health');
  const job = normalizeRepairJobRecord({
    lane: lane?.lane_id || 'route_contract_health',
    scoped_targets: Array.isArray(options.changedFiles) ? options.changedFiles : (lane?.scoped_targets || []),
  });
  return runQaRepairLaneValidationChecks(rootPath, job, options);
}

function updateInvestigationPressure(rootPath = null, investigationId = '', event = null) {
  const filePath = getQaInvestigationsFilePath(rootPath);
  const investigations = readQaInvestigations(rootPath);
  const index = investigations.findIndex((entry) => normalizeQaInvestigationRecord(entry).id === normalizeText(investigationId));
  if (index < 0) {
    return null;
  }
  const current = normalizeQaInvestigationRecord(investigations[index]);
  const nextEvent = event && typeof event === 'object'
    ? event
    : {
        seen_at: nowIso(),
        trigger: 'repair_validation_failed',
      };
  const next = {
    ...current,
    repeat_count: (Number(current.repeat_count) || 1) + 1,
    last_seen_at: nextEvent.seen_at || nowIso(),
    latest_evidence: nextEvent,
    evidence_events: [...(Array.isArray(current.evidence_events) ? current.evidence_events : []), nextEvent].slice(-10),
  };
  investigations[index] = next;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(investigations, null, 2)}\n`, 'utf8');
  return normalizeQaInvestigationRecord(next);
}

function resolveRepairJob(rootPath = null, identifiers = {}) {
  const jobs = readQaRepairJobs(rootPath);
  const investigationId = normalizeText(identifiers.investigationId || identifiers.investigation_id || '');
  const repairJobId = normalizeText(identifiers.repairJobId || identifiers.repair_job_id || '');
  return jobs.find((job) => {
    if (repairJobId && normalizeText(job.id) === repairJobId) return true;
    if (investigationId && normalizeText(job.investigation_id) === investigationId) return true;
    return false;
  }) || null;
}

function buildQaRepairLoopState(rootPath = null) {
  const jobs = readQaRepairJobs(rootPath).sort(sortByUpdatedAtDesc);
  const attempts = readQaRepairAttempts(rootPath).sort(sortAttemptsDesc);
  const investigations = readOpenQaInvestigations(rootPath, 50);
  const lanes = getQaRepairLaneRegistry().map((lane) => buildQaRepairLaneState(rootPath, lane, investigations, jobs, attempts));
  return {
    lane: VALIDATION_SEAM_LANE,
    laneRegistry: getQaRepairLaneRegistry(),
    trustPolicyRegistry: getRepairLaneTrustPolicyRegistry(),
    lanes,
    jobs,
    attempts,
    latestJob: jobs[0] || null,
    latestAttempt: attempts[0] || null,
    summary: {
      open: jobs.filter((job) => job.status === 'open' || job.status === 'retry_queued').length,
      accepted: jobs.filter((job) => job.status === 'accepted').length,
      stalled: jobs.filter((job) => ['stalled_after_retries', 'needs_human_review'].includes(job.status)).length,
      policyBlocked: jobs.filter((job) => job.status === 'policy_blocked').length,
      totalJobs: jobs.length,
      totalAttempts: attempts.length,
      totalLanes: lanes.length,
      activeLanes: lanes.filter((lane) => lane.status === 'active').length,
      healthyLanes: lanes.filter((lane) => lane.status === 'healthy').length,
      watchingLanes: lanes.filter((lane) => lane.status === 'watching').length,
      stalledLanes: lanes.filter((lane) => lane.status === 'stalled').length,
      blockedLanes: lanes.filter((lane) => lane.status === 'blocked').length,
    },
  };
}

function runQaRepairAttempt(rootPath = null, options = {}) {
  const job = resolveRepairJob(rootPath, options);
  if (!job) {
    return {
      ok: false,
      verdict: 'inconclusive',
      reason: 'Repair job not found.',
      job: null,
      brief: null,
      attempt: null,
      validation: null,
      executor: null,
      retry_allowed: false,
    };
  }
  const normalizedJob = normalizeRepairJobRecord(job);
  if (['accepted', 'stalled_after_retries', 'needs_human_review'].includes(normalizedJob.status)) {
    return {
      ok: true,
      verdict: normalizedJob.status === 'accepted' ? 'accepted' : 'inconclusive',
      reason: `Repair job is already ${normalizedJob.status}.`,
      job: normalizedJob,
      brief: buildQaRepairExecutorBrief(normalizedJob, options.investigation || null),
      attempt: null,
      validation: null,
      executor: null,
      retry_allowed: false,
    };
  }
  if (normalizedJob.attempt_count >= normalizedJob.max_attempts) {
    const stalled = {
      ...normalizedJob,
      status: 'stalled_after_retries',
      updated_at: nowIso(),
      retry_budget: 0,
    };
    upsertQaRepairJob(rootPath, stalled);
    return {
      ok: true,
      verdict: 'inconclusive',
      reason: 'Repair job has exhausted its retry budget.',
      job: stalled,
      brief: buildQaRepairExecutorBrief(stalled, options.investigation || null),
      attempt: null,
      validation: null,
      executor: null,
      retry_allowed: false,
    };
  }

  const investigation = options.investigation || readQaInvestigations(rootPath).find((entry) => normalizeQaInvestigationRecord(entry).id === normalizedJob.investigation_id) || null;
  const brief = buildQaRepairExecutorBrief(normalizedJob, investigation);
  const laneConfig = getQaRepairLaneConfig(normalizedJob.lane) || getQaRepairLaneConfig(VALIDATION_SEAM_LANE);
  const trustPolicyCheck = evaluateRepairLaneTrustPolicyCompliance({
    policy: laneConfig?.trust_policy || laneConfig,
    lane: laneConfig,
    job: normalizedJob,
    brief,
  });
  if (normalizedJob.auto_apply_allowed === false) {
    trustPolicyCheck.ok = false;
    trustPolicyCheck.blocked = true;
    trustPolicyCheck.reasons = [
      ...trustPolicyCheck.reasons,
      'Auto-apply is not permitted for this lane trust policy.',
    ];
  }
  if (!trustPolicyCheck.ok) {
    const policyBlockReason = trustPolicyCheck.reasons.join(' ');
    const policyVerdict = normalizedJob.policy_block_status || laneConfig?.policy_block_status || 'policy_blocked';
    const attempt = recordRepairAttempt(rootPath, {
      attempt_id: options.attemptId || `qa_repair_attempt_${Date.now()}`,
      repair_job_id: normalizedJob.id,
      investigation_id: normalizedJob.investigation_id,
      lane: normalizedJob.lane,
      lane_label: normalizedJob.lane_label,
      timestamp: nowIso(),
      changed_files: [],
      proposed_fix_summary: policyBlockReason,
      validation_verdict: policyVerdict,
      validation_evidence_summary: policyBlockReason,
      policy_block_reason: policyBlockReason,
      status: policyVerdict,
      executor_summary: policyBlockReason,
    });
    const nextJob = upsertQaRepairJob(rootPath, {
      ...normalizedJob,
      attempt_count: normalizedJob.attempt_count + 1,
      latest_attempt_id: attempt.attempt_id,
      latest_attempt_at: attempt.timestamp,
      latest_verdict: policyVerdict,
      latest_validation_evidence: {
        ok: false,
        verdict: policyVerdict,
        summary: policyBlockReason,
        policy_block_reason: policyBlockReason,
        trust_policy_id: normalizedJob.trust_policy_id || laneConfig?.trust_policy_id || null,
      },
      latest_policy_check: trustPolicyCheck,
      policy_block_reason: policyBlockReason,
      status: policyVerdict,
      updated_at: nowIso(),
      retry_budget: Math.max(0, normalizedJob.max_attempts - (normalizedJob.attempt_count + 1)),
    });
    return {
      ok: true,
      verdict: policyVerdict,
      reason: policyBlockReason,
      job: nextJob,
      brief,
      attempt,
      validation: {
        ok: false,
        verdict: policyVerdict,
        summary: policyBlockReason,
        policy_block_reason: policyBlockReason,
        trust_policy: trustPolicyCheck,
        checks: [],
      },
      executor: null,
      retry_allowed: false,
      safe_stop: true,
    };
  }
  const bundle = buildConstrainedAutoFixBundle({
    criticalErrors: [{
      message: brief.failure_summary || brief.summary,
      route: normalizedJob.scoped_targets.join(', '),
      stage: 'executor',
      component: 'qa-repair-loop',
    }],
    failingTestNames: laneConfig?.failing_test_names || [],
  }, {
    rootPath,
    changedFiles: normalizedJob.scoped_targets,
    stage: 'executor',
    message: brief.summary,
    failureClass: laneConfig?.failure_class || 'qa_repair_lane',
  });

  const executorRunner = typeof options.executorRunner === 'function'
    ? options.executorRunner
    : ((runnerOptions = {}) => {
        if (normalizedJob.lane === UI_BOOT_INTEGRITY_LANE) {
          return applyUiBootIntegrityRepair(rootPath, {
            job: normalizedJob,
            brief,
            investigation,
            ...runnerOptions,
          });
        }
        return runConstrainedAutoFixExecutor(rootPath, bundle, {
          implicatedFiles: normalizedJob.scoped_targets,
          maxFiles: normalizedJob.scoped_targets.length || 2,
          validate: false,
          ...runnerOptions,
        });
      });
  const executor = executorRunner({
    rootPath,
    job: normalizedJob,
    brief,
    bundle,
    investigation,
  }) || {};
  const changedFiles = [...new Set([
    ...(executor.appliedFiles || []),
    ...(executor.changedFiles || []),
    ...(normalizedJob.scoped_targets || []),
  ].map((entry) => normalizeText(entry)).filter(Boolean))];

  let validation;
  if (executor.blocked || executor.needs_human_review || executor.stop_status === 'needs_human_review') {
    validation = {
      ok: false,
      verdict: 'inconclusive',
      summary: executor.reason || executor.summary || 'Repair is blocked and needs human review.',
      checks: [],
    };
  } else {
    const validationRunner = typeof options.validationRunner === 'function'
      ? options.validationRunner
      : ((runnerOptions = {}) => runQaRepairLaneValidationChecks(rootPath, normalizedJob, {
          changedFiles,
          ...runnerOptions,
        }));
    validation = validationRunner({
      rootPath,
      job: normalizedJob,
      brief,
      executor,
      changedFiles,
    }) || {};
  }
  const verdict = validation.ok ? 'accepted' : (validation.verdict || 'rejected');
  const attempt = recordRepairAttempt(rootPath, {
    attempt_id: options.attemptId || `qa_repair_attempt_${Date.now()}`,
    repair_job_id: normalizedJob.id,
    investigation_id: normalizedJob.investigation_id,
    lane: normalizedJob.lane,
    lane_label: normalizedJob.lane_label,
    timestamp: nowIso(),
    changed_files: changedFiles,
    proposed_fix_summary: executor.reason || executor.summary || brief.summary,
    validation_verdict: verdict,
    validation_evidence_summary: validation.summary || '',
    status: verdict,
    executor_summary: executor.reason || executor.summary || '',
  });
  const nextAttemptCount = normalizedJob.attempt_count + 1;
  const forceSafeStop = Boolean(executor.blocked || executor.needs_human_review || executor.stop_status === 'needs_human_review');
  const retryAllowed = !forceSafeStop && verdict !== 'accepted' && nextAttemptCount < normalizedJob.max_attempts;
  const nextStatus = verdict === 'accepted'
    ? 'accepted'
    : (forceSafeStop
        ? (normalizeText(executor.stop_status) || 'needs_human_review')
        : (retryAllowed ? 'retry_queued' : 'stalled_after_retries'));
  const nextJob = upsertQaRepairJob(rootPath, {
    ...normalizedJob,
    attempt_count: nextAttemptCount,
    latest_attempt_id: attempt.attempt_id,
    latest_attempt_at: attempt.timestamp,
    latest_verdict: verdict,
    latest_validation_evidence: validation,
    latest_policy_check: trustPolicyCheck,
    latest_attempt_summary: attempt.validation_evidence_summary || attempt.proposed_fix_summary,
    policy_block_reason: null,
    status: nextStatus,
    updated_at: nowIso(),
    retry_budget: Math.max(0, normalizedJob.max_attempts - nextAttemptCount),
  });
  if (verdict !== 'accepted' && normalizedJob.investigation_id) {
    updateInvestigationPressure(rootPath, normalizedJob.investigation_id, {
      seen_at: nowIso(),
      trigger: 'repair_validation_failed',
      lane_id: normalizedJob.lane,
      lane_label: normalizedJob.lane_label,
      internal_status: investigation?.status || 'open',
      external_status: validation.ok ? 'pass' : 'fail',
      probe_status: verdict,
      test_id: normalizedJob.id,
      repair_job_id: normalizedJob.id,
      validation_verdict: verdict,
    });
  }
  return {
    ok: true,
    verdict,
    job: nextJob,
    brief,
    attempt,
    validation,
    executor,
    retry_allowed: retryAllowed,
    safe_stop: !retryAllowed && verdict !== 'accepted',
  };
}

module.exports = {
  QA_REPAIR_LANES,
  VALIDATION_SEAM_LANE,
  VALIDATION_SEAM_MAX_ATTEMPTS,
  VALIDATION_SEAM_TARGETS,
  DEFAULT_QA_REPAIR_JOBS_PATH,
  DEFAULT_QA_REPAIR_ATTEMPTS_PATH,
  appendJsonArrayRecord,
  buildQaRepairExecutorBrief,
  buildQaRepairJobFromInvestigation,
  buildQaRepairLaneEligibilitySummary,
  buildQaRepairLaneState,
  buildQaRepairLaneTrustSummary,
  buildQaRepairLoopState,
  buildValidationSeamRepairJobFromInvestigation,
  doesInvestigationQualifyForLane,
  getRepairAttemptsFilePath,
  getRepairJobsFilePath,
  getQaRepairLaneConfig,
  getQaRepairLaneRegistry,
  maybeBridgeOpenInvestigationsToRepairJobs,
  normalizeRepairAttemptRecord,
  normalizeRepairJobRecord,
  normalizeQaRepairLaneConfig,
  normalizeQaRepairValidationCheck,
  readQaRepairAttempts,
  readQaRepairJobs,
  recordRepairAttempt,
  resolveRepairJob,
  runQaRepairAttempt,
  runQaRepairLaneValidationChecks,
  runRouteContractHealthChecks,
  runValidationSeamChecks,
  selectQaRepairLaneForInvestigation,
  sortAttemptsDesc,
  sortByUpdatedAtDesc,
  upsertQaRepairJob,
  updateInvestigationPressure,
  writeQaRepairJobs,
};
