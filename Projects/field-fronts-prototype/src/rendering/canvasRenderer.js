import { FIELD_OVERLAYS, getTerrain } from '../config/terrain.js';
import { getBrushTiles } from '../editor/brush.js';
import { FACTIONS } from '../game/gameModel.js';
import { getStructureDefinition } from '../game/structureRegistry.js';
import { getElevation, getTile } from '../world/mapModel.js';

const TILE_GAP = 1;
const DEFAULT_RENDER_SCALE = 2;
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 4;
const BASE_TERRAIN_PIXELS_PER_TILE = 4;
const TERRAIN_MASK_SHARPNESS = 4.2;

export function createCanvasRenderer(canvas, options = {}) {
  let ctx = canvas.getContext('2d');
  const renderScale = normaliseRenderScale(options.renderScale ?? options.visualTileResolution ?? DEFAULT_RENDER_SCALE);
  const terrainBuffer = document.createElement('canvas');
  const terrainCtx = terrainBuffer.getContext('2d');
  const tacticalBuffer = document.createElement('canvas');
  const tacticalCtx = tacticalBuffer.getContext('2d');
  let terrainBufferSignature = null;
  let tacticalBufferSignature = null;
  let currentRenderState = null;
  const stats = {
    renderCount: 0,
    tacticalLayerBuilds: 0,
    tacticalLayerHits: 0,
    entityCullSkips: 0,
    structureCullSkips: 0,
    intentCullSkips: 0
  };
  const view = {
    dpr: 1,
    width: 0,
    height: 0,
    tileSize: 18,
    offsetX: 0,
    offsetY: 0
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nextDpr = window.devicePixelRatio || 1;
    const nextWidth = rect.width;
    const nextHeight = rect.height;
    const nextCanvasWidth = Math.max(1, Math.floor(nextWidth * nextDpr));
    const nextCanvasHeight = Math.max(1, Math.floor(nextHeight * nextDpr));
    const changed = canvas.width !== nextCanvasWidth
      || canvas.height !== nextCanvasHeight
      || view.width !== nextWidth
      || view.height !== nextHeight
      || view.dpr !== nextDpr;
    view.dpr = nextDpr;
    view.width = nextWidth;
    view.height = nextHeight;
    if (changed) {
      canvas.width = nextCanvasWidth;
      canvas.height = nextCanvasHeight;
      tacticalBufferSignature = null;
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function fitToMap(map) {
    const availableW = Math.max(1, view.width - 40);
    const availableH = Math.max(1, view.height - 40);
    view.tileSize = Math.max(8, Math.floor(Math.min(availableW / map.width, availableH / map.height)));
    view.offsetX = Math.floor((view.width - map.width * view.tileSize) / 2);
    view.offsetY = Math.floor((view.height - map.height * view.tileSize) / 2);
  }

  function render(state) {
    stats.renderCount += 1;
    currentRenderState = state;
    resize();
    fitToMap(state.map);
    ctx.clearRect(0, 0, view.width, view.height);
    drawBackdrop();
    drawMap(state);
    drawCachedTacticalLayer(state);
    drawMovementIntents(state);
    drawIntentPreview(state);
    drawPlacementPreview(state);
    drawStructures(state);
    drawOutposts(state);
    drawSquads(state);
    drawBuilders(state);
    drawLeaders(state);
    if (state.mode === 'edit') {
      drawBrushPreview(state);
    }
    drawSelection(state);
  }

  function drawCachedTacticalLayer(state) {
    if (!shouldDrawTacticalLayer(state)) {
      tacticalBufferSignature = null;
      return;
    }

    const nextSignature = getTacticalLayerSignature(state);
    const bufferWidth = Math.max(1, Math.floor(view.width * view.dpr));
    const bufferHeight = Math.max(1, Math.floor(view.height * view.dpr));
    if (tacticalBuffer.width !== bufferWidth || tacticalBuffer.height !== bufferHeight) {
      tacticalBuffer.width = bufferWidth;
      tacticalBuffer.height = bufferHeight;
      tacticalBufferSignature = null;
    }

    if (tacticalBufferSignature !== nextSignature) {
      stats.tacticalLayerBuilds += 1;
      const mainCtx = ctx;
      ctx = tacticalCtx;
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.clearRect(0, 0, view.width, view.height);
      drawInfluenceVisualization(state);
      drawCommandRadii(state);
      drawFrontline(state);
      ctx = mainCtx;
      tacticalBufferSignature = nextSignature;
    } else {
      stats.tacticalLayerHits += 1;
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tacticalBuffer, 0, 0, bufferWidth, bufferHeight, 0, 0, view.width, view.height);
    ctx.restore();
  }

  function drawBackdrop() {
    ctx.fillStyle = '#121613';
    ctx.fillRect(0, 0, view.width, view.height);
  }

  function drawMap(state) {
    drawTerrainBuffer(state);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      terrainBuffer,
      0,
      0,
      terrainBuffer.width,
      terrainBuffer.height,
      view.offsetX,
      view.offsetY,
      state.map.width * view.tileSize,
      state.map.height * view.tileSize
    );
    ctx.restore();

    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        const terrain = getTerrain(getTile(state.map, x, y));
        const sx = view.offsetX + x * view.tileSize;
        const sy = view.offsetY + y * view.tileSize;
        drawTerrainMark(terrain.id, sx, sy, view.tileSize);
      }
    }
  }

  function drawTerrainBuffer(state) {
    const bufferTileSize = Math.max(4, Math.ceil(BASE_TERRAIN_PIXELS_PER_TILE * renderScale));
    const bufferWidth = Math.max(1, state.map.width * bufferTileSize);
    const bufferHeight = Math.max(1, state.map.height * bufferTileSize);
    const nextSignature = getTerrainBufferSignature(state, bufferTileSize, bufferWidth, bufferHeight);
    
    if (terrainBuffer.width !== bufferWidth || terrainBuffer.height !== bufferHeight) {
      terrainBuffer.width = bufferWidth;
      terrainBuffer.height = bufferHeight;
      terrainBufferSignature = null;
    }
    if (terrainBufferSignature === nextSignature) {
      return;
    }

    if (terrainBufferSignature && state.dirtyRegion) {
      const pad = 2;
      const minX = Math.max(0, state.dirtyRegion.minX - pad);
      const maxX = Math.min(state.map.width - 1, state.dirtyRegion.maxX + pad);
      const minY = Math.max(0, state.dirtyRegion.minY - pad);
      const maxY = Math.min(state.map.height - 1, state.dirtyRegion.maxY + pad);

      const pxStart = Math.floor(minX * bufferTileSize);
      const pxEnd = Math.min(bufferWidth, Math.ceil((maxX + 1) * bufferTileSize));
      const pyStart = Math.floor(minY * bufferTileSize);
      const pyEnd = Math.min(bufferHeight, Math.ceil((maxY + 1) * bufferTileSize));

      const subWidth = pxEnd - pxStart;
      const subHeight = pyEnd - pyStart;

      if (subWidth > 0 && subHeight > 0) {
        const image = terrainCtx.createImageData(subWidth, subHeight);
        const data = image.data;
        for (let py = 0; py < subHeight; py += 1) {
          const globalPy = pyStart + py;
          for (let px = 0; px < subWidth; px += 1) {
            const globalPx = pxStart + px;
            const sampleX = (globalPx + 0.5) / bufferTileSize;
            const sampleY = (globalPy + 0.5) / bufferTileSize;
            const color = sampleTerrainColor(state.map, sampleX, sampleY);
            const overlayColor = sampleTerrainOverlayColor(state, sampleX, sampleY);
            const index = (py * subWidth + px) * 4;
            data[index] = clampByte(color.r + overlayColor.r);
            data[index + 1] = clampByte(color.g + overlayColor.g);
            data[index + 2] = clampByte(color.b + overlayColor.b);
            data[index + 3] = 255;
          }
        }
        terrainCtx.putImageData(image, pxStart, pyStart);
        terrainBufferSignature = nextSignature;
        return;
      }
    }

    const image = terrainCtx.createImageData(bufferWidth, bufferHeight);
    const data = image.data;
    for (let py = 0; py < bufferHeight; py += 1) {
      for (let px = 0; px < bufferWidth; px += 1) {
        const sampleX = (px + 0.5) / bufferTileSize;
        const sampleY = (py + 0.5) / bufferTileSize;
        const color = sampleTerrainColor(state.map, sampleX, sampleY);
        const overlayColor = sampleTerrainOverlayColor(state, sampleX, sampleY);
        const index = (py * bufferWidth + px) * 4;
        data[index] = clampByte(color.r + overlayColor.r);
        data[index + 1] = clampByte(color.g + overlayColor.g);
        data[index + 2] = clampByte(color.b + overlayColor.b);
        data[index + 3] = 255;
      }
    }
    terrainCtx.putImageData(image, 0, 0);
    terrainBufferSignature = nextSignature;
  }

  function drawTerrainMark(terrainId, sx, sy, tileSize) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    if (terrainId === 'forest') {
      ctx.beginPath();
      ctx.arc(sx + tileSize * 0.5, sy + tileSize * 0.52, Math.max(2, tileSize * 0.22), 0, Math.PI * 2);
      ctx.stroke();
    } else if (terrainId === 'river' || terrainId === 'sea') {
      ctx.beginPath();
      ctx.moveTo(sx + tileSize * 0.18, sy + tileSize * 0.58);
      ctx.quadraticCurveTo(sx + tileSize * 0.45, sy + tileSize * 0.28, sx + tileSize * 0.82, sy + tileSize * 0.52);
      ctx.stroke();
    } else if (terrainId === 'mountains') {
      ctx.beginPath();
      ctx.moveTo(sx + tileSize * 0.18, sy + tileSize * 0.76);
      ctx.lineTo(sx + tileSize * 0.44, sy + tileSize * 0.25);
      ctx.lineTo(sx + tileSize * 0.78, sy + tileSize * 0.76);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function sampleTerrainOverlayColor(state, x, y) {
    if (state.activeField === 'none' || state.activeField === 'normal' || state.activeField === 'displacement') {
      return { r: 0, g: 0, b: 0 };
    }
    const overlay = FIELD_OVERLAYS[state.activeField];
    if (!overlay || !overlay.color) {
      return { r: 0, g: 0, b: 0 };
    }
    const value = sampleWorldField(state.fields, state.activeField, x, y) ?? 0;
    const [r, g, b] = overlay.color;
    const alpha = 0.08 + value * 0.36;
    return {
      r: (r - 20) * alpha,
      g: (g - 22) * alpha,
      b: (b - 18) * alpha
    };
  }

  function drawInfluenceVisualization(state) {
    if (!state.game || state.gameOverlay === 'none') {
      return;
    }

    if (state.gameOverlay === 'control' || state.gameOverlay === 'influenceFrontline') {
      drawFieldRelationshipWash(state);
      drawCommandInfluenceSpheres(state);
      drawCommandFieldContours(state);
      return;
    }

    drawSmoothGameFieldOverlay(state);
    drawCommandFieldContours(state);
  }

  function drawSmoothGameFieldOverlay(state) {
    const subSteps = getOverlaySubSteps();
    const sampleSize = view.tileSize / subSteps;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        for (let syIndex = 0; syIndex < subSteps; syIndex += 1) {
          for (let sxIndex = 0; sxIndex < subSteps; sxIndex += 1) {
            const sampleX = x + (sxIndex + 0.5) / subSteps;
            const sampleY = y + (syIndex + 0.5) / subSteps;
            const color = getGameOverlaySampleColor(state, sampleX, sampleY);
            if (!color) {
              continue;
            }
            ctx.fillStyle = color;
            ctx.fillRect(
              view.offsetX + x * view.tileSize + sxIndex * sampleSize,
              view.offsetY + y * view.tileSize + syIndex * sampleSize,
              sampleSize + 0.7,
              sampleSize + 0.7
            );
          }
        }
      }
    }
    ctx.restore();
  }

  function drawFieldRelationshipWash(state) {
    const subSteps = getOverlaySubSteps();
    const sampleSize = view.tileSize / subSteps;
    ctx.save();
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        for (let syIndex = 0; syIndex < subSteps; syIndex += 1) {
          for (let sxIndex = 0; sxIndex < subSteps; sxIndex += 1) {
            const sampleX = x + (sxIndex + 0.5) / subSteps;
            const sampleY = y + (syIndex + 0.5) / subSteps;
            const control = sampleGameField(state.game, 'control', sampleX, sampleY) ?? 0.5;
            const player = sampleGameField(state.game, 'playerCommand', sampleX, sampleY) ?? 0;
            const enemy = sampleGameField(state.game, 'enemyCommand', sampleX, sampleY) ?? 0;
            const pressure = sampleGameField(state.game, 'frontPressure', sampleX, sampleY) ?? 0;
            const lean = Math.abs(control - 0.5) * 2;
            const alpha = state.gameOverlay === 'influenceFrontline'
              ? 0.03 + Math.max(player, enemy) * 0.32 + pressure * 0.46
              : 0.03 + Math.max(player, enemy) * 0.28 + lean * 0.12 + pressure * 0.18;
            if (alpha < 0.04) {
              continue;
            }
            const playerWeight = smoothstep(0.38, 0.62, control);
            const red = Math.round(lerp(234, 84, playerWeight));
            const green = Math.round(lerp(101, 157, playerWeight));
            const blue = Math.round(lerp(82, 244, playerWeight));
            ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, ${Math.min(0.56, alpha)})`;
            ctx.fillRect(
              view.offsetX + x * view.tileSize + sxIndex * sampleSize,
              view.offsetY + y * view.tileSize + syIndex * sampleSize,
              sampleSize + 0.6,
              sampleSize + 0.6
            );
          }
        }
      }
    }
    ctx.restore();
  }

  function drawCommandInfluenceSpheres(state) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawResolvedCommandGlow(state, 'playerCommand', 'player');
    drawResolvedCommandGlow(state, 'enemyCommand', 'enemy');
    ctx.restore();
  }

  function drawResolvedCommandGlow(state, fieldId, factionId) {
    const subSteps = getOverlaySubSteps();
    const sampleSize = view.tileSize / subSteps;
    const color = factionId === 'enemy' ? [255, 135, 111] : [111, 179, 255];
    for (let y = 0; y < state.map.height; y += 1) {
      for (let x = 0; x < state.map.width; x += 1) {
        for (let syIndex = 0; syIndex < subSteps; syIndex += 1) {
          for (let sxIndex = 0; sxIndex < subSteps; sxIndex += 1) {
            const sampleX = x + (sxIndex + 0.5) / subSteps;
            const sampleY = y + (syIndex + 0.5) / subSteps;
            const value = sampleGameField(state.game, fieldId, sampleX, sampleY) ?? 0;
            if (value < 0.025) {
              continue;
            }
            const alpha = Math.min(0.28, 0.03 + value * 0.34);
            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
            ctx.fillRect(
              view.offsetX + x * view.tileSize + sxIndex * sampleSize,
              view.offsetY + y * view.tileSize + syIndex * sampleSize,
              sampleSize + 0.7,
              sampleSize + 0.7
            );
          }
        }
      }
    }
  }

  function drawCommandFieldContours(state) {
    if (!state.game?.fields) {
      return;
    }
    const visibleContours = getVisibleCommandContours(state.gameOverlay);
    if (visibleContours.length === 0) {
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'screen';
    visibleContours.forEach(({ fieldId, factionId }) => {
      const faction = FACTIONS[factionId];
      [0.18, 0.32, 0.46].forEach((level, index) => {
        const segments = buildFieldContourSegments(state.game.fields[fieldId], level)
          .filter((segment) => tileDistance(segment.start, segment.end) >= 0.08);
        const alphaBase = state.gameOverlay === fieldId ? 0.42 : 0.2;
        ctx.strokeStyle = factionId === 'enemy'
          ? `rgba(255, 208, 196, ${alphaBase - index * 0.07})`
          : `rgba(184, 220, 255, ${alphaBase - index * 0.07})`;
        ctx.lineWidth = Math.max(1, view.tileSize * (0.035 + index * 0.012));
        buildSegmentPaths(segments).forEach((path) => drawStablePath(path));
      });
    });
    ctx.restore();
  }

  function drawFrontline(state) {
    if (state.gameOverlay !== 'control' && state.gameOverlay !== 'influenceFrontline') {
      return;
    }
    const segments = state.game.frontline?.segments ?? [];
    if (segments.length === 0) {
      return;
    }
    const pulse = 0.5 + Math.sin((state.game.tick ?? 0) * 0.7) * 0.5;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255, 87, 72, 0.62)';
    ctx.shadowBlur = Math.max(4, view.tileSize * 0.34);
    const contourSegments = buildFrontlineContourSegments(state);
    const paths = contourSegments.length > 0 ? buildSegmentPaths(contourSegments) : buildSegmentPaths(segments);
    paths.forEach((path) => {
      const pressure = Math.min(1, average(path.map((point) => point.pressure ?? 0)) * 2.8);
      ctx.strokeStyle = `rgba(255, 78, 61, ${0.56 + pressure * 0.34})`;
      ctx.lineWidth = Math.max(2, view.tileSize * (0.12 + pressure * 0.11));
      drawStablePath(path, { smooth: 'chaikin', iterations: 3 });
      ctx.strokeStyle = `rgba(255, 241, 173, ${0.24 + pulse * 0.22})`;
      ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
      drawStablePath(path, { smooth: 'chaikin', iterations: 3 });
    });
    ctx.restore();
  }

  function drawCommandRadii(state) {
    if (!state.showCommandRadii || !state.game?.leaders?.length) {
      return;
    }
    ctx.save();
    state.game.leaders.forEach((leader) => {
      const faction = FACTIONS[leader.factionId];
      const position = getEntityPosition(leader);
      ctx.strokeStyle = faction.color;
      ctx.fillStyle = faction.softColor;
      ctx.lineWidth = 2;
      ctx.lineWidth = Math.max(1.5, view.tileSize * 0.07);
      const fieldId = leader.factionId === 'enemy' ? 'enemyCommand' : 'playerCommand';
      const edgeSegments = buildFieldContourSegments(state.game.fields[fieldId], 0.06);
      if (edgeSegments.length > 0) {
        buildSegmentPaths(edgeSegments).forEach((path) => drawStablePath(path));
      } else {
        drawStablePath(createCirclePath(position, leader.influenceRadius));
      }
    });
    ctx.restore();
  }

  function drawMovementIntents(state) {
    if (!state.game?.leaders?.length && !state.game?.squads?.length) {
      return;
    }
    ctx.save();
    ctx.lineWidth = Math.max(1, view.tileSize * 0.08);
    ctx.setLineDash([Math.max(3, view.tileSize * 0.35), Math.max(3, view.tileSize * 0.25)]);
    state.game.leaders.forEach((leader) => {
      if (!leader.movement?.target || (leader.movement.status !== 'moving' && leader.movement.status !== 'blocked')) {
        return;
      }
      const faction = FACTIONS[leader.factionId];
      const position = getEntityPosition(leader);
      const path = leader.movementPath?.nodes?.length >= 2
        ? [position, ...leader.movementPath.nodes.slice(leader.movementPath.cursor ?? 1)]
        : leader.movementOrder?.path?.length >= 2
          ? [position, ...leader.movementOrder.path.slice(1)]
        : [position, leader.movement.target];
      if (!isPathInViewport(path, 2)) {
        stats.intentCullSkips += 1;
        return;
      }
      const end = tileCenter(leader.movement.target.x, leader.movement.target.y);
      ctx.strokeStyle = faction.color;
      ctx.globalAlpha = 0.52;
      drawStablePath(path, { smooth: 'catmull', samplesPerSegment: 8 });
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = faction.color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, Math.max(2.5, view.tileSize * 0.12), 0, Math.PI * 2);
      ctx.fill();
    });
    (state.game.squads ?? []).forEach((squad) => {
      if (!squad.movement?.target || (squad.movement.status !== 'moving' && squad.movement.status !== 'blocked')) {
        return;
      }
      const faction = FACTIONS[squad.factionId];
      const position = getEntityPosition(squad);
      const path = squad.movementPath?.nodes?.length >= 2
        ? [position, ...squad.movementPath.nodes.slice(squad.movementPath.cursor ?? 1)]
        : squad.movementOrder?.path?.length >= 2
          ? [position, ...squad.movementOrder.path.slice(1)]
        : [position, squad.movement.target];
      if (!isPathInViewport(path, 2)) {
        stats.intentCullSkips += 1;
        return;
      }
      const end = tileCenter(squad.movement.target.x, squad.movement.target.y);
      ctx.strokeStyle = faction.color;
      ctx.globalAlpha = 0.42;
      drawStablePath(path, { smooth: 'catmull', samplesPerSegment: 8 });
      ctx.globalAlpha = 0.64;
      ctx.fillStyle = faction.color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, Math.max(2, view.tileSize * 0.09), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawIntentPreview(state) {
    const path = state.intentPreview?.path;
    if (!path || path.length < 2) {
      return;
    }
    const entityId = state.intentPreview.entityId ?? state.intentPreview.leaderId;
    const entity = [...(state.game?.leaders ?? []), ...(state.game?.squads ?? [])].find((candidate) => candidate.id === entityId);
    const faction = FACTIONS[entity?.factionId] ?? FACTIONS.player;
    const target = path[path.length - 1];
    const end = tileCenter(target.x, target.y);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = faction.stroke;
    ctx.lineWidth = Math.max(2, view.tileSize * 0.12);
    ctx.globalAlpha = 0.9;
    ctx.setLineDash([Math.max(4, view.tileSize * 0.42), Math.max(3, view.tileSize * 0.22)]);
    drawStablePath(path, { smooth: 'catmull', samplesPerSegment: 8 });
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff4b8';
    ctx.strokeStyle = '#101410';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(end.x, end.y, Math.max(3.5, view.tileSize * 0.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawStructures(state) {
    const structures = state.game?.structures ?? [];
    if (structures.length === 0) {
      return;
    }
    ctx.save();
    structures.forEach((structure) => {
      if (isLegacyOutpostStructure(state, structure)) {
        return;
      }
      const position = structure.position ?? structure.tile;
      if (!isEntityInView(position, 3)) {
        stats.structureCullSkips += 1;
        return;
      }
      drawStructureGlyph(structure);
    });
    ctx.restore();
  }

  function drawPlacementPreview(state) {
    const placement = state.placement;
    if (!placement?.active || !placement.hoverPosition) {
      return;
    }
    const validity = placement.validity ?? {};
    const structureType = placement.selectedStructureType;
    const footprint = getPreviewFootprint(structureType);
    const centre = tileCenter(placement.hoverPosition.x, placement.hoverPosition.y);
    const width = Math.max(view.tileSize * 0.55, view.tileSize * footprint.width);
    const height = Math.max(view.tileSize * 0.32, view.tileSize * footprint.height);
    const valid = Boolean(validity.valid);

    ctx.save();
    ctx.lineWidth = Math.max(1.5, view.tileSize * 0.08);
    ctx.strokeStyle = valid ? 'rgba(210, 225, 186, 0.92)' : 'rgba(238, 126, 98, 0.94)';
    ctx.fillStyle = valid ? 'rgba(96, 112, 74, 0.22)' : 'rgba(107, 44, 35, 0.24)';
    ctx.setLineDash([Math.max(5, view.tileSize * 0.32), Math.max(3, view.tileSize * 0.2)]);
    drawFootprintOutline(centre, width, height, footprint.shape);
    ctx.setLineDash([]);
    drawSurveyStakes(centre, width, height, valid);
    ctx.font = `${Math.max(8, view.tileSize * 0.34)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = valid ? '#f2ead0' : '#ffd3c5';
    ctx.strokeStyle = '#101410';
    ctx.lineWidth = 2;
    const label = `${getStructureShortLabel(structureType)} ${valid ? 'site' : 'blocked'}`;
    ctx.strokeText(label, centre.x, centre.y + height * 0.54 + 3);
    ctx.fillText(label, centre.x, centre.y + height * 0.54 + 3);
    ctx.restore();
  }

  function isLegacyOutpostStructure(state, structure) {
    if (structure.type !== 'outpost') {
      return false;
    }
    const legacyOutpostId = structure.id?.startsWith('structure_')
      ? structure.id.slice('structure_'.length)
      : null;
    return Boolean(legacyOutpostId && state.game?.outposts?.some((outpost) => outpost.id === legacyOutpostId));
  }

  function drawStructureGlyph(structure) {
    const faction = FACTIONS[structure.factionId] ?? FACTIONS.neutral;
    const centre = tileCenter(structure.position?.x ?? structure.tile.x, structure.position?.y ?? structure.tile.y);
    const selected = currentRenderState?.game?.selectedEntityId === structure.id;
    const width = Math.max(view.tileSize * 0.55, view.tileSize * (structure.footprint?.width ?? 1));
    const height = Math.max(view.tileSize * 0.32, view.tileSize * (structure.footprint?.height ?? structure.footprint?.width ?? 1));
    const baseStroke = selected ? '#fff4b8' : faction.stroke;
    ctx.lineWidth = selected ? 2.2 : 1.4;
    if (structure.construction?.state !== 'complete') {
      drawConstructionStructure(structure, centre, width, height, baseStroke);
      return;
    }
    ctx.strokeStyle = baseStroke;
    ctx.fillStyle = getStructureFill(structure);
    ctx.globalAlpha = structure.construction?.state === 'complete' ? 0.88 : 0.42;

    if (structure.type === 'wall_segment') {
      drawStructureRect(centre, width, Math.max(4, height), 0.08);
    } else if (structure.type === 'gate') {
      drawStructureRect(centre, width, Math.max(5, height), 0.1);
      ctx.strokeStyle = structure.nav?.gateState === 'open' ? '#bde9c4' : '#f2c28b';
      ctx.beginPath();
      ctx.moveTo(centre.x - width * 0.18, centre.y);
      ctx.lineTo(centre.x + width * 0.18, centre.y);
      ctx.stroke();
    } else if (structure.type === 'trench_segment') {
      ctx.setLineDash([Math.max(3, view.tileSize * 0.22), Math.max(2, view.tileSize * 0.16)]);
      drawStructureRect(centre, width, Math.max(4, height), 0.12);
      ctx.setLineDash([]);
    } else if (structure.type === 'watchtower') {
      const radius = Math.max(5, view.tileSize * (structure.footprint?.radius ?? 0.55));
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - radius * 0.75);
      ctx.lineTo(centre.x, centre.y + radius * 0.75);
      ctx.moveTo(centre.x - radius * 0.75, centre.y);
      ctx.lineTo(centre.x + radius * 0.75, centre.y);
      ctx.stroke();
    } else if (structure.type === 'fort') {
      drawStructureRect(centre, width, height, 0.02);
      ctx.strokeRect(centre.x - width * 0.28, centre.y - height * 0.28, width * 0.56, height * 0.56);
    } else {
      const size = Math.max(view.tileSize * 0.95, width);
      ctx.strokeRect(centre.x - size * 0.56, centre.y - size * 0.56, size * 1.12, size * 1.12);
    }

    ctx.globalAlpha = 1;
    if (view.tileSize >= 12 && structure.type !== 'outpost') {
      drawStructureLabel(structure, centre);
    }
  }

  function drawConstructionStructure(structure, centre, width, height, baseStroke) {
    const progress = Math.max(0, Math.min(1, Number(structure.construction?.progress) || 0));
    ctx.save();
    ctx.strokeStyle = baseStroke;
    ctx.fillStyle = '#423b2b';
    ctx.globalAlpha = 0.36 + progress * 0.34;
    ctx.setLineDash([Math.max(4, view.tileSize * 0.28), Math.max(3, view.tileSize * 0.18)]);
    drawFootprintOutline(centre, width, height, structure.footprint?.shape ?? 'rect');
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.42 + progress * 0.3;
    ctx.fillStyle = structure.type === 'trench_segment' ? '#243329' : '#514936';
    drawFoundationFill(centre, width, height, progress, structure.footprint?.shape ?? 'rect');
    drawSurveyStakes(centre, width, height, true);
    drawScaffoldPosts(centre, width, height, progress);
    drawConstructionProgress(centre, width, height, progress);
    ctx.restore();
  }

  function drawFootprintOutline(centre, width, height, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(centre.x, centre.y, Math.max(width, height) / 2, 0, Math.PI * 2);
    } else {
      ctx.rect(centre.x - width / 2, centre.y - height / 2, width, height);
    }
    ctx.fill();
    ctx.stroke();
  }

  function drawFoundationFill(centre, width, height, progress, shape) {
    const fillHeight = Math.max(2, height * Math.max(0.16, progress));
    if (shape === 'circle') {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(width, height) * 0.38 * Math.max(0.55, progress), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.fillRect(centre.x - width * 0.42, centre.y + height * 0.42 - fillHeight, width * 0.84, fillHeight);
  }

  function drawSurveyStakes(centre, width, height, valid) {
    const stake = Math.max(3, view.tileSize * 0.18);
    const corners = [
      { x: centre.x - width / 2, y: centre.y - height / 2 },
      { x: centre.x + width / 2, y: centre.y - height / 2 },
      { x: centre.x + width / 2, y: centre.y + height / 2 },
      { x: centre.x - width / 2, y: centre.y + height / 2 }
    ];
    ctx.save();
    ctx.strokeStyle = valid ? '#d9c99b' : '#e7907c';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
    corners.forEach((corner) => {
      ctx.beginPath();
      ctx.moveTo(corner.x, corner.y - stake);
      ctx.lineTo(corner.x, corner.y + stake);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawScaffoldPosts(centre, width, height, progress) {
    if (progress < 0.28) {
      return;
    }
    const posts = progress > 0.68 ? 4 : 2;
    ctx.save();
    ctx.strokeStyle = '#c6b98d';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
    for (let index = 0; index < posts; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const lane = index < 2 ? -0.22 : 0.22;
      const x = centre.x + side * width * 0.36;
      const y = centre.y + lane * height;
      ctx.beginPath();
      ctx.moveTo(x, y + height * 0.24);
      ctx.lineTo(x, y - height * 0.24);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawConstructionProgress(centre, width, height, progress) {
    ctx.save();
    ctx.strokeStyle = '#efe2b5';
    ctx.lineWidth = Math.max(2, view.tileSize * 0.09);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, Math.max(width, height) * 0.56, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
    ctx.restore();
  }

  function getPreviewFootprint(type) {
    const footprint = getStructureDefinition(type)?.footprint;
    return footprint
      ? { shape: footprint.shape, width: footprint.width || footprint.radius * 2 || 1, height: footprint.height || footprint.radius * 2 || 1 }
      : { shape: 'rect', width: 1.2, height: 1.2 };
  }

  function drawStructureRect(centre, width, height, insetRatio) {
    const inset = Math.max(0, Math.min(width, height) * insetRatio);
    ctx.beginPath();
    ctx.rect(centre.x - width / 2 + inset, centre.y - height / 2 + inset, width - inset * 2, height - inset * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawStructureLabel(structure, centre) {
    const label = getStructureShortLabel(structure.type);
    ctx.save();
    ctx.font = `${Math.max(8, view.tileSize * 0.36)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4edd8';
    ctx.strokeStyle = '#121613';
    ctx.lineWidth = 2;
    ctx.strokeText(label, centre.x, centre.y);
    ctx.fillText(label, centre.x, centre.y);
    ctx.restore();
  }

  function getStructureFill(structure) {
    if (structure.type === 'trench_segment') return '#29362d';
    if (structure.type === 'wall_segment') return '#39413c';
    if (structure.type === 'gate') return '#4a4538';
    if (structure.type === 'watchtower') return '#24363c';
    if (structure.type === 'fort') return '#30352f';
    return '#20261f';
  }

  function getStructureShortLabel(type) {
    return {
      watchtower: 'WT',
      wall_segment: 'WL',
      gate: 'GT',
      trench_segment: 'TR',
      fort: 'FT'
    }[type] ?? 'ST';
  }

  function drawOutposts(state) {
    ctx.save();
    state.game?.outposts?.forEach((outpost) => {
      const faction = FACTIONS[outpost.factionId];
      const centre = tileCenter(outpost.tile.x, outpost.tile.y);
      const size = Math.max(11, view.tileSize * 0.78);
      ctx.fillStyle = '#20261f';
      ctx.strokeStyle = faction.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (outpost.contestable) {
        ctx.moveTo(centre.x, centre.y - size * 0.68);
        ctx.lineTo(centre.x + size * 0.68, centre.y);
        ctx.lineTo(centre.x, centre.y + size * 0.68);
        ctx.lineTo(centre.x - size * 0.68, centre.y);
        ctx.closePath();
      } else {
        ctx.rect(centre.x - size / 2, centre.y - size / 2, size, size);
      }
      ctx.fill();
      ctx.stroke();
      if (outpost.contestable) {
        drawOutpostContestMeter(outpost, centre, size);
      } else {
        ctx.fillStyle = faction.color;
        ctx.fillRect(centre.x - size * 0.18, centre.y - size * 0.5, size * 0.36, size * 0.28);
      }
    });
    ctx.restore();
  }

  function drawOutpostContestMeter(outpost, centre, size) {
    const playerShare = outpost.control?.player ?? 0.5;
    const barWidth = size * 1.15;
    const barHeight = Math.max(3, size * 0.16);
    const x = centre.x - barWidth / 2;
    const y = centre.y + size * 0.72;
    ctx.fillStyle = FACTIONS.enemy.color;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = FACTIONS.player.color;
    ctx.fillRect(x, y, barWidth * playerShare, barHeight);
    ctx.strokeStyle = '#101410';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);
    ctx.fillStyle = FACTIONS.neutral.color;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, Math.max(2.5, size * 0.14), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLeaders(state) {
    ctx.save();
    state.game?.leaders?.forEach((leader) => {
      const faction = FACTIONS[leader.factionId];
      const position = getEntityPosition(leader);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const radius = Math.max(3, view.tileSize * 0.17);
      const selected = state.game.selectedEntityId === leader.id;
      ctx.fillStyle = faction.color;
      ctx.strokeStyle = selected ? '#fff4b8' : '#101410';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = faction.stroke;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * 1.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawSquads(state) {
    ctx.save();
    (state.game?.squads ?? []).forEach((squad) => {
      const faction = FACTIONS[squad.factionId];
      const position = getEntityPosition(squad);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const selected = state.game.selectedEntityId === squad.id;
      const memberRadius = Math.max(2, view.tileSize * 0.095);
      ctx.strokeStyle = selected ? '#fff4b8' : '#101410';
      ctx.lineWidth = selected ? 1.8 : 1.1;
      (squad.members ?? []).forEach((member) => {
        const offset = member.offset ?? { x: 0, y: 0 };
        const memberCentre = tileCenter(position.x + offset.x, position.y + offset.y);
        ctx.fillStyle = faction.color;
        ctx.beginPath();
        ctx.arc(memberCentre.x, memberCentre.y, memberRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.globalAlpha = selected ? 0.82 : 0.42;
      ctx.strokeStyle = faction.stroke;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(5, view.tileSize * 0.34), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawBuilders(state) {
    ctx.save();
    (state.game?.builders ?? []).forEach((builder) => {
      const faction = FACTIONS[builder.factionId] ?? FACTIONS.player;
      const position = getEntityPosition(builder);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const size = Math.max(4, view.tileSize * 0.24);
      const selected = state.game.selectedEntityId === builder.id;
      ctx.fillStyle = builder.state === 'working' ? '#e9cf8f' : faction.color;
      ctx.strokeStyle = selected ? '#fff4b8' : '#101410';
      ctx.lineWidth = selected ? 2 : 1.2;
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - size);
      ctx.lineTo(centre.x + size, centre.y);
      ctx.lineTo(centre.x, centre.y + size);
      ctx.lineTo(centre.x - size, centre.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (builder.jobId) {
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#ead7a8';
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, size * 1.55, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function drawBrushPreview(state) {
    if (!state.hoverTile) {
      return;
    }
    const terrain = getTerrain(state.brush.terrainId);
    const isHeightBrush = state.brush.tool === 'height';
    const lowering = isHeightBrush && state.brush.heightDirection === 'lower';
    ctx.save();
    ctx.strokeStyle = isHeightBrush ? (lowering ? '#4d6472' : '#fff0b8') : terrain.stroke;
    ctx.fillStyle = isHeightBrush ? (lowering ? '#0d1519' : '#f2df9a') : terrain.color;
    ctx.globalAlpha = isHeightBrush ? 0.34 : 0.42;
    getBrushTiles(state.map, state.hoverTile.x, state.hoverTile.y, state.brush).forEach(({ x, y }) => {
      const sx = view.offsetX + x * view.tileSize;
      const sy = view.offsetY + y * view.tileSize;
      ctx.fillRect(sx, sy, view.tileSize - TILE_GAP, view.tileSize - TILE_GAP);
    });
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      view.offsetX + state.hoverTile.x * view.tileSize + 1,
      view.offsetY + state.hoverTile.y * view.tileSize + 1,
      view.tileSize - 3,
      view.tileSize - 3
    );
    if (isHeightBrush) {
      const centre = tileCenter(state.hoverTile.x, state.hoverTile.y);
      ctx.fillStyle = lowering ? '#cfe5ef' : '#2a2412';
      ctx.font = `${Math.max(10, view.tileSize * 0.7)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lowering ? '-' : '+', centre.x, centre.y - 1);
    }
    ctx.restore();
  }

  function drawSelection(state) {
    if (!state.selectedTile) {
      return;
    }
    ctx.save();
    ctx.strokeStyle = '#f1f3ec';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      view.offsetX + state.selectedTile.x * view.tileSize + 2,
      view.offsetY + state.selectedTile.y * view.tileSize + 2,
      view.tileSize - 5,
      view.tileSize - 5
    );
    ctx.restore();
  }

  function tileCenter(x, y) {
    return {
      x: view.offsetX + x * view.tileSize + view.tileSize / 2,
      y: view.offsetY + y * view.tileSize + view.tileSize / 2
    };
  }

  function isEntityInView(position, marginTiles = 1) {
    if (!position) {
      return false;
    }
    const margin = view.tileSize * marginTiles;
    const centre = tileCenter(position.x, position.y);
    return centre.x >= -margin
      && centre.y >= -margin
      && centre.x <= view.width + margin
      && centre.y <= view.height + margin;
  }

  function isPathInViewport(points = [], marginTiles = 1) {
    return points.some((point) => isEntityInView(point, marginTiles));
  }

  function getEntityPosition(entity) {
    const visualPosition = entity?.id ? currentRenderState?.renderMotion?.leaderPositions?.[entity.id] : null;
    if (visualPosition) {
      return visualPosition;
    }
    return entity.position ?? entity.tile;
  }

  function drawStablePath(points, options = {}) {
    const path = stabilizeRenderPath(points);
    if (path.length < 2) {
      return;
    }
    const curvedPath = options.smooth === 'catmull'
      ? catmullRomPath(path, options.samplesPerSegment ?? 6)
      : options.smooth === 'chaikin'
        ? chaikinPath(path, options.iterations ?? 2)
        : path;
    const screenPoints = curvedPath.map((point) => {
      const centre = tileCenter(point.x, point.y);
      return {
        x: snapPixel(centre.x),
        y: snapPixel(centre.y)
      };
    });
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    if (screenPoints.length <= 3) {
      for (let index = 1; index < screenPoints.length; index += 1) {
        ctx.lineTo(screenPoints[index].x, screenPoints[index].y);
      }
      ctx.stroke();
      return;
    }
    for (let index = 1; index < screenPoints.length; index += 1) {
      ctx.lineTo(screenPoints[index].x, screenPoints[index].y);
    }
    ctx.stroke();
  }

  function stabilizeRenderPath(points) {
    const deduped = [];
    points.forEach((point) => {
      const previous = deduped[deduped.length - 1];
      if (!previous || tileDistance(previous, point) >= 0.08) {
        deduped.push(point);
      }
    });
    if (deduped.length <= 2) {
      return deduped;
    }
    return deduped.map((point, index) => {
      if (index === 0 || index === deduped.length - 1) {
        return point;
      }
      const previous = deduped[index - 1];
      const next = deduped[index + 1];
      return {
        x: previous.x * 0.2 + point.x * 0.6 + next.x * 0.2,
        y: previous.y * 0.2 + point.y * 0.6 + next.y * 0.2,
        pressure: point.pressure
      };
    });
  }

  function catmullRomPath(points, samplesPerSegment) {
    if (points.length < 3) {
      return points;
    }
    const result = [points[0]];
    for (let index = 0; index < points.length - 1; index += 1) {
      const p0 = points[Math.max(0, index - 1)];
      const p1 = points[index];
      const p2 = points[index + 1];
      const p3 = points[Math.min(points.length - 1, index + 2)];
      for (let sample = 1; sample <= samplesPerSegment; sample += 1) {
        const t = sample / samplesPerSegment;
        result.push({
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
          pressure: lerp(p1.pressure ?? p2.pressure ?? 0, p2.pressure ?? p1.pressure ?? 0, t)
        });
      }
    }
    return result;
  }

  function chaikinPath(points, iterations) {
    if (points.length < 3 || iterations <= 0) {
      return points;
    }
    let result = points;
    for (let pass = 0; pass < iterations; pass += 1) {
      const next = [result[0]];
      for (let index = 0; index < result.length - 1; index += 1) {
        const start = result[index];
        const end = result[index + 1];
        next.push({
          x: start.x * 0.75 + end.x * 0.25,
          y: start.y * 0.75 + end.y * 0.25,
          pressure: lerp(start.pressure ?? end.pressure ?? 0, end.pressure ?? start.pressure ?? 0, 0.25)
        });
        next.push({
          x: start.x * 0.25 + end.x * 0.75,
          y: start.y * 0.25 + end.y * 0.75,
          pressure: lerp(start.pressure ?? end.pressure ?? 0, end.pressure ?? start.pressure ?? 0, 0.75)
        });
      }
      next.push(result[result.length - 1]);
      result = next;
    }
    return result;
  }

  function buildSegmentPaths(segments) {
    return segments.reduce((paths, segment) => {
      const start = { ...segment.start, pressure: segment.pressure };
      const end = { ...segment.end, pressure: segment.pressure };
      const previousPath = paths[paths.length - 1];
      if (previousPath && tileDistance(previousPath[previousPath.length - 1], start) <= 0.35) {
        previousPath.push(end);
      } else {
        paths.push([start, end]);
      }
      return paths;
    }, []);
  }

  function buildFieldContourSegments(field, isoValue) {
    if (!field?.values) {
      return [];
    }
    const segments = [];
    for (let y = 0; y < field.height - 1; y += 1) {
      for (let x = 0; x < field.width - 1; x += 1) {
        const corners = [
          { x, y, value: field.values[y][x] },
          { x: x + 1, y, value: field.values[y][x + 1] },
          { x: x + 1, y: y + 1, value: field.values[y + 1][x + 1] },
          { x, y: y + 1, value: field.values[y + 1][x] }
        ];
        const intersections = collectIsoIntersections(corners, isoValue);
        if (intersections.length < 2) {
          continue;
        }
        for (let index = 0; index < intersections.length - 1; index += 2) {
          segments.push({
            start: intersections[index],
            end: intersections[index + 1],
            pressure: isoValue
          });
        }
      }
    }
    return segments;
  }

  function buildFrontlineContourSegments(state) {
    const fields = state.game?.fields;
    if (!fields?.control?.values) {
      return [];
    }
    const field = fields.control;
    const segments = [];
    for (let y = 0; y < field.height - 1; y += 1) {
      for (let x = 0; x < field.width - 1; x += 1) {
        const corners = [
          createFrontlineRenderCorner(fields, x, y),
          createFrontlineRenderCorner(fields, x + 1, y),
          createFrontlineRenderCorner(fields, x + 1, y + 1),
          createFrontlineRenderCorner(fields, x, y + 1)
        ];
        const pressure = average(corners.map((corner) => corner.pressure));
        const mass = average(corners.map((corner) => corner.rawMass));
        if (mass < 0.035) {
          continue;
        }
        const intersections = collectIsoIntersections(corners, 0.5);
        for (let index = 0; index < intersections.length - 1; index += 2) {
          segments.push({
            start: intersections[index],
            end: intersections[index + 1],
            pressure: Math.max(pressure, mass * 0.35)
          });
        }
      }
    }
    return segments;
  }

  function createFrontlineRenderCorner(fields, x, y) {
    const rawPlayer = fields.playerCommandRaw?.values[y]?.[x] ?? fields.playerCommand?.values[y]?.[x] ?? 0;
    const rawEnemy = fields.enemyCommandRaw?.values[y]?.[x] ?? fields.enemyCommand?.values[y]?.[x] ?? 0;
    return {
      x,
      y,
      value: fields.control.values[y][x],
      pressure: fields.frontPressure?.values[y]?.[x] ?? 0,
      rawMass: rawPlayer + rawEnemy
    };
  }

  function collectIsoIntersections(corners, isoValue) {
    const edges = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[3]],
      [corners[3], corners[0]]
    ];
    const intersections = [];
    edges.forEach(([start, end]) => {
      const startDelta = start.value - isoValue;
      const endDelta = end.value - isoValue;
      if (startDelta === 0 && endDelta === 0) {
        return;
      }
      if (startDelta === 0) {
        intersections.push({ x: start.x, y: start.y });
        return;
      }
      if (endDelta === 0) {
        intersections.push({ x: end.x, y: end.y });
        return;
      }
      if (startDelta * endDelta > 0) {
        return;
      }
      const t = (isoValue - start.value) / (end.value - start.value);
      intersections.push({
        x: lerp(start.x, end.x, t),
        y: lerp(start.y, end.y, t)
      });
    });
    return dedupePoints(intersections);
  }

  function dedupePoints(points) {
    const seen = new Set();
    return points.filter((point) => {
      const key = `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function createCirclePath(position, radiusTiles) {
    const pointCount = 96;
    return Array.from({ length: pointCount + 1 }, (_, index) => {
      const angle = (index / pointCount) * Math.PI * 2;
      return {
        x: position.x + Math.cos(angle) * radiusTiles,
        y: position.y + Math.sin(angle) * radiusTiles
      };
    });
  }

  function getVisibleCommandContours(gameOverlay) {
    if (gameOverlay === 'playerCommand') {
      return [{ fieldId: 'playerCommand', factionId: 'player' }];
    }
    if (gameOverlay === 'enemyCommand') {
      return [{ fieldId: 'enemyCommand', factionId: 'enemy' }];
    }
    if (gameOverlay === 'control' || gameOverlay === 'influenceFrontline') {
      return [
        { fieldId: 'playerCommand', factionId: 'player' },
        { fieldId: 'enemyCommand', factionId: 'enemy' }
      ];
    }
    return [];
  }

  function snapPixel(value) {
    return Math.round(value * 2) / 2;
  }

  function tileDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function average(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function sampleGameField(game, fieldId, x, y) {
    const field = game?.fields?.[fieldId];
    if (!field) {
      return null;
    }
    return sampleScalarField(field, x, y);
  }

  function sampleWorldField(fields, fieldId, x, y) {
    const field = fields?.[fieldId];
    if (!field) {
      return null;
    }
    return sampleScalarField(field, x, y);
  }

  function sampleScalarField(field, x, y) {
    if (!field?.values) {
      return null;
    }
    const x0 = Math.max(0, Math.min(field.width - 1, Math.floor(x)));
    const y0 = Math.max(0, Math.min(field.height - 1, Math.floor(y)));
    const x1 = Math.max(0, Math.min(field.width - 1, x0 + 1));
    const y1 = Math.max(0, Math.min(field.height - 1, y0 + 1));
    const tx = Math.max(0, Math.min(1, x - x0));
    const ty = Math.max(0, Math.min(1, y - y0));
    const top = lerp(field.values[y0][x0], field.values[y0][x1], tx);
    const bottom = lerp(field.values[y1][x0], field.values[y1][x1], tx);
    return lerp(top, bottom, ty);
  }

  function sampleTerrainColor(map, x, y) {
    const samples = sampleTerrainMemberships(map, x, y);
    const elevation = sampleElevation(map, x, y);
    const normal = getNormalAt(map, x, y);

    if (currentRenderState?.activeField === 'normal') {
      return {
        r: (normal.x + 1) * 127.5,
        g: (normal.y + 1) * 127.5,
        b: (normal.z + 1) * 127.5
      };
    }
    if (currentRenderState?.activeField === 'displacement') {
      const val = Math.max(0, Math.min(255, elevation * 255));
      return { r: val, g: val, b: val };
    }

    let lightDir = { x: -0.577, y: -0.577, z: 0.577 };
    if (currentRenderState?.dynamicLighting) {
      const tick = currentRenderState.game?.tick ?? 0;
      const angle = tick * 0.04 - Math.PI / 4;
      lightDir = {
        x: Math.cos(angle) * 0.707,
        y: Math.sin(angle) * 0.707,
        z: 0.707
      };
    }

    const relief = (sampleElevation(map, x - 0.18, y - 0.18) - sampleElevation(map, x + 0.18, y + 0.18)) * 34;
    const mixed = samples.reduce((accumulator, sample) => {
      const color = terrainMaterialColor(sample.terrainId, x, y, elevation, relief, normal, lightDir);
      accumulator.r += color.r * sample.weight;
      accumulator.g += color.g * sample.weight;
      accumulator.b += color.b * sample.weight;
      accumulator.weight += sample.weight;
      return accumulator;
    }, { r: 0, g: 0, b: 0, weight: 0 });

    return {
      r: mixed.r / mixed.weight,
      g: mixed.g / mixed.weight,
      b: mixed.b / mixed.weight
    };
  }

  function getGameOverlaySampleColor(state, x, y) {
    if (state.gameOverlay === 'control') {
      const value = sampleGameField(state.game, 'control', x, y) ?? 0.5;
      const lean = Math.abs(value - 0.5) * 2;
      if (lean < 0.04) {
        return null;
      }
      return value >= 0.5
        ? `rgba(84, 157, 244, ${0.07 + lean * 0.28})`
        : `rgba(234, 101, 82, ${0.07 + lean * 0.28})`;
    }

    const value = sampleGameField(state.game, state.gameOverlay, x, y) ?? 0;
    if (value <= 0.015) {
      return null;
    }
    if (state.gameOverlay === 'playerCommand') {
      return `rgba(84, 157, 244, ${0.07 + value * 0.36})`;
    }
    if (state.gameOverlay === 'enemyCommand') {
      return `rgba(234, 101, 82, ${0.07 + value * 0.36})`;
    }
    if (state.gameOverlay === 'playerLoS') {
      return `rgba(118, 198, 143, ${0.05 + value * 0.28})`;
    }
    if (state.gameOverlay === 'enemyLoS') {
      return `rgba(229, 127, 92, ${0.05 + value * 0.28})`;
    }
    return `rgba(229, 195, 93, ${0.05 + value * 0.5})`;
  }

  function getOverlaySubSteps() {
    return Math.max(2, Math.min(5, renderScale + (view.tileSize >= 16 ? 1 : 0)));
  }

  function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return 0.5 * (
      2 * p1
      + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  function sampleTerrainMemberships(map, x, y) {
    const sampleX = Math.max(0, Math.min(map.width - 1, x - 0.5));
    const sampleY = Math.max(0, Math.min(map.height - 1, y - 0.5));
    const x0 = Math.floor(sampleX);
    const y0 = Math.floor(sampleY);
    const x1 = Math.min(map.width - 1, x0 + 1);
    const y1 = Math.min(map.height - 1, y0 + 1);
    const tx = smoothstep(0, 1, sampleX - x0);
    const ty = smoothstep(0, 1, sampleY - y0);
    const rawWeights = [
      { terrainId: getTile(map, x0, y0), weight: (1 - tx) * (1 - ty) },
      { terrainId: getTile(map, x1, y0), weight: tx * (1 - ty) },
      { terrainId: getTile(map, x0, y1), weight: (1 - tx) * ty },
      { terrainId: getTile(map, x1, y1), weight: tx * ty }
    ].reduce((weights, sample) => {
      weights.set(sample.terrainId, (weights.get(sample.terrainId) ?? 0) + sample.weight);
      return weights;
    }, new Map());

    const sharpened = [...rawWeights.entries()].map(([terrainId, weight]) => ({
      terrainId,
      weight: Math.pow(weight, TERRAIN_MASK_SHARPNESS)
    })).filter((sample) => sample.weight > 0.0001);
    const total = sharpened.reduce((sum, sample) => sum + sample.weight, 0) || 1;
    return sharpened.map((sample) => ({
      terrainId: sample.terrainId,
      weight: sample.weight / total
    }));
  }

  function fastGetElevation(map, x, y) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
      return 0;
    }
    return map.elevation?.[y]?.[x] ?? 0;
  }

  function getNormalAt(map, x, y) {
    const step = 0.1;
    const hL = sampleElevation(map, x - step, y);
    const hR = sampleElevation(map, x + step, y);
    const hT = sampleElevation(map, x, y - step);
    const hB = sampleElevation(map, x, y + step);
    
    const strength = 6.0;
    const nx = (hL - hR) * strength;
    const ny = (hT - hB) * strength;
    const nz = 1.0;
    
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function terrainMaterialColor(terrainId, x, y, elevation, relief, normal, lightDir) {
    const base = parseHexColor(getTerrain(terrainId).color);
    const coarse = valueNoise(x, y, 0.95, terrainSeed(terrainId));
    const fine = valueNoise(x, y, 3.4, terrainSeed(terrainId) + 19);
    const grain = terrainDither(Math.floor(x * 17), Math.floor(y * 17));
    
    let heightShade = (elevation - 0.34) * 18;
    if (normal && lightDir) {
      const dot = normal.x * lightDir.x + normal.y * lightDir.y + normal.z * lightDir.z;
      heightShade += (dot - 0.45) * 38;
    } else {
      heightShade += relief;
    }

    if (terrainId === 'forest') {
      const canopy = (coarse - 0.5) * 24 + (fine - 0.5) * 16;
      return shiftColor(base, -10 + canopy * 0.2 + heightShade * 0.35, canopy * 0.55 + heightShade * 0.45, -8 + canopy * 0.14 + heightShade * 0.25);
    }
    if (terrainId === 'river') {
      const ripple = Math.sin((x * 1.7 + y * 0.42) * Math.PI * 1.9) * 5 + (fine - 0.5) * 10;
      return shiftColor(base, -5 + ripple * 0.2 + heightShade * 0.12, 2 + ripple * 0.35 + heightShade * 0.16, 8 + ripple * 0.72 + heightShade * 0.22);
    }
    if (terrainId === 'sea') {
      const swell = Math.sin((x * 0.62 + y * 0.18) * Math.PI * 2.1) * 4 + (coarse - 0.5) * 14;
      return shiftColor(base, -8 + swell * 0.12, -2 + swell * 0.28, 10 + swell * 0.62);
    }
    if (terrainId === 'mountains') {
      const ridge = Math.abs(Math.sin((x * 0.88 - y * 0.64) * Math.PI * 2.4));
      const shade = (ridge - 0.5) * 26 + (fine - 0.5) * 12;
      return shiftColor(base, shade + heightShade * 0.75, shade + heightShade * 0.75, shade * 0.86 + heightShade * 0.62);
    }
    const meadow = (coarse - 0.5) * 14 + (fine - 0.5) * 7 + grain * 5;
    return shiftColor(base, meadow * 0.38 + heightShade * 0.45, meadow * 0.72 + heightShade * 0.56, meadow * 0.24 + heightShade * 0.28);
  }

  function sampleElevation(map, x, y) {
    const sampleX = Math.max(0, Math.min(map.width - 1, x - 0.5));
    const sampleY = Math.max(0, Math.min(map.height - 1, y - 0.5));
    const x0 = Math.floor(sampleX);
    const y0 = Math.floor(sampleY);
    const x1 = Math.min(map.width - 1, x0 + 1);
    const y1 = Math.min(map.height - 1, y0 + 1);
    const tx = smoothstep(0, 1, sampleX - x0);
    const ty = smoothstep(0, 1, sampleY - y0);
    const top = lerp(fastGetElevation(map, x0, y0), fastGetElevation(map, x1, y0), tx);
    const bottom = lerp(fastGetElevation(map, x0, y1), fastGetElevation(map, x1, y1), tx);
    return lerp(top, bottom, ty);
  }

  function parseHexColor(hex) {
    const normalized = String(hex).replace('#', '');
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16)
    };
  }

  function shiftColor(color, r, g, b) {
    return {
      r: clampColorChannel(color.r + r),
      g: clampColorChannel(color.g + g),
      b: clampColorChannel(color.b + b)
    };
  }

  function valueNoise(x, y, frequency, seed) {
    const sx = x * frequency;
    const sy = y * frequency;
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const tx = smoothstep(0, 1, sx - x0);
    const ty = smoothstep(0, 1, sy - y0);
    const top = lerp(hashNoise(x0, y0, seed), hashNoise(x0 + 1, y0, seed), tx);
    const bottom = lerp(hashNoise(x0, y0 + 1, seed), hashNoise(x0 + 1, y0 + 1, seed), tx);
    return lerp(top, bottom, ty);
  }

  function hashNoise(x, y, seed) {
    const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return value - Math.floor(value);
  }

  function terrainSeed(terrainId) {
    return String(terrainId).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  }

  function clampColorChannel(value) {
    return Math.max(0, Math.min(255, value));
  }

  function terrainDither(x, y) {
    return (((x * 13 + y * 17) % 7) / 6) - 0.5;
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function getTerrainBufferSignature(state, bufferTileSize, bufferWidth, bufferHeight) {
    return [
      state.activeField,
      state.dynamicLighting ? 'dynamic' : 'flat',
      renderScale,
      bufferTileSize,
      bufferWidth,
      bufferHeight,
      state.map.revision ?? 0
    ].join(':');
  }

  function shouldDrawTacticalLayer(state) {
    return Boolean(state.game && (state.gameOverlay !== 'none' || state.showCommandRadii));
  }

  function getTacticalLayerSignature(state) {
    const game = state.game;
    const tacticalStateSignature = state.gameOverlay === 'none'
      ? 'hidden'
      : [
        game?.tick ?? 0,
        game?.leaders?.map((leader) => `${leader.id}:${leader.position?.x ?? leader.tile?.x}:${leader.position?.y ?? leader.tile?.y}:${leader.movement?.status ?? ''}`).join('|') ?? '',
        game?.squads?.map((squad) => `${squad.id}:${squad.position?.x ?? squad.tile?.x}:${squad.position?.y ?? squad.tile?.y}:${squad.movement?.status ?? ''}`).join('|') ?? '',
        game?.outposts?.map((outpost) => `${outpost.id}:${outpost.status}:${outpost.control?.player ?? 0}`).join('|') ?? ''
      ].join('/');
    return [
      state.gameOverlay,
      state.showCommandRadii ? 'radii' : 'no-radii',
      tacticalStateSignature,
      view.width,
      view.height,
      view.tileSize,
      view.offsetX,
      view.offsetY
    ].join(':');
  }

  function screenToTile(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - view.offsetX) / view.tileSize);
    const y = Math.floor((clientY - rect.top - view.offsetY) / view.tileSize);
    return { x, y };
  }

  return {
    render,
    screenToTile,
    getStats: () => ({ ...stats }),
    getView: () => ({
      ...view,
      renderScale,
      visualTileResolution: renderScale,
      terrainBufferElement: terrainBuffer
    })
  };
}

function normaliseRenderScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RENDER_SCALE;
  }
  return Math.max(MIN_RENDER_SCALE, Math.min(MAX_RENDER_SCALE, Math.round(numeric)));
}
