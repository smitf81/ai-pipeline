export const PAUSE_MENU_LAYOUT_CONTRACT = 'black-sky-bound.pause-menu-layout.v1';

export function buildPauseMenuLayout(menu, viewport = {}) {
  const viewportW = dimension(viewport.width ?? viewport.viewportW, 1280);
  const viewportH = dimension(viewport.height ?? viewport.viewportH, 720);
  const compact = viewportW < 820 || viewportH < 620;
  const rowGap = compact ? 35 : 43;
  const startY = compact ? 94 : 116;
  const settingsX = compact ? 48 : Math.max(620, viewportW * 0.62);
  const settingsWidth = Math.max(210, viewportW - settingsX - 50);
  const controls = (menu?.controls ?? []).map((control, index) => ({
    ...control,
    x: 50,
    y: startY + index * rowGap,
    labelX: compact ? 148 : 176,
    scale: compact ? 1 : 2
  }));
  const sections = [];
  const settingsRows = [];
  let settingsY = compact ? startY + controls.length * rowGap + 12 : 118;
  let section = null;

  for (const [index, setting] of (menu?.settings ?? []).entries()) {
    if (setting.section !== section) {
      section = setting.section;
      sections.push({ label: section, x: settingsX, y: settingsY });
      settingsY += compact ? 24 : 29;
    }
    const rowHeight = setting.kind === 'level' ? (compact ? 31 : 35) : (compact ? 24 : 29);
    const row = {
      ...setting,
      index,
      x: settingsX,
      y: settingsY,
      width: settingsWidth,
      height: rowHeight,
      bounds: bounds(settingsX - 14, settingsY - 3, settingsWidth + 14, setting.kind === 'level' ? rowHeight + 3 : Math.max(27, rowHeight))
    };
    if (setting.kind === 'level') addLevelGeometry(row);
    settingsRows.push(row);
    settingsY += rowHeight;
  }

  return {
    contract: PAUSE_MENU_LAYOUT_CONTRACT,
    viewportW,
    viewportH,
    compact,
    controls,
    sections,
    settingsRows,
    footer: { x: 48, y: viewportH - 42, scale: compact ? 1 : 2, maxWidth: viewportW - 96 }
  };
}

export function hitTestPauseMenu(layout, x, y) {
  if (!layout || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const row of layout.settingsRows ?? []) {
    if (!pointInBounds(x, y, row.bounds)) continue;
    if (row.kind === 'level') {
      if (pointInBounds(x, y, row.minusBounds)) return { row, target: 'decrease' };
      if (pointInBounds(x, y, row.plusBounds)) return { row, target: 'increase' };
      if (pointInBounds(x, y, row.railHitBounds)) return { row, target: 'rail' };
    }
    return { row, target: 'row' };
  }
  return null;
}

export function levelFromPauseMenuPointer(row, x) {
  if (!row?.rail || !Number.isFinite(x)) return 0;
  const raw = (x - row.rail.x) / Math.max(1, row.rail.w);
  return Math.round(clamp01(raw) * 100) / 100;
}

function addLevelGeometry(row) {
  const buttonSize = 23;
  const controlGap = 8;
  const railX = row.x + buttonSize + controlGap;
  const railWidth = Math.max(96, row.width - (buttonSize + controlGap) * 2);
  row.minusBounds = bounds(row.x, row.y + 12, buttonSize, 19);
  row.plusBounds = bounds(row.x + row.width - buttonSize, row.y + 12, buttonSize, 19);
  row.rail = bounds(railX, row.y + 19, railWidth, 6);
  row.railHitBounds = bounds(railX, row.y + 9, railWidth, 22);
}

function bounds(x, y, w, h) {
  return { x, y, w, h };
}

function pointInBounds(x, y, target) {
  return !!target && x >= target.x && x <= target.x + target.w && y >= target.y && y <= target.y + target.h;
}

function dimension(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

