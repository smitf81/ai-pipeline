import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

export const PROJECT_DIARY_STORE_SCHEMA = 'axiom.project-diary.store.v0';
export const PROJECT_DIARY_ENTRY_SCHEMA = 'axiom.project-diary.entry.v0';
export const PROJECT_DIARY_CONTEXT_SCHEMA = 'axiom.project-diary.context-snapshot.v0';
export const PROJECT_DIARY_STEWARD_SCHEMA = 'axiom.project-diary.steward.v0';

const SOURCE_LIMIT = 24000;
const REPORT_LIMIT = 60000;
const ENTRY_LIMIT = 500;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 1000000;
const MAX_ATTACHMENT_TOTAL_BYTES = 4000000;
const MAX_EVIDENCE_FILES = 220;
const MAX_FILE_BYTES = 800000;
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.json', '.md', '.txt', '.html', '.css', '.yml', '.yaml']);
const ATTACHMENT_TEXT_TYPES = new Set(['text/plain', 'text/markdown', 'application/json', 'text/javascript', 'text/css', 'text/html']);
const ATTACHMENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'artifacts', 'output', 'coverage', 'dist', 'build', '.cache', '.playwright-cli']);
const STOP_WORDS = new Set([
  'about', 'again', 'also', 'and', 'because', 'being', 'could', 'does', 'from', 'have', 'into', 'just', 'look', 'make', 'more',
  'probably', 'should', 'still', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through',
  'need', 'not', 'very', 'want', 'when', 'where', 'which', 'with', 'would', 'your', 'user', 'project', 'current'
]);
const SUPPORTED_EVENT_TYPES = new Set([
  'active_project_changed',
  'project_file_changed_external',
  'axiom_authoring_state_changed',
  'axiom_authoring_source_saved',
  'bsb_runtime_map_baked',
  'focused_validation_completed',
  'codex_completion_report_ingested',
  'documentation_stale_detected'
]);

export function createProjectDiaryService(options = {}) {
  const dataRoot = path.resolve(options.dataRoot || path.join(process.cwd(), 'data', 'project-diary'));
  const debounceMs = boundedInteger(options.debounceMs, 1200, 100, 10000);
  const clock = typeof options.now === 'function' ? options.now : () => new Date();

  function now() {
    return clock().toISOString();
  }

  function storePath(project) {
    return path.join(dataRoot, `${projectStorageKey(project)}.json`);
  }

  function attachmentDirectory(project, entryId) {
    return path.join(dataRoot, 'attachments', projectStorageKey(project), safeKey(entryId));
  }

  function emptyStore(project) {
    const createdAt = now();
    return {
      schema: PROJECT_DIARY_STORE_SCHEMA,
      project: projectSnapshot(project),
      entries: [],
      knowledge: {
        classification: 'derived_project_memory_index',
        recentChanges: [],
        unresolvedQuestions: [],
        updatedAt: createdAt
      },
      steward: {
        schema: PROJECT_DIARY_STEWARD_SCHEMA,
        scheduler: 'event_only',
        status: 'quiet',
        debounceMs,
        timers: 0,
        runs: 0,
        acceptedEvents: 0,
        deduplicatedEvents: 0,
        modelCalls: 0,
        idleModelCalls: 0,
        lastRun: null,
        recentSignatures: [],
        supportedEvents: [...SUPPORTED_EVENT_TYPES],
        updatedAt: createdAt
      },
      createdAt,
      updatedAt: createdAt
    };
  }

  function readStore(project) {
    const file = storePath(project);
    if (!fs.existsSync(file)) return emptyStore(project);
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed?.schema !== PROJECT_DIARY_STORE_SCHEMA) throw new Error('project_diary_store_schema_invalid');
    const expected = projectSnapshot(project);
    if (parsed.project?.id !== expected.id || parsed.project?.rootHash !== expected.rootHash) {
      throw new Error('project_diary_identity_mismatch');
    }
    return parsed;
  }

  function writeStore(project, store) {
    fs.mkdirSync(dataRoot, { recursive: true });
    store.entries = Array.isArray(store.entries) ? store.entries.slice(-ENTRY_LIMIT) : [];
    store.updatedAt = now();
    const target = storePath(project);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, target);
    return store;
  }

  function capture(project, payload = {}) {
    const sourceText = boundedText(payload.source?.text ?? payload.text, SOURCE_LIMIT).trim();
    const capturedAt = now();
    const repository = repositoryPosture(project);
    const context = sanitizeContext(payload.context, project, repository, payload.spatialAnchor);
    const annotations = sanitizeAnnotations(payload.source?.annotations || payload.annotations);
    const rawAttachments = payload.source?.attachments || payload.attachments;
    if (!sourceText && !annotations.length && !(Array.isArray(rawAttachments) && rawAttachments.length)) {
      throw new Error('project_diary_source_material_required');
    }
    const entryId = `diary_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const attachments = persistAttachments(project, entryId, rawAttachments);
    const evidenceQuery = sourceText || visualSourceSummary({ annotations, attachments, context });
    const evidence = retrieveEvidence(project, evidenceQuery, {
      maxFiles: options.maxEvidenceFiles || MAX_EVIDENCE_FILES,
      context
    });
    const source = {
      text: sourceText,
      classification: classifySource(sourceText, payload.source?.classification, { annotations, attachments }),
      annotations,
      attachments,
      capturedAt,
      preserved: true,
      hash: null
    };
    source.hash = sourceIntegrityHash(source);
    const baseline = buildBaselineInterpretation(source, evidence, capturedAt);
    const entry = {
      schema: PROJECT_DIARY_ENTRY_SCHEMA,
      id: entryId,
      project: projectSnapshot(project),
      source,
      context,
      derived: {
        classification: 'derived_project_knowledge',
        interpretations: [baseline],
        activeInterpretationId: baseline.id,
        evidence,
        handovers: [],
        completionReports: [],
        unresolvedQuestions: baseline.payload.uncertainties,
        status: 'interpreted_baseline'
      },
      provenance: {
        owner: 'ProjectDiaryService',
        identityOwner: 'FileManagerRuntime',
        sourceSurface: boundedText(payload.provenance?.sourceSurface || 'project_diary', 120),
        capturedBy: boundedText(payload.provenance?.capturedBy || 'user', 120),
        createdAt: capturedAt
      },
      createdAt: capturedAt,
      updatedAt: capturedAt
    };
    try {
      const store = readStore(project);
      store.entries.push(entry);
      evidence.knowledgeLinks.forEach(link => {
        if (link.classification === 'unresolved_question') store.knowledge.unresolvedQuestions.push(link);
      });
      store.knowledge.updatedAt = capturedAt;
      writeStore(project, store);
      return clone(entry);
    } catch (error) {
      try { fs.rmSync(attachmentDirectory(project, entryId), { recursive: true, force: true }); } catch { /* best-effort rollback */ }
      throw error;
    }
  }

  function list(project, options = {}) {
    const store = readStore(project);
    const limit = boundedInteger(options.limit, 30, 1, 100);
    return {
      ok: true,
      schema: PROJECT_DIARY_STORE_SCHEMA,
      project: clone(store.project),
      entries: clone(store.entries.slice(-limit).reverse()),
      knowledge: clone(store.knowledge),
      steward: publicStewardStatus(store.steward)
    };
  }

  function get(project, entryId) {
    const store = readStore(project);
    const entry = store.entries.find(item => item.id === String(entryId || ''));
    if (!entry) throw new Error('project_diary_entry_not_found');
    return clone(entry);
  }

  function appendInterpretation(project, entryId, input = {}) {
    const store = readStore(project);
    const entry = requireEntry(store, entryId);
    const beforeSourceHash = entry.source.hash;
    const payload = normalizeInterpretationPayload(input.interpretation || input.payload || input);
    const createdAt = now();
    const interpretation = {
      id: `interpretation_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      classification: input.classification === 'deterministic_interpretation' ? 'deterministic_interpretation' : 'model_interpretation',
      provider: boundedText(input.provider || 'local_model', 120),
      model: boundedText(input.model || 'unknown', 180),
      sourceHash: entry.source.hash,
      payload,
      budget: {
        trigger: 'entry_capture_only',
        maxTokens: boundedInteger(input.budget?.maxTokens, 520, 64, 1600),
        promptEntries: 1,
        wholeProjectDumped: false
      },
      provenance: {
        generatedAt: createdAt,
        derivedFrom: [entry.id, ...entry.derived.evidence.ownerCandidates.map(item => item.path), ...entry.derived.evidence.knowledgeLinks.map(item => item.path)].slice(0, 12)
      },
      createdAt
    };
    entry.derived.interpretations.push(interpretation);
    entry.derived.activeInterpretationId = interpretation.id;
    entry.derived.unresolvedQuestions = payload.uncertainties;
    entry.derived.status = 'interpreted';
    entry.updatedAt = createdAt;
    if (entry.source.hash !== beforeSourceHash || !sourceIntegrityMatches(entry.source)) throw new Error('project_diary_source_integrity_violation');
    writeStore(project, store);
    return clone(entry);
  }

  function createHandover(project, entryId) {
    const store = readStore(project);
    const entry = requireEntry(store, entryId);
    const interpretation = activeInterpretation(entry);
    const createdAt = now();
    const facts = [
      `Active project: ${entry.project.name} (${entry.project.id}) at ${entry.project.root}.`,
      entry.context.repository?.branch ? `Repository branch: ${entry.context.repository.branch}; dirty paths: ${entry.context.repository.dirtyPathCount}.` : 'Repository posture was unavailable at capture time.',
      entry.context.scene?.catalogueMapId ? `Captured region: ${entry.context.scene.catalogueMapId}.` : null,
      entry.context.scene?.selection ? `Captured selection: ${entry.context.scene.selection.kind || 'record'} ${entry.context.scene.selection.id || 'unknown'}.` : null,
      entry.context.spatialAnchor?.tile ? `Captured viewport tile: ${entry.context.spatialAnchor.tile.x},${entry.context.spatialAnchor.tile.y}.` : null,
      ...entry.derived.evidence.ownerCandidates.slice(0, 4).map(item => `Verified candidate owner: ${item.path}:${item.line} (${item.reason}).`)
    ].filter(Boolean);
    const decisions = entry.derived.evidence.knowledgeLinks
      .filter(item => item.classification === 'accepted_constraint' || item.classification === 'accepted_decision')
      .slice(0, 4)
      .map(item => `${item.path}:${item.line} — ${item.excerpt}`);
    const uncertainties = interpretation.payload.uncertainties.length ? interpretation.payload.uncertainties : ['Confirm the exact runtime reproduction before editing.'];
    const validation = interpretation.payload.suggestedValidation.length
      ? interpretation.payload.suggestedValidation
      : ['Run focused tests for the grounded owners.', 'Run a real browser playtest and inspect screenshots plus console/page errors.'];
    const prompt = [
      `# Codex Goal — ${entry.project.name}`,
      '',
      '## Intended outcome',
      interpretation.payload.interpretedIntent,
      '',
      '## Original user material (preserved)',
      formatOriginalSource(entry.source),
      '',
      '## Verified facts',
      ...facts.map(item => `- ${item}`),
      '',
      '## Accepted decisions and constraints',
      ...(decisions.length ? decisions : ['No directly relevant accepted decision was verified; inspect before assuming.']).map(item => `- ${item}`),
      '',
      '## AXIOM inferences',
      ...interpretation.payload.affectedSystems.map(item => `- Affected system: ${item}`),
      ...interpretation.payload.tasks.map(item => `- ${item}`),
      '',
      '## Unresolved uncertainty',
      ...uncertainties.map(item => `- ${item}`),
      '',
      '## Required validation',
      ...validation.map(item => `- ${item}`),
      '',
      '## Explicit exclusions',
      '- Do not replace FileManager as active-project/workspace identity owner.',
      '- Do not change Map Forge or runtime truth ownership without evidence.',
      '- Do not introduce outlines or broad visual effects when the recorded constraint rejects them.',
      '- Do not treat this handover or the completion report as canonical implementation truth.',
      '',
      '## Documentation reconciliation',
      ...entry.derived.evidence.knowledgeLinks.slice(0, 4).map(item => `- Reconcile ${item.path} if implementation changes invalidate this ${item.classification.replace(/_/g, ' ')}.`)
    ].join('\n');
    const handover = {
      id: `handover_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      schema: 'axiom.project-diary.codex-handover.v0',
      classification: 'derived_handover_preview',
      entryId: entry.id,
      prompt,
      facts,
      decisions,
      inferences: clone(interpretation.payload),
      uncertainties,
      validation,
      provenance: { owner: 'ProjectDiaryService', sourceHash: entry.source.hash, createdAt },
      createdAt
    };
    entry.derived.handovers.push(handover);
    entry.updatedAt = createdAt;
    writeStore(project, store);
    return clone(handover);
  }

  function reconcileCompletion(project, entryId, input = {}) {
    const reportText = boundedText(input.report || input.text, REPORT_LIMIT).trim();
    if (!reportText) throw new Error('project_diary_completion_report_required');
    const store = readStore(project);
    const entry = requireEntry(store, entryId);
    const claimedFiles = extractClaimedFiles(reportText);
    const fileChecks = claimedFiles.map(file => verifyClaimedFile(project, file));
    const claimedValidation = reportText.split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => /(?:npm|node|playwright|pytest|test|validation|passed|failed|console error|page error)/i.test(line))
      .slice(0, 20)
      .map(line => boundedText(line.replace(/^[-*]\s*/, ''), 500));
    const discrepancies = fileChecks.filter(item => !item.exists).map(item => `Claimed file not found under the active project: ${item.path}`);
    if (!claimedValidation.length) discrepancies.push('No validation claim was recognised in the completion report.');
    const documentationImplications = entry.derived.evidence.knowledgeLinks
      .filter(item => /^(docs\/|progress\.md|README\.md)/i.test(item.path))
      .slice(0, 6)
      .map(item => ({ path: item.path, reason: `Review because the originating entry linked this ${item.classification.replace(/_/g, ' ')}.` }));
    const reconciledAt = now();
    const completion = {
      id: `completion_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      schema: 'axiom.project-diary.completion-reconciliation.v0',
      classification: 'external_agent_report_evidence',
      report: reportText,
      reportHash: digest(reportText),
      claimedFiles,
      fileChecks,
      claimedValidation,
      discrepancies,
      documentationImplications,
      status: discrepancies.length ? 'needs_review' : 'claims_grounded',
      provenance: { source: boundedText(input.source || 'codex_completion_report', 120), reconciledBy: 'ProjectDiaryService', reconciledAt },
      createdAt: reconciledAt
    };
    entry.derived.completionReports.push(completion);
    entry.updatedAt = reconciledAt;
    writeStore(project, store);
    handleEvent(project, {
      type: 'codex_completion_report_ingested',
      paths: claimedFiles,
      entryId: entry.id,
      reportHash: completion.reportHash
    });
    return clone(completion);
  }

  function handleEvent(project, input = {}) {
    const type = String(input.type || '').trim();
    if (!SUPPORTED_EVENT_TYPES.has(type)) throw new Error(`project_diary_event_unsupported:${type || 'missing'}`);
    const store = readStore(project);
    const receivedAt = now();
    const paths = uniqueStrings(input.paths || input.changedPaths || [], 24).map(normalizeRelativePath);
    const signature = digest(JSON.stringify({ type, paths, revision: input.revision ?? null, status: input.status ?? null, entryId: input.entryId ?? null, reportHash: input.reportHash ?? null }));
    const cutoff = Date.parse(receivedAt) - debounceMs;
    const duplicate = (store.steward.recentSignatures || []).find(item => item.signature === signature && Date.parse(item.at) >= cutoff);
    if (duplicate) {
      store.steward.deduplicatedEvents += 1;
      store.steward.status = 'quiet';
      store.steward.updatedAt = receivedAt;
      writeStore(project, store);
      return {
        ok: true,
        accepted: false,
        deduplicated: true,
        signature,
        debounceMs,
        steward: publicStewardStatus(store.steward)
      };
    }
    const started = Date.now();
    const classifiedPaths = paths.map(classifyChangedPath);
    const completedAt = now();
    const run = {
      id: `steward_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      eventType: type,
      signature,
      status: 'completed',
      classification: 'bounded_deterministic_event_update',
      receivedAt,
      completedAt,
      workBudget: { maxPaths: 24, maxMilliseconds: 250, modelCalls: 0, retries: 0 },
      workUsed: { paths: classifiedPaths.length, milliseconds: Math.max(0, Date.now() - started), modelCalls: 0, retries: 0 },
      paths: classifiedPaths,
      provenance: { source: boundedText(input.source || 'browser_event_bridge', 120), entryId: input.entryId || null }
    };
    store.steward.status = 'quiet';
    store.steward.runs += 1;
    store.steward.acceptedEvents += 1;
    store.steward.lastRun = run;
    store.steward.recentSignatures = [{ signature, at: receivedAt }, ...(store.steward.recentSignatures || [])].slice(0, 24);
    store.steward.updatedAt = completedAt;
    store.knowledge.recentChanges = [{ eventType: type, at: completedAt, paths: classifiedPaths, provenance: run.provenance }, ...(store.knowledge.recentChanges || [])].slice(0, 20);
    store.knowledge.updatedAt = completedAt;
    writeStore(project, store);
    return { ok: true, accepted: true, deduplicated: false, run: clone(run), steward: publicStewardStatus(store.steward) };
  }

  function status(project) {
    const store = readStore(project);
    return {
      ok: true,
      project: clone(store.project),
      entryCount: store.entries.length,
      steward: publicStewardStatus(store.steward),
      modelPolicy: {
        interpretation: 'capture_triggered_only',
        interpretationMaxTokens: 520,
        eventStewardModelCalls: 0,
        idleModelCalls: 0,
        wholeDiaryPrompted: false
      },
      persistence: {
        owner: 'ProjectDiaryService',
        classification: 'durable_project_linked_memory',
        identityOwner: 'FileManagerRuntime',
        path: storePath(project)
      },
      attachments: {
        maxFiles: MAX_ATTACHMENTS,
        maxBytesPerFile: MAX_ATTACHMENT_BYTES,
        maxTotalBytes: MAX_ATTACHMENT_TOTAL_BYTES,
        persistedOutsideEntryIndex: true
      }
    };
  }

  function persistAttachments(project, entryId, values) {
    if (!Array.isArray(values) || !values.length) return [];
    const directory = attachmentDirectory(project, entryId);
    const output = [];
    let totalBytes = 0;
    for (const [index, item] of values.slice(0, MAX_ATTACHMENTS).entries()) {
      const decoded = decodeAttachment(item);
      if (!decoded) {
        output.push(sanitizeAttachmentReference(item));
        continue;
      }
      totalBytes += decoded.buffer.length;
      if (decoded.buffer.length > MAX_ATTACHMENT_BYTES) throw new Error(`project_diary_attachment_too_large:${decoded.name}`);
      if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error('project_diary_attachment_total_too_large');
      fs.mkdirSync(directory, { recursive: true });
      const attachmentId = `attachment_${index + 1}_${digest(decoded.buffer).slice(0, 10)}`;
      const storageName = `${attachmentId}${attachmentExtension(decoded.type, decoded.name)}`;
      fs.writeFileSync(path.join(directory, storageName), decoded.buffer);
      output.push({
        id: attachmentId,
        name: decoded.name,
        type: decoded.type,
        size: decoded.buffer.length,
        sha256: digest(decoded.buffer),
        storageName,
        reference: `project-diary://${entryId}/${attachmentId}`,
        classification: 'user_attachment_preserved'
      });
    }
    return output;
  }

  function readAttachment(project, entryId, attachmentId) {
    const entry = get(project, entryId);
    const attachment = (entry.source?.attachments || []).find(item => item.id === String(attachmentId || ''));
    if (!attachment?.storageName || attachment.classification !== 'user_attachment_preserved') {
      throw new Error('project_diary_attachment_not_found');
    }
    const directory = path.resolve(attachmentDirectory(project, entryId));
    const target = path.resolve(directory, path.basename(attachment.storageName));
    if (path.dirname(target) !== directory || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error('project_diary_attachment_not_found');
    }
    return { path: target, name: attachment.name, type: attachment.type, size: attachment.size, sha256: attachment.sha256 };
  }

  return { capture, list, get, readAttachment, appendInterpretation, createHandover, reconcileCompletion, handleEvent, status, storePath };
}

export function retrieveProjectDiaryEvidence(project, sourceText, options = {}) {
  return retrieveEvidence(project, sourceText, options);
}

export function normalizeProjectDiaryInterpretation(value) {
  return normalizeInterpretationPayload(value);
}

function projectSnapshot(project = {}) {
  const root = path.resolve(project.root || '.');
  return {
    id: boundedText(project.id || safeKey(path.basename(root)), 120),
    name: boundedText(project.name || path.basename(root), 180),
    root: boundedText(project.selector || project.publicRoot || project.root || '.', 500),
    rootHash: digest(root.toLowerCase()),
    kind: boundedText(project.kind || 'workspace_project', 120),
    trust: boundedText(project.trust || 'unknown', 120)
  };
}

function projectStorageKey(project) {
  const snapshot = projectSnapshot(project);
  return `${safeKey(snapshot.id)}-${snapshot.rootHash.slice(0, 10)}`;
}

function sanitizeContext(input = {}, project, repository, spatialAnchorInput = null) {
  const context = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const projectContext = context.project && typeof context.project === 'object' ? context.project : {};
  const scene = context.scene && typeof context.scene === 'object' ? context.scene : {};
  const authoring = context.authoring && typeof context.authoring === 'object' ? context.authoring : {};
  const runtimeBake = context.runtimeBake && typeof context.runtimeBake === 'object' ? context.runtimeBake : {};
  const viewport = context.viewport && typeof context.viewport === 'object' ? context.viewport : {};
  const anchor = spatialAnchorInput || context.spatialAnchor || null;
  return {
    schema: PROJECT_DIARY_CONTEXT_SCHEMA,
    identityOwner: 'FileManagerRuntime',
    project: {
      id: boundedText(projectContext.id || project.id, 120),
      name: boundedText(projectContext.name || project.name, 180),
      root: boundedText(projectContext.root || project.selector || '.', 500),
      identityStatus: boundedText(projectContext.identityStatus || 'verified_server_project', 120),
      workspaceContract: boundedText(projectContext.workspace?.contract || '', 160) || null,
      surfaceId: boundedText(projectContext.workspace?.surfaceId || '', 160) || null
    },
    repository,
    scene: {
      kind: boundedText(scene.kind || '', 80) || null,
      id: boundedText(scene.id || '', 180) || null,
      mapId: boundedText(scene.mapId || '', 180) || null,
      catalogueMapId: boundedText(scene.catalogueMapId || '', 180) || null,
      selection: sanitizeSelection(scene.selection)
    },
    authoring: {
      active: authoring.active === true,
      surfaceId: boundedText(authoring.surfaceId || '', 160) || null,
      owner: authoring.owner && typeof authoring.owner === 'object' ? {
        owner: boundedText(authoring.owner.owner || '', 160) || null,
        projectId: boundedText(authoring.owner.projectId || '', 160) || null,
        root: boundedText(authoring.owner.root || '', 500) || null,
        pathSource: boundedText(authoring.owner.pathSource || '', 160) || null
      } : null,
      sourcePath: normalizeRelativePath(authoring.sourcePath || ''),
      status: boundedText(authoring.status || '', 120) || null,
      dirty: authoring.dirty === true,
      revision: finiteNumber(authoring.revision)
    },
    runtimeBake: {
      destinationPath: normalizeRelativePath(runtimeBake.destinationPath || ''),
      status: boundedText(runtimeBake.status || '', 120) || null,
      explicit: runtimeBake.explicit === true
    },
    viewport: {
      owner: boundedText(viewport.owner || '', 160) || null,
      mode: boundedText(viewport.mode || '', 120) || null,
      zoom: finiteNumber(viewport.zoom ?? viewport.state?.zoom),
      visibleTiles: sanitizeTileBounds(viewport.visibleTiles)
    },
    spatialAnchor: sanitizeSpatialAnchor(anchor),
    focus: sanitizeFocus(context.focus),
    connections: Object.fromEntries(Object.entries(context.connections || {}).slice(0, 8).map(([key, value]) => [safeKey(key), { state: boundedText(value?.state || 'unknown', 80), lastError: boundedText(value?.lastError || '', 240) || null }])),
    capturedAt: new Date().toISOString()
  };
}

function repositoryPosture(project) {
  try {
    const root = execFileSync('git', ['-C', project.root, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', timeout: 1500, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const status = execFileSync('git', ['-C', project.root, 'status', '--porcelain=v1', '--branch'], { encoding: 'utf8', timeout: 1800, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = status.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0]?.startsWith('##') ? lines.shift().slice(2).trim() : '';
    const branch = branchLine.split('...')[0].trim() || null;
    return {
      available: true,
      root: path.relative(project.root, root).replace(/\\/g, '/') || '.',
      branch,
      dirty: lines.length > 0,
      dirtyPathCount: lines.length,
      sampledPaths: lines.slice(0, 20).map(line => boundedText(line.slice(3).trim(), 500)),
      capturedAt: new Date().toISOString()
    };
  } catch (error) {
    return { available: false, root: null, branch: null, dirty: null, dirtyPathCount: null, sampledPaths: [], error: boundedText(error.message || error, 300), capturedAt: new Date().toISOString() };
  }
}

function retrieveEvidence(project, sourceText, options = {}) {
  const terms = extractKeywords(sourceText);
  const files = collectEvidenceFiles(project.root, boundedInteger(options.maxFiles, MAX_EVIDENCE_FILES, 20, 600));
  const scored = [];
  for (const file of files) {
    let content = '';
    try { content = fs.readFileSync(file.absolute, 'utf8').slice(0, MAX_FILE_BYTES); } catch { continue; }
    const lines = content.split(/\r?\n/);
    let best = null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (!line) continue;
      const matches = terms.filter(term => line.toLowerCase().includes(term));
      if (!matches.length) continue;
      let score = matches.length * 8;
      if (/\b(export|class|function|const|profile|system|renderer|projection|guard|combat|silhouette)\b/i.test(line)) score += 4;
      if (/\b(do not|must|avoid|without|intentionally unchanged|preserve|constraint|no full|no screen|no artificial)\b/i.test(line)) score += 36;
      if (!best || score > best.score) best = { score, line: index + 1, excerpt: boundedText(line, 440), matches };
    }
    const pathScore = terms.filter(term => file.relative.toLowerCase().includes(term)).length * 6;
    if (best || pathScore) scored.push({ ...file, score: (best?.score || 0) + pathScore, line: best?.line || 1, excerpt: best?.excerpt || file.relative, matches: best?.matches || [] });
  }
  scored.sort((left, right) => right.score - left.score || left.relative.localeCompare(right.relative));
  let ownerCandidates = scored
    .filter(item => /^(src|public|server|tests)\//i.test(item.relative) && !/\.test\./i.test(item.relative))
    .map(item => ({
      ...item,
      ownerScore: item.matches.length * 8 + terms.filter(term => item.relative.toLowerCase().includes(term)).length * 6
    }))
    .sort((left, right) => right.ownerScore - left.ownerScore || left.relative.localeCompare(right.relative))
    .slice(0, 6)
    .map(item => ({
      path: item.relative,
      line: item.line,
      excerpt: item.excerpt,
      classification: 'verified_project_file_match',
      confidence: item.ownerScore >= 20 ? 'high' : 'medium',
      reason: `Live project inspection matched: ${item.matches.join(', ') || 'path relevance'}`
    }));
  const workspaceAuthoringOwner = workspaceAuthoringOwnerCandidate(options.context, sourceText);
  if (workspaceAuthoringOwner) {
    ownerCandidates = [
      workspaceAuthoringOwner,
      ...ownerCandidates.filter(item => item.path !== workspaceAuthoringOwner.path)
    ].slice(0, 6);
  }
  const knowledgeSource = workspaceAuthoringOwner
    ? scored.filter(isAuthoringKnowledgeMatch)
    : scored;
  const knowledgeLinks = knowledgeSource
    .filter(item => /(?:\.md|\.txt)$/i.test(item.relative))
    .slice(0, 5)
    .map(item => ({
      path: item.relative,
      line: item.line,
      excerpt: item.excerpt,
      classification: classifyKnowledgeLine(item.excerpt),
      confidence: item.score >= 20 ? 'high' : 'medium',
      provenance: 'bounded_live_project_text_scan'
    }));
  if (!knowledgeLinks.some(item => item.classification === 'accepted_decision') && fs.existsSync(path.join(project.root, '.axiom', 'project.json'))) {
    knowledgeLinks.push({
      path: '.axiom/project.json',
      line: 1,
      excerpt: 'FileManager project manifest declares the active workspace, authoring owner, and explicit runtime-bake owner.',
      classification: 'accepted_decision',
      confidence: 'high',
      provenance: 'verified_project_manifest'
    });
  }
  return {
    schema: 'axiom.project-diary.evidence.v0',
    classification: 'bounded_retrieved_project_evidence',
    terms,
    ownerCandidates,
    knowledgeLinks,
    scan: { filesConsidered: files.length, matches: scored.length, maxFiles: boundedInteger(options.maxFiles, MAX_EVIDENCE_FILES, 20, 600), maxFileBytes: MAX_FILE_BYTES, wholeProjectPrompted: false },
    retrievedAt: new Date().toISOString()
  };
}

function workspaceAuthoringOwnerCandidate(context, sourceText) {
  const authoring = context?.authoring;
  if (!authoring?.active || !authoring.sourcePath) return null;
  if (!/\b(map|level|layout|route|path|terrain|tile|spawn|placement|place|paint|forge|region|encounter|choke|bypass|opening scene)\b/i.test(sourceText)) {
    return null;
  }
  const ownerLabel = authoring.owner?.owner || authoring.owner?.projectId || 'AXIOM authoring surface';
  return {
    path: authoring.sourcePath,
    line: 1,
    excerpt: `${ownerLabel} owns the active editable map source; the runtime map is an explicit derived bake.`,
    classification: 'verified_workspace_authoring_owner',
    confidence: 'high',
    reason: `FileManager workspace context declares ${ownerLabel} / ${authoring.surfaceId || 'active authoring surface'} as the mutation owner.`
  };
}

function isAuthoringKnowledgeMatch(item) {
  const relative = String(item?.relative || '').toLowerCase();
  const matches = new Set((item?.matches || []).map(value => String(value).toLowerCase()));
  const authoringTerms = ['map', 'level', 'layout', 'route', 'path', 'terrain', 'tile', 'spawn', 'placement', 'place', 'paint', 'forge', 'region', 'encounter', 'choke', 'bypass', 'opening', 'playable'];
  return authoringTerms.some(term => matches.has(term))
    || /(?:^|\/)(?:first_playable|playable_loop|runtime_map|map|level|gdd|gcd)[^/]*\.(?:md|txt)$/i.test(relative);
}

function collectEvidenceFiles(root, limit) {
  const output = [];
  const pending = [path.resolve(root)];
  while (pending.length && output.length < limit) {
    const current = pending.shift();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { continue; }
    for (const entry of entries) {
      if (output.length >= limit) break;
      if (entry.name.startsWith('.') && entry.name !== '.axiom') continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(absolute);
        continue;
      }
      if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const relative = path.relative(root, absolute).replace(/\\/g, '/');
      if (/^data\/maps\/.*\.json$/i.test(relative)) continue;
      let size = 0;
      try { size = fs.statSync(absolute).size; } catch { continue; }
      if (size > MAX_FILE_BYTES * 2) continue;
      output.push({ absolute, relative, size });
    }
  }
  return output;
}

function buildBaselineInterpretation(source, evidence, createdAt) {
  const hasWorkspaceAuthoringOwner = evidence.ownerCandidates.some(item => item.classification === 'verified_workspace_authoring_owner');
  const affectedSystems = uniqueStrings(evidence.ownerCandidates.map(item => systemFromPath(item.path)), 8);
  const tasks = [
    evidence.ownerCandidates[0] ? `Inspect ${evidence.ownerCandidates[0].path} first and confirm the observed behavior against its current contract.` : 'Inspect the active project before assigning an implementation owner.',
    'Reproduce the concern in the live BSB viewport before changing behavior.',
    evidence.knowledgeLinks.some(item => item.classification === 'accepted_constraint') ? 'Preserve the linked accepted constraints while evaluating the change.' : 'Confirm design constraints before implementation.'
  ];
  const uncertainties = [];
  if (!evidence.ownerCandidates.length) uncertainties.push('No likely source owner was grounded by the bounded project scan.');
  if (!evidence.knowledgeLinks.some(item => ['accepted_constraint', 'accepted_decision'].includes(item.classification))) uncertainties.push('No relevant accepted decision or constraint was verified.');
  uncertainties.push(hasWorkspaceAuthoringOwner
    ? 'Runtime pacing and collision still require a save, bake, and browser playtest before completion.'
    : 'The exact runtime reproduction and desired acceptance threshold still need confirmation.');
  return {
    id: `interpretation_baseline_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    classification: 'deterministic_interpretation',
    provider: 'ProjectDiaryService',
    model: null,
    sourceHash: source.hash,
    payload: {
      interpretedIntent: boundedText(source.text || visualSourceSummary({ annotations: source.annotations, attachments: source.attachments }), 1200),
      affectedSystems: affectedSystems.length ? affectedSystems : ['unresolved active-project subsystem'],
      tasks,
      uncertainties,
      suggestedValidation: ['Run focused tests for any changed owner.', 'Run a real browser playtest with screenshot and console/page-error inspection.'],
      recommendedAction: hasWorkspaceAuthoringOwner ? 'local_handling' : evidence.ownerCandidates.length ? 'codex_escalation' : 'user_clarification',
      confidence: hasWorkspaceAuthoringOwner ? 'high' : evidence.ownerCandidates.length ? 'medium' : 'low'
    },
    budget: { trigger: 'deterministic_capture', maxTokens: 0, promptEntries: 0, wholeProjectDumped: false },
    provenance: { generatedAt: createdAt, derivedFrom: [source.hash], note: 'Baseline interpretation is derived and may be superseded by a capture-triggered local-model interpretation.' },
    createdAt
  };
}

function normalizeInterpretationPayload(input = {}) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    interpretedIntent: boundedText(value.interpretedIntent || value.intent || value.summary || 'Interpretation unavailable.', 2000),
    affectedSystems: uniqueStrings(value.affectedSystems || value.systems || [], 10).map(item => boundedText(item, 240)),
    tasks: uniqueStrings(value.tasks || [], 12).map(item => boundedText(item, 500)),
    uncertainties: uniqueStrings(value.uncertainties || value.openQuestions || [], 12).map(item => boundedText(item, 500)),
    suggestedValidation: uniqueStrings(value.suggestedValidation || value.validation || [], 10).map(item => boundedText(item, 500)),
    recommendedAction: ['local_handling', 'user_clarification', 'codex_escalation'].includes(value.recommendedAction) ? value.recommendedAction : 'codex_escalation',
    confidence: ['low', 'medium', 'high'].includes(value.confidence) ? value.confidence : 'medium'
  };
}

function activeInterpretation(entry) {
  return entry.derived.interpretations.find(item => item.id === entry.derived.activeInterpretationId) || entry.derived.interpretations.at(-1);
}

function requireEntry(store, entryId) {
  const entry = store.entries.find(item => item.id === String(entryId || ''));
  if (!entry) throw new Error('project_diary_entry_not_found');
  return entry;
}

function extractKeywords(value) {
  const raw = String(value || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
  const output = [];
  for (const word of raw) {
    if (!STOP_WORDS.has(word)) output.push(word);
    const stem = stemWord(word);
    if (stem !== word && !STOP_WORDS.has(stem)) output.push(stem);
  }
  return [...new Set(output)].slice(0, 18);
}

function stemWord(word) {
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 4) return word.slice(0, -1);
  return word;
}

function classifySource(text, explicit, visual = {}) {
  if (explicit && ['bug', 'observation', 'design_idea', 'decision', 'task_request', 'code', 'completion_report', 'visual_annotation'].includes(explicit)) return explicit;
  if (!String(text || '').trim() && ((visual.annotations || []).length || (visual.attachments || []).length)) return 'visual_annotation';
  if (/\b(error|bug|broken|fails?|wrong|unclear|vibrat|flicker|regression)\b/i.test(text)) return 'bug';
  if (/\b(decide|decision|must|do not|never|accepted)\b/i.test(text)) return 'decision';
  if (/\b(please|task|implement|change|fix|add|remove)\b/i.test(text)) return 'task_request';
  if (/```|\b(function|const|class|import|export)\b/.test(text)) return 'code';
  if (/\b(idea|maybe|probably|could|should|want)\b/i.test(text)) return 'design_idea';
  return 'observation';
}

function classifyKnowledgeLine(line) {
  if (/\b(do not|must|avoid|without|intentionally unchanged|preserve|constraint|no full|no screen|no artificial)\b/i.test(line)) return 'accepted_constraint';
  if (/\b(decision|owns?|canonical|contract|declares?)\b/i.test(line)) return 'accepted_decision';
  if (/\b(todo|open question|unresolved|needs confirmation)\b/i.test(line)) return 'unresolved_question';
  if (/\b(regression|failed|failure|bug)\b/i.test(line)) return 'known_regression';
  return 'current_implementation_observation';
}

function systemFromPath(value) {
  const file = String(value || '').replace(/\\/g, '/');
  if (/render|projection|silhouette|visual/i.test(file)) return 'rendering and visual projection';
  if (/combat|attack|guard|damage/i.test(file)) return 'combat and defensive behavior';
  if (/map|world|scene/i.test(file)) return 'map/world authoring';
  if (/audio|sound/i.test(file)) return 'audio';
  if (/test/i.test(file)) return 'validation';
  return file.split('/').slice(0, -1).join('/') || 'project source';
}

function extractClaimedFiles(report) {
  const matches = String(report || '').match(/(?:[A-Za-z]:[\\/][^\s`"'<>|]+|(?:\.\.?[\\/])?(?:src|docs|tests|public|server|data|AXIOM|_A_Projects)[\\/][^\s`"'<>|]+?\.(?:js|mjs|cjs|ts|json|md|txt|html|css|yml|yaml|ps1|cmd))/gi) || [];
  return uniqueStrings(matches.map(item => item.replace(/[),;:.]+$/, '')), 80).map(normalizeRelativePath);
}

function verifyClaimedFile(project, claimedPath) {
  let candidate = String(claimedPath || '').replace(/\\/g, '/');
  const selector = String(project.selector || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (selector && candidate.toLowerCase().startsWith(`${selector.toLowerCase()}/`)) candidate = candidate.slice(selector.length + 1);
  const resolved = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(project.root, candidate);
  const relative = path.relative(project.root, resolved);
  const inside = relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  const exists = inside && fs.existsSync(resolved) && fs.statSync(resolved).isFile();
  return {
    path: normalizeRelativePath(candidate),
    insideProject: inside,
    exists,
    sha256: exists ? digest(fs.readFileSync(resolved)) : null,
    classification: exists ? 'deterministically_verified_file_claim' : 'unresolved_file_claim'
  };
}

function classifyChangedPath(value) {
  const file = normalizeRelativePath(value);
  let subsystem = 'project_file';
  if (/^(docs\/|.*\.md$)/i.test(file)) subsystem = 'documentation';
  else if (/^(src\/render|src\/projection)/i.test(file)) subsystem = 'rendering';
  else if (/^(src\/systems|src\/data\/.*(?:combat|attack|guard))/i.test(file)) subsystem = 'gameplay';
  else if (/^(data\/maps|data\/bsb-v2\/maps)/i.test(file)) subsystem = 'map_authoring_or_runtime';
  else if (/^(tests\/|.*\.test\.)/i.test(file)) subsystem = 'validation';
  return { path: file, subsystem, documentationLikelyAffected: subsystem !== 'documentation' && ['rendering', 'gameplay', 'map_authoring_or_runtime'].includes(subsystem) };
}

function publicStewardStatus(steward = {}) {
  return {
    schema: PROJECT_DIARY_STEWARD_SCHEMA,
    scheduler: steward.scheduler || 'event_only',
    status: steward.status || 'quiet',
    debounceMs: steward.debounceMs,
    timers: 0,
    runs: steward.runs || 0,
    acceptedEvents: steward.acceptedEvents || 0,
    deduplicatedEvents: steward.deduplicatedEvents || 0,
    modelCalls: 0,
    idleModelCalls: 0,
    lastRun: clone(steward.lastRun || null),
    supportedEvents: [...(steward.supportedEvents || SUPPORTED_EVENT_TYPES)]
  };
}

function sanitizeSelection(value) {
  if (!value || typeof value !== 'object') return null;
  return { kind: boundedText(value.kind || value.type || '', 100) || null, id: boundedText(value.id || '', 200) || null };
}

function sanitizeSpatialAnchor(value) {
  if (!value || typeof value !== 'object') return null;
  const tile = value.tile && Number.isFinite(Number(value.tile.x)) && Number.isFinite(Number(value.tile.y))
    ? { x: Number(value.tile.x), y: Number(value.tile.y) }
    : null;
  return {
    schema: 'axiom.project-diary.spatial-anchor.v0',
    surfaceId: boundedText(value.surfaceId || 'bsb-v2-map-authoring', 160),
    catalogueMapId: boundedText(value.catalogueMapId || '', 180) || null,
    mapId: boundedText(value.mapId || '', 180) || null,
    tile,
    selection: sanitizeSelection(value.selection),
    capturedAt: boundedText(value.capturedAt || new Date().toISOString(), 80)
  };
}

function sanitizeAnnotations(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 24).map((item, index) => {
    const kind = ['point', 'circle', 'arrow', 'freehand', 'highlight'].includes(item?.kind) ? item.kind : 'freehand';
    const pathPoints = Array.isArray(item?.path) ? item.path : [];
    const path = pathPoints.slice(0, 256).map(sanitizeAnnotationPoint).filter(Boolean);
    const fallback = sanitizeAnnotationPoint(item?.screen);
    if (!path.length && fallback) path.push(fallback);
    return {
      id: boundedText(item?.id || `annotation_${index + 1}`, 180),
      schema: 'axiom.annotation.v1',
      kind,
      classification: 'preserved_viewport_annotation',
      path,
      radius: finiteNumber(item?.radius),
      surface: sanitizeAnnotationSurface(item?.surface || item?.anchor || item?.surfaceAnchor),
      focus: sanitizeFocus(item?.focus),
      note: boundedText(item?.note || '', 1000) || null,
      provenance: {
        createdBy: boundedText(item?.provenance?.createdBy || 'InteractionModeRuntime', 180),
        createdAt: boundedText(item?.provenance?.createdAt || new Date().toISOString(), 80),
        sourceGesture: boundedText(item?.provenance?.sourceGesture || 'axiom.annotation.gesture.v1', 180)
      }
    };
  }).filter(item => item.path.length);
}

function sanitizeAnnotationPoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const nx = finiteNumber(value.nx);
  const ny = finiteNumber(value.ny);
  if (x === null && y === null && nx === null && ny === null) return null;
  return {
    x,
    y,
    nx: nx === null ? null : Math.max(0, Math.min(1, nx)),
    ny: ny === null ? null : Math.max(0, Math.min(1, ny))
  };
}

function sanitizeAnnotationSurface(value) {
  if (!value || typeof value !== 'object') return null;
  const classification = ['canonical_authoring_anchor', 'runtime_only_reference', 'derived_viewport_reference'].includes(value.classification)
    ? value.classification
    : 'derived_viewport_reference';
  const tile = value.tile && Number.isFinite(Number(value.tile.x)) && Number.isFinite(Number(value.tile.y))
    ? { x: Number(value.tile.x), y: Number(value.tile.y) }
    : null;
  return {
    surfaceId: boundedText(value.surfaceId || 'axiom-viewport', 180),
    view: boundedText(value.view || '', 80) || null,
    classification,
    mapId: boundedText(value.mapId || '', 180) || null,
    catalogueMapId: boundedText(value.catalogueMapId || '', 180) || null,
    revision: finiteNumber(value.revision),
    tile,
    normalized: value.normalized && typeof value.normalized === 'object' ? {
      x: finiteNumber(value.normalized.x),
      y: finiteNumber(value.normalized.y)
    } : null
  };
}

function sanitizeFocus(value) {
  if (!value || typeof value !== 'object') return null;
  return {
    id: boundedText(value.focus_id || value.id || '', 180) || null,
    label: boundedText(value.label || '', 240) || null,
    kind: boundedText(value.kind || '', 120) || null,
    classification: boundedText(value.classification || '', 160) || null,
    relatedFiles: (value.related_files || value.relatedFiles || []).slice(0, 10).map(item => ({ path: normalizeRelativePath(item.path || ''), classification: boundedText(item.classification || 'unverified', 120) }))
  };
}

function sanitizeTileBounds(value) {
  if (!value || typeof value !== 'object') return null;
  return Object.fromEntries(['minX', 'minY', 'maxX', 'maxY'].map(key => [key, finiteNumber(value[key])]).filter(([, number]) => number !== null));
}

function sanitizeAttachmentReference(item) {
  return {
    id: boundedText(item?.id || `reference_${digest(String(item?.reference || item?.name || 'attachment')).slice(0, 10)}`, 180),
    name: boundedText(item?.name || 'attachment', 240),
    type: boundedText(item?.type || 'application/octet-stream', 160),
    size: finiteNumber(item?.size),
    reference: boundedText(item?.reference || '', 500) || null,
    classification: 'user_attachment_reference_unresolved'
  };
}

function decodeAttachment(item) {
  if (!item || typeof item !== 'object') return null;
  const name = boundedText(path.basename(String(item.name || 'attachment')), 240);
  const requestedType = boundedText(item.type || '', 160).toLowerCase();
  let type = requestedType;
  let buffer = null;
  const dataUrl = String(item.dataUrl || '');
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (match) {
    type = String(match[1] || type).toLowerCase();
    buffer = Buffer.from(match[2], 'base64');
  } else if (typeof item.content === 'string') {
    type = type || attachmentTypeFromName(name);
    buffer = Buffer.from(item.content, 'utf8');
  }
  if (!buffer) return null;
  if (!ATTACHMENT_IMAGE_TYPES.has(type) && !ATTACHMENT_TEXT_TYPES.has(type)) {
    throw new Error(`project_diary_attachment_type_unsupported:${type || 'unknown'}`);
  }
  return { name, type, buffer };
}

function attachmentTypeFromName(name) {
  const extension = path.extname(String(name || '')).toLowerCase();
  if (extension === '.md') return 'text/markdown';
  if (extension === '.json') return 'application/json';
  if (['.js', '.mjs', '.cjs', '.ts'].includes(extension)) return 'text/javascript';
  if (extension === '.css') return 'text/css';
  if (extension === '.html') return 'text/html';
  return 'text/plain';
}

function attachmentExtension(type, name) {
  const known = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/json': '.json',
    'text/javascript': '.js',
    'text/css': '.css',
    'text/html': '.html'
  }[type];
  return known || path.extname(String(name || '')).toLowerCase().slice(0, 10) || '.bin';
}

function sourceIntegrityHash(source = {}) {
  return digest(JSON.stringify({
    text: String(source.text || ''),
    annotations: source.annotations || [],
    attachments: (source.attachments || []).map(item => ({ id: item.id, name: item.name, type: item.type, size: item.size, sha256: item.sha256 || null, reference: item.reference || null }))
  }));
}

function sourceIntegrityMatches(source = {}) {
  if (sourceIntegrityHash(source) === source.hash) return true;
  const legacyVisualsAbsent = !Array.isArray(source.annotations) && (source.attachments || []).every(item => !item?.sha256);
  return legacyVisualsAbsent && digest(String(source.text || '')) === source.hash;
}

function visualSourceSummary({ annotations = [], attachments = [], context = null } = {}) {
  const types = uniqueStrings((annotations || []).map(item => item.kind), 8);
  const surface = annotations?.[0]?.surface?.surfaceId || context?.authoring?.surfaceId || context?.project?.surfaceId || 'viewport';
  const parts = [`Visual Journal entry on ${surface}`];
  if (annotations.length) parts.push(`${annotations.length} annotation${annotations.length === 1 ? '' : 's'}${types.length ? ` (${types.join(', ')})` : ''}`);
  if (attachments.length) parts.push(`${attachments.length} preserved source file${attachments.length === 1 ? '' : 's'}`);
  return `${parts.join(' · ')}.`;
}

function formatOriginalSource(source = {}) {
  const lines = [];
  if (String(source.text || '').trim()) lines.push(source.text);
  if ((source.annotations || []).length || (source.attachments || []).length) lines.push(visualSourceSummary(source));
  return lines.join('\n\n') || 'No source material available.';
}

function normalizeRelativePath(value) {
  return boundedText(String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, ''), 1000);
}

function uniqueStrings(values, limit) {
  const array = Array.isArray(values) ? values : typeof values === 'string' ? [values] : [];
  return [...new Set(array.map(item => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

function boundedText(value, limit) {
  return String(value ?? '').slice(0, limit);
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function safeKey(value) {
  return String(value || 'project').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100) || 'project';
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
