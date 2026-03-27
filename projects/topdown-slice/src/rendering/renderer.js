import { BUILDING_STATE, BUILDING_TYPES } from '../buildings/buildings.js';
import { BUILDER_SPAWNER_TYPE } from '../buildings/builderSpawner.js';
import { drawDebugOverlay } from '../debug/debugOverlay.js';
import { getResolverPresentationEntries, RESOLVER_PULSE_DURATION_FRAMES } from '../debug/resolverPresentation.js';
import { isConflictUnit } from '../units/conflict.js';
import { actorUsesEnergy, getActorEnergyRatio, isActorExhausted } from '../units/energy.js';
import { getTileKey } from '../world/coordinates.js';
import { TILE_SIZE, TILE_TYPES } from '../world/tilemap.js';

const GHOST_ACTIVE_TASK_STATUSES = new Set(['queued', 'in_progress']);
const SHORTLIST_FALLBACK_TILE_TYPE = 'stone';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function draw(state) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const tileType = state.map.tiles[y][x];
        ctx.fillStyle = TILE_TYPES[tileType].color;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = '#00000033';
        ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    drawDebugOverlay(ctx, state);
    drawGhostPaintPreviews(ctx, state);
    drawResolverInspector(ctx, state);

    state.store.buildings.forEach((b) => {
      const color = BUILDING_TYPES[b.type]?.color ?? '#ffffff';
      const x = b.x * TILE_SIZE + 4;
      const y = b.y * TILE_SIZE + 4;
      const w = TILE_SIZE - 8;
      const h = TILE_SIZE - 8;

      if (b.state === BUILDING_STATE.UNDER_CONSTRUCTION) {
        ctx.fillStyle = `${color}99`;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffe56b';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        const progress = Math.max(0, Math.min(1, (b.buildProgress ?? 0) / (b.buildRequired ?? 1)));
        ctx.fillStyle = '#00000088';
        ctx.fillRect(x, y + h + 2, w, 4);
        ctx.fillStyle = '#64ff7a';
        ctx.fillRect(x, y + h + 2, w * progress, 4);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      }

      if (b.type === BUILDER_SPAWNER_TYPE) {
        ctx.save();
        ctx.strokeStyle = '#1a2028';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x * TILE_SIZE + TILE_SIZE / 2, b.y * TILE_SIZE + TILE_SIZE / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.x * TILE_SIZE + TILE_SIZE / 2, b.y * TILE_SIZE + 6);
        ctx.lineTo(b.x * TILE_SIZE + TILE_SIZE / 2, b.y * TILE_SIZE + TILE_SIZE / 2);
        ctx.lineTo(b.x * TILE_SIZE + TILE_SIZE - 6, b.y * TILE_SIZE + TILE_SIZE / 2);
        ctx.stroke();
        ctx.restore();
      }

      if (state.selectedBuildingId === b.id) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x * TILE_SIZE + 3, b.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
        ctx.lineWidth = 1;
      }
    });

    state.store.units.forEach((u) => {
      if (u.type === 'worker') {
        const exhausted = isActorExhausted(u) || u.state === 'exhausted';
        const recharging = u.state === 'recharging';
        ctx.fillStyle = exhausted ? '#8b5f65' : recharging ? '#7dff93' : '#5ce1ff';
        ctx.fillRect(u.x * TILE_SIZE + 8, u.y * TILE_SIZE + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        if (exhausted) {
          ctx.strokeStyle = '#ffcf6c';
          ctx.lineWidth = 2;
          ctx.strokeRect(u.x * TILE_SIZE + 7, u.y * TILE_SIZE + 7, TILE_SIZE - 14, TILE_SIZE - 14);
          ctx.lineWidth = 1;
        } else if (recharging) {
          ctx.strokeStyle = '#dfffe7';
          ctx.lineWidth = 2;
          ctx.strokeRect(u.x * TILE_SIZE + 7, u.y * TILE_SIZE + 7, TILE_SIZE - 14, TILE_SIZE - 14);
          ctx.lineWidth = 1;
        }
        drawWorkerEnergy(ctx, u);
        return;
      }

      if (isConflictUnit(u)) {
        drawConflictUnit(ctx, u);
        return;
      }

      ctx.fillStyle = '#ffe56b';
      ctx.beginPath();
      ctx.arc(u.x * TILE_SIZE + TILE_SIZE / 2, u.y * TILE_SIZE + TILE_SIZE / 2, 8, 0, Math.PI * 2);
      ctx.fill();
    });

    const a = state.store.agent;
    ctx.fillStyle = '#ff4dd1';
    ctx.beginPath();
    ctx.arc(a.x * TILE_SIZE + TILE_SIZE / 2, a.y * TILE_SIZE + TILE_SIZE / 2, 10, 0, Math.PI * 2);
    ctx.fill();

    if (state.preview) {
      ctx.fillStyle = state.preview.valid ? '#64ff7a88' : '#ff4d4d88';
      ctx.fillRect(state.preview.x * TILE_SIZE + 5, state.preview.y * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
    }
  }

  return { draw };
}

function drawGhostPaintPreviews(ctx, state) {
  const previews = collectGhostPaintPreviews(state);
  if (previews.length === 0) {
    return;
  }

  previews.forEach((preview) => {
    drawGhostPaintPreview(ctx, preview);
  });
}

function collectGhostPaintPreviews(state) {
  const previews = [];
  const occupiedTargets = new Set();
  const activeTasks = getPendingFieldPaintTasks(state);

  activeTasks.forEach((task) => {
    const tileType = task.payload?.tileType;
    if (!task.target || !tileType || getLiveTileType(state, task.target) === tileType) {
      return;
    }

    const tileKey = getTileKey(task.target);
    if (occupiedTargets.has(tileKey)) {
      return;
    }

    previews.push({
      target: { ...task.target },
      tileType,
      source: 'winner',
      taskStatus: task.status ?? 'queued'
    });
    occupiedTargets.add(tileKey);
  });

  if (previews.length === 0) {
    return previews;
  }

  const decisionEntries = getResolverPresentationEntries(
    state.emergence?.resolverDecision,
    state.emergence?.resolverInspector?.topRanked ?? []
  );

  decisionEntries
    .filter((entry) => entry.presentationStatus === 'shortlisted')
    .forEach((entry) => {
      const tileKey = getTileKey(entry.target);
      if (occupiedTargets.has(tileKey)) {
        return;
      }

      const tileType = getResolverPreviewTileType(state, entry.target);
      if (!tileType || getLiveTileType(state, entry.target) === tileType) {
        return;
      }

      previews.push({
        target: { ...entry.target },
        tileType,
        source: 'shortlist',
        rank: entry.rank ?? null
      });
      occupiedTargets.add(tileKey);
    });

  return previews;
}

function getPendingFieldPaintTasks(state) {
  return getRenderableActors(state)
    .flatMap((actor) => [actor.currentTask, ...(actor.taskQueue ?? [])])
    .filter((task) =>
      task
      && task.type === 'paintTile'
      && task.payload?.source === 'field-emergence'
      && GHOST_ACTIVE_TASK_STATUSES.has(task.status)
    );
}

function getRenderableActors(state) {
  return [state.store.agent, ...(state.store.units ?? [])];
}

function getResolverPreviewTileType(state, target) {
  const candidate = (state.emergence?.candidates ?? []).find((entry) =>
    entry.target?.x === target.x && entry.target?.y === target.y
  );
  return candidate?.payload?.tileType ?? SHORTLIST_FALLBACK_TILE_TYPE;
}

function getLiveTileType(state, target) {
  return state.map.tiles[target.y]?.[target.x] ?? null;
}

function drawGhostPaintPreview(ctx, preview) {
  const baseColor = parseHexColor(TILE_TYPES[preview.tileType]?.color ?? '#ffffff');
  if (!baseColor) {
    return;
  }

  const tileX = preview.target.x * TILE_SIZE;
  const tileY = preview.target.y * TILE_SIZE;
  const isWinner = preview.source === 'winner';
  const activeBoost = preview.taskStatus === 'in_progress' ? 0.06 : 0;
  const fillAlpha = isWinner ? 0.26 + activeBoost : 0.12;
  const coreAlpha = isWinner ? 0.18 + activeBoost : 0.08;
  const outlineAlpha = isWinner ? 0.84 : 0.42;
  const hatchAlpha = isWinner ? 0.38 : 0.16;
  const inset = isWinner ? 4 : 7;
  const size = TILE_SIZE - inset * 2;

  ctx.save();
  ctx.fillStyle = toRgba(baseColor, fillAlpha);
  ctx.fillRect(tileX + inset, tileY + inset, size, size);

  ctx.fillStyle = toRgba(baseColor, coreAlpha);
  ctx.fillRect(tileX + inset + 4, tileY + inset + 4, size - 8, size - 8);

  ctx.strokeStyle = `rgba(242, 247, 255, ${outlineAlpha})`;
  ctx.lineWidth = isWinner ? 1.8 : 1.1;
  ctx.setLineDash(isWinner ? [6, 3] : [3, 4]);
  ctx.strokeRect(tileX + inset + 0.5, tileY + inset + 0.5, size - 1, size - 1);
  ctx.setLineDash([]);

  ctx.strokeStyle = `rgba(242, 247, 255, ${hatchAlpha})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tileX + inset + 3, tileY + inset + size - 5);
  ctx.lineTo(tileX + inset + size - 5, tileY + inset + 3);
  ctx.moveTo(tileX + inset + 3, tileY + inset + size - 11);
  ctx.lineTo(tileX + inset + size - 11, tileY + inset + 3);
  ctx.stroke();

  ctx.fillStyle = isWinner ? 'rgba(16, 21, 28, 0.78)' : 'rgba(16, 21, 28, 0.58)';
  ctx.fillRect(tileX + 3, tileY + 3, isWinner ? 30 : 20, 12);
  ctx.fillStyle = isWinner ? 'rgba(242, 247, 255, 0.94)' : 'rgba(213, 223, 236, 0.86)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(isWinner ? 'PLAN' : `#${preview.rank ?? '?'}`, tileX + 5, tileY + 12);
  ctx.restore();
}

function parseHexColor(color) {
  if (typeof color !== 'string') {
    return null;
  }

  const normalized = color.startsWith('#') ? color.slice(1) : color;
  if (normalized.length !== 6) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function toRgba(color, alpha) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function drawWorkerEnergy(ctx, worker) {
  if (!actorUsesEnergy(worker)) {
    return;
  }

  const barWidth = TILE_SIZE - 8;
  const barHeight = 4;
  const barX = worker.x * TILE_SIZE + 4;
  const barY = worker.y * TILE_SIZE + 2;
  const energyRatio = getActorEnergyRatio(worker);

  ctx.fillStyle = '#111c';
  ctx.fillRect(barX, barY, barWidth, barHeight);
  ctx.fillStyle = energyRatio > 0.35 ? '#7dff93' : energyRatio > 0 ? '#ffcf6c' : '#ff8484';
  ctx.fillRect(barX, barY, barWidth * energyRatio, barHeight);
  ctx.strokeStyle = '#00000088';
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  ctx.fillStyle = '#f2f5f7';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(String(worker.energy), worker.x * TILE_SIZE + TILE_SIZE / 2, worker.y * TILE_SIZE + TILE_SIZE - 2);
}

function drawConflictUnit(ctx, unit) {
  const centerX = unit.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = unit.y * TILE_SIZE + TILE_SIZE / 2;
  const baseColor = unit.faction === 'red' ? '#ff6f61' : '#6aa8ff';
  const strokeColor = unit.faction === 'red' ? '#ffe2dc' : '#d8ebff';

  ctx.save();
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = unit.currentTask?.type === 'attackUnit' ? 2.5 : 1.5;
  ctx.stroke();

  const hpRatio = Math.max(0, Math.min(1, Number(unit.hp ?? 0) / Math.max(1, Number(unit.maxHp ?? 1))));
  ctx.fillStyle = '#111d';
  ctx.fillRect(unit.x * TILE_SIZE + 4, unit.y * TILE_SIZE + 2, TILE_SIZE - 8, 4);
  ctx.fillStyle = unit.faction === 'red' ? '#ffb4ab' : '#b9d3ff';
  ctx.fillRect(unit.x * TILE_SIZE + 4, unit.y * TILE_SIZE + 2, (TILE_SIZE - 8) * hpRatio, 4);
  ctx.strokeStyle = '#00000088';
  ctx.lineWidth = 1;
  ctx.strokeRect(unit.x * TILE_SIZE + 4, unit.y * TILE_SIZE + 2, TILE_SIZE - 8, 4);
  ctx.restore();
}

function drawResolverInspector(ctx, state) {
  if (!state.debug?.resolverInspectorEnabled) {
    return;
  }

  const ranked = getResolverPresentationEntries(
    state.emergence?.resolverDecision,
    state.emergence?.resolverInspector?.topRanked ?? []
  );

  drawResolverWinnerPulse(ctx, state);
  ranked.forEach((entry, index) => {
    drawResolverCandidateHighlight(ctx, entry, index);
  });

  const inspectedTile = state.debug?.resolverPinnedTile ?? state.debug?.resolverHoverTile;
  if (!inspectedTile) {
    return;
  }

  const inspectedEntry = ranked.find((entry) =>
    entry.target.x === inspectedTile.x && entry.target.y === inspectedTile.y
  );

  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = getResolverStrokeColor(inspectedEntry, 0.95);
  ctx.lineWidth = 2;
  ctx.strokeRect(
    inspectedTile.x * TILE_SIZE + 1,
    inspectedTile.y * TILE_SIZE + 1,
    TILE_SIZE - 2,
    TILE_SIZE - 2
  );
  ctx.restore();
}

function drawResolverWinnerPulse(ctx, state) {
  const decision = state.emergence?.resolverDecision;
  const winnerTile = decision?.winnerTile;
  if (!winnerTile) {
    return;
  }

  const startedFrame = Number(decision.frame ?? 0);
  const age = Number(state.emergence?.frame ?? 0) - startedFrame;
  if (age < 0 || age > RESOLVER_PULSE_DURATION_FRAMES) {
    return;
  }

  const progress = age / RESOLVER_PULSE_DURATION_FRAMES;
  const centerX = winnerTile.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = winnerTile.y * TILE_SIZE + TILE_SIZE / 2;
  const alpha = 1 - progress;
  const radius = TILE_SIZE * (0.42 + progress * 0.92);

  ctx.save();
  ctx.strokeStyle = `rgba(125, 255, 147, ${0.75 * alpha})`;
  ctx.lineWidth = Math.max(1, 3 - progress * 2);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(125, 255, 147, ${0.35 * alpha})`;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawResolverCandidateHighlight(ctx, entry, index) {
  const tileX = entry.target.x * TILE_SIZE;
  const tileY = entry.target.y * TILE_SIZE;
  const accent = getResolverStrokeColor(entry);
  const fill = getResolverFillColor(entry, index);

  ctx.save();
  ctx.fillStyle = fill;
  ctx.fillRect(tileX + 2, tileY + 2, TILE_SIZE - 4, TILE_SIZE - 4);

  ctx.strokeStyle = accent;
  ctx.lineWidth = entry.presentationStatus === 'accepted' ? 2.5 : 2;
  if (entry.presentationStatus === 'shortlisted') {
    ctx.setLineDash([6, 3]);
  }
  ctx.strokeRect(tileX + 2, tileY + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.setLineDash([]);

  if (entry.presentationStatus === 'rejected') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tileX + 5, tileY + 5);
    ctx.lineTo(tileX + TILE_SIZE - 5, tileY + TILE_SIZE - 5);
    ctx.moveTo(tileX + TILE_SIZE - 5, tileY + 5);
    ctx.lineTo(tileX + 5, tileY + TILE_SIZE - 5);
    ctx.stroke();
  }

  ctx.fillStyle = '#10151cd9';
  ctx.fillRect(tileX + 2, tileY + 2, entry.presentationStatus === 'accepted' ? 28 : 22, 12);
  ctx.fillStyle = accent;
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    entry.presentationStatus === 'accepted' ? 'WIN' : `#${index + 1}`,
    tileX + 4,
    tileY + 11
  );
  ctx.restore();
}

function getResolverStrokeColor(entry, alpha = 1) {
  switch (entry?.presentationStatus) {
    case 'accepted':
      return `rgba(125, 255, 147, ${alpha})`;
    case 'rejected':
      return `rgba(255, 138, 138, ${alpha})`;
    default:
      return `rgba(255, 211, 107, ${alpha})`;
  }
}

function getResolverFillColor(entry, index) {
  if (entry?.presentationStatus === 'accepted') {
    return 'rgba(125, 255, 147, 0.18)';
  }

  if (entry?.presentationStatus === 'rejected') {
    return 'rgba(255, 138, 138, 0.14)';
  }

  return index === 1
    ? 'rgba(116, 199, 255, 0.13)'
    : 'rgba(255, 211, 107, 0.12)';
}
