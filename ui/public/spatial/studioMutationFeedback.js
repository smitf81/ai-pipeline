function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function getValidationItems(validation = {}, status = '') {
  const normalizedStatus = String(status || validation?.status || '').toLowerCase();
  if (normalizedStatus === 'block') {
    return Array.isArray(validation?.blockers) && validation.blockers.length
      ? validation.blockers
      : Array.isArray(validation?.issues) ? validation.issues : [];
  }
  if (normalizedStatus === 'warn') {
    return Array.isArray(validation?.warnings) && validation.warnings.length
      ? validation.warnings
      : Array.isArray(validation?.issues) ? validation.issues : [];
  }
  return Array.isArray(validation?.issues) ? validation.issues : [];
}

export function summarizeMutationValidation(validation = {}) {
  const items = getValidationItems(validation);
  return items
    .map((item) => toText(item?.reason || item?.code || item?.severity || ''))
    .filter(Boolean);
}

export function buildMutationFeedback(actionId, outcome = null) {
  const result = outcome?.result || null;
  const validation = result?.validation || null;
  const status = String(validation?.status || '').toLowerCase();
  const reasons = summarizeMutationValidation(validation);
  const targetLabel = actionId === 'add_desk' ? 'Desk' : 'Department';
  const baseLabel = actionId === 'add_desk'
    ? 'Desk added to studio layout.'
    : 'Department added to studio layout.';

  if (status === 'block') {
    return {
      actionId,
      phase: 'blocked',
      title: `${targetLabel} add blocked`,
      message: reasons.length ? reasons.join(' ') : 'Dependency validation blocked the mutation.',
      reasons,
      validation,
      shouldCommit: false,
    };
  }

  if (status === 'warn') {
    return {
      actionId,
      phase: 'warning',
      title: `${targetLabel} added with warnings`,
      message: reasons.length ? reasons.join(' ') : 'Dependency validation returned warnings.',
      reasons,
      validation,
      shouldCommit: true,
    };
  }

  return {
    actionId,
    phase: 'success',
    title: `${targetLabel} added successfully`,
    message: baseLabel,
    reasons,
    validation,
    shouldCommit: true,
  };
}

export function shouldCommitMutationOutcome(outcome = null) {
  return Boolean(buildMutationFeedback(outcome?.actionId || '', outcome).shouldCommit);
}
