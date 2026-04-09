import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ensureQaMcpHelperBootstrapped,
  readQaMcpLauncherStatus,
  resolveQaMcpHelperPath,
} = require('../qaMcpLauncher.js');
const {
  buildQaMcpPreflightResponse,
} = require('../server.js');

function closeHttpServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
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

function startValidHelperServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/run_test') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        test_id: 'qa_mcp_helper_ping',
        status: 'pass',
        details: 'Test helper reachable.',
        timestamp: '2026-04-09T18:00:00.000Z',
        source: 'external_mcp',
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function writeHelperScript(rootPath, fileName, port) {
  const helperPath = path.join(rootPath, fileName);
  fs.writeFileSync(helperPath, `
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

PORT = ${port}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/run_test":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "test_id": "qa_mcp_helper_ping",
                "status": "pass",
                "details": "temp helper reachable",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "external_mcp",
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

server = HTTPServer(("127.0.0.1", PORT), Handler)
server.serve_forever()
`, 'utf8');
  return helperPath;
}

function writeWrongPortHelperScript(rootPath, fileName, actualPort) {
  const helperPath = path.join(rootPath, fileName);
  fs.writeFileSync(helperPath, `
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

PORT = ${actualPort}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def do_GET(self):
        if self.path == "/run_test":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "test_id": "qa_mcp_helper_ping",
                "status": "pass",
                "details": "wrong-port helper reachable",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "external_mcp",
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

server = HTTPServer(("127.0.0.1", PORT), Handler)
server.serve_forever()
`, 'utf8');
  return helperPath;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopPid(pid) {
  if (!pid) return;
  try {
    process.kill(pid);
  } catch {}
}

export default async function runQaMcpLauncherTests() {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-qa-mcp-launcher-'));
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'ui', 'server.js'), 'utf8');
  assert.match(serverSource, /bootQaMcpHelperIfNeeded\(ROOT\);/);
  assert.equal(resolveQaMcpHelperPath(path.join(testRoot, 'repo')), path.join(testRoot, 'repo', 'qa_mcp_helper.py'));

  const alreadyRunningPort = await getFreePort();
  const alreadyRunningServer = await startValidHelperServer(alreadyRunningPort);
  try {
    const alreadyRunning = await ensureQaMcpHelperBootstrapped({
      rootPath: testRoot,
      probeUrl: `http://127.0.0.1:${alreadyRunningPort}/run_test`,
      spawnFn: () => {
        throw new Error('spawn should not be called when helper is already reachable');
      },
    });
    assert.equal(alreadyRunning.status, 'already_running');
    assert.equal(alreadyRunning.already_running, true);
    assert.equal(alreadyRunning.launch_attempted, false);
    assert.equal(alreadyRunning.post_launch_reachable, true);
  } finally {
    await closeHttpServer(alreadyRunningServer);
  }

  const launchPort = await getFreePort();
  const helperPath = writeHelperScript(testRoot, 'temp_qa_mcp_helper.py', launchPort);
  let launchedPid = null;
  try {
    const launched = await ensureQaMcpHelperBootstrapped({
      rootPath: testRoot,
      helperPath,
      probeUrl: `http://127.0.0.1:${launchPort}/run_test`,
      detached: false,
      postLaunchWaitMs: 5000,
    });
    launchedPid = launched.pid;
    assert.equal(launched.status, 'launch_started');
    assert.equal(launched.launch_attempted, true);
    assert.equal(launched.launch_started, true);
    assert.equal(launched.post_launch_reachable, true);
    assert.equal(typeof launched.pid, 'number');

    const preflight = await buildQaMcpPreflightResponse({
      rootPath: testRoot,
      probeUrl: `http://127.0.0.1:${launchPort}/run_test`,
      timeoutMs: 1500,
    });
    assert.equal(preflight.verdict, 'ok');
    assert.equal(preflight.launcher_status.status, 'launch_started');

    const secondCall = await ensureQaMcpHelperBootstrapped({
      rootPath: testRoot,
      helperPath,
      probeUrl: `http://127.0.0.1:${launchPort}/run_test`,
      spawnFn: () => {
        throw new Error('spawn should not be called for an already running helper');
      },
    });
    assert.equal(secondCall.status, 'already_running');
    assert.equal(secondCall.launch_attempted, false);
  } finally {
    stopPid(launchedPid);
    await sleep(250);
  }

  const occupiedPort = await getFreePort();
  const occupiedServer = http.createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>wrong service</h1>');
  });
  await new Promise((resolve) => occupiedServer.listen(occupiedPort, '127.0.0.1', resolve));
  try {
    const occupiedStatus = await ensureQaMcpHelperBootstrapped({
      rootPath: testRoot,
      helperPath,
      probeUrl: `http://127.0.0.1:${occupiedPort}/run_test`,
      spawnFn: () => {
        throw new Error('spawn should not be called when the target port is already occupied');
      },
    });
    assert.equal(occupiedStatus.status, 'still_unreachable');
    assert.equal(occupiedStatus.launch_attempted, false);
    assert.equal(occupiedStatus.launch_started, false);
    assert.match(occupiedStatus.summary, /already occupied|answered/i);
  } finally {
    await closeHttpServer(occupiedServer);
  }

  const missingHelper = await ensureQaMcpHelperBootstrapped({
    rootPath: testRoot,
    helperPath: path.join(testRoot, 'missing_qa_mcp_helper.py'),
    probeUrl: `http://127.0.0.1:${await getFreePort()}/run_test`,
  });
  assert.equal(missingHelper.status, 'launch_failed');
  assert.equal(missingHelper.launch_attempted, true);
  assert.match(missingHelper.summary, /Helper file not found/i);

  const expectedPort = await getFreePort();
  const wrongPort = await getFreePort();
  const wrongPortHelperPath = writeWrongPortHelperScript(testRoot, 'wrong_port_qa_mcp_helper.py', wrongPort);
  let wrongPortPid = null;
  try {
    const stillUnreachable = await ensureQaMcpHelperBootstrapped({
      rootPath: testRoot,
      helperPath: wrongPortHelperPath,
      probeUrl: `http://127.0.0.1:${expectedPort}/run_test`,
      detached: false,
      postLaunchWaitMs: 1200,
      pollIntervalMs: 200,
    });
    wrongPortPid = stillUnreachable.pid;
    assert.equal(stillUnreachable.status, 'still_unreachable');
    assert.equal(stillUnreachable.launch_attempted, true);
    assert.equal(stillUnreachable.launch_started, true);
    assert.equal(stillUnreachable.post_launch_reachable, false);
  } finally {
    stopPid(wrongPortPid);
    await sleep(250);
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  const latestStatus = readQaMcpLauncherStatus();
  assert.ok(latestStatus);
}
