import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildQaMcpPreflightCheck,
} = require('../externalQaProbe.js');
const {
  runQaLeadCycle,
} = require('../qaLeadRunner.js');
const {
  app,
} = require('../server.js');
const {
  writeStructuredQAReport,
} = require('../qaRunner.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-mcp-preflight-'));
}

function makeQaState() {
  return {
    structuredReport: {
      status: 'pass',
      finishedAt: '2026-04-09T10:00:00.000Z',
      summary: 'Structured QA report passed.',
    },
  };
}

function startHelperServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}/run_test`,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function getClosedLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.once('error', reject);
  });
}

function buildQaLeadStubOptions(helperUrl) {
  const now = '2026-04-09T10:05:00.000Z';
  return {
    runId: 'qa_lead_preflight_ok',
    startedAt: now,
    baseUrl: 'http://127.0.0.1:3000',
    probeUrl: helperUrl,
    browserRunner: async () => ({
      id: 'qa_browser_preflight_ok',
      status: 'completed',
      verdict: 'pass',
      scenario: 'studio-smoke',
      summary: 'Browser QA run completed.',
      createdAt: now,
      finishedAt: now,
    }),
    canaryRunner: async () => ({
      overall_status: 'pass',
      summary: 'All lane canaries passed.',
      last_run_at: now,
      passed_count: 1,
      failed_count: 0,
      results: [],
    }),
    loopAuditRunner: async () => ({
      overall_status: 'pass',
      summary: 'All injected loop faults behaved as expected.',
      completed_at: now,
      failing_fault_ids: [],
      comparisons: [],
    }),
    qaRepairLoopModule: {
      buildQaRepairLoopState: () => ({
        summary: { totalJobs: 0, blockedLanes: 0, activeLanes: 0 },
        latestAttempt: null,
        latestJob: null,
        lanes: [],
      }),
    },
  };
}

function resolveUiServerSourcePath() {
  const cwdServerPath = path.resolve(process.cwd(), 'server.js');
  if (fs.existsSync(cwdServerPath)) return cwdServerPath;
  return path.resolve(process.cwd(), 'ui', 'server.js');
}

export default async function runQaMcpPreflightTests() {
  const badConfig = await buildQaMcpPreflightCheck({
    qaState: makeQaState(),
    probeUrl: '::bad-url::',
  });
  assert.equal(badConfig.source, 'qa_mcp_preflight');
  assert.equal(badConfig.verdict, 'bad_config');
  assert.equal(badConfig.transport.reachable, false);
  assert.equal(badConfig.payload.contract_valid, false);

  const closedPort = await getClosedLocalPort();
  const notRunning = await buildQaMcpPreflightCheck({
    qaState: makeQaState(),
    probeUrl: `http://127.0.0.1:${closedPort}/run_test`,
  });
  assert.equal(notRunning.verdict, 'not_running');
  assert.equal(notRunning.target.port, closedPort);
  assert.equal(notRunning.transport.reachable, false);
  assert.equal(notRunning.transport.responded, false);
  assert.equal(notRunning.next_action.kind, 'start_external_helper');

  const invalidJsonHelper = await startHelperServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{not-json');
  });
  try {
    const badResponse = await buildQaMcpPreflightCheck({
      qaState: makeQaState(),
      probeUrl: invalidJsonHelper.url,
    });
    assert.equal(badResponse.verdict, 'bad_response');
    assert.equal(badResponse.transport.reachable, true);
    assert.equal(badResponse.transport.responded, true);
    assert.equal(badResponse.payload.has_body, true);
    assert.equal(badResponse.payload.parsed_json, false);
  } finally {
    await closeServer(invalidJsonHelper.server);
  }

  const invalidContractHelper = await startHelperServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      test_id: 'ollama_ping',
      details: 'Helper answered without status.',
      timestamp: '2026-04-09T10:00:01.000Z',
      source: 'external_mcp',
    }));
  });
  try {
    const invalidContract = await buildQaMcpPreflightCheck({
      qaState: makeQaState(),
      probeUrl: invalidContractHelper.url,
    });
    assert.equal(invalidContract.verdict, 'invalid_contract');
    assert.equal(invalidContract.transport.reachable, true);
    assert.equal(invalidContract.transport.responded, true);
    assert.equal(invalidContract.payload.has_body, true);
    assert.equal(invalidContract.payload.parsed_json, true);
    assert.equal(invalidContract.payload.contract_valid, false);
  } finally {
    await closeServer(invalidContractHelper.server);
  }

  const validHelper = await startHelperServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      test_id: 'ollama_ping',
      status: 'pass',
      details: 'Local QA MCP helper is reachable.',
      timestamp: '2026-04-09T10:00:01.000Z',
      source: 'external_mcp',
    }));
  });
  const rootPath = makeTempRoot();
  try {
    writeStructuredQAReport(rootPath, {
      status: 'pass',
      summary: 'Structured QA report passed.',
      createdAt: '2026-04-09T10:00:00.000Z',
      finishedAt: '2026-04-09T10:00:00.000Z',
      desks: [],
    }, 'latest');

    const okResult = await buildQaMcpPreflightCheck({
      qaState: makeQaState(),
      probeUrl: validHelper.url,
    });
    assert.equal(okResult.verdict, 'ok');
    assert.equal(okResult.transport.reachable, true);
    assert.equal(okResult.transport.responded, true);
    assert.equal(okResult.payload.has_body, true);
    assert.equal(okResult.payload.parsed_json, true);
    assert.equal(okResult.payload.contract_valid, true);
    assert.equal(okResult.qa_path.consumed, true);
    assert.equal(okResult.qa_path.probe_status, 'ok');

    const cycle = await runQaLeadCycle(rootPath, buildQaLeadStubOptions(validHelper.url));
    assert.equal(cycle.external_validation.probeStatus, 'ok');
    assert.equal(cycle.live_status.mcp_reachable, true);
    assert.ok(['live', 'reachable_but_idle', 'processing'].includes(cycle.status));

    const serverSource = fs.readFileSync(resolveUiServerSourcePath(), 'utf8');
    assert.match(serverSource, /app\.get\('\/api\/qa\/mcp\/preflight'/);
    assert.ok(app);
  } finally {
    await closeServer(validHelper.server);
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
