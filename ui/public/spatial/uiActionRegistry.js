function toTrimmedString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function resolveStatusLabel(definition, context = {}, payload = {}, result = null) {
  if (typeof definition?.statusLabel === 'function') {
    return definition.statusLabel(context, payload, result);
  }
  if (typeof definition?.successLabel === 'function') {
    return definition.successLabel(context, payload, result);
  }
  return toTrimmedString(definition?.statusLabel || definition?.successLabel || definition?.label || definition?.id || 'Action complete');
}

function summarizeMutationStatus(actionId, definition, context = {}, payload = {}, result = null) {
  const validation = result?.validation || null;
  const status = String(validation?.status || '').toLowerCase();
  const targetLabel = actionId === 'add_desk' ? 'Desk' : 'Department';
  if (status === 'block') {
    const reasons = Array.isArray(validation?.blockers) && validation.blockers.length
      ? validation.blockers
      : Array.isArray(validation?.issues) ? validation.issues : [];
    const message = reasons
      .map((item) => toTrimmedString(item?.reason || item?.code || item?.severity))
      .filter(Boolean)
      .join(' ');
    return {
      phase: 'blocked',
      busy: false,
      label: `Blocked: ${message || 'Dependency validation blocked the mutation.'}`,
      error: message || 'Dependency validation blocked the mutation.',
      validation,
    };
  }
  if (status === 'warn') {
    const reasons = Array.isArray(validation?.warnings) && validation.warnings.length
      ? validation.warnings
      : Array.isArray(validation?.issues) ? validation.issues : [];
    const message = reasons
      .map((item) => toTrimmedString(item?.reason || item?.code || item?.severity))
      .filter(Boolean)
      .join(' ');
    return {
      phase: 'warning',
      busy: false,
      label: `${targetLabel} added with warnings${message ? `: ${message}` : ''}`,
      error: null,
      validation,
    };
  }
  return {
    phase: 'success',
    busy: false,
    label: resolveStatusLabel(definition, context, payload, result),
    error: null,
    validation,
  };
}

function resolveButtonLabel(definition, context = {}) {
  if (typeof definition?.label === 'function') {
    return definition.label(context);
  }
  return toTrimmedString(definition?.label || definition?.id || 'Action');
}

function resolveDefinition(actionId) {
  return UI_ACTION_REGISTRY[actionId] || null;
}

function ensureActionSetStatus(context, actionId, status) {
  if (typeof context?.setActionStatus === 'function') {
    context.setActionStatus(actionId, status);
  }
}

export const UI_ACTION_REGISTRY = Object.freeze({
  add_department: Object.freeze({
    id: 'add_department',
    scope: 'server',
    label: 'Add Department',
    busyLabel: 'Adding department...',
    successLabel: 'Department added to studio layout.',
    buildPayload: (context = {}) => {
      const draft = context.layoutMutationDraft && typeof context.layoutMutationDraft === 'object' ? context.layoutMutationDraft : {};
      return {
        templateId: toTrimmedString(draft.departmentTemplateId),
      };
    },
    run: async (context = {}, payload = {}) => {
      if (typeof context?.ace?.addDepartment !== 'function') {
        throw new Error('Ace connector addDepartment is unavailable');
      }
      return context.ace.addDepartment(payload);
    },
  }),
  add_desk: Object.freeze({
    id: 'add_desk',
    scope: 'server',
    label: 'Add Desk',
    busyLabel: 'Adding desk...',
    successLabel: 'Desk added to studio layout.',
    buildPayload: (context = {}) => {
      const draft = context.layoutMutationDraft && typeof context.layoutMutationDraft === 'object' ? context.layoutMutationDraft : {};
      return {
        departmentId: toTrimmedString(draft.deskDepartmentId),
        templateId: toTrimmedString(draft.deskTemplateId),
      };
    },
    run: async (context = {}, payload = {}) => {
      if (typeof context?.ace?.addDesk !== 'function') {
        throw new Error('Ace connector addDesk is unavailable');
      }
      return context.ace.addDesk(payload);
    },
  }),
  toggle_utility_dock: Object.freeze({
    id: 'toggle_utility_dock',
    scope: 'local',
    label: (context = {}) => (context.utilityDockOpen ? 'Hide Utilities' : 'Utilities'),
    busyLabel: 'Updating utilities...',
    successLabel: (context = {}, payload = {}, result = {}) => (result.utilityDockOpen ? 'Utilities shown.' : 'Utilities hidden.'),
    buildPayload: (context = {}) => ({
      nextValue: !Boolean(context.utilityDockOpen),
    }),
    run: async (context = {}, payload = {}) => {
      if (typeof context?.setUtilityDockOpen !== 'function') {
        throw new Error('Utility dock setter is unavailable');
      }
      const nextValue = Boolean(payload.nextValue);
      context.setUtilityDockOpen(nextValue);
      return {
        ok: true,
        utilityDockOpen: nextValue,
      };
    },
  }),
});

export function getUiActionDefinition(actionId) {
  const id = toTrimmedString(actionId);
  return id ? resolveDefinition(id) : null;
}

export function buildActionPayload(actionId, context = {}) {
  const definition = getUiActionDefinition(actionId);
  if (!definition) {
    throw new Error(`Unknown UI action: ${toTrimmedString(actionId) || actionId}`);
  }
  if (typeof definition.buildPayload !== 'function') {
    return {};
  }
  const payload = definition.buildPayload(context);
  return payload && typeof payload === 'object' ? payload : {};
}

export async function runUiAction(actionId, context = {}) {
  const definition = getUiActionDefinition(actionId);
  if (!definition) {
    throw new Error(`Unknown UI action: ${toTrimmedString(actionId) || actionId}`);
  }
  const payload = buildActionPayload(actionId, context);
  const pendingStatus = {
    phase: 'running',
    busy: true,
    label: toTrimmedString(definition.busyLabel || resolveButtonLabel(definition, context) || definition.id),
    error: null,
  };
  ensureActionSetStatus(context, definition.id, pendingStatus);
  try {
    const result = await definition.run(context, payload);
    const completedStatus = summarizeMutationStatus(definition.id, definition, context, payload, result);
    ensureActionSetStatus(context, definition.id, completedStatus);
    return {
      ok: !(result?.ok === false || completedStatus.phase === 'blocked'),
      actionId: definition.id,
      payload,
      result,
      status: completedStatus,
    };
  } catch (error) {
    const message = String(error?.message || error || 'Action failed');
    const failureStatus = {
      phase: 'error',
      busy: false,
      label: message,
      error: message,
    };
    ensureActionSetStatus(context, definition.id, failureStatus);
    throw error;
  }
}

export function ActionButton(props = {}) {
  const h = globalThis.React?.createElement;
  if (typeof h !== 'function') {
    throw new Error('React is required to render ActionButton');
  }
  const {
    actionId,
    context = {},
    actionStatus = {},
    onAction = null,
    children = null,
    className = '',
    disabled = false,
    type = 'button',
    title = '',
    dataQa = '',
    ...rest
  } = props;
  const definition = getUiActionDefinition(actionId);
  if (!definition) {
    throw new Error(`Unknown UI action: ${toTrimmedString(actionId) || actionId}`);
  }
  const currentStatus = actionStatus?.[definition.id] || {};
  const busy = Boolean(currentStatus.busy || currentStatus.phase === 'running');
  const resolvedLabel = children || resolveButtonLabel(definition, context);
  const resolvedTitle = toTrimmedString(title || (typeof definition.title === 'function' ? definition.title(context) : definition.title || resolvedLabel));
  return h('button', {
    ...rest,
    className: [className, busy ? 'is-busy' : ''].filter(Boolean).join(' '),
    type,
    disabled: Boolean(disabled || busy),
    title: resolvedTitle || undefined,
    'data-action-id': definition.id,
    'data-qa': dataQa || `action-${definition.id}`,
    'aria-busy': busy ? 'true' : undefined,
    onClick: async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onAction === 'function') {
        await onAction(definition.id, context);
        return;
      }
      await runUiAction(definition.id, context);
    },
  }, busy ? (currentStatus.label || resolvedLabel) : resolvedLabel);
}
