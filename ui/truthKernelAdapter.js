console.log("LOADED: truthKernelAdapter");
const fs = require('fs');
const path = require('path');

const KINDS = new Set(['input', 'execution', 'artifact']);
const STATUSES = new Set(['healthy', 'degraded', 'blocked', 'orphaned', 'informational']);

function clamp01(value, fallback = 0.5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function toTimestamp(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeReadJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function listJsonFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (_error) {
    return [];
  }
}

function listDirectories(dirPath, prefix = '') {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && (!prefix || entry.name.startsWith(prefix)))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch (_error) {
    return [];
  }
}

function normalizeStatus(value, fallback = 'informational') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'pass' || normalized === 'ok' || normalized === 'active') return 'healthy';
  if (normalized === 'degraded' || normalized === 'warn' || normalized === 'warning' || normalized === 'offline') return 'degraded';
  if (normalized === 'blocked' || normalized === 'fail' || normalized === 'failed' || normalized === 'error' || normalized === 'timeout') return 'blocked';
  if (STATUSES.has(normalized)) return normalized;
  return fallback;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeStringArray(values = []) {
  return Array.isArray(values)
    ? [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
    : [];
}

function normalizeSupportingEvidence(partial = {}) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return null;
  const evidenceSources = normalizeStringArray(partial.evidenceSources || partial.evidence_sources || []);
  const eventStages = normalizeStringArray(partial.eventStages || partial.event_stages || []);
  const lastApplyReceiptId = normalizeText(partial.lastApplyReceiptId || partial.last_apply_receipt_id || partial.receiptId || partial.receipt_id);
  if (!evidenceSources.length && !eventStages.length && !lastApplyReceiptId) {
    return null;
  }
  return {
    classification: normalizeText(partial.classification) || 'evidence_artefact',
    lastApplyReceiptId: lastApplyReceiptId || null,
    evidenceSources,
    eventStages,
  };
}

function makeNode(partial = {}) {
  const kind = KINDS.has(partial.kind) ? partial.kind : 'artifact';
  const hasExplicitStatus = Object.prototype.hasOwnProperty.call(partial, 'status') && partial.status !== undefined && partial.status !== null && String(partial.status).trim() !== '';
  const hasExplicitConfidence = Object.prototype.hasOwnProperty.call(partial, 'confidence') && Number.isFinite(Number(partial.confidence));
  return {
    id: String(partial.id || '').trim(),
    kind,
    label: String(partial.label || partial.title || '').trim() || null,
    summary: String(partial.summary || partial.description || '').trim() || null,
    what: String(partial.what || '').trim() || null,
    why: String(partial.why || '').trim() || null,
    represents: String(partial.represents || '').trim() || null,
    sourceType: String(partial.sourceType || '').trim() || null,
    sourceRef: String(partial.sourceRef || '').trim() || null,
    canonicalSource: String(partial.canonicalSource || '').trim() || null,
    derivedSource: String(partial.derivedSource || '').trim() || null,
    verdict: String(partial.verdict || '').trim() || null,
    blocker: String(partial.blocker || '').trim() || null,
    owner: String(partial.owner || '').trim() || null,
    recommendedOwner: String(partial.recommendedOwner || '').trim() || null,
    timestamp: toTimestamp(partial.timestamp, 0),
    parents: Array.isArray(partial.parents) ? [...new Set(partial.parents.filter(Boolean).map((value) => String(value)))] : [],
    children: Array.isArray(partial.children) ? [...new Set(partial.children.filter(Boolean).map((value) => String(value)))] : [],
    status: normalizeStatus(partial.status, partial.status === 'orphaned' ? 'orphaned' : 'informational'),
    statusOrigin: String(partial.statusOrigin || (hasExplicitStatus ? 'derived' : 'unavailable')).trim() || 'unavailable',
    confidence: clamp01(partial.confidence, 0.5),
    confidenceOrigin: String(partial.confidenceOrigin || (hasExplicitConfidence ? 'derived' : 'unavailable')).trim() || 'unavailable',
    confidenceAvailable: hasExplicitConfidence,
    healthScore: Number.isFinite(Number(partial.healthScore)) ? Number(partial.healthScore) : null,
    healthOrigin: String(partial.healthOrigin || (Number.isFinite(Number(partial.healthScore)) ? 'derived' : 'unavailable')).trim() || 'unavailable',
    weight: clamp01(partial.weight, 0.5),
    lane: normalizeText(partial.lane || partial.laneId || partial.lane_id) || null,
    targetType: normalizeText(partial.targetType || partial.target_type) || null,
    truthApplicationStatus: normalizeText(partial.truthApplicationStatus || partial.truth_application_status) || null,
    truthApplicationOrigin: normalizeText(partial.truthApplicationOrigin || partial.truth_application_origin) || null,
    postApplyVerificationVerdict: normalizeText(partial.postApplyVerificationVerdict || partial.post_apply_verification_verdict) || null,
    postApplyVerificationOrigin: normalizeText(partial.postApplyVerificationOrigin || partial.post_apply_verification_origin) || null,
    consistencyStatus: normalizeText(partial.consistencyStatus || partial.consistency_status) || null,
    consistencyOrigin: normalizeText(partial.consistencyOrigin || partial.consistency_origin) || null,
    consistencyIssues: normalizeStringArray(partial.consistencyIssues || partial.consistency_issues || []),
    supportingEvidence: normalizeSupportingEvidence(partial.supportingEvidence || partial.supporting_evidence || null),
  };
}

function addNode(registry, partial) {
  const node = makeNode(partial);
  if (!node.id) return null;
  registry.set(node.id, node);
  return node;
}

function linkNodes(registry, parentId, childId) {
  const parent = registry.get(parentId);
  const child = registry.get(childId);
  if (!parent || !child || parent.id === child.id) return;
  parent.children = [...new Set([...parent.children, child.id])];
  child.parents = [...new Set([...child.parents, parent.id])];
}

function shouldPreserveStandaloneNodeStatus(node = {}) {
  return node?.sourceType === 'qa-investigation'
    && ['healthy', 'degraded', 'blocked'].includes(String(node?.status || '').trim().toLowerCase());
}

function finalizeNodes(registry) {
  return [...registry.values()]
    .map((node) => {
      const relationshipCount = node.parents.length + node.children.length;
      const preserveStandaloneStatus = shouldPreserveStandaloneNodeStatus(node);
      return {
        ...node,
        status: relationshipCount === 0 && node.status !== 'blocked' && !preserveStandaloneStatus ? 'orphaned' : node.status,
        statusOrigin: relationshipCount === 0 && node.status !== 'blocked' && !preserveStandaloneStatus ? 'derived' : node.statusOrigin,
      };
    })
    .sort((left, right) => {
      if (left.timestamp !== right.timestamp) return left.timestamp - right.timestamp;
      return left.id.localeCompare(right.id);
    });
}

function collectIntakeNodes(registry, workspace = {}, intentByCanonicalId = new Map()) {
  const records = Array.isArray(workspace?.studio?.intake?.records) ? workspace.studio.intake.records : [];
  records.forEach((record, index) => {
    const intakeId = String(record?.id || '').trim();
    if (!intakeId) return;
    addNode(registry, {
      id: intakeId,
      kind: 'input',
      label: record?.acknowledgement?.summary || record?.text || intakeId,
      summary: record?.acknowledgement?.summary || null,
      what: 'Canvas intake record',
      why: 'Captured to preserve the incoming request before routing.',
      represents: 'The grounded intake event that seeded downstream intent handling.',
      sourceType: 'workspace.intake',
      sourceRef: record?.sourceRef || record?.route || intakeId,
      derivedSource: 'workspace.studio.intake.records',
      blocker: record?.intentExtraction?.reason || null,
      recommendedOwner: 'context-manager',
      timestamp: record?.createdAt || record?.updatedAt || Date.now() + index,
      status: record?.status || 'informational',
      statusOrigin: record?.status ? 'derived' : 'unavailable',
      confidence: record?.intentExtraction?.confidence ?? 0.6,
      confidenceOrigin: Number.isFinite(Number(record?.intentExtraction?.confidence)) ? 'derived' : 'unavailable',
      weight: 0.45,
    });
    const canonicalIntentId = String(record?.intentExtraction?.canonicalIntentId || '').trim();
    if (canonicalIntentId && intentByCanonicalId.has(canonicalIntentId)) {
      linkNodes(registry, intakeId, intentByCanonicalId.get(canonicalIntentId));
    }
  });
}

function collectIntentNodes(registry, workspace = {}) {
  const records = Array.isArray(workspace?.intentState?.registry?.records) ? workspace.intentState.registry.records : [];
  const intentByCanonicalId = new Map();
  const intentBySourceNodeId = new Map();
  records.forEach((record, index) => {
    const intentId = String(record?.id || '').trim();
    if (!intentId) return;
    const sourceNodeId = String(record?.sourceNodeId || '').trim();
    addNode(registry, {
      id: intentId,
      kind: 'input',
      label: record?.summary || record?.statement || record?.goal || intentId,
      summary: record?.summary || record?.statement || record?.goal || null,
      what: 'Intent registry record',
      why: 'Tracks the current interpreted task/request in the spatial loop.',
      represents: 'The current grounded intent artifact used to steer planning and execution.',
      sourceType: record?.provenance?.sourceType || 'intent-registry',
      sourceRef: record?.provenance?.sourceRef || record?.sourceRef || sourceNodeId || intentId,
      canonicalSource: record?.canonicalIntentId ? 'workspace.intentState.registry.records' : null,
      derivedSource: 'workspace.intentState.registry.records',
      verdict: record?.status || null,
      blocker: Array.isArray(record?.missingFields) && record.missingFields.length ? `Missing: ${record.missingFields.join(', ')}` : null,
      recommendedOwner: 'context-manager',
      timestamp: record?.updatedAt || record?.createdAt || Date.now() + index,
      status: record?.status || 'informational',
      statusOrigin: record?.status ? 'derived' : 'unavailable',
      confidence: record?.confidence ?? record?.audit?.confidence ?? 0.6,
      confidenceOrigin: Number.isFinite(Number(record?.confidence)) || Number.isFinite(Number(record?.audit?.confidence)) ? 'derived' : 'unavailable',
      weight: 0.5,
    });
    const canonicalIntentId = String(record?.canonicalIntentId || '').trim();
    if (canonicalIntentId) intentByCanonicalId.set(canonicalIntentId, intentId);
    if (sourceNodeId) intentBySourceNodeId.set(sourceNodeId, intentId);
  });
  return { intentByCanonicalId, intentBySourceNodeId };
}

function collectHandoffNodes(registry, workspace = {}, intentBySourceNodeId = new Map()) {
  const handoffs = [];
  const current = workspace?.studio?.handoffs?.contextToPlanner;
  if (current) handoffs.push(current);
  if (Array.isArray(workspace?.studio?.handoffs?.history)) {
    handoffs.push(...workspace.studio.handoffs.history);
  }
  handoffs.forEach((handoff, index) => {
    const handoffId = String(handoff?.id || '').trim();
    if (!handoffId) return;
    const sourceNodeId = String(handoff?.sourceNodeId || '').trim();
    addNode(registry, {
      id: handoffId,
      kind: 'artifact',
      label: handoff?.summary || handoffId,
      summary: handoff?.summary || null,
      what: 'Planner handoff artifact',
      why: 'Carries routed context from intake/intent work into planning.',
      represents: 'A handoff checkpoint between grounded context and planning.',
      sourceType: 'studio.handoffs',
      sourceRef: sourceNodeId || handoffId,
      derivedSource: 'workspace.studio.handoffs',
      verdict: handoff?.status || null,
      blocker: handoff?.reason || null,
      recommendedOwner: 'planner',
      timestamp: handoff?.updatedAt || handoff?.createdAt || Date.now() + index,
      status: handoff?.status || 'informational',
      statusOrigin: handoff?.status ? 'derived' : 'unavailable',
      confidence: handoff?.confidence ?? 0.6,
      confidenceOrigin: Number.isFinite(Number(handoff?.confidence)) ? 'derived' : 'unavailable',
      weight: 0.6,
    });
    if (sourceNodeId && intentBySourceNodeId.has(sourceNodeId)) {
      linkNodes(registry, intentBySourceNodeId.get(sourceNodeId), handoffId);
    }
  });
}

function collectContextManagerRuns(registry, rootPath, intentBySourceNodeId = new Map()) {
  const runsDir = path.join(rootPath, 'data', 'spatial', 'agent-runs', 'context-manager');
  listJsonFiles(runsDir).forEach((filePath) => {
    const run = safeReadJson(filePath, null);
    const runId = String(run?.id || '').trim();
    if (!runId) return;
    addNode(registry, {
      id: runId,
      kind: 'execution',
      label: run?.report?.summary || run?.extractedIntent?.summary || runId,
      summary: run?.report?.summary || run?.extractedIntent?.summary || null,
      what: 'Context-manager execution run',
      why: 'Executes live interpretation/routing work against incoming context.',
      represents: 'A grounded execution step in the intent-processing lane.',
      sourceType: 'agent-run/context-manager',
      sourceRef: runId,
      derivedSource: 'data/spatial/agent-runs/context-manager',
      verdict: run?.status || run?.outcome || null,
      blocker: run?.report?.reason || null,
      owner: 'context-manager',
      recommendedOwner: 'context-manager',
      timestamp: run?.completedAt || run?.startedAt || run?.createdAt,
      status: run?.status || run?.outcome || 'informational',
      statusOrigin: run?.status || run?.outcome ? 'derived' : 'unavailable',
      confidence: run?.report?.confidence ?? run?.extractedIntent?.audit?.confidence ?? 0.6,
      confidenceOrigin: Number.isFinite(Number(run?.report?.confidence)) || Number.isFinite(Number(run?.extractedIntent?.audit?.confidence)) ? 'derived' : 'unavailable',
      weight: 0.65,
    });
    const sourceNodeId = String(run?.sourceNodeId || run?.handoff?.sourceNodeId || '').trim();
    if (sourceNodeId && intentBySourceNodeId.has(sourceNodeId)) {
      linkNodes(registry, intentBySourceNodeId.get(sourceNodeId), runId);
    }
    const handoffId = String(run?.handoffId || run?.handoff?.id || '').trim();
    if (handoffId) {
      if (!registry.has(handoffId) && run?.handoff) {
        addNode(registry, {
          id: handoffId,
          kind: 'artifact',
          label: run?.handoff?.summary || handoffId,
          summary: run?.handoff?.summary || null,
          what: 'Generated handoff artifact',
          why: 'Persisted so downstream desks can pick up routed work.',
          represents: 'A handoff emitted by the context-manager run.',
          sourceType: 'agent-run/context-manager',
          sourceRef: handoffId,
          derivedSource: 'data/spatial/agent-runs/context-manager',
          verdict: run?.handoff?.status || null,
          blocker: run?.handoff?.reason || null,
          recommendedOwner: 'planner',
          timestamp: run?.handoff?.updatedAt || run?.handoff?.createdAt || run?.completedAt || run?.startedAt,
          status: run?.handoff?.status || 'informational',
          statusOrigin: run?.handoff?.status ? 'derived' : 'unavailable',
          confidence: run?.handoff?.confidence ?? run?.report?.confidence ?? 0.6,
          confidenceOrigin: Number.isFinite(Number(run?.handoff?.confidence)) || Number.isFinite(Number(run?.report?.confidence)) ? 'derived' : 'unavailable',
          weight: 0.6,
        });
      }
      linkNodes(registry, runId, handoffId);
    }
  });
}

function collectQaRuns(registry, rootPath) {
  const qaDir = path.join(rootPath, 'data', 'spatial', 'qa');
  listDirectories(qaDir, 'qa_').forEach((runDir) => {
    const runtimeFile = path.join(runDir, 'runtime.json');
    const payload = safeReadJson(runtimeFile, null);
    const runtime = payload?.runtime || payload;
    const runId = String(runtime?.id || path.basename(runDir)).trim();
    if (!runId) return;
    const failures = Array.isArray(runtime?.failures) ? runtime.failures.length : 0;
    const findings = Array.isArray(runtime?.desks) ? runtime.desks.reduce((count, desk) => count + (Array.isArray(desk?.failures) ? desk.failures.length : 0), 0) : 0;
    addNode(registry, {
      id: runId,
      kind: 'execution',
      label: runtime?.summary || runId,
      summary: runtime?.summary || null,
      what: 'QA run record',
      why: 'Captures the latest QA execution posture for the system.',
      represents: 'A grounded QA pass/fail execution outcome.',
      sourceType: 'qa-runtime',
      sourceRef: runId,
      derivedSource: 'data/spatial/qa/*/runtime.json',
      verdict: runtime?.status || null,
      blocker: failures > 0 || findings > 0 ? `${failures + findings} QA failures/findings surfaced.` : null,
      owner: 'qa',
      recommendedOwner: 'qa',
      timestamp: runtime?.finishedAt || runtime?.completedAt || payload?.capturedAt || runtime?.startedAt,
      status: failures > 0 || findings > 0 ? 'blocked' : (runtime?.status || 'healthy'),
      statusOrigin: failures > 0 || findings > 0 || runtime?.status ? 'derived' : 'unavailable',
      confidence: 0.7,
      confidenceOrigin: 'unavailable',
      weight: 0.55,
    });
  });
}

function collectInvestigations(registry, rootPath) {
  const investigations = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'investigations.json'), []);
  (Array.isArray(investigations) ? investigations : []).forEach((entry) => {
    const investigationId = String(entry?.id || '').trim();
    if (!investigationId || registry.has(investigationId)) return;
    addNode(registry, {
      id: investigationId,
      kind: 'artifact',
      label: entry?.summary || investigationId,
      summary: entry?.summary || null,
      what: 'QA investigation artifact',
      why: 'Tracks unresolved QA investigations that still matter to runtime health.',
      represents: 'An open or resolved QA issue record.',
      sourceType: 'qa-investigation',
      sourceRef: investigationId,
      derivedSource: 'data/spatial/qa/investigations.json',
      verdict: entry?.status || null,
      blocker: entry?.status === 'open' ? 'Investigation remains open.' : null,
      owner: 'qa',
      recommendedOwner: 'qa',
      timestamp: entry?.last_seen_at || entry?.created_at,
      status: entry?.status === 'open' ? 'degraded' : 'healthy',
      statusOrigin: entry?.status ? 'derived' : 'unavailable',
      confidence: 0.65,
      confidenceOrigin: 'unavailable',
      weight: 0.5,
    });
  });
}

function mapRepairTruthStatus(truthApplicationStatus = '', consistencyStatus = '') {
  const normalizedConsistency = String(consistencyStatus || '').trim().toLowerCase();
  if (normalizedConsistency === 'inconsistent') return 'blocked';
  if (normalizedConsistency === 'warning') return 'degraded';
  const normalized = String(truthApplicationStatus || '').trim().toLowerCase();
  if (normalized === 'verified_healthy') return 'healthy';
  if (normalized === 'blocked_degraded') return 'blocked';
  if (['proposal_pending', 'accepted_pending_apply', 'applied_pending_verification'].includes(normalized)) {
    return 'degraded';
  }
  return 'informational';
}

function collectRepairLoopNodes(registry, rootPath) {
  const jobs = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'repair-jobs.json'), []);
  const attempts = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'repair-attempts.json'), []);
  const receipts = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'repair-apply-receipts.json'), []);
  const events = safeReadJson(path.join(rootPath, 'data', 'spatial', 'qa', 'repair-events.json'), []);
  const latestAttemptByJob = new Map();
  (Array.isArray(attempts) ? attempts : []).forEach((entry) => {
    const jobId = normalizeText(entry?.repair_job_id);
    if (!jobId) return;
    const nextTimestamp = toTimestamp(entry?.timestamp || entry?.created_at, 0);
    const previous = latestAttemptByJob.get(jobId);
    if (!previous || nextTimestamp >= toTimestamp(previous?.timestamp || previous?.created_at, 0)) {
      latestAttemptByJob.set(jobId, entry);
    }
  });
  const latestReceiptByJob = new Map();
  (Array.isArray(receipts) ? receipts : []).forEach((entry) => {
    const jobId = normalizeText(entry?.repair_job_id);
    if (!jobId) return;
    const nextTimestamp = toTimestamp(entry?.apply_timestamp || entry?.created_at, 0);
    const previous = latestReceiptByJob.get(jobId);
    if (!previous || nextTimestamp >= toTimestamp(previous?.apply_timestamp || previous?.created_at, 0)) {
      latestReceiptByJob.set(jobId, entry);
    }
  });
  const eventStagesByJob = new Map();
  (Array.isArray(events) ? events : []).forEach((entry) => {
    const jobId = normalizeText(entry?.repair_job_id);
    if (!jobId) return;
    const stages = eventStagesByJob.get(jobId) || [];
    const stage = normalizeText(entry?.stage);
    if (stage && !stages.includes(stage)) stages.push(stage);
    eventStagesByJob.set(jobId, stages);
  });
  (Array.isArray(jobs) ? jobs : []).forEach((entry) => {
    const jobId = String(entry?.id || '').trim();
    if (!jobId) return;
    const truthApplicationStatus = String(entry?.truth_application_status || '').trim() || 'proposal_pending';
    const consistencyStatus = normalizeText(entry?.consistency_status) || 'consistent';
    const consistencyIssues = normalizeStringArray(entry?.consistency_issues || []);
    const latestAttempt = latestAttemptByJob.get(jobId) || null;
    const latestReceipt = latestReceiptByJob.get(jobId) || null;
    const blockedReason = truthApplicationStatus === 'blocked_degraded'
      ? (entry?.policy_block_reason || entry?.latest_validation_evidence?.summary || 'Repair is blocked or degraded.')
      : ((consistencyStatus === 'inconsistent' || consistencyStatus === 'warning')
        ? (`Consistency ${consistencyStatus}${consistencyIssues.length ? `: ${consistencyIssues.join(', ')}` : ''}`)
        : null);
    addNode(registry, {
      id: jobId,
      kind: 'artifact',
      label: entry?.lane_label || entry?.summary || jobId,
      summary: entry?.summary || null,
      what: 'QA repair job state',
      why: 'Tracks the governed self-fix lifecycle separately from QA evidence artefacts.',
      represents: 'The current canonical repair state for one bounded QA repair lane.',
      sourceType: 'qa-repair-job',
      sourceRef: jobId,
      canonicalSource: 'data/spatial/qa/repair-jobs.json',
      verdict: truthApplicationStatus,
      blocker: blockedReason,
      owner: 'qa',
      recommendedOwner: 'qa',
      timestamp: entry?.updated_at || entry?.created_at,
      status: mapRepairTruthStatus(truthApplicationStatus, consistencyStatus),
      statusOrigin: 'canonical',
      confidence: 0.74,
      confidenceOrigin: 'derived',
      weight: 0.58,
      lane: entry?.lane || null,
      targetType: entry?.target_type || null,
      truthApplicationStatus,
      truthApplicationOrigin: 'canonical',
      postApplyVerificationVerdict: latestAttempt?.validation_verdict || entry?.latest_verdict || null,
      postApplyVerificationOrigin: latestAttempt?.validation_verdict ? 'derived' : (entry?.latest_verdict ? 'canonical' : 'unavailable'),
      consistencyStatus,
      consistencyOrigin: 'canonical',
      consistencyIssues,
      supportingEvidence: {
        classification: 'evidence_artefact',
        lastApplyReceiptId: latestReceipt?.receipt_id || entry?.latest_apply_receipt_id || null,
        evidenceSources: [
          latestAttempt ? 'data/spatial/qa/repair-attempts.json' : null,
          latestReceipt ? 'data/spatial/qa/repair-apply-receipts.json' : null,
          (eventStagesByJob.get(jobId) || []).length ? 'data/spatial/qa/repair-events.json' : null,
        ].filter(Boolean),
        eventStages: eventStagesByJob.get(jobId) || [],
      },
    });
    const investigationId = String(entry?.investigation_id || '').trim();
    if (investigationId && registry.has(investigationId)) {
      linkNodes(registry, investigationId, jobId);
    }
  });
  (Array.isArray(attempts) ? attempts : []).forEach((entry) => {
    const attemptId = String(entry?.attempt_id || '').trim();
    const jobId = String(entry?.repair_job_id || '').trim();
    if (!attemptId || !jobId) return;
    addNode(registry, {
      id: attemptId,
      kind: 'artifact',
      label: entry?.validation_verdict || attemptId,
      summary: entry?.validation_evidence_summary || entry?.proposed_fix_summary || null,
      what: 'QA repair validation attempt',
      why: 'Preserves the evidence trail for a single repair attempt.',
      represents: 'Attempt-level evidence linked to a repair job.',
      sourceType: 'qa-repair-attempt',
      sourceRef: attemptId,
      derivedSource: 'data/spatial/qa/repair-attempts.json',
      verdict: entry?.truth_application_status || entry?.validation_verdict || null,
      blocker: entry?.truth_application_status === 'blocked_degraded' ? (entry?.validation_evidence_summary || entry?.executor_summary || 'Attempt blocked.') : null,
      owner: 'qa',
      recommendedOwner: 'qa',
      timestamp: entry?.timestamp || entry?.created_at,
      status: mapRepairTruthStatus(entry?.truth_application_status || ''),
      statusOrigin: 'derived',
      confidence: 0.7,
      confidenceOrigin: 'derived',
      weight: 0.5,
    });
    if (registry.has(jobId)) {
      linkNodes(registry, jobId, attemptId);
    }
  });
  (Array.isArray(receipts) ? receipts : []).forEach((entry) => {
    const receiptId = String(entry?.receipt_id || '').trim();
    const jobId = String(entry?.repair_job_id || '').trim();
    if (!receiptId || !jobId) return;
    addNode(registry, {
      id: receiptId,
      kind: 'artifact',
      label: entry?.apply_status || receiptId,
      summary: entry?.summary || null,
      what: 'QA repair apply receipt',
      why: 'Proves what live state changed during governed self-apply.',
      represents: 'Execution evidence for one governed apply operation.',
      sourceType: 'qa-repair-apply-receipt',
      sourceRef: receiptId,
      derivedSource: 'data/spatial/qa/repair-apply-receipts.json',
      verdict: entry?.apply_verdict || entry?.apply_status || null,
      blocker: String(entry?.apply_status || '').trim() === 'blocked' ? (entry?.summary || 'Apply was blocked.') : null,
      owner: 'qa',
      recommendedOwner: 'qa',
      timestamp: entry?.apply_timestamp || entry?.created_at,
      status: String(entry?.apply_status || '').trim() === 'applied' ? 'healthy' : (String(entry?.apply_status || '').trim() === 'blocked' ? 'blocked' : 'degraded'),
      statusOrigin: 'derived',
      confidence: 0.78,
      confidenceOrigin: 'derived',
      weight: 0.52,
    });
    if (registry.has(jobId)) {
      linkNodes(registry, jobId, receiptId);
    }
  });
}

function collectCtoDiagnostics(registry, rootPath) {
  const diagnostics = safeReadJson(path.join(rootPath, 'data', 'spatial', 'cto-diagnostics.json'), {});
  const entries = Array.isArray(diagnostics?.entries) ? diagnostics.entries : [];
  entries.forEach((entry) => {
    const entryId = String(entry?.id || '').trim();
    if (!entryId) return;
    addNode(registry, {
      id: entryId,
      kind: 'artifact',
      label: entry?.summary || entry?.message || entryId,
      summary: entry?.summary || entry?.message || null,
      what: 'CTO diagnostic entry',
      why: 'Reflects elevated operational concerns tracked by the CTO diagnostics lane.',
      represents: 'A top-level diagnostic signal about system posture.',
      sourceType: 'cto-diagnostics',
      sourceRef: entryId,
      derivedSource: 'data/spatial/cto-diagnostics.json',
      verdict: entry?.status || null,
      blocker: entry?.reason || entry?.message || null,
      owner: 'cto',
      recommendedOwner: 'cto',
      timestamp: entry?.timestamp,
      status: normalizeStatus(entry?.status, 'degraded'),
      statusOrigin: entry?.status ? 'derived' : 'unavailable',
      confidence: 0.55,
      confidenceOrigin: 'unavailable',
      weight: 0.4,
    });
  });
}

function buildTruthKernelPayload({ rootPath, workspace } = {}) {
  const resolvedRoot = rootPath || process.cwd();
  const registry = new Map();
  const normalizedWorkspace = workspace || {};
  const { intentByCanonicalId, intentBySourceNodeId } = collectIntentNodes(registry, normalizedWorkspace);
  collectIntakeNodes(registry, normalizedWorkspace, intentByCanonicalId);
  collectHandoffNodes(registry, normalizedWorkspace, intentBySourceNodeId);
  collectContextManagerRuns(registry, resolvedRoot, intentBySourceNodeId);
  collectQaRuns(registry, resolvedRoot);
  collectInvestigations(registry, resolvedRoot);
  collectRepairLoopNodes(registry, resolvedRoot);
  collectCtoDiagnostics(registry, resolvedRoot);
  const nodes = finalizeNodes(registry);
  return {
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    nodes,
  };
}

module.exports = {
  buildTruthKernelPayload,
};
