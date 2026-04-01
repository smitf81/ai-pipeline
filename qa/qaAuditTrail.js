const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizeArtifactArtifact(artifact = {}) {
  if (typeof artifact === 'string') {
    const value = normalizeText(artifact);
    return value
      ? {
          path: value,
          label: value,
          kind: 'artifact',
          freshnessClass: null,
          observedAt: null,
          derivedFrom: null,
        }
      : null;
  }
  const source = artifact && typeof artifact === 'object' ? artifact : {};
  const pathValue = normalizeText(source.path || source.sourcePath);
  const label = normalizeText(source.label) || pathValue || 'Artifact';
  return pathValue || label
    ? {
        path: pathValue || null,
        label,
        kind: normalizeText(source.kind) || 'artifact',
        freshnessClass: normalizeText(source.freshnessClass) || null,
        observedAt: normalizeText(source.observedAt) || null,
        derivedFrom: normalizeText(source.derivedFrom) || null,
      }
    : null;
}

function normalizeGenerator(generator = {}) {
  const source = generator && typeof generator === 'object' ? generator : {};
  const moduleName = normalizeText(source.module || source.moduleName);
  const system = normalizeText(source.system || source.owner || source.source || source.kind);
  const label = normalizeText(source.label) || [system, moduleName].filter(Boolean).join(' | ');
  return moduleName || system || label
    ? {
        system: system || null,
        module: moduleName || null,
        label: label || null,
      }
    : null;
}

function parseTimestamp(...values) {
  for (const value of values) {
    const parsed = Date.parse(normalizeText(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function classifyFreshness(freshnessClass = '', generatedAt = null, now = Date.now()) {
  const normalized = normalizeText(freshnessClass);
  if (normalized === 'stale' || normalized === 'missing' || normalized === 'non_executable') {
    return normalized;
  }
  const timestamp = parseTimestamp(generatedAt);
  if (timestamp == null) return 'missing';
  return Math.max(0, now - timestamp) > DEFAULT_STALE_AFTER_MS ? 'stale' : normalized || 'live_canonical';
}

function buildAuditEntry({
  kind = 'qa-output',
  label = '',
  status = 'ok',
  freshnessClass = 'missing',
  generatedAt = null,
  generator = null,
  sourceArtifacts = [],
  mismatchReason = null,
  detail = null,
  sourceTrace = null,
} = {}) {
  const normalizedArtifacts = Array.isArray(sourceArtifacts)
    ? sourceArtifacts.map(normalizeArtifactArtifact).filter(Boolean)
    : [];
  const normalizedGenerator = normalizeGenerator(generator);
  const normalizedStatus = normalizeText(status) || 'ok';
  const normalizedFreshness = normalizeText(freshnessClass) || 'missing';
  return {
    kind: normalizeText(kind) || 'qa-output',
    label: normalizeText(label) || 'QA output',
    status: normalizedStatus,
    freshnessClass: normalizedFreshness,
    generatedAt: normalizeText(generatedAt) || null,
    generator: normalizedGenerator,
    sourceArtifacts: normalizedArtifacts,
    mismatch: normalizedStatus === 'mismatch',
    mismatchReason: normalizeText(mismatchReason) || null,
    detail: normalizeText(detail) || null,
    sourceTrace: sourceTrace && typeof sourceTrace === 'object' ? { ...sourceTrace } : null,
  };
}

function buildStructuredTestLookup(structuredReport = null) {
  const lookup = new Map();
  for (const deskReport of Array.isArray(structuredReport?.desks) ? structuredReport.desks : []) {
    const deskId = normalizeText(deskReport?.desk);
    if (!deskId) continue;
    for (const test of Array.isArray(deskReport?.tests) ? deskReport.tests : []) {
      const testName = normalizeText(test?.name);
      if (!testName) continue;
      const card = test?.qualityCard && typeof test.qualityCard === 'object' ? test.qualityCard : null;
      const record = {
        deskId,
        testName,
        status: normalizeText(test?.status) || 'missing',
        reason: normalizeText(test?.reason) || null,
        qualityCard: card,
      };
      lookup.set(`${deskId}:${testName}`, record);
      if (card?.testId) lookup.set(`${deskId}:${normalizeText(card.testId)}`, record);
      if (card?.id) lookup.set(normalizeText(card.id), record);
      if (card?.testName) lookup.set(`${deskId}:${normalizeText(card.testName)}`, record);
    }
  }
  return lookup;
}

function collectStructuredReportIntegrityIssues(structuredReport = null) {
  const issues = [];
  if (!structuredReport) return issues;
  const failures = Array.isArray(structuredReport.failures) ? structuredReport.failures : [];
  const status = normalizeText(structuredReport.status);
  if (status === 'pass' && failures.length) {
    issues.push('Structured QA report status is pass, but failures are present.');
  }
  if (status === 'fail' && !failures.length) {
    issues.push('Structured QA report status is fail, but no failures are present.');
  }
  return issues;
}

function buildStructuredReportAudit({
  structuredReport = null,
  structuredSummary = null,
  now = Date.now(),
} = {}) {
  const generatedAt = normalizeText(structuredSummary?.finishedAt || structuredReport?.finishedAt || structuredReport?.updatedAt || structuredReport?.createdAt || null) || null;
  const sourceTrace = structuredReport?.sourceTrace || null;
  const freshnessClass = classifyFreshness(sourceTrace?.freshnessClass || (structuredReport ? 'live_canonical' : 'missing'), generatedAt, now);
  const issues = collectStructuredReportIntegrityIssues(structuredReport);
  return buildAuditEntry({
    kind: 'structured-report',
    label: 'Structured QA report',
    status: !structuredReport
      ? 'missing'
      : issues.length
        ? 'mismatch'
        : freshnessClass === 'stale'
          ? 'stale'
          : freshnessClass === 'missing'
            ? 'missing'
            : 'ok',
    freshnessClass,
    generatedAt,
    generator: structuredReport?.generatedBy || { system: 'qa', module: 'qa/qaLead.runAll' },
    sourceArtifacts: Array.isArray(structuredReport?.sourceTrace?.sourceArtifacts) && structuredReport.sourceTrace.sourceArtifacts.length
      ? structuredReport.sourceTrace.sourceArtifacts
      : [
          {
            path: 'data/spatial/qa/structured/latest.json',
            label: 'Structured QA report',
            kind: 'report',
            freshnessClass,
            observedAt: generatedAt,
          },
        ],
    mismatchReason: issues.join(' ') || null,
    detail: structuredSummary?.summary || structuredReport?.summary || 'Structured QA report.',
    sourceTrace,
  });
}

function buildScorecardAuditEntries({
  structuredReport = null,
  structuredSummary = null,
  scorecards = [],
  now = Date.now(),
} = {}) {
  const reportTrace = structuredReport?.sourceTrace || null;
  const reportGeneratedAt = normalizeText(structuredSummary?.finishedAt || structuredReport?.finishedAt || structuredReport?.updatedAt || structuredReport?.createdAt || null) || null;
  const reportFreshness = classifyFreshness(reportTrace?.freshnessClass || (structuredReport ? 'live_canonical' : 'missing'), reportGeneratedAt, now);
  const reportLookup = buildStructuredTestLookup(structuredReport);
  return (Array.isArray(scorecards) ? scorecards : []).map((card, index) => {
    const source = card && typeof card === 'object' ? card : {};
    const deskId = normalizeText(source.desk || source.deskId);
    const testName = normalizeText(source.testName || source.testId || `scorecard-${index}`);
    const matchKeyCandidates = [
      deskId && testName ? `${deskId}:${testName}` : null,
      deskId && source.testId ? `${deskId}:${normalizeText(source.testId)}` : null,
      normalizeText(source.id),
    ].filter(Boolean);
    const matchedTest = matchKeyCandidates.map((key) => reportLookup.get(key)).find(Boolean) || null;
    const sourceFreshness = normalizeText(source.sourceTrace?.freshnessClass || '');
    const freshnessClass = reportFreshness === 'stale'
      ? 'stale'
      : reportFreshness === 'missing'
        ? 'missing'
        : classifyFreshness(sourceFreshness || (structuredReport ? 'derived_current' : 'missing'), source.sourceTrace?.observedAt || source.updatedAt || reportGeneratedAt, now);
    const issues = [];
    if (!structuredReport) {
      issues.push('Structured QA report is missing.');
    } else if (!matchedTest) {
      issues.push('No matching structured test evidence was found.');
    } else if (normalizeText(source.status || 'pass').toLowerCase() !== normalizeText(matchedTest.status).toLowerCase()) {
      issues.push(`Scorecard status ${normalizeText(source.status || 'pass')} does not match structured test status ${normalizeText(matchedTest.status)}.`);
    }
    const status = !structuredReport
      ? 'missing'
      : freshnessClass === 'stale'
        ? 'stale'
        : freshnessClass === 'missing'
          ? 'missing'
          : issues.length
            ? 'mismatch'
            : 'ok';
    return buildAuditEntry({
      kind: 'scorecard',
      label: `${deskId || 'desk'} | ${testName || 'QA test'}`,
      status,
      freshnessClass,
      generatedAt: source.updatedAt || reportGeneratedAt || null,
      generator: source.generatedBy || { system: 'ui', module: 'ui/server.collectStructuredQAScorecards' },
      sourceArtifacts: Array.isArray(source?.sourceTrace?.sourceArtifacts) && source.sourceTrace.sourceArtifacts.length
        ? source.sourceTrace.sourceArtifacts
        : [
            {
              path: 'data/spatial/qa/structured/latest.json',
              label: 'Structured QA report',
              kind: 'report',
              freshnessClass: reportFreshness,
              observedAt: reportGeneratedAt,
            },
            {
              path: matchedTest ? `${matchedTest.deskId}:${matchedTest.testName}` : (deskId && testName ? `${deskId}:${testName}` : normalizeText(source.id) || null),
              label: 'Structured test result',
              kind: 'test-result',
              freshnessClass: matchedTest ? 'derived_current' : 'missing',
              observedAt: reportGeneratedAt,
              derivedFrom: 'data/spatial/qa/structured/latest.json',
            },
          ],
      mismatchReason: issues.join(' ') || null,
      detail: normalizeText(source.validation?.summary || source.reason || matchedTest?.reason || '') || null,
      sourceTrace: source.sourceTrace || null,
    });
  });
}

function buildBrowserRunAuditEntries({
  latestBrowserRun = null,
  browserRuns = [],
  now = Date.now(),
} = {}) {
  const runs = [];
  const seenIds = new Set();
  if (latestBrowserRun) {
    const latestId = normalizeText(latestBrowserRun?.id);
    if (latestId) seenIds.add(latestId);
    runs.push({ ...latestBrowserRun, _kind: 'latest-browser-run' });
  }
  for (const run of Array.isArray(browserRuns) ? browserRuns : []) {
    const runId = normalizeText(run?.id);
    if (runId && seenIds.has(runId)) continue;
    runs.push({ ...run, _kind: 'browser-run' });
  }
  return runs.map((run) => {
    const runId = normalizeText(run?.id);
    if (runId) seenIds.add(runId);
    const freshnessClass = classifyFreshness(run?.sourceTrace?.freshnessClass || 'missing', run?.sourceTrace?.observedAt || run?.finishedAt || run?.createdAt || null, now);
    return buildAuditEntry({
      kind: run?._kind === 'latest-browser-run' ? 'latest-browser-run' : 'browser-run',
      label: `${normalizeText(run?.scenario) || 'layout-pass'} | ${normalizeText(run?.verdict || run?.status) || 'pending'}`,
      status: freshnessClass === 'stale'
        ? 'stale'
        : freshnessClass === 'missing'
          ? 'missing'
          : 'ok',
      freshnessClass,
      generatedAt: run?.finishedAt || run?.createdAt || null,
      generator: run?.sourceTrace?.generatedBy || { system: 'ui', module: 'ui/qaRunner.runQARun' },
      sourceArtifacts: Array.isArray(run?.sourceTrace?.sourceArtifacts) && run.sourceTrace.sourceArtifacts.length
        ? run.sourceTrace.sourceArtifacts
        : [
            {
              path: run?.id ? `data/spatial/qa/${run.id}.json` : 'data/spatial/qa/*.json',
              label: 'Browser run artifact',
              kind: 'run',
              freshnessClass,
              observedAt: run?.finishedAt || run?.createdAt || null,
            },
          ],
      detail: run?.findingCount != null ? `${run.findingCount} findings` : null,
      sourceTrace: run?.sourceTrace || null,
    });
  });
}

function buildLocalGateAuditEntries({
  localGate = null,
  now = Date.now(),
} = {}) {
  const entries = [];
  const unit = localGate?.unit || null;
  if (unit) {
    const freshnessClass = classifyFreshness(unit?.sourceTrace?.freshnessClass || 'missing', unit?.sourceTrace?.observedAt || unit?.finishedAt || unit?.updatedAt || unit?.createdAt || null, now);
    entries.push(buildAuditEntry({
      kind: 'local-gate-unit',
      label: 'Fast unit gate',
      status: freshnessClass === 'stale' ? 'stale' : freshnessClass === 'missing' ? 'missing' : 'ok',
      freshnessClass,
      generatedAt: unit?.finishedAt || unit?.updatedAt || unit?.createdAt || null,
      generator: unit?.sourceTrace?.generatedBy || { system: 'ui', module: 'ui/qaRunner.writeLocalGateReport' },
      sourceArtifacts: Array.isArray(unit?.sourceTrace?.sourceArtifacts) && unit.sourceTrace.sourceArtifacts.length
        ? unit.sourceTrace.sourceArtifacts
        : [
            {
              path: 'data/spatial/qa/local-gates/test-unit-latest.json',
              label: 'Fast unit gate report',
              kind: 'gate',
              freshnessClass,
              observedAt: unit?.finishedAt || unit?.updatedAt || unit?.createdAt || null,
            },
          ],
      detail: unit?.summary || null,
      sourceTrace: unit?.sourceTrace || null,
    }));
  }
  const studioBoot = localGate?.studioBoot || null;
  if (studioBoot) {
    const freshnessClass = classifyFreshness(studioBoot?.sourceTrace?.freshnessClass || 'missing', studioBoot?.sourceTrace?.observedAt || studioBoot?.finishedAt || studioBoot?.createdAt || null, now);
    entries.push(buildAuditEntry({
      kind: 'local-gate-studio-boot',
      label: 'Studio boot guardrail',
      status: freshnessClass === 'stale' ? 'stale' : freshnessClass === 'missing' ? 'missing' : 'ok',
      freshnessClass,
      generatedAt: studioBoot?.finishedAt || studioBoot?.createdAt || null,
      generator: studioBoot?.sourceTrace?.generatedBy || { system: 'ui', module: 'ui/qaRunner.runQARun' },
      sourceArtifacts: Array.isArray(studioBoot?.sourceTrace?.sourceArtifacts) && studioBoot.sourceTrace.sourceArtifacts.length
        ? studioBoot.sourceTrace.sourceArtifacts
        : [
            {
              path: studioBoot?.sourceTrace?.sourcePath || (studioBoot?.id ? `data/spatial/qa/${studioBoot.id}.json` : 'data/spatial/qa/*.json'),
              label: 'Studio boot guardrail report',
              kind: 'gate',
              freshnessClass,
              observedAt: studioBoot?.finishedAt || studioBoot?.createdAt || null,
              derivedFrom: studioBoot?.sourceTrace?.derivedFrom || null,
            },
          ],
      detail: studioBoot?.summary || null,
      sourceTrace: studioBoot?.sourceTrace || null,
    }));
  }
  return entries;
}

function summarizeQAAuditTrail(auditTrail = null) {
  const entries = Array.isArray(auditTrail?.entries) ? auditTrail.entries : Array.isArray(auditTrail) ? auditTrail : [];
  return entries.reduce((summary, entry) => {
    const status = normalizeText(entry?.status) || 'ok';
    const kind = normalizeText(entry?.kind) || 'qa-output';
    summary.total += 1;
    if (status === 'ok') summary.ok += 1;
    else if (status === 'stale') summary.stale += 1;
    else if (status === 'missing') summary.missing += 1;
    else if (status === 'mismatch') summary.mismatch += 1;
    else summary.ok += 1;
    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
    return summary;
  }, {
    total: 0,
    ok: 0,
    stale: 0,
    missing: 0,
    mismatch: 0,
    byKind: {},
  });
}

function buildQAAuditTrail({
  structuredReport = null,
  structuredSummary = null,
  scorecards = [],
  latestBrowserRun = null,
  browserRuns = [],
  localGate = null,
  now = Date.now(),
} = {}) {
  const entries = [
    buildStructuredReportAudit({ structuredReport, structuredSummary, now }),
    ...buildScorecardAuditEntries({ structuredReport, structuredSummary, scorecards, now }),
    ...buildBrowserRunAuditEntries({ latestBrowserRun, browserRuns, now }),
    ...buildLocalGateAuditEntries({ localGate, now }),
  ];
  return {
    schema: 'qa.audit-trail.v1',
    generatedAt: new Date(now).toISOString(),
    entries,
    summary: summarizeQAAuditTrail(entries),
  };
}

module.exports = {
  buildQAAuditTrail,
  summarizeQAAuditTrail,
};
