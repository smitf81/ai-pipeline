const fs = require('fs');
const path = require('path');
const { writeJsonIfChanged } = require('./changeHygiene');
const { buildExternalQaProbeCheckPayload, readOpenQaInvestigations } = require('./externalQaProbe');
const { buildQaMcpLiveStatus } = require('./qaMcpLiveStatus');
const {
  appendQaOutputFeedEntry,
  buildQaOutputFeedEntryFromCycle,
} = require('./qaOutputFeed');
const {
  buildQaResearchState,
  maybeGenerateQaResearchNotesForInvestigations,
} = require('./qaResearch');
const { runQARun, summarizeQARun } = require('./qaRunner');

const QA_LEAD_RELATIVE_DIR = path.join('data', 'spatial', 'qa', 'lead-runs');
const QA_LEAD_STATE_RELATIVE_FILE = path.join('data', 'spatial', 'qa', 'lead-state.json');
const QA_LEAD_DEFAULT_BASE_URL = 'http://127.0.0.1:3000';
const QA_LEAD_DEFAULT_PROBE_URL = 'http://127.0.0.1:5051/run_test';
const QA_LEAD_DEFAULT_INTERVAL_MS = 20 * 60 * 1000;

const qaLeadAutomationInProgress = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getQaLeadRunsDir(rootPath = null) {
  return path.join(rootPath || process.cwd(), QA_LEAD_RELATIVE_DIR);
}

function getQaLeadStateFilePath(rootPath = null) {
  return path.join(rootPath || process.cwd(), QA_LEAD_STATE_RELATIVE_FILE);
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function ensureQaLeadRunsDir(rootPath = null) {
  const dir = getQaLeadRunsDir(rootPath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readQaLeadState(rootPath = null) {
  return readJsonSafe(getQaLeadStateFilePath(rootPath), null);
}

function writeQaLeadState(rootPath = null, state = {}) {
  const normalizedState = state && typeof state === 'object' ? state : {};
  writeJson(getQaLeadStateFilePath(rootPath), normalizedState);
  return normalizedState;
}

function readQaLeadRuns(rootPath = null, limit = 8) {
  const dir = ensureQaLeadRunsDir(rootPath);
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJsonSafe(path.join(dir, entry.name), null))
    .filter(Boolean)
    .sort((left, right) => String(right.finished_at || right.finishedAt || right.started_at || right.startedAt || '')
      .localeCompare(String(left.finished_at || left.finishedAt || left.started_at || left.startedAt || '')))
    .slice(0, Math.max(0, Number(limit) || 0));
}

function writeQaLeadRun(rootPath = null, run = {}) {
  const normalizedRun = run && typeof run === 'object' ? run : {};
  const dir = ensureQaLeadRunsDir(rootPath);
  const runId = normalizeText(normalizedRun.id) || makeId('qa_lead');
  const filePath = path.join(dir, `${runId}.json`);
  writeJson(filePath, {
    ...normalizedRun,
    id: runId,
  });
  writeQaLeadState(rootPath, {
    source: 'qa_lead_runner',
    agent_id: 'qa-lead',
    run_id: runId,
    status: normalizedRun.status || 'completed',
    current_task: normalizedRun.current_task || null,
    current_batch: normalizedRun.current_batch || null,
    started_at: normalizedRun.started_at || null,
    finished_at: normalizedRun.finished_at || null,
    last_completed_cycle_at: normalizedRun.finished_at || normalizedRun.last_completed_cycle_at || null,
    active_tools: Array.isArray(normalizedRun.active_tools) ? normalizedRun.active_tools : [],
    live_status: normalizedRun.live_status || null,
    output_feed: Array.isArray(normalizedRun.output_feed) ? normalizedRun.output_feed : [],
    latest_run: normalizedRun.summary || null,
    result_paths: normalizedRun.result_paths || {},
    summary: normalizedRun.summary || null,
    last_updated_at: normalizedRun.finished_at || normalizedRun.updated_at || nowIso(),
  });
  return {
    ...normalizedRun,
    id: runId,
    path: filePath,
  };
}

function summarizeQaLeadFeedItem(item = {}) {
  return {
    id: normalizeText(item.id) || null,
    label: normalizeText(item.label) || 'QA tool result',
    tool: normalizeText(item.tool) || 'qa_tool',
    status: normalizeText(item.status) || 'unknown',
    verdict: normalizeText(item.verdict) || normalizeText(item.status) || 'unknown',
    summary: normalizeText(item.summary) || 'No summary recorded.',
    detail: normalizeText(item.detail) || '',
    observed_at: normalizeText(item.observed_at || item.observedAt) || null,
    artifact_refs: Array.isArray(item.artifact_refs || item.artifactRefs)
      ? (item.artifact_refs || item.artifactRefs).map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
    notes: Array.isArray(item.notes)
      ? item.notes.map((entry) => normalizeText(entry)).filter(Boolean)
      : [],
  };
}

function buildQaLeadOutputFeed({
  bootHealth = null,
  bootRepair = null,
  externalValidation = null,
  browserRun = null,
  canaries = null,
  loopAudit = null,
  researchState = null,
  repairLoop = null,
  liveStatus = null,
} = {}) {
  const feed = [
    ...(bootHealth ? [{
      id: 'boot-preflight',
      label: 'Boot preflight',
      tool: 'boot_preflight',
      status: bootHealth.safeMode || bootHealth.status === 'blocked' || bootHealth.failure_class ? 'blocked' : 'validated',
      verdict: bootHealth.safeMode || bootHealth.status === 'blocked' || bootHealth.failure_class ? 'blocked' : 'pass',
      summary: bootHealth.safeMode || bootHealth.status === 'blocked'
        ? `Boot gate triggered: ${bootHealth.reason || bootHealth.summary || bootHealth.failure_class || 'unknown boot failure'}.`
        : 'Boot preflight passed.',
      detail: bootRepair?.repairResult?.summary
        || bootRepair?.repairResult?.reason
        || bootHealth.summary
        || bootHealth.reason
        || '',
      observed_at: bootHealth.checked_at || bootHealth.checkedAt || null,
      artifact_refs: ['/api/health'],
      notes: [
        bootHealth.failure_class ? `Failure class: ${bootHealth.failure_class}` : null,
        bootHealth.failure_stage ? `Failure stage: ${bootHealth.failure_stage}` : null,
        bootHealth.asset ? `Asset: ${bootHealth.asset}` : null,
      ].filter(Boolean),
    }] : []),
    {
      id: 'proof-of-life',
      label: 'MCP proof of life',
      tool: 'external_probe_check',
      status: externalValidation?.ok ? 'validated' : 'degraded',
      verdict: externalValidation?.ok ? 'pass' : (externalValidation?.probeStatus || externalValidation?.error?.kind || 'fail'),
      summary: externalValidation?.ok
        ? 'External QA probe returned a fresh result.'
        : (externalValidation?.error?.message || 'External QA probe did not return a fresh result.'),
      detail: externalValidation?.internal_truth?.details || externalValidation?.comparison?.notes?.[0] || '',
      observed_at: externalValidation?.lastCheckedAt || null,
      artifact_refs: ['http://127.0.0.1:5051/run_test'],
      notes: externalValidation?.comparison?.notes || [],
    },
    {
      id: 'browser-pass',
      label: 'Browser QA run',
      tool: 'browser_qa_run',
      status: browserRun ? 'validated' : 'missing',
      verdict: browserRun?.verdict || browserRun?.status || 'unknown',
      summary: browserRun ? summarizeQARun(browserRun) : 'No browser QA run captured.',
      detail: browserRun?.error || browserRun?.findings?.[0]?.summary || '',
      observed_at: browserRun?.finishedAt || browserRun?.createdAt || null,
      artifact_refs: browserRun?.id
        ? [
            `data/spatial/qa/${browserRun.id}.json`,
            ...(browserRun?.artifacts?.screenshots || []).map((artifact) => artifact?.url || artifact?.path).filter(Boolean),
          ]
        : [],
      notes: Array.isArray(browserRun?.findings)
        ? browserRun.findings.slice(0, 4).map((finding) => finding.summary || finding.reason).filter(Boolean)
        : [],
    },
    {
      id: 'lane-canaries',
      label: 'Lane canary suite',
      tool: 'lane_canary_suite',
      status: canaries?.overall_status === 'pass' ? 'validated' : (canaries?.overall_status === 'fail' ? 'degraded' : 'unknown'),
      verdict: canaries?.overall_status || 'unknown',
      summary: canaries?.summary || 'No lane canary results were recorded.',
      detail: Array.isArray(canaries?.failing_canary_ids) && canaries.failing_canary_ids.length
        ? `Failing canaries: ${canaries.failing_canary_ids.join(' | ')}`
        : 'All visible canaries passed.',
      observed_at: canaries?.last_run_at || null,
      artifact_refs: [],
      notes: Array.isArray(canaries?.results)
        ? canaries.results.slice(0, 3).map((result) => `${result.label || result.canary_id}: ${result.status || 'unknown'}`)
        : [],
    },
    {
      id: 'loop-audit',
      label: 'Closed-loop fault audit',
      tool: 'loop_audit',
      status: loopAudit?.overall_status === 'pass' ? 'validated' : (loopAudit?.overall_status === 'fail' ? 'degraded' : 'unknown'),
      verdict: loopAudit?.overall_status || 'unknown',
      summary: loopAudit?.summary || 'No loop audit results were recorded.',
      detail: Array.isArray(loopAudit?.failing_fault_ids) && loopAudit.failing_fault_ids.length
        ? `Failing fault ids: ${loopAudit.failing_fault_ids.join(' | ')}`
        : 'All injected loop faults behaved as expected.',
      observed_at: loopAudit?.completed_at || loopAudit?.finished_at || null,
      artifact_refs: [],
      notes: Array.isArray(loopAudit?.comparisons)
        ? loopAudit.comparisons.map((comparison) => `${comparison.fault_id}: ${comparison.pass ? 'pass' : 'fail'}`).slice(0, 4)
        : [],
    },
  ];

  const latestResearchNote = Array.isArray(researchState?.notes) ? researchState.notes[0] || null : null;
  if (latestResearchNote) {
    feed.push({
      id: 'research-note',
      label: 'Research note',
      tool: 'qa_research_note',
      status: latestResearchNote.research_available ? 'advisory' : 'degraded',
      verdict: latestResearchNote.research_available ? 'available' : 'unavailable',
      summary: latestResearchNote.summary || 'Research note available.',
      detail: latestResearchNote.recommendation || latestResearchNote.error_message || '',
      observed_at: latestResearchNote.created_at || latestResearchNote.updated_at || null,
      artifact_refs: latestResearchNote.sources
        ? latestResearchNote.sources.map((source) => source?.url || source?.source_url || source?.title).filter(Boolean)
        : [],
      notes: [
        ...(latestResearchNote.likely_causes || []),
        ...(latestResearchNote.suggested_extra_checks || []),
      ],
    });
  }

  if (liveStatus) {
    feed.push({
      id: 'mcp-live-status',
      label: 'QA MCP live status',
      tool: 'qa_mcp_live_status',
      status: liveStatus.status === 'live' ? 'validated' : (['degraded', 'offline', 'stale'].includes(liveStatus.status) ? 'degraded' : 'unknown'),
      verdict: liveStatus.status || 'unknown',
      summary: liveStatus.summary || 'QA MCP proof-of-life has not been recorded yet.',
      detail: liveStatus.notes?.[0] || '',
      observed_at: liveStatus.heartbeat_at || liveStatus.last_completed_cycle_at || null,
      artifact_refs: [],
      notes: liveStatus.notes || [],
    });
  }

  if (repairLoop) {
    feed.push({
      id: 'repair-loop',
      label: 'Repair loop summary',
      tool: 'qa_repair_loop',
      status: repairLoop.summary?.blockedLanes > 0 ? 'degraded' : 'validated',
      verdict: repairLoop.summary?.blockedLanes > 0 ? 'blocked' : 'pass',
      summary: repairLoop.summary?.totalJobs
        ? `${repairLoop.summary.totalJobs} repair job${repairLoop.summary.totalJobs === 1 ? '' : 's'} tracked.`
        : 'No repair jobs are tracked yet.',
      detail: repairLoop.latestAttempt?.validation_verdict || repairLoop.latestJob?.status || '',
      observed_at: repairLoop.latestAttempt?.timestamp || repairLoop.latestJob?.updated_at || null,
      artifact_refs: [],
      notes: [
        ...(repairLoop.lanes || []).slice(0, 3).map((lane) => `${lane.label || lane.lane_id}: ${lane.current_status || 'idle'}`),
      ],
    });
  }

  return feed.map((item) => summarizeQaLeadFeedItem(item));
}

function buildQaLeadRunState({
  runId,
  startedAt,
  finishedAt = null,
  baseUrl = QA_LEAD_DEFAULT_BASE_URL,
  probeUrl = QA_LEAD_DEFAULT_PROBE_URL,
  currentTask = 'QA proof-of-life, browser pass, canaries, and loop audit',
  activeTools = [],
  status = 'idle',
  liveStatus = null,
  bootHealth = null,
  bootRepair = null,
  externalValidation = null,
  browserRun = null,
  canaries = null,
  loopAudit = null,
  researchState = null,
  repairLoop = null,
  outputFeed = [],
  resultPaths = {},
  failureReason = null,
  runType = 'scheduled_cycle',
} = {}) {
  const feed = Array.isArray(outputFeed) ? outputFeed.map((item) => summarizeQaLeadFeedItem(item)) : [];
  return {
    source: 'qa_lead_runner',
    agent_id: 'qa-lead',
    id: normalizeText(runId) || makeId('qa_lead'),
    run_type: normalizeText(runType) || 'scheduled_cycle',
    status: normalizeText(status) || 'idle',
    current_task: normalizeText(currentTask) || 'QA proof-of-life, browser pass, canaries, and loop audit',
    current_batch: normalizeText(runId) || null,
    base_url: normalizeText(baseUrl) || QA_LEAD_DEFAULT_BASE_URL,
    probe_url: normalizeText(probeUrl) || QA_LEAD_DEFAULT_PROBE_URL,
    started_at: normalizeText(startedAt) || nowIso(),
    finished_at: normalizeText(finishedAt) || null,
    last_completed_cycle_at: normalizeText(finishedAt) || null,
    active_tools: Array.isArray(activeTools) ? activeTools.map((tool) => normalizeText(tool)).filter(Boolean) : [],
    live_status: liveStatus || null,
    boot_health: bootHealth || null,
    boot_repair: bootRepair || null,
    external_validation: externalValidation || null,
    browser_run: browserRun || null,
    canaries: canaries || null,
    loop_audit: loopAudit || null,
    research_state: researchState || null,
    repair_loop: repairLoop || null,
    output_feed: feed,
    result_paths: resultPaths,
    failure_reason: normalizeText(failureReason) || null,
    summary: failureReason
      ? `QA lead cycle degraded: ${failureReason}`
      : `QA lead cycle ${normalizeText(status) || 'completed'}.`,
  };
}

function readQaLeadOutput(rootPath = null) {
  const state = readQaLeadState(rootPath);
  const runs = readQaLeadRuns(rootPath, 8);
  const latestRun = runs[0] || null;
  const fallback = latestRun
    ? {
        ...latestRun,
        live_status: latestRun.live_status || null,
      }
    : null;
  return {
    state: state || fallback || {
      source: 'qa_lead_runner',
      agent_id: 'qa-lead',
      status: 'idle',
      current_task: 'QA proof-of-life, browser pass, canaries, and loop audit',
      output_feed: [],
      active_tools: [],
      summary: 'QA lead has not run yet.',
      result_paths: {},
      boot_health: null,
      boot_repair: null,
      started_at: null,
      finished_at: null,
      last_completed_cycle_at: null,
      run_type: 'scheduled_cycle',
    },
    latestRun,
    recentRuns: runs,
  };
}

async function runQaLeadCycle(rootPath = null, options = {}) {
  const normalizedRoot = rootPath || process.cwd();
  if (qaLeadAutomationInProgress.get(normalizedRoot)) {
    return readQaLeadOutput(normalizedRoot).state;
  }
  const startedAt = normalizeText(options.startedAt) || nowIso();
  const runId = normalizeText(options.runId) || makeId('qa_lead');
  const baseUrl = normalizeText(options.baseUrl || QA_LEAD_DEFAULT_BASE_URL) || QA_LEAD_DEFAULT_BASE_URL;
  const probeUrl = normalizeText(options.probeUrl || QA_LEAD_DEFAULT_PROBE_URL) || QA_LEAD_DEFAULT_PROBE_URL;
  const bootHealth = options.bootHealth && typeof options.bootHealth === 'object' ? options.bootHealth : null;
  const bootRepair = options.bootRepair && typeof options.bootRepair === 'object' ? options.bootRepair : null;
  const currentTask = normalizeText(options.currentTask)
    || (bootHealth?.safeMode
      ? `QA boot recovery: ${bootHealth.reason || bootHealth.summary || bootHealth.failure_class || 'boot gate triggered'}`
      : 'QA proof-of-life, browser pass, lane canaries, and loop audit');
  const runType = normalizeText(options.runType) || 'scheduled_cycle';
  const activeTools = [];
  const resultPaths = {};

  if (bootHealth) activeTools.push('boot_preflight');
  if (bootRepair) activeTools.push('ui_boot_repair');

  qaLeadAutomationInProgress.set(normalizedRoot, true);
  writeQaLeadState(normalizedRoot, {
    source: 'qa_lead_runner',
    agent_id: 'qa-lead',
    run_id: runId,
    status: 'running',
    current_task: currentTask,
    current_batch: runId,
    base_url: baseUrl,
    probe_url: probeUrl,
    started_at: startedAt,
    finished_at: null,
    last_completed_cycle_at: null,
    active_tools: [
      ...(bootHealth ? ['boot_preflight'] : []),
      ...(bootRepair ? ['ui_boot_repair'] : []),
      'external_probe_check',
      'browser_qa_run',
      'lane_canary_suite',
      'loop_audit',
      'qa_research_note',
    ],
    output_feed: [],
    result_paths: {},
    summary: 'QA lead cycle is running.',
  });

  let externalValidation = null;
  let browserRun = null;
  let canaries = null;
  let loopAudit = null;
  let researchState = null;
  let repairLoop = null;
  let liveStatus = null;
  let failureReason = null;

  try {
    const externalProbeResult = typeof options.externalProbeRunner === 'function'
      ? await options.externalProbeRunner({
          qaState: readQaLeadOutput(normalizedRoot).state,
          probeUrl,
          timeoutMs: options.probeTimeoutMs,
          rootPath: normalizedRoot,
        })
      : await buildExternalQaProbeCheckPayload({
          probeUrl,
          timeoutMs: options.probeTimeoutMs,
          investigationRootPath: normalizedRoot,
        });
    externalValidation = externalProbeResult.externalValidation || externalProbeResult;
    activeTools.push('external_probe_check');

    const currentInvestigations = readOpenQaInvestigations(normalizedRoot, 10);
    const researchResult = await maybeGenerateQaResearchNotesForInvestigations(
      normalizedRoot,
      currentInvestigations,
      {
        fetchImpl: options.fetchImpl || globalThis.fetch,
        serverUrl: options.researchServerUrl,
        timeoutMs: options.researchTimeoutMs,
      },
    );
    resultPaths.researchNotes = path.join(normalizedRoot, 'data', 'spatial', 'qa', 'research-notes.json');
    activeTools.push('qa_research_note');

    if (typeof options.browserRunner === 'function') {
      browserRun = await options.browserRunner({
        rootPath: normalizedRoot,
        baseUrl,
        scenario: options.browserScenario || 'studio-smoke',
        mode: options.browserMode || 'observation',
        trigger: 'qa_lead_cycle',
        linked: { qaLeadRunId: runId },
      });
    } else {
      browserRun = await runQARun({
        rootPath: normalizedRoot,
        baseUrl,
        scenario: options.browserScenario || 'studio-smoke',
        mode: options.browserMode || 'observation',
        trigger: 'qa_lead_cycle',
        linked: { qaLeadRunId: runId },
      });
    }
    activeTools.push('browser_qa_run');
    resultPaths.browserRun = browserRun?.id ? path.join(normalizedRoot, 'data', 'spatial', 'qa', `${browserRun.id}.json`) : null;

    const laneCanariesModule = typeof options.laneCanariesModule === 'object'
      ? options.laneCanariesModule
      : require('./qaLaneCanaries');
    canaries = typeof options.canaryRunner === 'function'
      ? await options.canaryRunner({
          rootPath: normalizedRoot,
          force: true,
          laneRegistry: options.laneRegistry,
        })
      : laneCanariesModule.runQaLaneCanarySuite(normalizedRoot, { force: true });
    activeTools.push('lane_canary_suite');

    const qaLoopAuditModule = typeof options.loopAuditModule === 'object'
      ? options.loopAuditModule
      : require('./qaLoopAudit');
    loopAudit = typeof options.loopAuditRunner === 'function'
      ? await options.loopAuditRunner({ rootPath: normalizedRoot })
      : qaLoopAuditModule.runQaLoopAudit(normalizedRoot);
    activeTools.push('loop_audit');
    resultPaths.loopAudit = path.join(normalizedRoot, 'ui', 'qaLoopAudit.js');

    const qaRepairLoopModule = typeof options.qaRepairLoopModule === 'object'
      ? options.qaRepairLoopModule
      : require('./qaRepairLoop');
    repairLoop = qaRepairLoopModule.buildQaRepairLoopState(normalizedRoot);
    const latestInvestigations = readOpenQaInvestigations(normalizedRoot, 10);
    researchState = buildQaResearchState(normalizedRoot, latestInvestigations);
    liveStatus = buildQaMcpLiveStatus({
      externalValidation,
      researchState,
      openInvestigations: latestInvestigations,
      repairLoop,
      structuredSummary: browserRun
        ? {
            status: browserRun.verdict || browserRun.status || 'pending',
            summary: browserRun.summary || browserRun.scenario || 'Browser QA run completed.',
            finishedAt: browserRun.finishedAt || browserRun.createdAt || null,
            createdAt: browserRun.createdAt || null,
            updatedAt: browserRun.updatedAt || null,
          }
        : null,
      latestBrowserRun: browserRun,
      localGate: null,
    });

    const outputFeed = buildQaLeadOutputFeed({
      bootHealth,
      bootRepair,
      externalValidation,
      browserRun,
      canaries,
      loopAudit,
      researchState,
      repairLoop,
      liveStatus,
    });
    const overallPass = Boolean(
      externalValidation?.ok
      && (!browserRun || !['fail', 'failed', 'error'].includes(String(browserRun.verdict || browserRun.status || '').toLowerCase()))
      && (!canaries || canaries.overall_status !== 'fail')
      && (!loopAudit || loopAudit.overall_status !== 'fail')
    );
    const status = overallPass
      ? (liveStatus?.status === 'live' ? 'live' : 'processing')
      : (liveStatus?.status || 'degraded');
    const finishedAt = nowIso();
    const runRecord = buildQaLeadRunState({
      runId,
      startedAt,
      finishedAt,
      baseUrl,
      probeUrl,
      currentTask,
      activeTools,
      status,
      liveStatus,
      externalValidation,
      browserRun,
      canaries,
      loopAudit,
      researchState,
      repairLoop,
      bootHealth,
      bootRepair,
      outputFeed,
      resultPaths,
      failureReason: overallPass ? null : (browserRun?.error || loopAudit?.summary || canaries?.summary || externalValidation?.errorMessage || 'QA lead cycle degraded.'),
      runType,
    });
    const persisted = writeQaLeadRun(normalizedRoot, runRecord);
    try {
      appendQaOutputFeedEntry(normalizedRoot, buildQaOutputFeedEntryFromCycle({
        cycleId: runId,
        createdAt: finishedAt,
        investigationCount: Array.isArray(currentInvestigations) ? currentInvestigations.length : 0,
        failedChecks: [
          bootHealth && (bootHealth.safeMode || bootHealth.status === 'blocked' || bootHealth.failure_class),
          browserRun && ['fail', 'failed', 'error'].includes(String(browserRun.verdict || browserRun.status || '').toLowerCase()),
          canaries && canaries.overall_status === 'fail',
          loopAudit && loopAudit.overall_status === 'fail',
        ].filter(Boolean).length,
        activeLanes: Number(repairLoop?.summary?.activeLanes || repairLoop?.summary?.active_lanes || 0) || (
          Array.isArray(repairLoop?.lanes)
            ? repairLoop.lanes.filter((lane) => !['idle', 'inactive'].includes(String(lane?.current_status || lane?.status || '').toLowerCase())).length
            : 0
        ),
        externalStatus: externalValidation?.ok
          ? 'ok'
          : (['unreachable', 'offline'].includes(String(externalValidation?.probeStatus || externalValidation?.error?.kind || '').toLowerCase())
            ? 'unreachable'
            : (externalValidation ? 'degraded' : 'unknown')),
      }));
    } catch (error) {
      console.warn(`[${nowIso()}] qa output feed append failed: ${error.message}`);
    }
    return {
      ...persisted,
      research_results: researchResult,
    };
  } catch (error) {
    failureReason = String(error?.message || error);
    const finishedAt = nowIso();
    const failureRun = buildQaLeadRunState({
      runId,
      startedAt,
      finishedAt,
      baseUrl,
      probeUrl,
      currentTask,
      activeTools,
      status: 'degraded',
      liveStatus,
      externalValidation,
      browserRun,
      canaries,
      loopAudit,
      researchState,
      repairLoop,
      bootHealth,
      bootRepair,
      outputFeed: buildQaLeadOutputFeed({
        bootHealth,
        bootRepair,
        externalValidation,
        browserRun,
        canaries,
        loopAudit,
        researchState,
        repairLoop,
        liveStatus,
      }),
      resultPaths,
      failureReason,
      runType,
    });
    const persisted = writeQaLeadRun(normalizedRoot, failureRun);
    const openInvestigations = readOpenQaInvestigations(normalizedRoot, 10);
    try {
      appendQaOutputFeedEntry(normalizedRoot, buildQaOutputFeedEntryFromCycle({
        cycleId: runId,
        createdAt: finishedAt,
        investigationCount: Array.isArray(openInvestigations) ? openInvestigations.length : 0,
        failedChecks: [
          bootHealth && (bootHealth.safeMode || bootHealth.status === 'blocked' || bootHealth.failure_class),
          browserRun && ['fail', 'failed', 'error'].includes(String(browserRun.verdict || browserRun.status || '').toLowerCase()),
          canaries && canaries.overall_status === 'fail',
          loopAudit && loopAudit.overall_status === 'fail',
        ].filter(Boolean).length,
        activeLanes: Number(repairLoop?.summary?.activeLanes || repairLoop?.summary?.active_lanes || 0) || (
          Array.isArray(repairLoop?.lanes)
            ? repairLoop.lanes.filter((lane) => !['idle', 'inactive'].includes(String(lane?.current_status || lane?.status || '').toLowerCase())).length
            : 0
        ),
        externalStatus: externalValidation?.ok
          ? 'ok'
          : (['unreachable', 'offline'].includes(String(externalValidation?.probeStatus || externalValidation?.error?.kind || '').toLowerCase())
            ? 'unreachable'
            : (externalValidation ? 'degraded' : 'unknown')),
      }));
    } catch (error) {
      console.warn(`[${nowIso()}] qa output feed append failed: ${error.message}`);
    }
    return persisted;
  } finally {
    qaLeadAutomationInProgress.delete(normalizedRoot);
  }
}

function startQaLeadAutomation(rootPath = null, options = {}) {
  const normalizedRoot = rootPath || process.cwd();
  const intervalMs = Math.max(60 * 1000, Number(options.intervalMs || QA_LEAD_DEFAULT_INTERVAL_MS) || QA_LEAD_DEFAULT_INTERVAL_MS);
  const shouldAutoRun = options.autoRun !== false;
  const state = readQaLeadState(normalizedRoot);
  if (state?.automation_started) {
    return {
      started: true,
      intervalMs,
      autoRun: shouldAutoRun,
      state,
    };
  }
  const nextState = {
    ...(state && typeof state === 'object' ? state : {}),
    automation_started: true,
    automation_interval_ms: intervalMs,
    automation_enabled: shouldAutoRun,
    automation_last_kick_at: state?.automation_last_kick_at || null,
    automation_last_result: state?.automation_last_result || null,
  };
  writeQaLeadState(normalizedRoot, nextState);
  if (shouldAutoRun) {
    setTimeout(() => {
      runQaLeadCycle(normalizedRoot, options).catch((error) => {
        writeQaLeadState(normalizedRoot, {
          ...(readQaLeadState(normalizedRoot) || {}),
          automation_last_result: {
            ok: false,
            error: String(error?.message || error),
            at: nowIso(),
          },
        });
      });
    }, 1500);
    const timer = setInterval(() => {
      runQaLeadCycle(normalizedRoot, options).catch((error) => {
        writeQaLeadState(normalizedRoot, {
          ...(readQaLeadState(normalizedRoot) || {}),
          automation_last_result: {
            ok: false,
            error: String(error?.message || error),
            at: nowIso(),
          },
        });
      });
    }, intervalMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  }
  return {
    started: true,
    intervalMs,
    autoRun: shouldAutoRun,
    state: nextState,
  };
}

module.exports = {
  QA_LEAD_DEFAULT_BASE_URL,
  QA_LEAD_DEFAULT_INTERVAL_MS,
  QA_LEAD_DEFAULT_PROBE_URL,
  QA_LEAD_RELATIVE_DIR,
  QA_LEAD_STATE_RELATIVE_FILE,
  buildQaLeadOutputFeed,
  buildQaLeadRunState,
  getQaLeadRunsDir,
  getQaLeadStateFilePath,
  readQaLeadOutput,
  readQaLeadRuns,
  readQaLeadState,
  runQaLeadCycle,
  startQaLeadAutomation,
  summarizeQaLeadFeedItem,
  writeQaLeadRun,
  writeQaLeadState,
};
