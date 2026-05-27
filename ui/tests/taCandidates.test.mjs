import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            json: responseBody ? JSON.parse(responseBody) : null,
          });
        });
      },
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

export default async function runTaCandidatesTests() {
  const rootPath = path.resolve(process.cwd(), '..');
  const serverPath = path.resolve(process.cwd(), 'server.js');
  const generatorPath = path.resolve(rootPath, 'ta', 'generateCandidates.js');
  const exampleGapPath = path.resolve(rootPath, 'ta', 'exampleGap.json');
  const taDepartmentPath = path.resolve(rootPath, 'data', 'spatial', 'ta-department.json');
  const { app } = require(serverPath);
  const { generateCandidates } = require(generatorPath);
  const exampleGap = require(exampleGapPath);
  await fs.writeFile(taDepartmentPath, JSON.stringify({
    hiredCandidates: [],
    updatedAt: null,
    lastGeneratedGap: null,
  }, null, 2));

  const generated = generateCandidates(exampleGap);
  assert.ok(generated.length >= 3 && generated.length <= 5);
  assert.deepEqual(
    generated.map((candidate) => candidate.role).slice(0, 3),
    ['Integration Auditor', 'Pipeline Observer', 'Runtime Cartographer'],
  );
  assert.ok(generated.every((candidate) => candidate.department === 'Talent Acquisition'));
  assert.ok(generated.every((candidate) => candidate.assigned_model === 'mistral:latest'));
  assert.ok(generated.every((candidate) => candidate.model_locked === true));
  assert.ok(generated.every((candidate) => Array.isArray(candidate.desk_targets) && candidate.desk_targets.length > 0));
  assert.ok(generated.every((candidate) => typeof candidate.role_id === 'string' && candidate.role_id.length > 0));
  assert.ok(generated.every((candidate) => candidate.department_id === 'talent-acquisition'));
  assert.ok(generated.every((candidate) => Array.isArray(candidate.allowed_desk_ids) && candidate.allowed_desk_ids.length > 0));
  assert.ok(generated.every((candidate) => candidate.cv_card && candidate.cv_card.contract));
  assert.ok(generated.every((candidate) => candidate.model_policy && typeof candidate.model_policy.reason === 'string'));
  assert.ok(generated.every((candidate) => candidate.confidence >= 0 && candidate.confidence <= 1));

  const server = app.listen(0);

  try {
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const success = await postJson(`${baseUrl}/api/ta/candidates`, { gap: exampleGap });
    assert.equal(success.statusCode, 200);
    assert.equal(Array.isArray(success.json.candidates), true);
    assert.equal(success.json.candidates.length, generated.length);
    assert.equal(success.json.candidates[0].role, 'Integration Auditor');
    assert.equal(success.json.candidates[0].roleId, 'integration_auditor');
    assert.equal(success.json.candidates[0].assigned_model, 'mistral:latest');
    assert.equal(success.json.candidates[0].cv_card.headline.length > 0, true);

    const invalid = await postJson(`${baseUrl}/api/ta/candidates`, { gap: { affected_components: ['UI'] } });
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.json.error, /gap\.description is required/i);

    const department = await new Promise((resolve, reject) => {
      http.get(`${baseUrl}/api/ta/department`, (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            json: responseBody ? JSON.parse(responseBody) : null,
          });
        });
      }).on('error', reject);
    });
    assert.equal(department.statusCode, 200);
    assert.equal(Array.isArray(department.json.coverage), true);
    assert.ok(department.json.coverage.length >= 1);
    assert.equal(Array.isArray(department.json.gapModel.openRoles), true);
    assert.equal(Array.isArray(department.json.gapModel.blockers), true);
    assert.ok(['critical', 'high', 'medium', 'low'].includes(department.json.gapModel.summary.urgency));
    const initialOpenRoleCount = department.json.coverageSummary.openRoleCount;

    const hireCandidate = success.json.candidates[0];
    const hire = await postJson(`${baseUrl}/api/ta/hire`, {
      candidate: hireCandidate,
      deskId: hireCandidate.primary_desk_target,
      gapDescription: exampleGap.description,
    });
    assert.equal(hire.statusCode, 201);
    assert.equal(hire.json.ok, true);
    assert.equal(hire.json.hiredCandidate.roleId, 'integration_auditor');
    assert.equal(hire.json.hiredCandidate.departmentId, 'talent-acquisition');
    assert.equal(hire.json.hiredCandidate.assignedModel, 'mistral:latest');
    assert.equal(hire.json.hiredCandidate.contractLocked, true);
    assert.equal(Array.isArray(hire.json.department.gapModel.openRoles), true);
    assert.ok(hire.json.department.coverageSummary.openRoleCount <= initialOpenRoleCount);

    const duplicateHire = await postJson(`${baseUrl}/api/ta/hire`, {
      candidate: hireCandidate,
      deskId: hireCandidate.primary_desk_target,
      gapDescription: exampleGap.description,
    });
    assert.equal(duplicateHire.statusCode, 400);
    assert.match(duplicateHire.json.error, /already hired/i);

    const badHire = await postJson(`${baseUrl}/api/ta/hire`, {
      candidate: {
        ...hireCandidate,
        assigned_model: '',
      },
      deskId: hireCandidate.primary_desk_target,
    });
    assert.equal(badHire.statusCode, 400);
    assert.match(badHire.json.error, /assigned_model is required/i);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
