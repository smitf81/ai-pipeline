import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanonicalTruthAccess } = require('../canonicalTruthAccess.js');
const { buildTruthKernelPayload } = require('../truthKernelAdapter.js');

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'truth-kernel-route-lite-'));
}

function writeJson(rootPath, relativePath, value) {
  const targetPath = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export default async function runTruthKernelRouteLiteTests() {
  const rootPath = makeTempRoot();
  try {
    writeJson(rootPath, 'data/spatial/qa/repair-jobs.json', [{
      id: 'qa_repair_route_lite_001',
      lane: 'validation_seam',
      lane_label: 'Validation Seam',
      target_type: 'external_validation_contract',
      truth_application_status: 'verified_healthy',
      status: 'accepted',
      latest_apply_receipt_id: 'qa_receipt_route_lite_001',
      updated_at: '2026-04-06T00:04:00.000Z',
    }]);
    writeJson(rootPath, 'data/spatial/qa/repair-attempts.json', [{
      attempt_id: 'qa_attempt_route_lite_001',
      repair_job_id: 'qa_repair_route_lite_001',
      validation_verdict: 'accepted',
      truth_application_status: 'verified_healthy',
      timestamp: '2026-04-06T00:03:00.000Z',
    }]);
    writeJson(rootPath, 'data/spatial/qa/repair-apply-receipts.json', [{
      receipt_id: 'qa_receipt_route_lite_001',
      repair_job_id: 'qa_repair_route_lite_001',
      apply_status: 'applied',
      apply_verdict: 'applied',
      apply_timestamp: '2026-04-06T00:02:00.000Z',
    }]);

    const access = createCanonicalTruthAccess({
      repositories: {
        workspace: async () => ({}),
      },
      builders: {
        buildTruthKernelPayload: async ({ sourceData, rootPath: projectionRootPath }) => buildTruthKernelPayload({
          rootPath: projectionRootPath,
          workspace: sourceData,
        }),
      },
    });

    const payload = await access.resolveProjectionResponse('truth_kernel', {
      rootPath,
      freshness: 'live',
    });

    assert.equal(payload.canonicalTruth.domain, 'truth_kernel');
    assert.equal(payload.canonicalTruth.projectionId, 'truth_kernel');
    assert.equal(Array.isArray(payload.nodes), true);
    const repairNode = payload.nodes.find((node) => node.id === 'qa_repair_route_lite_001');
    assert.ok(repairNode);
    assert.equal(repairNode.status, 'healthy');
    assert.equal(repairNode.verdict, 'verified_healthy');
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
