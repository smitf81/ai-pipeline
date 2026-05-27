import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CADENCE_OBLIGATION_VERSION,
  CADENCE_SYSTEMS,
  summarizeCadenceRegistry,
  validateCadenceRegistry
} from '../src/game/cadenceRegistry.js';
import { RUNTIME_SCHEDULER_DEFAULTS } from '../src/game/runtimeEvents.js';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(projectRoot, 'output/cadence-obligation-audit');
const reportPath = join(outputDir, 'report.json');

const gameModelSource = readText('src/game/gameModel.js');
const logisticsSource = readText('src/game/logisticsSystem.js');
const runtimeEventsSource = readText('src/game/runtimeEvents.js');
const packageSource = readText('package.json');

const validation = validateCadenceRegistry({ schedulerDefaults: RUNTIME_SCHEDULER_DEFAULTS });
const staticFindings = [
  ...scanMustUseProofs(),
  ...scanValidationHook()
];
const findings = [...validation.findings, ...staticFindings];
const status = findings.some((entry) => entry.severity === 'high')
  ? 'fail'
  : findings.length
    ? 'warn'
    : 'pass';

const report = {
  status,
  generatedAt: new Date().toISOString(),
  contractId: CADENCE_OBLIGATION_VERSION,
  testType: 'cadence-obligation-audit',
  description: 'Registry-backed audit that prevents heavy runtime systems from silently gaining every-tick, generic-dirty, or undeclared scheduler behaviour.',
  registry: summarizeCadenceRegistry(),
  schedulerDefaults: RUNTIME_SCHEDULER_DEFAULTS,
  findings
};

mkdirSync(outputDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Cadence obligation audit: ${status.toUpperCase()} (${findings.length} findings).`);
console.log(`Report: ${reportPath}`);
if (status === 'fail') {
  process.exitCode = 1;
}

function scanMustUseProofs() {
  const findings = [];
  const sourceByOwner = {
    'src/game/gameModel.js': gameModelSource,
    'src/game/logisticsSystem.js': logisticsSource,
    'src/game/runtimeEvents.js': runtimeEventsSource
  };

  for (const [systemId, contract] of Object.entries(CADENCE_SYSTEMS)) {
    const sourcePath = contract.owner.split('::')[0];
    const source = sourceByOwner[sourcePath] ?? '';
    if (!source) {
      findings.push(finding('high', 'cadence_owner_source_missing', `${systemId} owner source ${sourcePath} was not loaded.`));
      continue;
    }
    if ((contract.mustUse ?? []).includes('shouldRunScheduledSystem') && !source.includes(`shouldRunScheduledSystem(game, '${systemId}')`)) {
      findings.push(finding('high', 'cadence_missing_should_run_gate', `${systemId} owner does not call shouldRunScheduledSystem(game, '${systemId}').`));
    }
    if ((contract.mustUse ?? []).includes('completeScheduledSystem') && !source.includes(`completeScheduledSystem(game, '${systemId}')`)) {
      findings.push(finding('high', 'cadence_missing_completion_receipt', `${systemId} owner does not call completeScheduledSystem(game, '${systemId}').`));
    }
  }
  return findings;
}

function scanValidationHook() {
  const findings = [];
  if (!/"test:cadence"\s*:\s*"node tools\/audit-runtime-cadence\.mjs"/.test(packageSource)) {
    findings.push(finding('high', 'cadence_audit_script_missing', 'package.json does not expose npm run test:cadence.'));
  }
  if (!/npm run test:cadence/.test(packageSource)) {
    findings.push(finding('high', 'cadence_audit_not_in_validation', 'package.json test:validation does not run the cadence obligation audit.'));
  }
  return findings;
}

function readText(relativePath) {
  return readFileSync(resolve(projectRoot, relativePath), 'utf8');
}

function finding(severity, code, message) {
  return {
    severity,
    code,
    message,
    recommendation: 'Declare cadence ownership in src/game/cadenceRegistry.js and prove the owning runtime path gates and completes through the scheduler before accepting the slice.'
  };
}
