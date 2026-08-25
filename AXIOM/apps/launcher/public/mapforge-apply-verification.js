(function installMapForgeApplyVerification(scope) {
  const CONTRACT = 'axiom.mapforge-apply-verification.v1';
  const OWNER = 'BsbV2MapAuthoring';
  const FAMILIES = new Set(['tree', 'undergrowth', 'geology']);

  function canonicalStatus(explicitStatus) {
    if (explicitStatus !== undefined) return { status: explicitStatus, error: null };
    try {
      return { status: scope.BsbV2MapAuthoring?.status?.() || null, error: null };
    } catch (error) {
      return { status: null, error: String(error?.message || error) };
    }
  }

  function verifyCanonicalReadback(result = {}, family, explicitStatus) {
    const operationResult = result && typeof result === 'object' && !Array.isArray(result) ? result : {};
    const statusRead = canonicalStatus(explicitStatus);
    const current = statusRead.status;
    const familyValid = FAMILIES.has(family);
    const affectedIds = Array.isArray(operationResult.affectedIds)
      ? operationResult.affectedIds.map(String)
      : [];
    const records = Array.isArray(current?.document?.sceneObjects) ? current.document.sceneObjects : [];
    const foundIds = familyValid
      ? affectedIds.filter(id => records.some(record => String(record?.id) === id && record?.[family] != null))
      : [];
    const missingIds = affectedIds.filter(id => !foundIds.includes(id));
    const expectedRevision = operationResult.afterRevision ?? null;
    const observedRevision = current?.document?.revision ?? null;
    const revisionMatches = expectedRevision != null && observedRevision === expectedRevision;
    const operationOk = operationResult.ok !== false;
    const operationApplied = operationResult.applied === true;
    const dirty = current?.dirty === true;

    let reason = null;
    if (!familyValid) reason = 'mapforge_family_invalid';
    else if (!operationOk) reason = 'mapforge_operation_reported_failure';
    else if (!operationApplied) reason = 'mapforge_operation_not_applied';
    else if (affectedIds.length === 0) reason = 'mapforge_affected_ids_missing';
    else if (statusRead.error) reason = `canonical_mapforge_status_failed:${statusRead.error}`;
    else if (!current?.document) reason = 'canonical_mapforge_status_unavailable';
    else if (expectedRevision == null) reason = 'mapforge_expected_revision_missing';
    else if (!revisionMatches) reason = `canonical_mapforge_revision_mismatch:${expectedRevision}:${observedRevision ?? 'missing'}`;
    else if (missingIds.length > 0) reason = `canonical_mapforge_${family}_records_missing`;
    else if (!dirty) reason = 'canonical_mapforge_dirty_state_missing';

    return {
      contract: CONTRACT,
      owner: OWNER,
      family,
      ok: reason === null,
      reason,
      operationOk,
      operationApplied,
      expectedRevision,
      observedRevision,
      revision: observedRevision,
      revisionMatches,
      affectedIds,
      foundIds,
      missingIds,
      dirty,
      runtimeStatus: current?.runtimeStatus || null,
      selectedRecordId: current?.selectedRecord?.id || null,
      checkedAt: new Date().toISOString()
    };
  }

  scope.MapForgeApplyVerification = Object.freeze({
    contract: CONTRACT,
    owner: OWNER,
    verifyCanonicalReadback
  });
})(globalThis);
