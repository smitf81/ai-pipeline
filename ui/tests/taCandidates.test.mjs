import assert from 'node:assert/strict';
import http from 'node:http';
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
  const { app } = require(serverPath);
  const { generateCandidates } = require(generatorPath);
  const exampleGap = require(exampleGapPath);

  const generated = generateCandidates(exampleGap);
  assert.ok(generated.length >= 3 && generated.length <= 5);
  assert.deepEqual(
    generated.map((candidate) => candidate.role).slice(0, 3),
    ['Integration Auditor', 'Pipeline Observer', 'Runtime Cartographer'],
  );
  assert.ok(generated.every((candidate) => candidate.department === 'Talent Acquisition'));
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

    const invalid = await postJson(`${baseUrl}/api/ta/candidates`, { gap: { affected_components: ['UI'] } });
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.json.error, /gap\.description is required/i);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
