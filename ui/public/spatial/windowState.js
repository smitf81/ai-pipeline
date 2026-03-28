const UTILITY_WINDOW_STORAGE_KEY = 'ace.spatial.utilityWindows.v1';
const UTILITY_WINDOW_ORDER = ['environment', 'qa', 'context', 'reports', 'roster', 'studio-map', 'scorecards'];
const UTILITY_WINDOW_META = {
  environment: { deskId: 'cto-architect' },
  qa: { deskId: 'qa-lead' },
  context: { deskId: 'memory-archivist' },
  reports: { deskId: null },
  roster: { deskId: null },
  'studio-map': { deskId: null },
  scorecards: { deskId: 'qa-lead' },
};
const DEFAULT_FLOATING_WINDOW_SIZE = { width: 460, height: 520 };
const DEFAULT_FLOATING_MARGIN = 24;
const DEFAULT_FLOATING_STEP = 28;

function getLocalStorage() {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage || null;
  } catch (error) {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function getDefaultUtilityWindowPosition(windowId) {
  const index = Math.max(0, UTILITY_WINDOW_ORDER.indexOf(windowId));
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const maxLeft = Math.max(DEFAULT_FLOATING_MARGIN, viewportWidth - DEFAULT_FLOATING_WINDOW_SIZE.width - DEFAULT_FLOATING_MARGIN);
  const maxTop = Math.max(DEFAULT_FLOATING_MARGIN, viewportHeight - DEFAULT_FLOATING_WINDOW_SIZE.height - DEFAULT_FLOATING_MARGIN);
  const left = clamp(maxLeft - (index * DEFAULT_FLOATING_STEP), DEFAULT_FLOATING_MARGIN, maxLeft);
  const top = clamp(DEFAULT_FLOATING_MARGIN + (index * 26), DEFAULT_FLOATING_MARGIN, maxTop);
  return { left, top };
}

export function clampUtilityWindowPosition(position = {}) {
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight || 800 : 800;
  const maxLeft = Math.max(DEFAULT_FLOATING_MARGIN, viewportWidth - DEFAULT_FLOATING_WINDOW_SIZE.width - DEFAULT_FLOATING_MARGIN);
  const maxTop = Math.max(DEFAULT_FLOATING_MARGIN, viewportHeight - DEFAULT_FLOATING_WINDOW_SIZE.height - DEFAULT_FLOATING_MARGIN);
  const left = Number.isFinite(position.left) ? position.left : DEFAULT_FLOATING_MARGIN;
  const top = Number.isFinite(position.top) ? position.top : DEFAULT_FLOATING_MARGIN;
  return {
    left: clamp(left, DEFAULT_FLOATING_MARGIN, maxLeft),
    top: clamp(top, DEFAULT_FLOATING_MARGIN, maxTop),
  };
}

export function createDefaultUtilityWindowState(windowId) {
  return {
    open: false,
    minimized: false,
    docked: true,
    targetDeskId: UTILITY_WINDOW_META[windowId]?.deskId ?? null,
    position: getDefaultUtilityWindowPosition(windowId),
  };
}

export function createDefaultUtilityWindows() {
  return Object.fromEntries(UTILITY_WINDOW_ORDER.map((windowId) => [windowId, createDefaultUtilityWindowState(windowId)]));
}

function normalizeUtilityWindowPosition(position, windowId) {
  if (!position || typeof position !== 'object') return getDefaultUtilityWindowPosition(windowId);
  const left = Number.isFinite(position.left) ? position.left : Number.isFinite(position.x) ? position.x : null;
  const top = Number.isFinite(position.top) ? position.top : Number.isFinite(position.y) ? position.y : null;
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return getDefaultUtilityWindowPosition(windowId);
  }
  return clampUtilityWindowPosition({ left, top });
}

export function normalizeUtilityWindowsState(state = {}) {
  const source = state && typeof state === 'object' ? state : {};
  return Object.fromEntries(UTILITY_WINDOW_ORDER.map((windowId) => {
    const entry = source[windowId] && typeof source[windowId] === 'object' ? source[windowId] : {};
    const defaults = createDefaultUtilityWindowState(windowId);
    return [windowId, {
      ...defaults,
      open: Boolean(entry.open),
      minimized: Boolean(entry.minimized),
      docked: entry.docked === undefined ? defaults.docked : Boolean(entry.docked),
      targetDeskId: Object.prototype.hasOwnProperty.call(entry, 'targetDeskId')
        ? entry.targetDeskId || null
        : defaults.targetDeskId,
      position: normalizeUtilityWindowPosition(entry.position, windowId),
    }];
  }));
}

export function loadUtilityWindowsState() {
  const storage = getLocalStorage();
  if (!storage) return createDefaultUtilityWindows();
  try {
    const raw = storage.getItem(UTILITY_WINDOW_STORAGE_KEY);
    if (!raw) return createDefaultUtilityWindows();
    return normalizeUtilityWindowsState(JSON.parse(raw));
  } catch (error) {
    return createDefaultUtilityWindows();
  }
}

export function saveUtilityWindowsState(state) {
  const storage = getLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(UTILITY_WINDOW_STORAGE_KEY, JSON.stringify(normalizeUtilityWindowsState(state)));
    return true;
  } catch (error) {
    return false;
  }
}
