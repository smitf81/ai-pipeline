import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

await import('../public/mapforge-apply-verification.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const verifier = globalThis.MapForgeApplyVerification;

assert.equal(verifier?.owner, 'BsbV2MapAuthoring');
assert.equal(verifier?.contract, 'axiom.mapforge-apply-verification.v1');

const familyIds = {
  tree: 'tree:receipt-proof',
  undergrowth: 'undergrowth:receipt-proof',
  geology: 'geology:receipt-proof'
};

function statusFor(family, overrides = {}) {
  const id = familyIds[family];
  return {
    dirty: overrides.dirty ?? true,
    runtimeStatus: 'stale',
    selectedRecord: { kind: 'sceneObject', id },
    document: {
      revision: overrides.revision ?? 41,
      sceneObjects: overrides.sceneObjects ?? [{ id, [family]: { schema: `proof.${family}.v1` } }]
    }
  };
}

function resultFor(family, overrides = {}) {
  return {
    ok: overrides.ok ?? true,
    applied: overrides.applied ?? true,
    afterRevision: overrides.afterRevision ?? 41,
    affectedIds: overrides.affectedIds ?? [familyIds[family]]
  };
}

for (const family of Object.keys(familyIds)) {
  const valid = verifier.verifyCanonicalReadback(resultFor(family), family, statusFor(family));
  assert.equal(valid.ok, true, `${family} should pass valid canonical readback`);
  assert.equal(valid.owner, 'BsbV2MapAuthoring');
  assert.equal(valid.family, family);
  assert.equal(valid.expectedRevision, 41);
  assert.equal(valid.observedRevision, 41);
  assert.deepEqual(valid.affectedIds, [familyIds[family]]);
  assert.deepEqual(valid.foundIds, [familyIds[family]]);

  const wrongRevision = verifier.verifyCanonicalReadback(
    resultFor(family),
    family,
    statusFor(family, { revision: 42 })
  );
  assert.equal(wrongRevision.ok, false, `${family} should reject a mismatched canonical revision`);
  assert.match(wrongRevision.reason, /^canonical_mapforge_revision_mismatch:/);
  assert.equal(wrongRevision.expectedRevision, 41);
  assert.equal(wrongRevision.observedRevision, 42);

  const missingFamilyRecord = verifier.verifyCanonicalReadback(
    resultFor(family),
    family,
    statusFor(family, { sceneObjects: [{ id: familyIds[family] }] })
  );
  assert.equal(missingFamilyRecord.ok, false, `${family} should reject an id without its family field`);
  assert.equal(missingFamilyRecord.reason, `canonical_mapforge_${family}_records_missing`);
  assert.deepEqual(missingFamilyRecord.foundIds, []);
}

for (const family of ['undergrowth', 'geology']) {
  const notApplied = verifier.verifyCanonicalReadback(
    resultFor(family, { ok: true, applied: false }),
    family,
    statusFor(family)
  );
  assert.equal(notApplied.ok, false, `${family} should reject ok:true with applied:false`);
  assert.equal(notApplied.operationOk, true);
  assert.equal(notApplied.operationApplied, false);
  assert.equal(notApplied.reason, 'mapforge_operation_not_applied');
}

assert.equal(
  verifier.verifyCanonicalReadback(resultFor('tree', { ok: false }), 'tree', statusFor('tree')).reason,
  'mapforge_operation_reported_failure'
);
assert.equal(
  verifier.verifyCanonicalReadback(resultFor('undergrowth', { affectedIds: [] }), 'undergrowth', statusFor('undergrowth')).reason,
  'mapforge_affected_ids_missing'
);
assert.equal(
  verifier.verifyCanonicalReadback(resultFor('geology'), 'geology', statusFor('geology', { dirty: false })).reason,
  'canonical_mapforge_dirty_state_missing'
);

const editor = await readFile(join(launcherRoot, 'public', 'axiom-editor.html'), 'utf8');
const verifierScriptIndex = editor.indexOf('<script src="./mapforge-apply-verification.js"></script>');
const bridgeIndex = editor.indexOf('const SSEBridge = (() => {');
assert.ok(verifierScriptIndex >= 0 && verifierScriptIndex < bridgeIndex, 'the shared verifier must load before SSEBridge');
assert.ok(!editor.includes('validateMapForgeTreeReadback'), 'the tree-only verifier must be removed');

for (const family of Object.keys(familyIds)) {
  const start = editor.indexOf(`if (action.type === 'bsb_${family}_operation')`);
  assert.ok(start >= 0, `${family} client-action branch should exist`);
  const next = editor.indexOf("if (action.type === 'bsb_", start + 1);
  const branch = editor.slice(start, next >= 0 ? next : editor.indexOf("if (action.type !== 'create_object')", start));
  assert.ok(branch.includes(`createVerifiedMapForgeReceipt(result, '${family}', action.type)`), `${family} should use the shared receipt verifier`);
  assert.ok(branch.includes("appendFeed(receipt.ok ? 'mcp_client_apply' : 'mcp_client_apply_failed', receipt)"), `${family} feed classification should follow verified truth`);
  if (family !== 'tree') assert.match(branch, /if \(receipt\.ok\) notify\('ok'/, `${family} success notification should require verified truth`);
}

assert.match(editor, /applied: !!receipt\.applied/);
assert.match(editor, /if \(receipt\.ok === false\) \{\s*payload\.ok = false;/);

console.log('mapforge-receipts.test.mjs passed');
