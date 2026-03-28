const WORLD_SCAFFOLD_KIND = 'rect-ground-grid';
const DEFAULT_WORLD_VIEW_MODE = '2d';
const WORLD_SCAFFOLD_CARD_OFFSET = Object.freeze({ x: 18, y: 144 });
const RECENT_WORLD_CHANGE_TONES = Object.freeze({
  added: {
    fill: 'rgba(92, 226, 159, 0.24)',
    stroke: 'rgba(155, 247, 199, 0.96)',
    labelFill: 'rgba(17, 49, 34, 0.94)',
    labelText: 'rgba(218, 255, 231, 0.96)',
  },
  modified: {
    fill: 'rgba(255, 211, 110, 0.24)',
    stroke: 'rgba(255, 224, 156, 0.96)',
    labelFill: 'rgba(58, 42, 12, 0.94)',
    labelText: 'rgba(255, 243, 214, 0.96)',
  },
});

import {
  describeScaffoldFieldLayer,
  normalizeScaffoldFieldBundle,
} from './spatialFieldBridge.js';

export const WORLD_VIEW_MODES = ['2d', '2.5d', '3d'];
export { DEFAULT_WORLD_VIEW_MODE };

function isWorldScaffoldNode(node = {}) {
  const scaffold = node?.metadata?.scaffold;
  return Boolean(
    scaffold
    && scaffold.kind === WORLD_SCAFFOLD_KIND
    && Number.isFinite(Number(scaffold?.dimensions?.width))
    && Number.isFinite(Number(scaffold?.dimensions?.height))
    && scaffold?.field?.layers
  );
}

function describeActiveDeskSelection(deskId = '', deskLabel = '') {
  const trimmedLabel = String(deskLabel || '').trim();
  const trimmedDeskId = String(deskId || '').trim();
  const label = trimmedLabel || trimmedDeskId || 'Desk';
  return `Active desk: ${label}`;
}

export function normalizeWorldViewMode(value = DEFAULT_WORLD_VIEW_MODE) {
  if (value === '2.5d') return '2.5d';
  if (value === '3d') return '3d';
  return DEFAULT_WORLD_VIEW_MODE;
}

export function findWorldScaffoldNodes(graph = {}) {
  return (graph?.nodes || []).filter((node) => isWorldScaffoldNode(node));
}

export function describeWorldScaffoldNode(node = {}) {
  const scaffold = node?.metadata?.scaffold || {};
  return scaffold.summary || `${scaffold?.dimensions?.width || 0}x${scaffold?.dimensions?.height || 0} grid`;
}

export function describeWorldScaffoldField(nodeOrScaffold = {}) {
  const bundle = normalizeScaffoldFieldBundle(nodeOrScaffold);
  return `Field ${describeScaffoldFieldLayer(bundle.baseLayer)} | ${describeScaffoldFieldLayer(bundle.coarseLayer)}`;
}

function resolveTilePalette(tileType = 'grass', surface = 'ground') {
  const normalizedTileType = String(tileType || 'grass').trim().toLowerCase();
  const normalizedSurface = String(surface || 'ground').trim().toLowerCase();
  if (normalizedTileType === 'stone') {
    return {
      fill: 'rgba(114, 122, 135, 0.88)',
      accent: 'rgba(168, 176, 188, 0.9)',
      shadow: 'rgba(63, 69, 80, 0.84)',
      stroke: 'rgba(224, 230, 240, 0.28)',
    };
  }
  if (normalizedTileType === 'ground' || normalizedTileType === 'dirt' || normalizedSurface === 'dirt') {
    return {
      fill: 'rgba(110, 86, 56, 0.86)',
      accent: 'rgba(152, 122, 82, 0.9)',
      shadow: 'rgba(56, 41, 24, 0.82)',
      stroke: 'rgba(222, 200, 161, 0.28)',
    };
  }
  return {
    fill: 'rgba(72, 136, 76, 0.82)',
    accent: 'rgba(122, 186, 110, 0.86)',
    shadow: 'rgba(38, 74, 41, 0.84)',
    stroke: 'rgba(214, 240, 198, 0.24)',
  };
}

function getScaffoldLayerValues(scaffold = {}) {
  return normalizeScaffoldFieldBundle(scaffold).baseLayer.values;
}

function getScaffoldAnchor(node = {}) {
  const x = Number(node?.position?.x ?? 0) + WORLD_SCAFFOLD_CARD_OFFSET.x;
  const y = Number(node?.position?.y ?? 0) + WORLD_SCAFFOLD_CARD_OFFSET.y;
  return { x, y };
}

function drawScaffoldLabel(ctx, node, viewport, anchorX, anchorY) {
  const title = describeWorldScaffoldNode(node);
  const labelWidth = Math.max(168, Math.min(360, title.length * 7.4));
  const scaledX = anchorX * viewport.zoom + viewport.x;
  const scaledY = (anchorY - 28) * viewport.zoom + viewport.y;
  ctx.save();
  ctx.fillStyle = 'rgba(7, 15, 25, 0.84)';
  ctx.fillRect(scaledX, scaledY, labelWidth * viewport.zoom, 20 * viewport.zoom);
  ctx.fillStyle = 'rgba(225, 236, 214, 0.92)';
  ctx.font = `${Math.max(11, Math.round(12 * viewport.zoom))}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(title, scaledX + 10 * viewport.zoom, scaledY + 10 * viewport.zoom);
  ctx.restore();
}

function drawActiveDeskBadge(ctx, viewport, deskId = '', deskLabel = '') {
  if (!deskId && !deskLabel) return;
  const text = describeActiveDeskSelection(deskId, deskLabel);
  const width = Math.max(172, Math.min(360, text.length * 7.8));
  const x = (18 * viewport.zoom) + viewport.x;
  const y = (14 * viewport.zoom) + viewport.y;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 24, 38, 0.92)';
  ctx.fillRect(x, y, width * viewport.zoom, 22 * viewport.zoom);
  ctx.strokeStyle = 'rgba(102, 199, 255, 0.56)';
  ctx.lineWidth = Math.max(1, 1.2 * viewport.zoom);
  ctx.strokeRect(x, y, width * viewport.zoom, 22 * viewport.zoom);
  ctx.fillStyle = 'rgba(224, 241, 255, 0.96)';
  ctx.font = `${Math.max(10, Math.round(11 * viewport.zoom))}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 10 * viewport.zoom, y + 11 * viewport.zoom);
  ctx.restore();
}

function drawFieldBadge(ctx, viewport, anchorX, anchorY, scaffold = {}) {
  const text = describeWorldScaffoldField(scaffold);
  if (!text) return;
  const width = Math.max(180, Math.min(420, text.length * 7.4));
  const scaledX = anchorX * viewport.zoom + viewport.x;
  const scaledY = (anchorY - 76) * viewport.zoom + viewport.y;
  ctx.save();
  ctx.fillStyle = 'rgba(18, 38, 58, 0.92)';
  ctx.fillRect(scaledX, scaledY, width * viewport.zoom, 18 * viewport.zoom);
  ctx.fillStyle = 'rgba(199, 224, 255, 0.94)';
  ctx.font = `${Math.max(10, Math.round(11 * viewport.zoom))}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, scaledX + 8 * viewport.zoom, scaledY + 9 * viewport.zoom);
  ctx.restore();
}

function getRecentWorldChangeTone(changeType = 'modified') {
  return RECENT_WORLD_CHANGE_TONES[changeType] || RECENT_WORLD_CHANGE_TONES.modified;
}

function buildRecentScaffoldLabel(recentItem = null) {
  const added = Number(recentItem?.counts?.addedCells || 0);
  const modified = Number(recentItem?.counts?.modifiedCells || 0);
  const parts = [];
  if (added) parts.push(`+${added}`);
  if (modified) parts.push(`~${modified}`);
  if (!parts.length) {
    parts.push(recentItem?.changeType === 'added' ? 'added' : 'updated');
  }
  return `Recent ${parts.join(' ')}`;
}

function drawRecentScaffoldBadge(ctx, viewport, anchorX, anchorY, recentItem = null) {
  if (!recentItem) return;
  const text = buildRecentScaffoldLabel(recentItem);
  const tone = getRecentWorldChangeTone(recentItem.changeType);
  const width = Math.max(108, Math.min(192, text.length * 8.2));
  const scaledX = anchorX * viewport.zoom + viewport.x;
  const scaledY = (anchorY - 52) * viewport.zoom + viewport.y;
  ctx.save();
  ctx.fillStyle = tone.labelFill;
  ctx.fillRect(scaledX, scaledY, width * viewport.zoom, 18 * viewport.zoom);
  ctx.fillStyle = tone.labelText;
  ctx.font = `${Math.max(10, Math.round(11 * viewport.zoom))}px monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, scaledX + 8 * viewport.zoom, scaledY + 9 * viewport.zoom);
  ctx.restore();
}

function drawCell2d(ctx, x, y, size, palette) {
  ctx.fillStyle = palette.fill;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(x + size * 0.12, y + size * 0.12, size * 0.76, size * 0.24);
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(x, y, size, size);
}

function drawCell25d(ctx, x, y, size, palette) {
  const topHeight = size * 0.68;
  const skew = size * 0.28;
  const depth = size * 0.34;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + size + skew, y);
  ctx.lineTo(x + size, y + topHeight);
  ctx.lineTo(x, y + topHeight);
  ctx.closePath();
  ctx.fillStyle = palette.fill;
  ctx.fill();
  ctx.strokeStyle = palette.stroke;
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x + size + skew, y);
  ctx.lineTo(x + size + skew, y + depth);
  ctx.lineTo(x + size, y + topHeight + depth);
  ctx.lineTo(x + size, y + topHeight);
  ctx.closePath();
  ctx.fillStyle = palette.shadow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y + topHeight);
  ctx.lineTo(x + size, y + topHeight);
  ctx.lineTo(x + size, y + topHeight + depth);
  ctx.lineTo(x, y + topHeight + depth);
  ctx.closePath();
  ctx.fillStyle = 'rgba(24, 34, 24, 0.28)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x + skew + size * 0.12, y + topHeight * 0.2);
  ctx.lineTo(x + skew + size * 0.88, y + topHeight * 0.2);
  ctx.lineTo(x + size * 0.84, y + topHeight * 0.46);
  ctx.lineTo(x + size * 0.16, y + topHeight * 0.46);
  ctx.closePath();
  ctx.fillStyle = palette.accent;
  ctx.fill();
  ctx.restore();
}

function traceCell25dFace(ctx, x, y, size) {
  const topHeight = size * 0.68;
  const skew = size * 0.28;
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + size + skew, y);
  ctx.lineTo(x + size, y + topHeight);
  ctx.lineTo(x, y + topHeight);
  ctx.closePath();
}

function drawRecentCellHighlight2d(ctx, x, y, size, changeType = 'modified') {
  const tone = getRecentWorldChangeTone(changeType);
  ctx.save();
  ctx.fillStyle = tone.fill;
  ctx.fillRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
  ctx.strokeStyle = tone.stroke;
  ctx.lineWidth = Math.max(1.4, size * 0.08);
  ctx.strokeRect(x + size * 0.06, y + size * 0.06, size * 0.88, size * 0.88);
  ctx.restore();
}

function drawRecentCellHighlight25d(ctx, x, y, size, changeType = 'modified') {
  const tone = getRecentWorldChangeTone(changeType);
  ctx.save();
  traceCell25dFace(ctx, x, y, size);
  ctx.fillStyle = tone.fill;
  ctx.fill();
  traceCell25dFace(ctx, x, y, size);
  ctx.strokeStyle = tone.stroke;
  ctx.lineWidth = Math.max(1.2, size * 0.06);
  ctx.stroke();
  ctx.restore();
}

function drawRecentRegion2d(ctx, anchorX, anchorY, size, width, height, changeType = 'modified') {
  const tone = getRecentWorldChangeTone(changeType);
  ctx.save();
  ctx.strokeStyle = tone.stroke;
  ctx.lineWidth = Math.max(1.5, size * 0.06);
  ctx.setLineDash([Math.max(4, size * 0.18), Math.max(3, size * 0.12)]);
  ctx.strokeRect(anchorX, anchorY, width * size, height * size);
  ctx.restore();
}

function drawRecentRegion25d(ctx, anchorX, anchorY, size, width, height, changeType = 'modified') {
  const tone = getRecentWorldChangeTone(changeType);
  const gridWidth = width * size;
  const gridHeight = height * size * 0.72;
  const skew = height * size * 0.18;
  ctx.save();
  ctx.strokeStyle = tone.stroke;
  ctx.lineWidth = Math.max(1.5, size * 0.05);
  ctx.setLineDash([Math.max(4, size * 0.16), Math.max(3, size * 0.12)]);
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(anchorX + gridWidth + skew, anchorY);
  ctx.lineTo(anchorX + gridWidth, anchorY + gridHeight);
  ctx.lineTo(anchorX - skew, anchorY + gridHeight);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function findRecentScaffoldChange(recentChange = null, nodeId = '') {
  return (recentChange?.items || []).find((item) => item?.kind === 'scaffold' && item?.nodeId === nodeId) || null;
}

function drawRecentScaffoldOverlay(ctx, viewport, anchor, baseCellSize, width, height, viewMode, recentItem = null) {
  if (!recentItem) return;
  const dominantChangeType = Number(recentItem?.counts?.addedCells || 0) > 0 ? 'added' : (recentItem?.changeType || 'modified');
  const drawCellHighlight = (cell, changeType) => {
    if (!cell) return;
    if (viewMode === '2.5d' || viewMode === '3d') {
      const topLeftX = (anchor.x + cell.x * baseCellSize + cell.y * baseCellSize * 0.18) * viewport.zoom + viewport.x;
      const topLeftY = (anchor.y + cell.y * baseCellSize * 0.72) * viewport.zoom + viewport.y;
      drawRecentCellHighlight25d(ctx, topLeftX, topLeftY, baseCellSize * viewport.zoom, changeType);
      return;
    }
    const topLeftX = (anchor.x + cell.x * baseCellSize) * viewport.zoom + viewport.x;
    const topLeftY = (anchor.y + cell.y * baseCellSize) * viewport.zoom + viewport.y;
    drawRecentCellHighlight2d(ctx, topLeftX, topLeftY, baseCellSize * viewport.zoom, changeType);
  };

  (recentItem?.addedCells || []).forEach((cell) => drawCellHighlight(cell, 'added'));
  (recentItem?.modifiedCells || []).forEach((cell) => drawCellHighlight(cell, 'modified'));

  if (viewMode === '2.5d' || viewMode === '3d') {
    drawRecentRegion25d(
      ctx,
      anchor.x * viewport.zoom + viewport.x,
      anchor.y * viewport.zoom + viewport.y,
      baseCellSize * viewport.zoom,
      width,
      height,
      dominantChangeType,
    );
  } else {
    drawRecentRegion2d(
      ctx,
      anchor.x * viewport.zoom + viewport.x,
      anchor.y * viewport.zoom + viewport.y,
      baseCellSize * viewport.zoom,
      width,
      height,
      dominantChangeType,
    );
  }
}

function drawWorldScaffold(ctx, node, viewport, { viewMode: requestedViewMode, recentChange = null, showRecentChanges = true } = {}) {
  const scaffold = node?.metadata?.scaffold;
  if (!scaffold) return;

  const viewMode = normalizeWorldViewMode(requestedViewMode);
  const fieldBundle = normalizeScaffoldFieldBundle(scaffold);
  const tileValues = fieldBundle.baseLayer.values;
  const width = Number(scaffold?.dimensions?.width || 0);
  const height = Number(scaffold?.dimensions?.height || 0);
  const baseCellSize = Math.max(16, Number(scaffold?.cellSize || 28));
  const anchor = getScaffoldAnchor(node);
  const palette = resolveTilePalette(scaffold.tileType, scaffold.surface);
  const recentScaffoldChange = showRecentChanges ? findRecentScaffoldChange(recentChange, node?.id) : null;

  drawScaffoldLabel(ctx, node, viewport, anchor.x, anchor.y);
  drawFieldBadge(ctx, viewport, anchor.x, anchor.y, scaffold);
  drawRecentScaffoldBadge(ctx, viewport, anchor.x, anchor.y, recentScaffoldChange);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const tileType = tileValues?.[y]?.[x] || scaffold.tileType || 'grass';
      const tilePalette = resolveTilePalette(tileType, scaffold.surface);
      if (viewMode === '2.5d' || viewMode === '3d') {
        const topLeftX = (anchor.x + x * baseCellSize + y * baseCellSize * 0.18) * viewport.zoom + viewport.x;
        const topLeftY = (anchor.y + y * baseCellSize * 0.72) * viewport.zoom + viewport.y;
        drawCell25d(ctx, topLeftX, topLeftY, baseCellSize * viewport.zoom, tilePalette);
      } else {
        const topLeftX = (anchor.x + x * baseCellSize) * viewport.zoom + viewport.x;
        const topLeftY = (anchor.y + y * baseCellSize) * viewport.zoom + viewport.y;
        drawCell2d(ctx, topLeftX, topLeftY, baseCellSize * viewport.zoom, tilePalette);
      }
    }
  }

  drawRecentScaffoldOverlay(ctx, viewport, anchor, baseCellSize, width, height, viewMode, recentScaffoldChange);

  if (viewMode === '3d') {
    const labelX = anchor.x * viewport.zoom + viewport.x;
    const labelY = (anchor.y + height * baseCellSize * 0.78 + 18) * viewport.zoom + viewport.y;
    ctx.save();
    ctx.fillStyle = 'rgba(245, 214, 128, 0.86)';
    ctx.font = `${Math.max(11, Math.round(12 * viewport.zoom))}px monospace`;
    ctx.fillText('3D placeholder', labelX, labelY);
    ctx.restore();
  }
}

export function drawWorldScaffolds(ctx, graph, viewport, { viewMode = DEFAULT_WORLD_VIEW_MODE, recentChange = null, showRecentChanges = true, selectedDeskId = '', selectedDeskLabel = '' } = {}) {
  drawActiveDeskBadge(ctx, viewport, selectedDeskId, selectedDeskLabel);
  findWorldScaffoldNodes(graph).forEach((node) => drawWorldScaffold(ctx, node, viewport, {
    viewMode,
    recentChange,
    showRecentChanges,
  }));
}

export { describeActiveDeskSelection };
