import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(uiRoot, '..');
const port = Number(process.env.ACE_STUDIO_BOOT_PORT || 3107);
const baseUrl = `http://127.0.0.1:${port}`;

process.env.PORT = String(port);

const require = createRequire(import.meta.url);
const { runQARun } = require('../qaRunner.js');
const { startServer } = require('../server.js');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeArtifacts(run = {}) {
  return [
    run.artifacts?.consoleLog?.path || null,
    run.artifacts?.domSnapshot?.path || null,
    run.artifacts?.networkSummary?.path || null,
    run.artifacts?.runtimeSnapshot?.path || null,
  ].filter(Boolean).join(' | ');
}

function isIgnorableConsoleEntry(entry = {}) {
  const text = String(entry.text || '');
  const locationUrl = String(entry.location?.url || '');
  return /favicon\.ico/i.test(text) || /favicon\.ico/i.test(locationUrl);
}

async function waitForHealth(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Retry until the timeout expires.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
}

async function main() {
  const server = startServer();
  try {
    await waitForHealth(`${baseUrl}/api/health`);
    const workspaceResponse = await fetch(`${baseUrl}/api/spatial/workspace`);
    if (!workspaceResponse.ok) {
      throw new Error(`Failed to load workspace bootstrap payload: ${workspaceResponse.status}`);
    }
    const workspace = await workspaceResponse.json();
    const run = await runQARun({
      rootPath: repoRoot,
      baseUrl,
      scenario: 'studio-smoke',
      mode: 'interactive',
      trigger: 'guardrail',
      prompt: 'Local Studio boot guardrail for desk truth surfaces and QA properties',
      actions: [
        { type: 'click', selector: '[data-qa="scene-studio-button"]', label: 'Return to ACE Studio' },
        { type: 'select-desk', deskId: 'qa-lead', label: 'Focus QA desk' },
      ],
    });

    const stepState = Object.fromEntries((run.steps || []).map((step) => [step.id, step]));
    const consoleErrors = (run.console || []).filter((entry) => (
      (entry.type === 'error' || entry.type === 'pageerror') && !isIgnorableConsoleEntry(entry)
    ));
    const domSnapshot = run.artifacts?.domSnapshot?.path && fs.existsSync(run.artifacts.domSnapshot.path)
      ? fs.readFileSync(run.artifacts.domSnapshot.path, 'utf8')
      : '';
    const failures = [];

    if (run.status !== 'completed') {
      failures.push(`QA run did not complete cleanly: ${run.status}${run.error ? ` (${run.error})` : ''}`);
    }
    if (!stepState.open || stepState.open.verdict !== 'pass') {
      failures.push(`Studio shell did not boot: open step verdict was ${stepState.open?.verdict || stepState.open?.status || 'missing'}.`);
    }
    if (!stepState.studio || stepState.studio.verdict !== 'pass') {
      failures.push(`Studio selectors did not become visible: studio step verdict was ${stepState.studio?.verdict || stepState.studio?.status || 'missing'}.`);
    }
    if (consoleErrors.length) {
      failures.push(`Console errors were captured: ${consoleErrors.map((entry) => entry.text).slice(0, 3).join(' | ')}`);
    }
    if ((run.network || []).length) {
      failures.push(`Network failures were captured: ${run.network.map((entry) => entry.url).slice(0, 3).join(' | ')}`);
    }
    if (!workspace?.studio?.layout?.departments?.some((department) => department.id === 'dept-talent-acquisition')) {
      failures.push('Talent Acquisition department was not present in the default workspace bootstrap payload.');
    }
    if (!workspace?.studio?.layout?.desks?.integration_auditor) {
      failures.push('Talent Acquisition desk was not present in the default workspace bootstrap payload.');
    }
    if (!domSnapshot.includes('Talent Acquisition') && !domSnapshot.includes('Integration Auditor')) {
      failures.push('Talent Acquisition was not visibly rendered in the Studio boot DOM snapshot.');
    }
    if (!domSnapshot.includes('data-qa="desk-truth-summary"')) {
      failures.push('Desk truth summary was not present in the Studio boot DOM snapshot.');
    }
    if (!domSnapshot.includes('Workload') || !domSnapshot.includes('Throughput') || !domSnapshot.includes('Reports')) {
      failures.push('Desk truth summary did not surface workload, throughput, and reports.');
    }
    if (!domSnapshot.includes('data-qa="utility-dock-toggle"')) {
      failures.push('Utility dock toggle was not present in the Studio boot DOM snapshot.');
    }
    if (domSnapshot.includes('data-qa="desk-props-qa-lead"')) {
      failures.push('Legacy always-on QA desk control is still rendered in the Studio boot DOM snapshot.');
    }

    if (failures.length) {
      throw new Error([
        ...failures,
        summarizeArtifacts(run) ? `Artifacts: ${summarizeArtifacts(run)}` : null,
      ].filter(Boolean).join('\n'));
    }

    console.log(`PASS studioBoot ${run.id}`);
  } finally {
    await closeServer(server);
  }
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  exitCode = 1;
  console.error(error?.stack || String(error));
}
process.exit(exitCode);
