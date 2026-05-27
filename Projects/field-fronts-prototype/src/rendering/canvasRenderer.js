import { FIELD_OVERLAYS, getTerrain } from '../config/terrain.js';
import { shouldShowGameDebugVisuals, shouldShowMapAuthoringVisuals } from '../core/appModes.js';
import { getBrushTiles } from '../editor/brush.js';
import { FACTIONS, getSelectedGameEntity } from '../game/gameModel.js';
import { commandFeedbackTone } from '../game/commandWheel.js';
import { getWeatherRenderSettings } from '../game/playtestStabilization.js';
import { getSceneEntity, getScenePresentation } from '../world/sceneEntity.js';
import { collectCorpseStacks } from '../game/corpseSystem.js';
import { getStructureDefinition } from '../game/structureRegistry.js';
import { canStructuresJoin, directionFromTo, getStructureJoinProfile } from '../game/structureJoinery.js';
import { getElevation, getTile } from '../world/mapModel.js';
import { buildLandWaterContourProjection } from './marchingSquares.js';
import { generateForkBoltGeometry, selectLightningEvents, sampleWeatherVisualCell, selectStormRenderCells } from './weatherVisuals.js';

const TILE_GAP = 1;
const DEFAULT_RENDER_SCALE = 2;
const MIN_RENDER_SCALE = 1;
const MAX_RENDER_SCALE = 4;
const CAMERA_LERP_STIFFNESS = 9.5;
const CAMERA_LERP_MAX_DELTA_MS = 80;
const CAMERA_LERP_SNAP_DISTANCE_PX = 520;
const BASE_TERRAIN_PIXELS_PER_TILE = 4;
const MAX_TERRAIN_BUFFER_SIZE = 4096;
const TERRAIN_MASK_SHARPNESS = 4.2;
const MAP_MAKER_MARCHING_SQUARES_ENABLED = true;
const MAP_MAKER_MARCHING_SQUARES_DEBUG_RAW = false;

export function createCanvasRenderer(canvas, options = {}) {
  let ctx = canvas.getContext('2d');
  const renderScale = normaliseRenderScale(options.renderScale ?? options.visualTileResolution ?? DEFAULT_RENDER_SCALE);
  const terrainBuffer = document.createElement('canvas');
  const terrainCtx = terrainBuffer.getContext('2d');
  const tacticalBuffer = document.createElement('canvas');
  const tacticalCtx = tacticalBuffer.getContext('2d');
  let terrainBufferSignature = null;
  let terrainContourSignature = null;
  let terrainContourProjection = null;
  let tacticalBufferSignature = null;
  let currentRenderState = null;
  const stats = {
    renderCount: 0,
    tacticalLayerBuilds: 0,
    tacticalLayerHits: 0,
    entityCullSkips: 0,
    structureCullSkips: 0,
    intentCullSkips: 0,
    terrainDetailDraws: 0,
    terrainDetailCullSkips: 0,
    authoredDetailCullSkips: 0
  };
  const view = {
    dpr: 1,
    width: 0,
    height: 0,
    tileSize: 18,
    offsetX: 0,
    offsetY: 0,
    targetOffsetX: 0,
    targetOffsetY: 0,
    cameraMode: 'full_scene',
    cameraTarget: null,
    commanderAnchor: null,
    commandRadiusTiles: null,
    detailRadiusTiles: null,
    farDetailRadiusTiles: null,
    fogOfWarMode: 'none',
    followStrength: 0.08,
    cameraInitialised: false,
    cameraNeedsSnap: true,
    cameraLastUpdateAt: 0
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
      view.cameraNeedsSnap = true;
    }
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function fitToMap(state) {
    const map = state.map;
    const safe = getViewportSafeArea(state);
    const availableW = Math.max(1, view.width - safe.left - safe.right);
    const availableH = Math.max(1, view.height - safe.top - safe.bottom);
    const baseTileSize = Math.max(8, Math.floor(Math.min(availableW / map.width, availableH / map.height)));
    const rig = getActiveScenarioCameraRig(state);
    const anchor = resolveScenarioCameraTarget(state, rig);
    const target = resolveScenarioCameraLookTarget(state, rig, anchor);
    const zoom = rig.mode === 'full_scene' ? 1 : clampNumber(rig.zoom, 1, 1, 4);
    const nextTileSize = Math.max(8, Math.floor(baseTileSize * zoom));

    if (!target || rig.mode === 'full_scene') {
      const nextOffsetX = Math.floor(safe.left + (availableW - map.width * nextTileSize) / 2);
      const nextOffsetY = Math.floor(safe.top + (availableH - map.height * nextTileSize) / 2);
      applyCameraViewport({
        tileSize: nextTileSize,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        cameraMode: 'full_scene',
        cameraTarget: null,
        commanderAnchor: null,
        commandRadiusTiles: null,
        detailRadiusTiles: null,
        farDetailRadiusTiles: null,
        fogOfWarMode: 'none',
        followStrength: rig.followStrength,
        lerp: false
      });
      return;
    }

    const targetX = (target.x + 0.5) * nextTileSize;
    const targetY = (target.y + 0.5) * nextTileSize;
    const mapPixelW = map.width * nextTileSize;
    const mapPixelH = map.height * nextTileSize;
    const centredX = safe.left + availableW / 2 - targetX;
    const centredY = safe.top + availableH / 2 - targetY;
    const nextOffsetX = clampViewportOffset(centredX, safe.left, availableW, mapPixelW);
    const nextOffsetY = clampViewportOffset(centredY, safe.top, availableH, mapPixelH);

    applyCameraViewport({
      tileSize: nextTileSize,
      offsetX: nextOffsetX,
      offsetY: nextOffsetY,
      cameraMode: rig.mode,
      cameraTarget: target,
      commanderAnchor: rig.mode === 'commander_follow_tactical_leash' ? anchor : null,
      commandRadiusTiles: rig.commandRadiusTiles,
      detailRadiusTiles: rig.detailRadiusTiles,
      farDetailRadiusTiles: rig.farDetailRadiusTiles,
      fogOfWarMode: rig.fogOfWarMode,
      followStrength: rig.followStrength,
      lerp: rig.mode === 'commander' || rig.mode === 'commander_follow_tactical_leash' || rig.mode === 'selected_unit'
    });
  }

  function applyCameraViewport(next) {
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
    const previousMode = view.cameraMode;
    const previousTileSize = view.tileSize;
    const previousOffsetX = Number(view.offsetX) || 0;
    const previousOffsetY = Number(view.offsetY) || 0;
    const desiredOffsetX = Number(next.offsetX) || 0;
    const desiredOffsetY = Number(next.offsetY) || 0;
    const distancePx = Math.hypot(desiredOffsetX - previousOffsetX, desiredOffsetY - previousOffsetY);
    const modeChanged = previousMode !== next.cameraMode;
    const tileSizeChanged = Math.abs((Number(next.tileSize) || previousTileSize) - previousTileSize) > 0.01;
    const shouldSnap = !next.lerp
      || !view.cameraInitialised
      || view.cameraNeedsSnap
      || modeChanged
      || tileSizeChanged
      || distancePx > CAMERA_LERP_SNAP_DISTANCE_PX;

    view.tileSize = next.tileSize;
    view.targetOffsetX = desiredOffsetX;
    view.targetOffsetY = desiredOffsetY;
    view.cameraMode = next.cameraMode;
    view.cameraTarget = next.cameraTarget;
    view.commanderAnchor = next.commanderAnchor;
    view.commandRadiusTiles = next.commandRadiusTiles;
    view.detailRadiusTiles = next.detailRadiusTiles;
    view.farDetailRadiusTiles = next.farDetailRadiusTiles;
    view.fogOfWarMode = next.fogOfWarMode;
    view.followStrength = next.followStrength;

    if (shouldSnap) {
      view.offsetX = Math.round(desiredOffsetX * 1000) / 1000;
      view.offsetY = Math.round(desiredOffsetY * 1000) / 1000;
      view.cameraInitialised = true;
      view.cameraNeedsSnap = false;
      view.cameraLastUpdateAt = now;
      return;
    }

    const deltaMs = Math.min(
      CAMERA_LERP_MAX_DELTA_MS,
      Math.max(0, now - (view.cameraLastUpdateAt || now))
    );
    const stiffness = clampNumber((next.followStrength ?? view.followStrength) * 120, CAMERA_LERP_STIFFNESS, 2, 18);
    const alpha = 1 - Math.exp(-stiffness * (deltaMs / 1000));
    view.offsetX = lerp(previousOffsetX, desiredOffsetX, alpha);
    view.offsetY = lerp(previousOffsetY, desiredOffsetY, alpha);
    view.cameraLastUpdateAt = now;
  }


  function getActiveScenarioCameraRig(state) {
    const layerRig = state?.map?.scenario?.scenarioLayer?.cameraRig;
    const rig = state?.scenarioCamera ?? layerRig ?? {};
    const mode = typeof rig.mode === 'string'
      ? rig.mode
      : 'full_scene';
    return {
      mode: ['full_scene', 'commander', 'commander_follow_tactical_leash', 'selected_unit', 'selected_point'].includes(mode) ? mode : 'full_scene',
      zoom: clampNumber(rig.zoom, 1, 1, 4),
      point: normaliseCameraTile(rig.point),
      followStrength: clampNumber(rig.followStrength, 0.08, 0.02, 0.18),
      softLeashStartTiles: clampNumber(rig.softLeashStartTiles, 7, 2, 24),
      maxPanDistanceTiles: clampNumber(rig.maxPanDistanceTiles, 12, 3, 36),
      commandRadiusTiles: clampNumber(rig.commandRadiusTiles, 12, 3, 40),
      detailRadiusTiles: clampNumber(rig.detailRadiusTiles, 18, 4, 48),
      farDetailRadiusTiles: clampNumber(rig.farDetailRadiusTiles, 28, 6, 72),
      fogOfWarMode: typeof rig.fogOfWarMode === 'string' ? rig.fogOfWarMode : 'none'
    };
  }

  function resolveScenarioCameraTarget(state, rig) {
    if (!state?.map || !rig || rig.mode === 'full_scene') {
      return null;
    }
    if (rig.mode === 'commander' || rig.mode === 'commander_follow_tactical_leash') {
      const commander = state.game?.leaders?.find((leader) => leader.id === 'leader_player_01')
        ?? state.game?.leaders?.find((leader) => leader.factionId === 'player');
      return normaliseCameraTile(getVisualEntityPosition(state, commander));
    }
    if (rig.mode === 'selected_unit') {
      const selected = getSelectedGameEntity(state.game);
      return normaliseCameraTile(getVisualEntityPosition(state, selected));
    }
    if (rig.mode === 'selected_point') {
      return normaliseCameraTile(rig.point)
        ?? normaliseCameraTile(state.selectedTile)
        ?? normaliseCameraTile(state.hoverTile)
        ?? normaliseCameraTile(state.map?.scenario?.scenarioLayer?.storyBeats?.[0]?.tile);
    }
    return null;
  }

  function resolveScenarioCameraLookTarget(state, rig, anchor) {
    if (!anchor || rig.mode !== 'commander_follow_tactical_leash') {
      return anchor;
    }
    const requestedPan = state?.tacticalCameraPan;
    if (!Number.isFinite(Number(requestedPan?.x)) || !Number.isFinite(Number(requestedPan?.y))) {
      return anchor;
    }
    const distance = Math.hypot(Number(requestedPan.x), Number(requestedPan.y));
    const softStart = Math.min(rig.softLeashStartTiles, rig.maxPanDistanceTiles);
    const maxPan = Math.max(rig.softLeashStartTiles, rig.maxPanDistanceTiles);
    const clampedDistance = Math.min(distance, maxPan);
    const easedDistance = clampedDistance <= softStart
      ? clampedDistance
      : softStart + (clampedDistance - softStart) * 0.58;
    const scale = distance > 0 ? easedDistance / distance : 0;
    return {
      x: anchor.x + Number(requestedPan.x) * scale,
      y: anchor.y + Number(requestedPan.y) * scale
    };
  }

  function getVisualEntityPosition(state, entity) {
    if (!entity) {
      return null;
    }
    return entity.id && state?.renderMotion?.leaderPositions?.[entity.id]
      ? state.renderMotion.leaderPositions[entity.id]
      : entity.position ?? entity.tile;
  }

  function normaliseCameraTile(tile) {
    if (!Number.isFinite(Number(tile?.x)) || !Number.isFinite(Number(tile?.y))) {
      return null;
    }
    return { x: Number(tile.x), y: Number(tile.y) };
  }

  function clampViewportOffset(offset, safeStart, available, mapPixels) {
    if (mapPixels <= available) {
      return Math.floor(safeStart + (available - mapPixels) / 2);
    }
    const minOffset = Math.floor(safeStart + available - mapPixels);
    const maxOffset = Math.floor(safeStart);
    return Math.max(minOffset, Math.min(maxOffset, offset));
  }

  function getViewportSafeArea(state) {
    const requested = state?.uiViewportSafeArea ?? {};
    const maxTop = Math.floor(view.height * 0.28);
    const maxBottom = Math.floor(view.height * 0.42);
    const top = clampNumber(requested.top, 20, 0, maxTop);
    const bottom = clampNumber(requested.bottom, 28, 0, maxBottom);
    const left = clampNumber(requested.left, 20, 0, Math.floor(view.width * 0.18));
    const right = clampNumber(requested.right, 20, 0, Math.floor(view.width * 0.18));

    // Keep the map usable on awkward laptop/browser sizes instead of letting
    // HUD reservations squeeze it into oblivion.
    const minContentHeight = Math.max(260, Math.floor(view.height * 0.42));
    if (view.height - top - bottom < minContentHeight) {
      return {
        top: Math.min(top, 52),
        bottom: Math.max(28, view.height - minContentHeight - Math.min(top, 52)),
        left,
        right
      };
    }

    return { top, bottom, left, right };
  }

  function render(state) {
    stats.renderCount += 1;
    currentRenderState = state;
    resize();
    fitToMap(state);
    ctx.clearRect(0, 0, view.width, view.height);
    const shakeOffset = getScenarioCameraShakeOffset(state);
    ctx.save();
    if (shakeOffset.active) {
      ctx.translate(shakeOffset.x, shakeOffset.y);
    }
    drawBackdrop();
    drawMap(state);
    drawMapMakerTerrainContours(state);
    drawCachedTacticalLayer(state);
    drawWeatherStormOverlay(state);
    drawBattlefieldTrace(state);
    drawPhysicalCoverObjects(state);
    drawNoisePings(state);
    drawMovementIntents(state);
    drawIntentPreview(state);
    drawCommandFeedback(state);
    drawPlacementPreview(state);
    drawStructures(state);
    drawOutposts(state);
    drawTimeOfDayOverlay(state);
    drawFieldOfViewCones(state);
    drawSquads(state);
    drawBuilders(state);
    drawResourceWorkers(state);
    drawSupplyTransports(state);
    drawProjectiles(state);
    drawLeaders(state);
    drawScenarioLayer(state);
    drawMouseObserver(state);
    if (state.mode === 'edit') {
      drawBrushPreview(state);
    }
    drawSelection(state);
    ctx.restore();
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

  function getScenarioCameraShakeOffset(state) {
    const shake = state?.scenarioCameraShake;
    if (!shake?.active || !Number.isFinite(Number(shake.until))) {
      return { active: false, x: 0, y: 0 };
    }
    const now = performance.now();
    if (now > shake.until) {
      return { active: false, x: 0, y: 0 };
    }
    const duration = Math.max(1, Number(shake.durationMs) || 1);
    const elapsed = Math.max(0, now - (Number(shake.startedAt) || now));
    const decay = Math.max(0, 1 - elapsed / duration);
    const strength = Math.max(0, Number(shake.strengthPx) || 0) * decay;
    const seed = (Number(shake.startedAt) || 1) * 0.017 + elapsed * 0.11;
    return {
      active: strength > 0.05,
      x: Math.sin(seed * 2.31) * strength,
      y: Math.cos(seed * 2.87) * strength * 0.72
    };
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

    const bounds = getVisibleTileBounds(state.map, 1);
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (!shouldRenderWorldDetailAt({ x, y })) {
          stats.terrainDetailCullSkips += 1;
          continue;
        }
        const terrain = getTerrain(getTile(state.map, x, y));
        const sx = view.offsetX + x * view.tileSize;
        const sy = view.offsetY + y * view.tileSize;
        drawTerrainMark(terrain.id, sx, sy, view.tileSize);
        stats.terrainDetailDraws += 1;
      }
    }
  }

  function drawBattlefieldTrace(state) {
    const trace = state.game?.battlefieldTrace;
    if (!trace) {
      return;
    }
    ctx.save();
    drawChurnedGround(trace.churn ?? []);
    drawBloodMarks(trace.bloodMarks ?? [], state.game?.tick ?? 0);
    drawFootprints(trace.footprints ?? []);
    ctx.restore();
  }

  function drawChurnedGround(churnTiles) {
    churnTiles.forEach((churn) => {
      if (!isEntityInView(churn.tile, 2)) return;
      const intensity = clampNumber(churn.intensity, 0, 0, 1);
      if (intensity < 0.035) return;
      const centre = tileCenter(churn.tile.x, churn.tile.y);
      const size = view.tileSize * (0.27 + intensity * 0.12);
      const mudAlpha = 0.035 + intensity * 0.13;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = mudAlpha;
      ctx.fillStyle = intensity > 0.27 ? '#463a2c' : '#5b4c3b';
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, size * (1 + churn.seed * 0.18), size * (0.72 + churn.seed * 0.14), churn.seed * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = mudAlpha * 0.3;
      ctx.fillStyle = '#2c251d';
      for (let index = 0; index < 2; index += 1) {
        const phase = (churn.seed * 17 + index * 2.41) % (Math.PI * 2);
        ctx.beginPath();
        ctx.arc(
          centre.x + Math.cos(phase) * size * 0.45,
          centre.y + Math.sin(phase) * size * 0.34,
          Math.max(0.65, view.tileSize * (0.018 + intensity * 0.026)),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    });
    ctx.globalAlpha = 1;
  }

  function drawBloodMarks(bloodMarks, tick) {
    bloodMarks.filter((mark) => mark.kind === 'pool').forEach((mark) => drawBloodPool(mark, tick));
    bloodMarks.filter((mark) => mark.kind !== 'pool').forEach((mark) => drawBloodSpatter(mark, tick));
    ctx.globalAlpha = 1;
  }

  function drawBloodPool(mark, tick) {
    if (!isEntityInView(mark.position, 2)) return;
    const centre = tileCenter(mark.position.x, mark.position.y);
    const age = Math.max(0, tick - mark.tick);
    const settled = Math.min(1, age / 5);
    const radius = view.tileSize * mark.radius * (0.68 + settled * 0.34);
    const opacity = (0.38 + mark.strength * 0.3) * (age > 240 ? 0.76 : 1);
    const gradient = ctx.createRadialGradient(centre.x, centre.y, radius * 0.08, centre.x, centre.y, radius);
    gradient.addColorStop(0, `rgba(43, 8, 9, ${opacity})`);
    gradient.addColorStop(0.72, `rgba(76, 12, 14, ${opacity * 0.84})`);
    gradient.addColorStop(1, 'rgba(50, 11, 10, 0)');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius * 1.16, radius * 0.83, mark.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(58, 9, 12, ${opacity * 0.55})`;
    for (let index = 0; index < 4; index += 1) {
      const phase = mark.angle + index * 1.56 + mark.seed;
      const lobeRadius = radius * (0.17 + ((mark.seed * 11 + index) % 1) * 0.17);
      ctx.beginPath();
      ctx.arc(centre.x + Math.cos(phase) * radius * 0.77, centre.y + Math.sin(phase) * radius * 0.5, lobeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBloodSpatter(mark, tick) {
    if (!isEntityInView(mark.position, 2)) return;
    const centre = tileCenter(mark.position.x, mark.position.y);
    const ageFade = Math.max(0.54, 1 - Math.max(0, tick - mark.tick) / 320);
    const radius = view.tileSize * mark.radius;
    const opacity = (0.3 + mark.strength * 0.3) * ageFade;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(103, 15, 17, ${opacity})`;
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius * 0.92, radius * 0.63, mark.angle, 0, Math.PI * 2);
    ctx.fill();
    for (let index = 1; index <= 3; index += 1) {
      const sprayDistance = radius * (1.2 + index * 0.7);
      const sprayAngle = mark.angle + (index % 2 ? -1 : 1) * (0.14 + mark.seed * 0.22);
      ctx.globalAlpha = Math.max(0.24, 0.72 - index * 0.13);
      ctx.beginPath();
      ctx.arc(
        centre.x + Math.cos(sprayAngle) * sprayDistance,
        centre.y + Math.sin(sprayAngle) * sprayDistance,
        Math.max(0.75, radius * (0.42 - index * 0.08)),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawFootprints(footprints) {
    ctx.globalCompositeOperation = 'multiply';
    footprints.forEach((footprint) => {
      if (!isEntityInView(footprint.position, 1.5)) return;
      const strength = footprint.strength;
      const centre = tileCenter(footprint.position.x, footprint.position.y);
      const size = view.tileSize * footprint.size;
      ctx.globalAlpha = 0.16 + strength * 0.22;
      ctx.fillStyle = '#62472c';
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.rotate(footprint.angle);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.56, size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 0.78;
      ctx.beginPath();
      ctx.ellipse(size * 0.13, -size * 0.74, size * 0.38, size * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }


  function drawMapMakerTerrainContours(state) {
    if (!MAP_MAKER_MARCHING_SQUARES_ENABLED || !shouldShowMapAuthoringVisuals(state)) {
      return;
    }
    const projection = getTerrainContourProjection(state);
    if (!projection || projection.segmentCount === 0) {
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'source-over';

    const paths = projection.smoothedPaths.length > 0 ? projection.smoothedPaths : projection.paths;
    ctx.strokeStyle = 'rgba(20, 38, 35, 0.46)';
    ctx.lineWidth = Math.max(3, view.tileSize * 0.22);
    paths.forEach((path) => drawMapContourPath(path));

    ctx.strokeStyle = 'rgba(212, 205, 154, 0.62)';
    ctx.lineWidth = Math.max(1.4, view.tileSize * 0.08);
    paths.forEach((path) => drawMapContourPath(path));

    ctx.strokeStyle = 'rgba(255, 246, 190, 0.42)';
    ctx.lineWidth = Math.max(0.9, view.tileSize * 0.035);
    paths.forEach((path) => drawMapContourPath(path));

    if (MAP_MAKER_MARCHING_SQUARES_DEBUG_RAW || state.showRawMarchingSquares) {
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = 'rgba(255, 244, 166, 0.88)';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.035);
      projection.segments.forEach((segment) => drawMapContourPath([segment.start, segment.end]));
    }
    ctx.restore();
  }

  function getTerrainContourProjection(state) {
    const map = state.map;
    const signature = `${map?.width ?? 0}:${map?.height ?? 0}:${map?.revision ?? 0}`;
    if (terrainContourSignature !== signature) {
      terrainContourProjection = buildLandWaterContourProjection(map, { smoothIterations: 2 });
      terrainContourSignature = signature;
    }
    return terrainContourProjection;
  }

  function drawMapContourPath(path) {
    if (!path || path.length < 2) {
      return;
    }
    const first = tileCenter(path[0].x, path[0].y);
    ctx.beginPath();
    ctx.moveTo(snapPixel(first.x), snapPixel(first.y));
    for (let index = 1; index < path.length; index += 1) {
      const point = tileCenter(path[index].x, path[index].y);
      ctx.lineTo(snapPixel(point.x), snapPixel(point.y));
    }
    ctx.stroke();
  }


  function getTerrainBufferTileSize(state) {
    const fallback = Math.max(4, Math.ceil(BASE_TERRAIN_PIXELS_PER_TILE * renderScale));
    const targetTextureSize = Number(state?.map?.scenario?.generator?.targetTextureSize);
    if (!Number.isFinite(targetTextureSize) || targetTextureSize <= 0) {
      return fallback;
    }
    const longestAxis = Math.max(1, state.map.width, state.map.height);
    const target = Math.max(512, Math.min(MAX_TERRAIN_BUFFER_SIZE, targetTextureSize));
    return Math.max(fallback, Math.ceil(target / longestAxis));
  }

  function drawTerrainBuffer(state) {
    const bufferTileSize = getTerrainBufferTileSize(state);
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
        state.dirtyRegion = null;
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
    if (!shouldShowMapAuthoringVisuals(state) || state.activeField === 'none' || state.activeField === 'normal' || state.activeField === 'displacement') {
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


  function drawWeatherStormOverlay(state) {
    if (!getScenePresentation(state?.map).visuals.weather) {
      return;
    }
    const weatherSettings = getWeatherRenderSettings(state.playtest, state.runtimeStats?.frameBudget);
    if (!weatherSettings.enabled || !state?.game?.fields?.cloudCover || !state?.game?.fields?.humidity || !state?.game?.fields?.heat) {
      return;
    }
    const fields = state.game.fields;
    const now = typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
    const wind = state.map?.scenario?.weather ?? state.map?.weather ?? {};
    const windX = Number.isFinite(Number(wind.windX)) ? Number(wind.windX) : 0.72;
    const windY = Number.isFinite(Number(wind.windY)) ? Number(wind.windY) : -0.28;
    const windLength = Math.max(0.001, Math.hypot(windX, windY));
    const windNormX = windX / windLength;
    const windNormY = windY / windLength;
    const driftA = (now * 0.000014) % 1;
    const driftB = (now * 0.000022 + 0.37) % 1;
    const stormCells = selectStormRenderCells(state.map, fields, {
      maxCells: Math.max(1, Math.min(weatherSettings.maxCloudCells, view.tileSize < 7 ? 24 : weatherSettings.maxCloudCells)),
      minCloud: view.tileSize < 7 ? Math.max(weatherSettings.minCloud, 0.5) : weatherSettings.minCloud
    });
    if (stormCells.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = weatherSettings.opacityScale;

    // Layer 1 — cheaper, lighter terrain dimming. We draw only sampled storm masses,
    // not every single map tile, so the weather reads as broad clouds without murdering FPS.
    for (const cell of stormCells) {
      const centre = tileCenter(cell.x, cell.y);
      const dim = Math.min(0.16, 0.025 + cell.terrainDim * 0.18) * weatherSettings.terrainDimScale;
      const cluster = Math.max(1, cell.stride || 2);
      const shadowRadius = view.tileSize * cluster * (0.85 + cell.cloudDensity * 0.58 + cell.darkCore * 0.28);
      const shadow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, shadowRadius);
      shadow.addColorStop(0, `rgba(3, 7, 18, ${dim})`);
      shadow.addColorStop(0.62, `rgba(5, 10, 24, ${dim * 0.34})`);
      shadow.addColorStop(1, 'rgba(5, 10, 24, 0)');
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y, shadowRadius * 0.98, shadowRadius * 0.46, -0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // Layer 2/3/4 — larger clustered cloud bodies, varied by deterministic noise.
    for (const cell of stormCells) {
      const base = tileCenter(cell.x, cell.y);
      const seed = Math.round(cell.x * 917 + cell.y * 613 + (cell.stride || 1) * 211);
      const local = hashUnit(seed + Math.floor(now / 2300) * 23);
      const cluster = Math.max(1, cell.stride || 2);
      const cx = base.x + windNormX * view.tileSize * cluster * (driftA - 0.5) * (0.35 + cell.cloudDensity * 0.34)
        + (local - 0.5) * view.tileSize * cluster * 0.18;
      const cy = base.y + windNormY * view.tileSize * cluster * (driftA - 0.5) * (0.28 + cell.cloudDensity * 0.28)
        + (hashUnit(seed + 31) - 0.5) * view.tileSize * cluster * 0.12;
      const bodyRx = view.tileSize * cluster * (0.76 + cell.cloudDensity * 0.42 + cell.darkCore * 0.22);
      const bodyRy = view.tileSize * cluster * (0.34 + cell.cloudDensity * 0.22 + cell.rainfall * 0.09);
      const stormBlue = Math.floor(25 + cell.humidity * 35 + cell.electric * 35);
      const stormGreen = Math.floor(10 + cell.humidity * 18 + cell.electric * 25);
      const stormRed = Math.floor(2 + cell.darkCore * 6);
      const rotation = -0.26 + (hashUnit(seed + 97) - 0.5) * 0.24;

      // Softer body; toned down so the map remains readable beneath it.
      const body = ctx.createRadialGradient(cx, cy, 0, cx, cy, bodyRx * 1.22);
      body.addColorStop(0, `rgba(${stormRed}, ${stormGreen}, ${stormBlue}, ${0.075 + cell.cloudDensity * 0.095 + cell.darkCore * 0.065})`);
      body.addColorStop(0.5, `rgba(5, 12, 31, ${0.055 + cell.cloudDensity * 0.08 + cell.darkCore * 0.08})`);
      body.addColorStop(1, 'rgba(3, 6, 15, 0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(cx, cy, bodyRx * 1.38, bodyRy * 1.46, rotation, 0, Math.PI * 2);
      ctx.fill();

      // Lumpy lobes vary count/shape so it does not read as the same stamp everywhere.
      const lobes = 2 + Math.floor(hashUnit(seed + 411) * 3);
      for (let i = 0; i < lobes; i += 1) {
        const t = lobes === 1 ? 0.5 : i / Math.max(1, lobes - 1);
        const offset = (t - 0.5) * bodyRx * (0.75 + hashUnit(seed + i * 53) * 0.35);
        const wobble = hashUnit(seed + i * 71 + Math.floor(now / 2800)) - 0.5;
        const lx = cx + offset + windNormX * view.tileSize * cluster * (driftB - 0.5) * 0.22;
        const ly = cy + wobble * view.tileSize * cluster * 0.13 + windNormY * view.tileSize * cluster * (driftB - 0.5) * 0.14;
        ctx.fillStyle = `rgba(${Math.floor(4 + cell.darkCore * 8)}, ${Math.floor(11 + cell.humidity * 16)}, ${Math.floor(25 + cell.humidity * 24)}, ${0.035 + cell.cloudDensity * 0.055 + cell.darkCore * 0.045})`;
        ctx.beginPath();
        ctx.ellipse(lx, ly, bodyRx * (0.34 + hashUnit(seed + i * 83) * 0.24), bodyRy * (0.48 + hashUnit(seed + i * 89) * 0.24), rotation + (i - 1) * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }

      // Silver-blue rim ridges only on strongest masses.
      if (cell.cloudDensity > 0.58 && view.tileSize >= 8) {
        ctx.strokeStyle = `rgba(156, 215, 255, ${0.022 + cell.cloudDensity * 0.035 + cell.electric * 0.075})`;
        ctx.lineWidth = Math.max(0.7, view.tileSize * 0.018);
        ctx.beginPath();
        ctx.ellipse(cx - bodyRx * 0.08, cy - bodyRy * 0.25, bodyRx * 0.78, bodyRy * 0.36, rotation, Math.PI * 1.05, Math.PI * 1.9);
        ctx.stroke();
      }

      // Inner electric glow: present, but no longer washing the whole map blue.
      if (cell.electric > 0.28) {
        const pulse = 0.55 + Math.sin(now * 0.004 + seed * 0.02) * 0.45;
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, bodyRx * 1.55);
        glow.addColorStop(0, `rgba(124, 211, 255, ${cell.electric * (0.025 + pulse * 0.055)})`);
        glow.addColorStop(0.36, `rgba(40, 104, 255, ${cell.electric * 0.024})`);
        glow.addColorStop(1, 'rgba(40, 104, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(cx, cy, bodyRx * 1.05, bodyRy * 0.82, rotation, 0, Math.PI * 2);
        ctx.fill();
      }

      if (cell.rainfall > 0.5 && view.tileSize >= 8) {
        drawWeatherRainCell(cell.x, cell.y, cell, now, windNormX, windNormY, weatherSettings);
      }
    }

    drawWeatherLightningEvents(state, now, weatherSettings);
    ctx.restore();
  }

  function drawWeatherRainCell(x, y, sample, now, windNormX, windNormY, weatherSettings) {
    const sx = view.offsetX + x * view.tileSize;
    const sy = view.offsetY + y * view.tileSize;
    const phase = Math.floor(now / 100);
    const rawDensity = sample.rainfall > 0.74 ? 4 : sample.rainfall > 0.56 ? 3 : 2;
    const density = Math.max(1, Math.floor(rawDensity * Math.max(0, weatherSettings.rainScale ?? 1)));
    if ((weatherSettings.rainScale ?? 1) <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.58, 0.12 + sample.rainfall * 0.48) * Math.max(0, weatherSettings.rainScale ?? 1);
    ctx.strokeStyle = `rgba(134, 196, 255, ${Math.min(0.5, 0.13 + sample.rainfall * 0.34)})`;
    ctx.lineWidth = Math.max(0.65, view.tileSize * 0.026);
    for (let i = 0; i < density; i += 1) {
      const local = hashUnit(x * 141 + y * 181 + i * 911 + phase * 13);
      const px = sx + view.tileSize * ((i + 0.34 + local * 0.72) / density);
      const py = sy + view.tileSize * ((hashUnit(x * 317 + y * 197 + i * 37 + phase) + now * 0.0009) % 1);
      const slantX = (-0.24 + windNormX * 0.18) * view.tileSize;
      const slantY = (0.44 + Math.abs(windNormY) * 0.08) * view.tileSize;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + slantX, py + slantY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWeatherLightningEvents(state, now, weatherSettings) {
    const events = selectLightningEvents(state.map, state.game.fields, {
      nowMs: now,
      weatherPhase: state.game?.weather?.weatherPhase ?? 0,
      maxEvents: Math.max(0, weatherSettings.lightningMaxEvents ?? 1),
      threshold: weatherSettings.lightningThreshold ?? 0.84,
      seed: state.map?.scenario?.generator?.seed ?? state.map?.seed ?? 'black-sky-bound'
    });
    if (events.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    events.forEach((event) => {
      const age = Math.max(0, now - event.createdAtMs);
      const life = Math.max(0, 1 - age / Math.max(1, event.ttlMs));
      const flash = Math.pow(life, 1.55) * event.strength * Math.max(0, weatherSettings.opacityScale ?? 1);
      const centre = tileCenter(event.x, event.y);
      const ground = {
        x: centre.x + (hashUnit(event.seed + 71) - 0.5) * view.tileSize * 2.2,
        y: centre.y + view.tileSize * (1.35 + hashUnit(event.seed + 73) * 1.65)
      };
      const start = {
        x: centre.x + (hashUnit(event.seed + 11) - 0.5) * view.tileSize * 1.4,
        y: centre.y - view.tileSize * (0.96 + event.sample.cloudDensity * 0.9)
      };
      const bolt = generateForkBoltGeometry(start, ground, {
        seed: event.seed,
        segments: 7 + Math.floor(event.strength * 5),
        forks: 2 + Math.floor(event.strength * 3),
        jitter: 0.22 + event.strength * 0.2
      });

      const cloudRadius = view.tileSize * (3.1 + event.strength * 3.5);
      const cloudGlow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, cloudRadius);
      cloudGlow.addColorStop(0, `rgba(225, 248, 255, ${0.42 * flash})`);
      cloudGlow.addColorStop(0.18, `rgba(115, 201, 255, ${0.34 * flash})`);
      cloudGlow.addColorStop(0.56, `rgba(43, 103, 255, ${0.14 * flash})`);
      cloudGlow.addColorStop(1, 'rgba(43, 103, 255, 0)');
      ctx.fillStyle = cloudGlow;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, cloudRadius, 0, Math.PI * 2);
      ctx.fill();

      const terrainRadius = view.tileSize * (2.1 + event.strength * 2.4);
      const terrainGlow = ctx.createRadialGradient(ground.x, ground.y, 0, ground.x, ground.y, terrainRadius);
      terrainGlow.addColorStop(0, `rgba(232, 249, 255, ${0.2 * flash})`);
      terrainGlow.addColorStop(0.45, `rgba(110, 172, 255, ${0.09 * flash})`);
      terrainGlow.addColorStop(1, 'rgba(110, 172, 255, 0)');
      ctx.fillStyle = terrainGlow;
      ctx.beginPath();
      ctx.arc(ground.x, ground.y, terrainRadius, 0, Math.PI * 2);
      ctx.fill();

      if (view.tileSize >= 7) {
        drawBoltPath(bolt.main, `rgba(240, 251, 255, ${0.78 * flash})`, Math.max(1, view.tileSize * 0.07));
        drawBoltPath(bolt.main, `rgba(83, 171, 255, ${0.34 * flash})`, Math.max(2, view.tileSize * 0.18));
        bolt.forks.forEach((fork) => {
          drawBoltPath(fork.points, `rgba(211, 243, 255, ${0.46 * flash})`, Math.max(0.8, view.tileSize * 0.043));
        });
      }
    });
    ctx.restore();
  }

  function drawBoltPath(points, strokeStyle, lineWidth) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawInfluenceVisualization(state) {
    if (!shouldShowGameDebugVisuals(state) || !state.game || state.gameOverlay === 'none') {
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

  function drawNoisePings(state) {
    if (!state.showNoisePings || !shouldShowGameDebugVisuals(state)) {
      return;
    }
    const tick = state.game?.tick ?? 0;
    ctx.save();
    (state.game?.soundEvents ?? []).forEach((sound) => {
      const duration = Math.max(1, (sound.expiresAtTick ?? tick + 1) - (sound.createdAtTick ?? tick));
      const remaining = Math.max(0, Math.min(1, ((sound.expiresAtTick ?? tick) - tick) / duration));
      if (remaining <= 0) {
        return;
      }
      const centre = tileCenter(sound.position.x, sound.position.y);
      const radius = Math.max(0.5, sound.audibleRadiusTiles ?? 1) * view.tileSize;
      const colour = sound.kind === 'stone_impact'
        ? '214, 186, 126'
        : sound.kind === 'melee_attack'
          ? '210, 84, 69'
          : sound.kind === 'arrow_impact'
            ? '198, 160, 104'
            : '180, 171, 141';
      ctx.globalAlpha = 0.16 + remaining * 0.22;
      ctx.fillStyle = `rgba(${colour}, 0.1)`;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([Math.max(3, view.tileSize * 0.28), Math.max(3, view.tileSize * 0.2)]);
      ctx.strokeStyle = `rgba(${colour}, 0.74)`;
      ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const pulseRadius = radius * (0.16 + (1 - remaining) * 0.62);
      ctx.globalAlpha = 0.3 + remaining * 0.45;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${colour}, 0.9)`;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(2, view.tileSize * 0.07), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPhysicalCoverObjects(state) {
    drawForestCoverObjects(state);
    drawAuthoredCoverObjects(state);
    drawCorpseCoverObjects(state);
  }

  function drawForestCoverObjects(state) {
    const map = state?.map;
    if (!map || view.tileSize < 7) return;
    const bounds = getVisibleTileBounds(map, 1);
    ctx.save();
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        if (!shouldRenderWorldDetailAt({ x, y })) {
          stats.terrainDetailCullSkips += 1;
          continue;
        }
        const terrain = getTerrain(getTile(map, x, y));
        if (terrain.id !== 'forest') continue;
        drawForestTileCover(x, y);
      }
    }
    ctx.restore();
  }

  function drawForestTileCover(x, y) {
    const centre = tileCenter(x, y);
    const seed = x * 928371 + y * 68917;
    const scale = view.tileSize;
    const treeCount = view.tileSize >= 13 ? 2 : 1;
    for (let i = 0; i < treeCount; i += 1) {
      const ox = (hashUnit(seed + i * 17) - 0.5) * scale * 0.42;
      const oy = (hashUnit(seed + i * 31) - 0.5) * scale * 0.34;
      const cx = centre.x + ox;
      const cy = centre.y + oy;
      const crown = Math.max(3.2, scale * (0.18 + hashUnit(seed + i * 43) * 0.08));
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = 'rgba(10, 28, 15, 0.78)';
      ctx.beginPath();
      ctx.ellipse(cx, cy + crown * 0.42, crown * 0.68, crown * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.64;
      ctx.strokeStyle = 'rgba(33, 26, 16, 0.82)';
      ctx.lineWidth = Math.max(1, scale * 0.045);
      ctx.beginPath();
      ctx.moveTo(cx, cy + crown * 0.5);
      ctx.lineTo(cx, cy - crown * 0.25);
      ctx.stroke();
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = 'rgba(31, 74, 39, 0.92)';
      ctx.beginPath();
      ctx.arc(cx, cy - crown * 0.14, crown, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = 'rgba(67, 111, 49, 0.9)';
      ctx.beginPath();
      ctx.arc(cx - crown * 0.36, cy - crown * 0.02, crown * 0.58, 0, Math.PI * 2);
      ctx.arc(cx + crown * 0.34, cy - crown * 0.08, crown * 0.52, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawAuthoredCoverObjects(state) {
    const cover = getSceneEntity(state?.map).authoredEntities.filter((entity) => entity.kind === 'cover');
    if (cover.length === 0) return;
    ctx.save();
    cover.forEach((entity) => {
      if (!isEntityInView(entity.tile, 2)) return;
      drawLowBarricade(entity.tile, entity.id);
    });
    ctx.restore();
  }

  function drawLowBarricade(tile, id = '') {
    const centre = tileCenter(tile.x, tile.y);
    const seed = String(id || `${tile.x},${tile.y}`).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const width = Math.max(7, view.tileSize * 0.76);
    const height = Math.max(3.2, view.tileSize * 0.18);
    const rotation = (hashUnit(seed + 5) - 0.5) * 0.45;
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(rotation);
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(62, 43, 29, 0.96)';
    ctx.strokeStyle = 'rgba(21, 15, 11, 0.84)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
    for (let i = -1; i <= 1; i += 1) {
      const y = i * height * 0.45;
      ctx.beginPath();
      ctx.roundRect(-width / 2, y - height / 2, width, height, height * 0.45);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(198, 169, 111, 0.55)';
    ctx.fillRect(-width * 0.38, -height * 1.2, width * 0.12, height * 2.4);
    ctx.fillRect(width * 0.26, -height * 1.2, width * 0.12, height * 2.4);
    ctx.restore();
  }

  function drawCorpseCoverObjects(state) {
    const stacks = collectCorpseStacks(state?.game ?? {}).filter((stack) => stack.count > 0);
    if (stacks.length === 0) return;
    ctx.save();
    stacks.forEach((stack) => {
      if (!isEntityInView(stack.position, 2)) return;
      drawCorpseStack(stack);
    });
    ctx.restore();
  }

  function drawCorpseStack(stack) {
    const centre = tileCenter(stack.position.x, stack.position.y);
    const count = Math.max(1, stack.count ?? 1);
    const wall = stack.stackState === 'wall';
    const radius = view.tileSize * Math.min(0.58, 0.18 + count * 0.055);
    ctx.save();
    ctx.globalAlpha = wall ? 0.78 : 0.58;
    ctx.fillStyle = wall ? 'rgba(63, 23, 20, 0.92)' : 'rgba(83, 38, 30, 0.76)';
    ctx.strokeStyle = wall ? 'rgba(26, 10, 9, 0.92)' : 'rgba(36, 18, 14, 0.74)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y + radius * 0.12, radius * 1.34, radius * 0.78, -0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < Math.min(6, count); i += 1) {
      const angle = hashUnit(stack.count * 11 + i * 19 + stack.position.x) * Math.PI * 2;
      const dist = radius * (0.18 + hashUnit(i * 23 + stack.position.y) * 0.72);
      ctx.globalAlpha = wall ? 0.68 : 0.5;
      ctx.fillStyle = i % 2 ? 'rgba(104, 63, 47, 0.82)' : 'rgba(45, 35, 31, 0.8)';
      ctx.beginPath();
      ctx.ellipse(
        centre.x + Math.cos(angle) * dist,
        centre.y + Math.sin(angle) * dist * 0.58,
        Math.max(1.4, radius * 0.32),
        Math.max(0.8, radius * 0.18),
        angle,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    if (wall) {
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = 'rgba(214, 142, 94, 0.7)';
      ctx.setLineDash([Math.max(3, view.tileSize * 0.18), Math.max(2, view.tileSize * 0.12)]);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * 1.6, Math.PI * 0.08, Math.PI * 1.08);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (view.tileSize >= 11 && count >= 2) {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = '#ead7a8';
      ctx.font = `${Math.max(7, view.tileSize * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wall ? 'wall' : 'pile', centre.x, centre.y - radius * 1.35);
    }
    ctx.restore();
  }

  function shouldRenderCombatantForPlayer(state, entity) {
    if (!entity || entity.health?.state === 'dead') return false;
    if (entity.factionId !== 'enemy') return true;
    if (shouldShowGameDebugVisuals(state)) return true;
    return entity.stealth?.visibleToPlayer !== false;
  }

  function applyHiddenDebugAlpha(state, entity) {
    if (entity?.factionId === 'enemy' && entity.stealth?.visibleToPlayer === false && shouldShowGameDebugVisuals(state)) {
      ctx.globalAlpha *= 0.22;
    }
  }

  function drawUnitCoverCue(entity, centre, radius, selected = false) {
    const stealth = entity?.stealth;
    if (!stealth || stealth.coverState === 'exposed') return;
    const hidden = stealth.coverState === 'hidden';
    const crouched = stealth.posture === 'crouched';
    ctx.save();
    ctx.globalAlpha = hidden ? 0.78 : 0.56;
    ctx.strokeStyle = hidden ? 'rgba(190, 226, 147, 0.96)' : 'rgba(229, 195, 93, 0.86)';
    ctx.fillStyle = hidden ? 'rgba(39, 84, 43, 0.18)' : 'rgba(115, 88, 48, 0.16)';
    ctx.lineWidth = selected ? Math.max(1.4, view.tileSize * 0.07) : Math.max(1, view.tileSize * 0.045);
    ctx.setLineDash(hidden ? [Math.max(2, view.tileSize * 0.13), Math.max(2, view.tileSize * 0.1)] : []);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * (hidden ? 2.35 : 1.95), Math.PI * 0.14, Math.PI * 1.86);
    ctx.stroke();
    ctx.setLineDash([]);
    if (crouched) {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(centre.x, centre.y + radius * 0.55, radius * 1.85, radius * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hidden && view.tileSize >= 10) {
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = 'rgba(216, 241, 183, 0.9)';
      ctx.font = `${Math.max(7, view.tileSize * 0.31)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('hidden', centre.x, centre.y - radius * 2.05);
    }
    ctx.restore();
  }

  function drawFieldOfViewCones(state) {
    if (!state.showFieldOfView || !shouldShowGameDebugVisuals(state)) {
      return;
    }
    ctx.save();
    [...(state.game?.leaders ?? []), ...(state.game?.squads ?? [])].forEach((entity) => {
      if (entity.health?.state === 'dead') {
        return;
      }
      const position = getEntityPosition(entity);
      const centre = tileCenter(position.x, position.y);
      const facing = getEntityFacingAngle(entity);
      const radiusTiles = Math.max(2.5, Number(entity.sightRadius ?? entity.influenceRadius ?? 5));
      const radius = radiusTiles * view.tileSize;
      const spread = Math.PI * 0.36;
      const faction = FACTIONS[entity.factionId] ?? FACTIONS.neutral;
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = faction.color;
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.arc(centre.x, centre.y, radius, facing - spread, facing + spread);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.38;
      ctx.strokeStyle = faction.stroke;
      ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.arc(centre.x, centre.y, radius, facing - spread, facing + spread);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.restore();
  }

  function getEntityFacingAngle(entity) {
    const position = getEntityPosition(entity);
    const target = entity.movementOrder?.target ?? entity.movement?.target;
    if (target && Math.hypot(target.x - position.x, target.y - position.y) > 0.04) {
      return Math.atan2(target.y - position.y, target.x - position.x);
    }
    return entity.factionId === 'enemy' ? Math.PI : 0;
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
      drawMovementOrderAnchors(leader);
    });
    (state.game.squads ?? []).forEach((squad) => {
      if (squad.occupancy?.state === 'occupied') {
        return;
      }
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
      drawMovementOrderAnchors(squad);
    });
    ctx.restore();
  }

  function drawMovementOrderAnchors(entity) {
    const orderPath = entity?.movementOrder?.routeMode === 'player-intended' ? entity.movementOrder.path : null;
    if (!Array.isArray(orderPath) || orderPath.length < 3 || view.tileSize < 6) return;
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(255, 244, 184, 0.74)';
    ctx.strokeStyle = 'rgba(8, 12, 18, 0.72)';
    ctx.lineWidth = 1;
    orderPath.slice(1, -1).forEach((anchor) => {
      if (!isEntityInView(anchor, 2)) return;
      const centre = tileCenter(anchor.x, anchor.y);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(2.1, view.tileSize * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }



  function drawCommandFeedback(state) {
    const feedback = state.commandFeedback;
    const target = feedback?.target;
    if (!target || !Number.isFinite(Number(target.x)) || !Number.isFinite(Number(target.y))) {
      return;
    }
    const selected = getSelectedGameEntity(state.game);
    const start = selected?.position ?? selected?.tile ?? null;
    if (!start) {
      return;
    }
    const targetTile = { x: Number(target.x), y: Number(target.y) };
    if (!isPathInViewport([start, targetTile], 4)) {
      return;
    }
    const tone = commandFeedbackTone(feedback.status);
    const stroke = {
      ok: 'rgba(110, 205, 255, 0.94)',
      warn: 'rgba(255, 193, 92, 0.94)',
      critical: 'rgba(255, 92, 92, 0.94)',
      forced: 'rgba(198, 120, 255, 0.96)'
    }[tone] ?? 'rgba(255, 244, 184, 0.88)';
    const end = tileCenter(targetTile.x, targetTile.y);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(2.5, view.tileSize * 0.15);
    ctx.globalAlpha = 0.86;
    ctx.setLineDash(tone === 'ok' ? [] : [Math.max(6, view.tileSize * 0.55), Math.max(4, view.tileSize * 0.3)]);
    drawStablePath([start, targetTile], { smooth: 'catmull', samplesPerSegment: 8 });
    ctx.setLineDash([]);
    ctx.fillStyle = stroke;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.66)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(end.x, end.y, Math.max(5, view.tileSize * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (feedback.repeatCount > 1 || feedback.overrideRisk > 0.55) {
      ctx.strokeStyle = tone === 'forced' ? 'rgba(198,120,255,0.82)' : 'rgba(255,193,92,0.74)';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.05);
      ctx.beginPath();
      ctx.arc(end.x, end.y, Math.max(8, view.tileSize * (0.26 + Math.min(0.18, feedback.overrideRisk * 0.18))), 0, Math.PI * 2);
      ctx.stroke();
    }
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
    if (view.tileSize >= 6) {
      ctx.fillStyle = 'rgba(255, 244, 184, 0.76)';
      path.slice(1, -1).forEach((anchor) => {
        const centre = tileCenter(anchor.x, anchor.y);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, Math.max(2, view.tileSize * 0.07), 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  function drawStructures(state) {
    const structures = state.game?.structures ?? [];
    if (structures.length === 0) {
      return;
    }
    ctx.save();
    drawStructureNetworkUnderlay(state, structures);
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

  function drawStructureNetworkUnderlay(state, structures) {
    const visibleStructures = structures
      .filter((structure) => !isLegacyOutpostStructure(state, structure))
      .filter((structure) => isJoinRenderedStructure(structure))
      .filter((structure) => isEntityInView(structure.position ?? structure.tile, 4));
    if (visibleStructures.length === 0) {
      return;
    }
    const byId = new Map(structures.map((structure) => [structure.id, structure]));
    const pathGroups = groupRenderablePathStructures(visibleStructures);
    const drawnPairs = new Set();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    pathGroups.forEach((group) => drawStructurePathRibbonGroup(group));
    visibleStructures.forEach((structure) => {
      const connections = structure.joinery?.connections ?? [];
      connections.forEach((connection) => {
        const target = connection.structureId ? byId.get(connection.structureId) : null;
        if (!target || target.construction?.state === 'ruined' || !isJoinRenderedStructure(target)) {
          return;
        }
        if (!canStructuresJoin(structure.type, target.type)) {
          return;
        }
        if (isInternalPathConnection(structure, target, connection)) {
          return;
        }
        const sourcePoint = structure.position ?? structure.tile;
        const targetPoint = target.position ?? target.tile;
        if (!sourcePoint || !targetPoint || tileDistance(sourcePoint, targetPoint) < 0.05) {
          return;
        }
        const key = [structure.id, target.id].sort().join('>');
        if (drawnPairs.has(key)) {
          return;
        }
        drawnPairs.add(key);
        drawStructureJoinSpan(structure, target, connection);
      });
    });

    visibleStructures.forEach((structure) => {
      const point = structure.position ?? structure.tile;
      if (!point) {
        return;
      }
      const connectionCount = (structure.joinery?.connections ?? [])
        .filter((connection) => connection.kind !== 'replaces')
        .length;
      if (connectionCount > 1 || isJoinAnchorStructure(structure)) {
        drawStructureJunctionCuff(structure, connectionCount);
      }
    });
    ctx.restore();
  }

  function drawStructureJoinSpan(source, target, connection) {
    const family = getDominantJoinFamily(source, target);
    const style = getStructureNetworkStyle(family, source, target);
    const points = createStructureJoinRenderPath(source, target, connection);
    if (points.length < 2) {
      return;
    }
    const blueprint = source.construction?.state !== 'complete' || target.construction?.state !== 'complete';
    drawStructureRibbon(points, style, { blueprint, smooth: 'catmull', samplesPerSegment: 6 });
  }

  function drawStructurePathRibbonGroup(group) {
    if (!group || group.structures.length < 2) {
      return;
    }
    const structures = [...group.structures].sort((a, b) => (a.joinery?.segmentIndex ?? 0) - (b.joinery?.segmentIndex ?? 0));
    const points = structures
      .map((structure) => structure.position ?? structure.tile)
      .filter(Boolean);
    if (points.length < 2) {
      return;
    }
    const family = getStructureJoinProfile(structures[0].type).family;
    const blueprint = structures.some((structure) => structure.construction?.state !== 'complete');
    const style = getStructureNetworkStyle(family, structures[0], structures[structures.length - 1]);
    drawStructureRibbon(points, style, { blueprint, smooth: 'catmull', samplesPerSegment: 8 });
  }

  function drawStructureRibbon(points, style, { blueprint = false, smooth = null, samplesPerSegment = 6 } = {}) {
    ctx.save();
    ctx.globalAlpha = blueprint ? 0.44 : style.alpha;
    ctx.strokeStyle = style.shadow;
    ctx.lineWidth = style.width * 1.55;
    drawStablePath(points, { smooth, samplesPerSegment });
    ctx.globalAlpha = blueprint ? 0.54 : style.alpha;
    ctx.strokeStyle = style.base;
    ctx.lineWidth = style.width;
    if (blueprint) {
      ctx.setLineDash([Math.max(4, view.tileSize * 0.26), Math.max(3, view.tileSize * 0.18)]);
    }
    drawStablePath(points, { smooth, samplesPerSegment });
    ctx.setLineDash([]);
    ctx.globalAlpha = blueprint ? 0.62 : style.highlightAlpha;
    ctx.strokeStyle = style.highlight;
    ctx.lineWidth = Math.max(1, style.width * 0.24);
    drawStablePath(points, { smooth, samplesPerSegment });
    ctx.restore();
  }

  function groupRenderablePathStructures(structures = []) {
    const groups = new Map();
    structures
      .filter((structure) => isLinearJoinStructure(structure) && structure.joinery?.pathId)
      .forEach((structure) => {
        const key = `${structure.type}:${structure.joinery.pathId}`;
        const group = groups.get(key) ?? { key, structures: [] };
        group.structures.push(structure);
        groups.set(key, group);
      });
    return [...groups.values()].filter((group) => group.structures.length > 1);
  }

  function isInternalPathConnection(source, target, connection) {
    if (!source?.joinery?.pathId || source.joinery.pathId !== target?.joinery?.pathId) {
      return false;
    }
    return connection.kind === 'previous' || connection.kind === 'next' || source.type === target.type;
  }

  function drawStructureJunctionCuff(structure, connectionCount) {
    const family = getStructureJoinProfile(structure.type).family;
    const style = getStructureNetworkStyle(family, structure, structure);
    const centre = tileCenter(structure.position?.x ?? structure.tile.x, structure.position?.y ?? structure.tile.y);
    const radius = Math.max(view.tileSize * 0.18, Math.min(view.tileSize * 0.48, style.width * (isJoinAnchorStructure(structure) ? 0.58 : 0.44)));
    const blueprint = structure.construction?.state !== 'complete';
    ctx.save();
    ctx.globalAlpha = blueprint ? 0.44 : Math.min(0.72, 0.34 + connectionCount * 0.08);
    ctx.fillStyle = style.base;
    ctx.strokeStyle = style.highlight;
    ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = blueprint ? 0.7 : 0.52;
    ctx.stroke();
    ctx.restore();
  }

  function drawPlacementPreview(state) {
    const placement = state.placement;
    if (!placement?.active || !placement.hoverPosition) {
      return;
    }
    if (placement.mode === 'path') {
      drawStructurePathPlacementPreview(placement);
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

  function drawStructurePathPlacementPreview(placement) {
    const validity = placement.validity ?? {};
    const structureType = placement.selectedStructureType;
    const footprint = getPreviewFootprint(structureType);
    const valid = Boolean(validity.valid);
    const path = placement.pathPlan?.tiles ?? placement.path ?? [];
    const segments = placement.pathPlan?.segments ?? (placement.pathPlan?.candidates ?? []).map((tile) => ({ tile, position: tile, orientation: { angleRadians: 0 } }));
    const connectors = placement.pathPlan?.connectors ?? [];
    ctx.save();
    drawPathBlueprintRibbon(structureType, path, segments, connectors, valid);
    ctx.lineWidth = Math.max(1.4, view.tileSize * 0.07);
    ctx.strokeStyle = valid ? 'rgba(210, 225, 186, 0.96)' : 'rgba(238, 126, 98, 0.96)';
    ctx.fillStyle = valid ? 'rgba(96, 112, 74, 0.24)' : 'rgba(107, 44, 35, 0.26)';
    const width = Math.max(view.tileSize * 0.55, view.tileSize * footprint.width);
    const height = Math.max(view.tileSize * 0.32, view.tileSize * footprint.height);
    segments.forEach((segment) => {
      const centre = tileCenter(segment.position.x, segment.position.y);
      drawBlueprintSegmentNode(centre, width, Math.max(4, height), footprint.shape, segment.orientation?.angleRadians ?? 0, valid);
    });
    connectors.forEach((connector) => drawBlueprintConnectorHint(connector, structureType, valid));
    const labelCentre = tileCenter(placement.hoverPosition.x, placement.hoverPosition.y);
    ctx.font = `${Math.max(8, view.tileSize * 0.34)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = valid ? '#f2ead0' : '#ffd3c5';
    ctx.strokeStyle = '#101410';
    ctx.lineWidth = 2;
    const count = segments.length;
    const label = `${getStructureShortLabel(structureType)} path ${valid ? count : 'blocked'}`;
    ctx.strokeText(label, labelCentre.x, labelCentre.y + height * 0.62 + 4);
    ctx.fillText(label, labelCentre.x, labelCentre.y + height * 0.62 + 4);
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
    const rotation = getStructureRotation(structure);
    if (structure.construction?.state !== 'complete') {
      drawConstructionStructure(structure, centre, width, height, baseStroke, rotation);
      return;
    }
    ctx.strokeStyle = baseStroke;
    ctx.fillStyle = getStructureFill(structure);
    ctx.globalAlpha = structure.construction?.state === 'complete' ? 0.88 : 0.42;

    if (shouldReduceLinearPathGlyph(structure, selected)) {
      drawReducedLinearJoinGlyph(structure, centre, width, height, baseStroke, rotation);
      ctx.globalAlpha = 1;
      if (selected && view.tileSize >= 12) {
        drawStructureLabel(structure, centre);
      }
      drawStructureOccupancyBadge(structure, centre, width, height);
      return;
    }

    if (structure.type === 'wall_segment') {
      drawStructureRect(centre, width, Math.max(4, height), 0.08, rotation);
    } else if (structure.type === 'gate') {
      drawStructureRect(centre, width, Math.max(5, height), 0.1, rotation);
      ctx.strokeStyle = structure.nav?.gateState === 'open' ? '#bde9c4' : '#f2c28b';
      drawRotatedLine(centre, width * 0.18, rotation);
    } else if (structure.type === 'trench_segment') {
      ctx.setLineDash([Math.max(3, view.tileSize * 0.22), Math.max(2, view.tileSize * 0.16)]);
      drawStructureRect(centre, width, Math.max(4, height), 0.12, rotation);
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
    } else if (structure.type === 'hunting_tent') {
      const radius = Math.max(5, view.tileSize * (structure.footprint?.radius ?? 0.55));
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - radius * 0.85);
      ctx.lineTo(centre.x + radius * 0.9, centre.y + radius * 0.62);
      ctx.lineTo(centre.x - radius * 0.9, centre.y + radius * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - radius * 0.58);
      ctx.lineTo(centre.x, centre.y + radius * 0.56);
      ctx.stroke();
    } else if (structure.type === 'wood_gathering_post') {
      const radius = Math.max(5, view.tileSize * (structure.footprint?.radius ?? 0.6));
      drawStructureRect(centre, width * 0.84, height * 0.7, 0.12, rotation);
      ctx.beginPath();
      ctx.moveTo(centre.x - radius * 0.8, centre.y + radius * 0.45);
      ctx.lineTo(centre.x + radius * 0.8, centre.y - radius * 0.45);
      ctx.moveTo(centre.x - radius * 0.55, centre.y - radius * 0.5);
      ctx.lineTo(centre.x + radius * 0.62, centre.y + radius * 0.48);
      ctx.stroke();
    } else if (structure.type === 'storage_tent') {
      const radius = Math.max(5, view.tileSize * (structure.footprint?.radius ?? 0.6));
      drawStructureRect(centre, width * 0.9, height * 0.74, 0.1, rotation);
      ctx.beginPath();
      ctx.moveTo(centre.x - radius * 0.65, centre.y - radius * 0.2);
      ctx.lineTo(centre.x, centre.y - radius * 0.72);
      ctx.lineTo(centre.x + radius * 0.65, centre.y - radius * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x - radius * 0.52, centre.y + radius * 0.34);
      ctx.lineTo(centre.x + radius * 0.52, centre.y + radius * 0.34);
      ctx.stroke();
    } else if (structure.type === 'builder_lodge') {
      const radius = Math.max(5, view.tileSize * (structure.footprint?.radius ?? 0.62));
      drawStructureRect(centre, width * 0.92, height * 0.78, 0.14, rotation);
      ctx.beginPath();
      ctx.moveTo(centre.x - radius * 0.72, centre.y - radius * 0.2);
      ctx.lineTo(centre.x, centre.y - radius * 0.78);
      ctx.lineTo(centre.x + radius * 0.72, centre.y - radius * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x - radius * 0.42, centre.y + radius * 0.34);
      ctx.lineTo(centre.x - radius * 0.14, centre.y + radius * 0.06);
      ctx.lineTo(centre.x + radius * 0.16, centre.y + radius * 0.36);
      ctx.lineTo(centre.x + radius * 0.48, centre.y + radius * 0.02);
      ctx.stroke();
    } else if (structure.type === 'fort') {
      drawStructureRect(centre, width, height, 0.02, rotation);
      ctx.strokeRect(centre.x - width * 0.28, centre.y - height * 0.28, width * 0.56, height * 0.56);
    } else {
      const size = Math.max(view.tileSize * 0.95, width);
      ctx.strokeRect(centre.x - size * 0.56, centre.y - size * 0.56, size * 1.12, size * 1.12);
    }

    ctx.globalAlpha = 1;
    if (view.tileSize >= 12 && structure.type !== 'outpost') {
      drawStructureLabel(structure, centre);
    }
    drawStructureOccupancyBadge(structure, centre, width, height);
  }

  function shouldReduceLinearPathGlyph(structure, selected = false) {
    if (selected || structure.type === 'gate' || !isLinearJoinStructure(structure)) {
      return false;
    }
    return Boolean(structure.joinery?.pathId && (structure.joinery?.connections ?? []).length > 0);
  }

  function drawReducedLinearJoinGlyph(structure, centre, width, height, baseStroke, angleRadians) {
    const kind = structure.joinery?.junction?.kind ?? structure.joinery?.junction?.role ?? structure.orientation?.role ?? 'straight';
    if (kind === 'straight') {
      return;
    }
    ctx.save();
    ctx.strokeStyle = baseStroke;
    ctx.fillStyle = structure.type === 'trench_segment' ? 'rgba(41, 54, 45, 0.66)' : 'rgba(57, 65, 60, 0.66)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
    const radius = Math.max(2.5, Math.min(view.tileSize * 0.22, Math.max(width, height) * 0.24));
    if (kind === 'corner') {
      drawCornerJoinMarker(structure, centre, radius, angleRadians);
    } else if (kind === 't' || kind === 'cross') {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * (kind === 'cross' ? 1.28 : 1.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (kind === 'end' || structure.joinery?.junction?.capStart || structure.joinery?.junction?.capEnd) {
      ctx.globalAlpha = 0.58;
      applyStructureRotation(centre, angleRadians);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - radius * 1.15);
      ctx.lineTo(centre.x, centre.y + radius * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCornerJoinMarker(structure, centre, radius, angleRadians) {
    const incoming = directionVector(structure.orientation?.incoming ?? 'same');
    const outgoing = directionVector(structure.orientation?.outgoing ?? structure.orientation?.direction ?? 'e');
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    ctx.moveTo(centre.x - incoming.x * radius * 1.15, centre.y - incoming.y * radius * 1.15);
    ctx.lineTo(centre.x, centre.y);
    ctx.lineTo(centre.x + outgoing.x * radius * 1.15, centre.y + outgoing.y * radius * 1.15);
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStructureOccupancyBadge(structure, centre, width, height) {
    const occupancy = structure.occupancy ?? {};
    if (!occupancy.enabled || (occupancy.capacitySquads ?? 0) <= 0) {
      return;
    }
    const count = occupancy.occupants?.length ?? 0;
    const capacity = occupancy.capacitySquads ?? 0;
    const badgeRadius = Math.max(2.5, view.tileSize * 0.12);
    const spacing = badgeRadius * 2.55;
    const startX = centre.x - ((capacity - 1) * spacing) / 2;
    const y = centre.y - Math.max(height, width) * 0.55 - badgeRadius * 1.5;
    ctx.save();
    for (let index = 0; index < capacity; index += 1) {
      const filled = index < count;
      ctx.beginPath();
      ctx.arc(startX + index * spacing, y, badgeRadius, 0, Math.PI * 2);
      ctx.fillStyle = filled ? '#e9cf8f' : 'rgba(10, 14, 11, 0.78)';
      ctx.strokeStyle = filled ? '#fff4b8' : 'rgba(232, 225, 199, 0.36)';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
      ctx.fill();
      ctx.stroke();
    }
    if (count > 0 && view.tileSize >= 13) {
      ctx.font = `${Math.max(7, view.tileSize * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#fff4b8';
      ctx.strokeStyle = '#101410';
      ctx.lineWidth = 2;
      const label = `${count}/${capacity}`;
      ctx.strokeText(label, centre.x, y - badgeRadius - 2);
      ctx.fillText(label, centre.x, y - badgeRadius - 2);
    }
    ctx.restore();
  }

  function drawConstructionStructure(structure, centre, width, height, baseStroke, angleRadians = 0) {
    const progress = Math.max(0, Math.min(1, Number(structure.construction?.progress) || 0));
    if (isLinearJoinStructure(structure)) {
      drawConstructionJoinStructure(structure, centre, width, height, baseStroke, angleRadians, progress);
      return;
    }
    ctx.save();
    applyStructureRotation(centre, angleRadians);
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

  function drawConstructionJoinStructure(structure, centre, width, height, baseStroke, angleRadians, progress) {
    const family = getStructureJoinProfile(structure.type).family;
    const style = getStructureNetworkStyle(family, structure, structure);
    const length = Math.max(width, view.tileSize * 1.18);
    const thickness = Math.max(4, height * (structure.type === 'trench_segment' ? 1.18 : 0.88));
    ctx.save();
    applyStructureRotation(centre, angleRadians);
    ctx.globalAlpha = 0.28 + progress * 0.28;
    ctx.strokeStyle = style.shadow;
    ctx.lineWidth = thickness * 1.52;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centre.x - length * 0.48, centre.y);
    ctx.lineTo(centre.x + length * 0.48, centre.y);
    ctx.stroke();
    ctx.globalAlpha = 0.42 + progress * 0.28;
    ctx.strokeStyle = structure.type === 'trench_segment' ? '#293c30' : '#554f3f';
    ctx.lineWidth = thickness;
    ctx.setLineDash([Math.max(4, view.tileSize * 0.26), Math.max(3, view.tileSize * 0.18)]);
    ctx.beginPath();
    ctx.moveTo(centre.x - length * 0.48, centre.y);
    ctx.lineTo(centre.x + length * 0.48, centre.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
    ctx.beginPath();
    ctx.moveTo(centre.x - length * 0.32, centre.y - thickness * 0.42);
    ctx.lineTo(centre.x - length * 0.32, centre.y + thickness * 0.42);
    ctx.moveTo(centre.x + length * 0.32, centre.y - thickness * 0.42);
    ctx.lineTo(centre.x + length * 0.32, centre.y + thickness * 0.42);
    ctx.stroke();
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

  function drawPathBlueprintRibbon(structureType, path, segments, connectors, valid) {
    const ribbonPath = createBlueprintRibbonPath(path, segments, connectors);
    if (ribbonPath.length < 2) {
      return;
    }
    const style = getStructureNetworkStyle(getStructureJoinProfile(structureType).family, { type: structureType }, { type: structureType });
    const previewStyle = valid
      ? style
      : {
          ...style,
          shadow: 'rgba(70, 26, 22, 0.82)',
          base: 'rgba(196, 75, 58, 0.78)',
          highlight: 'rgba(255, 198, 184, 0.88)',
          alpha: 0.68,
          highlightAlpha: 0.72
        };
    drawStructureRibbon(ribbonPath, previewStyle, { blueprint: true, smooth: 'catmull', samplesPerSegment: 8 });
  }

  function drawBlueprintSegmentNode(centre, width, height, shape, angleRadians, valid) {
    ctx.save();
    ctx.globalAlpha = valid ? 0.62 : 0.72;
    ctx.strokeStyle = valid ? 'rgba(232, 225, 199, 0.72)' : 'rgba(255, 190, 174, 0.82)';
    ctx.fillStyle = valid ? 'rgba(96, 112, 74, 0.1)' : 'rgba(107, 44, 35, 0.14)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
    ctx.setLineDash([Math.max(4, view.tileSize * 0.22), Math.max(2, view.tileSize * 0.14)]);
    if (shape === 'circle') {
      drawFootprintOutline(centre, width, height, shape);
    } else {
      drawStructureRect(centre, width * 0.86, Math.max(3, height * 0.82), 0.1, angleRadians);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawBlueprintConnectorHint(connector, structureType, valid) {
    const tile = connector.position ?? connector.tile;
    if (!tile || !canStructuresJoin(structureType, connector.type)) {
      return;
    }
    const centre = tileCenter(tile.x, tile.y);
    const radius = Math.max(4, view.tileSize * (connector.mode === 'built-on' ? 0.32 : 0.22));
    ctx.save();
    ctx.globalAlpha = valid ? 0.72 : 0.55;
    ctx.strokeStyle = valid ? 'rgba(232, 225, 199, 0.9)' : 'rgba(255, 190, 174, 0.86)';
    ctx.fillStyle = valid ? 'rgba(210, 225, 186, 0.16)' : 'rgba(238, 126, 98, 0.16)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function createBlueprintRibbonPath(path, segments, connectors) {
    const segmentPoints = (segments ?? [])
      .map((segment) => segment.position ?? segment.tile)
      .filter(Boolean);
    const source = segmentPoints.length > 0 ? segmentPoints : path;
    if (!source || source.length === 0) {
      return [];
    }
    const out = [];
    const firstConnector = findNearestConnector(source[0], connectors);
    if (firstConnector && tileDistance(firstConnector.tile ?? firstConnector.position, source[0]) <= 1.45) {
      out.push(firstConnector.position ?? firstConnector.tile);
    }
    source.forEach((point) => appendRenderPoint(out, point));
    const last = source[source.length - 1];
    const lastConnector = findNearestConnector(last, connectors);
    if (lastConnector && tileDistance(lastConnector.tile ?? lastConnector.position, last) <= 1.45) {
      appendRenderPoint(out, lastConnector.position ?? lastConnector.tile);
    }
    return out;
  }

  function findNearestConnector(tile, connectors = []) {
    if (!tile || connectors.length === 0) {
      return null;
    }
    return connectors
      .map((connector) => ({
        connector,
        distance: tileDistance(tile, connector.tile ?? connector.position ?? tile)
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.connector ?? null;
  }

  function getPreviewFootprint(type) {
    const footprint = getStructureDefinition(type)?.footprint;
    return footprint
      ? { shape: footprint.shape, width: footprint.width || footprint.radius * 2 || 1, height: footprint.height || footprint.radius * 2 || 1 }
      : { shape: 'rect', width: 1.2, height: 1.2 };
  }

  function drawStructureRect(centre, width, height, insetRatio, angleRadians = 0) {
    const inset = Math.max(0, Math.min(width, height) * insetRatio);
    ctx.save();
    applyStructureRotation(centre, angleRadians);
    ctx.beginPath();
    ctx.rect(centre.x - width / 2 + inset, centre.y - height / 2 + inset, width - inset * 2, height - inset * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawRotatedLine(centre, halfWidth, angleRadians = 0) {
    ctx.save();
    applyStructureRotation(centre, angleRadians);
    ctx.beginPath();
    ctx.moveTo(centre.x - halfWidth, centre.y);
    ctx.lineTo(centre.x + halfWidth, centre.y);
    ctx.stroke();
    ctx.restore();
  }

  function applyStructureRotation(centre, angleRadians = 0) {
    if (!Number.isFinite(angleRadians) || Math.abs(angleRadians) < 0.0001) {
      return;
    }
    ctx.translate(centre.x, centre.y);
    ctx.rotate(angleRadians);
    ctx.translate(-centre.x, -centre.y);
  }

  function getStructureRotation(structure) {
    return Number.isFinite(structure?.orientation?.angleRadians) ? structure.orientation.angleRadians : 0;
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
    if (structure.type === 'hunting_tent') return '#4a4630';
    if (structure.type === 'wood_gathering_post') return '#37452f';
    if (structure.type === 'builder_lodge') return '#453a31';
    if (structure.type === 'storage_tent') return '#3f4535';
    if (structure.type === 'fort') return '#30352f';
    return '#20261f';
  }

  function getStructureShortLabel(type) {
    return {
      watchtower: 'WT',
      hunting_tent: 'FD',
      wood_gathering_post: 'WD',
      builder_lodge: 'BL',
      storage_tent: 'ST',
      wall_segment: 'WL',
      gate: 'GT',
      trench_segment: 'TR',
      fort: 'FT'
    }[type] ?? 'ST';
  }

  function drawOutposts(state) {
    ctx.save();
    state.game?.outposts?.forEach((outpost) => {
      if (!isEntityInView(outpost.tile, 3)) {
        stats.structureCullSkips += 1;
        return;
      }
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

  function drawScenarioLayer(state) {
    const layer = state?.map?.scenario?.scenarioLayer;
    const authoring = shouldShowMapAuthoringVisuals(state);
    if (!layer || (!authoring && (!state.showScenarioLayer || !getScenePresentation(state?.map).visuals.scenarioLayer))) {
      return;
    }

    ctx.save();
    drawAuthoredSceneEntities(state);
    drawScenarioBeatTriggers(layer);
    drawScenarioLocations(layer);
    drawScenarioAssets(layer);
    drawScenarioItems(layer);
    drawScenarioCharacters(layer);
    drawScenarioSpeechBubbles(layer);
    drawScenarioRuntimeEffects(state?.scenarioRuntime ?? state?.map?.scenario?.scenarioRuntime);
    ctx.restore();
  }

  function drawAuthoredSceneEntities(state) {
    const entities = getSceneEntity(state?.map).authoredEntities;
    if (entities.length === 0) return;
    const authoring = shouldShowMapAuthoringVisuals(state);
    entities.forEach((entity) => {
      if (!isEntityInView(entity.tile, 4)) return;
      if (!shouldRenderWorldDetailAt(entity.tile, 'far')) {
        stats.authoredDetailCullSkips += 1;
        return;
      }
      const centre = tileCenter(entity.tile.x, entity.tile.y);
      const radius = Math.max(5, view.tileSize * 0.32);
      ctx.save();
      ctx.lineWidth = Math.max(1, view.tileSize * 0.05);
      ctx.strokeStyle = entity.factionId === 'player'
        ? 'rgba(125, 198, 255, 0.92)'
        : entity.factionId === 'enemy'
          ? 'rgba(255, 127, 103, 0.92)'
          : 'rgba(229, 195, 93, 0.9)';
      ctx.fillStyle = 'rgba(8, 13, 18, 0.64)';
      ctx.setLineDash(entity.kind === 'trigger' || entity.kind === 'spawner' ? [3, 3] : []);
      ctx.beginPath();
      if (entity.kind === 'cover') {
        ctx.rect(centre.x - radius, centre.y - radius * 0.45, radius * 2, radius * 0.9);
      } else if (entity.kind === 'beat' || entity.kind === 'trigger') {
        ctx.arc(centre.x, centre.y, radius * 1.18, 0, Math.PI * 2);
      } else {
        ctx.moveTo(centre.x, centre.y - radius);
        ctx.lineTo(centre.x + radius, centre.y);
        ctx.lineTo(centre.x, centre.y + radius);
        ctx.lineTo(centre.x - radius, centre.y);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (authoring && view.tileSize >= 8) {
        drawScenarioMiniLabel(entity.label, centre.x, centre.y - radius * 1.8, ctx.strokeStyle);
      }
      ctx.restore();
    });
  }

  function drawScenarioRuntimeEffects(runtime) {
    const weatherSettings = getWeatherRenderSettings(currentRenderState?.playtest, currentRenderState?.runtimeStats?.frameBudget);
    const effectCap = Math.max(4, Math.min(16, weatherSettings.scenarioEffectCap ?? 10));
    const effects = Array.isArray(runtime?.effectHistory) ? runtime.effectHistory.slice(-effectCap) : [];
    if (effects.length === 0) return;
    const now = performance.now();
    effects.forEach((effect, index) => {
      if (!effect?.tile || !isEntityInView(effect.tile, 7)) return;
      if (!shouldRenderWorldDetailAt(effect.tile, 'far')) {
        stats.authoredDetailCullSkips += 1;
        return;
      }
      const centre = tileCenter(effect.tile.x, effect.tile.y);
      const age = effects.length - index;
      const pulse = 0.5 + Math.sin(now * 0.004 + index * 1.7) * 0.5;
      const alpha = Math.max(0.12, 0.62 - age * 0.045);
      const radius = Math.max(7, view.tileSize * (0.45 + pulse * 0.28));
      ctx.save();
      ctx.globalAlpha = alpha;
      if (['lightning_flash', 'storm_pulse'].includes(effect.type)) {
        const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius * 4.4);
        glow.addColorStop(0, `rgba(150, 224, 255, ${0.34 + pulse * 0.28})`);
        glow.addColorStop(0.32, `rgba(49, 169, 255, ${0.16 + pulse * 0.15})`);
        glow.addColorStop(1, 'rgba(49, 169, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, radius * 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(219, 247, 255, ${0.62 + pulse * 0.28})`;
        ctx.lineWidth = Math.max(1, view.tileSize * 0.055);
        ctx.beginPath();
        ctx.moveTo(centre.x - radius * 0.2, centre.y - radius * 1.1);
        ctx.lineTo(centre.x + radius * 0.14, centre.y - radius * 0.22);
        ctx.lineTo(centre.x - radius * 0.05, centre.y - radius * 0.18);
        ctx.lineTo(centre.x + radius * 0.28, centre.y + radius * 0.95);
        ctx.stroke();
      } else if (effect.type === 'silhouette_reveal' || effect.type === 'enemy_banner_reveal') {
        const width = radius * (effect.type === 'silhouette_reveal' ? 2.7 : 1.5);
        const height = radius * (effect.type === 'silhouette_reveal' ? 1.1 : 1.8);
        ctx.fillStyle = 'rgba(0, 2, 7, 0.88)';
        ctx.strokeStyle = `rgba(116, 204, 255, ${0.32 + pulse * 0.32})`;
        ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
        ctx.beginPath();
        if (effect.type === 'silhouette_reveal') {
          ctx.moveTo(centre.x - width * 0.5, centre.y);
          ctx.quadraticCurveTo(centre.x - width * 0.18, centre.y - height * 0.72, centre.x, centre.y - height * 0.05);
          ctx.quadraticCurveTo(centre.x + width * 0.18, centre.y - height * 0.72, centre.x + width * 0.5, centre.y);
          ctx.quadraticCurveTo(centre.x + width * 0.16, centre.y + height * 0.16, centre.x, centre.y + height * 0.05);
          ctx.quadraticCurveTo(centre.x - width * 0.16, centre.y + height * 0.16, centre.x - width * 0.5, centre.y);
        } else {
          ctx.moveTo(centre.x, centre.y - height);
          ctx.lineTo(centre.x + width * 0.42, centre.y - height * 0.62);
          ctx.lineTo(centre.x, centre.y - height * 0.28);
          ctx.closePath();
          ctx.moveTo(centre.x, centre.y - height);
          ctx.lineTo(centre.x, centre.y + height * 0.58);
        }
        ctx.fill();
        ctx.stroke();
      } else if (effect.type === 'smoke_column') {
        ctx.fillStyle = `rgba(31, 39, 45, ${0.18 + pulse * 0.16})`;
        for (let i = 0; i < 4; i += 1) {
          ctx.beginPath();
          ctx.arc(centre.x + Math.sin(now * 0.001 + i) * radius * 0.4, centre.y - radius * (0.5 + i * 0.42), radius * (0.46 + i * 0.12), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (effect.type === 'corpse_warning') {
        ctx.strokeStyle = `rgba(205, 150, 112, ${0.48 + pulse * 0.34})`;
        ctx.fillStyle = `rgba(62, 32, 26, ${0.24 + pulse * 0.1})`;
        ctx.lineWidth = Math.max(1, view.tileSize * 0.05);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, radius * 1.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(centre.x - radius, centre.y);
        ctx.lineTo(centre.x + radius, centre.y);
        ctx.moveTo(centre.x, centre.y - radius);
        ctx.lineTo(centre.x, centre.y + radius);
        ctx.stroke();
      } else {
        ctx.strokeStyle = `rgba(131, 208, 255, ${0.42 + pulse * 0.34})`;
        ctx.fillStyle = `rgba(35, 122, 180, ${0.12 + pulse * 0.12})`;
        ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, radius * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (shouldShowMapAuthoringVisuals(currentRenderState) && view.tileSize >= 9 && effect.label) {
        drawScenarioMiniLabel(effect.label, centre.x, centre.y - radius * 1.8, 'rgba(209, 236, 255, 0.94)');
      }
      ctx.restore();
    });
  }

  function drawScenarioBeatTriggers(layer) {
    const beats = layer.storyBeats ?? [];
    if (beats.length === 0) return;
    const pulse = 0.5 + Math.sin(performance.now() * 0.002) * 0.5;
    ctx.save();
    ctx.setLineDash([Math.max(3, view.tileSize * 0.22), Math.max(3, view.tileSize * 0.18)]);
    beats.forEach((beat, index) => {
      if (!isEntityInView(beat.tile, 8)) return;
      const centre = tileCenter(beat.tile.x, beat.tile.y);
      const radius = Math.max(view.tileSize * 2.2, (beat.trigger?.radius ?? 5) * view.tileSize);
      ctx.globalAlpha = 0.12 + pulse * 0.08;
      ctx.strokeStyle = index === 0 ? 'rgba(129, 205, 255, 0.68)' : 'rgba(236, 209, 144, 0.42)';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.28 + pulse * 0.22;
      ctx.fillStyle = index === 0 ? 'rgba(70, 147, 255, 0.12)' : 'rgba(236, 209, 144, 0.08)';
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(5, view.tileSize * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([Math.max(3, view.tileSize * 0.22), Math.max(3, view.tileSize * 0.18)]);
      if (shouldShowMapAuthoringVisuals(currentRenderState) && view.tileSize >= 9) {
        drawScenarioMiniLabel(beat.title, centre.x, centre.y - Math.max(12, view.tileSize * 0.8), 'rgba(191, 222, 255, 0.92)');
      }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawScenarioLocations(layer) {
    (layer.locations ?? []).forEach((location) => {
      if (!isEntityInView(location.tile, 4)) return;
      const centre = tileCenter(location.tile.x, location.tile.y);
      const size = Math.max(7, view.tileSize * 0.46);
      ctx.save();
      ctx.globalAlpha = 0.82;
      ctx.strokeStyle = location.kind === 'story_anchor' ? '#cce9ff' : '#ead7a8';
      ctx.fillStyle = location.kind === 'ruin' ? 'rgba(49, 43, 35, 0.72)' : 'rgba(25, 35, 38, 0.64)';
      ctx.lineWidth = Math.max(1.2, view.tileSize * 0.055);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x - size * 0.6, centre.y + size * 0.2);
      ctx.lineTo(centre.x, centre.y - size * 0.58);
      ctx.lineTo(centre.x + size * 0.58, centre.y + size * 0.2);
      ctx.stroke();
      if (shouldShowMapAuthoringVisuals(currentRenderState) && view.tileSize >= 10) {
        drawScenarioMiniLabel(location.name, centre.x, centre.y + size + 3, '#f2ead0');
      }
      ctx.restore();
    });
  }

  function drawScenarioAssets(layer) {
    const now = performance.now();
    (layer.assets ?? []).forEach((asset) => {
      if (!isEntityInView(asset.tile, 5)) return;
      if (!shouldRenderWorldDetailAt(asset.tile)) {
        stats.authoredDetailCullSkips += 1;
        return;
      }
      const centre = tileCenter(asset.tile.x, asset.tile.y);
      const pulse = 0.5 + Math.sin(now * 0.003 + asset.tile.x * 0.7 + asset.tile.y * 0.31) * 0.5;
      const strength = Math.max(0.1, Math.min(1, asset.intensity ?? 0.5));
      const radius = Math.max(6, view.tileSize * (0.32 + strength * 0.34));
      ctx.save();
      if (asset.kind === 'weather') {
        const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, radius * (2.6 + pulse));
        glow.addColorStop(0, `rgba(105, 181, 255, ${0.22 + pulse * 0.24})`);
        glow.addColorStop(0.45, `rgba(57, 96, 159, ${0.12 + pulse * 0.14})`);
        glow.addColorStop(1, 'rgba(57, 96, 159, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, radius * (2.6 + pulse), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(192, 226, 255, ${0.38 + pulse * 0.42})`;
        ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
        ctx.beginPath();
        ctx.moveTo(centre.x - radius * 0.18, centre.y - radius * 0.82);
        ctx.lineTo(centre.x + radius * 0.12, centre.y - radius * 0.14);
        ctx.lineTo(centre.x - radius * 0.1, centre.y - radius * 0.14);
        ctx.lineTo(centre.x + radius * 0.26, centre.y + radius * 0.7);
        ctx.stroke();
      } else if (asset.kind === 'wildlife') {
        ctx.globalAlpha = 0.62;
        ctx.strokeStyle = '#151a18';
        ctx.fillStyle = '#0f1412';
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(centre.x + (i - 1) * radius * 0.62, centre.y + Math.sin(now * 0.002 + i) * radius * 0.24, radius * 0.22, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = asset.kind === 'debris' ? '#4d4033' : '#3c3528';
        ctx.strokeStyle = '#d5c08c';
        ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
        ctx.beginPath();
        ctx.rect(centre.x - radius * 0.58, centre.y - radius * 0.36, radius * 1.16, radius * 0.72);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  function drawScenarioItems(layer) {
    (layer.items ?? []).forEach((item) => {
      if (!isEntityInView(item.tile, 3)) return;
      const centre = tileCenter(item.tile.x, item.tile.y);
      const size = Math.max(4, view.tileSize * 0.22);
      ctx.save();
      ctx.fillStyle = item.kind === 'supply' ? '#d8c87b' : item.kind === 'relic' ? '#8fb8ff' : '#d7b27a';
      ctx.strokeStyle = '#101410';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - size);
      ctx.lineTo(centre.x + size, centre.y);
      ctx.lineTo(centre.x, centre.y + size);
      ctx.lineTo(centre.x - size, centre.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  function drawScenarioCharacters(layer) {
    const bubbleByCharacter = new Map((layer.speechBubbles ?? []).map((bubble) => [bubble.characterId, bubble]));
    (layer.characters ?? []).forEach((character) => {
      if (!isEntityInView(character.tile, 3)) return;
      const centre = tileCenter(character.tile.x, character.tile.y);
      const radius = Math.max(3.5, view.tileSize * 0.18);
      ctx.save();
      ctx.fillStyle = character.factionId === 'player' ? '#9ec9ff' : '#d7c68f';
      ctx.strokeStyle = character.nonVerbalCue === 'speech' ? '#fff4b8' : '#1a1d18';
      ctx.lineWidth = Math.max(1.2, view.tileSize * 0.05);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y - radius * 0.65, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y - radius * 0.05);
      ctx.lineTo(centre.x + radius * 0.58, centre.y + radius * 0.92);
      ctx.lineTo(centre.x - radius * 0.58, centre.y + radius * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const bubble = bubbleByCharacter.get(character.id);
      if (bubble?.text && (bubble.reveal === 'visible_on_map' || shouldShowMapAuthoringVisuals(currentRenderState))) {
        drawScenarioBubble(bubble.text, centre.x, centre.y - radius * 2.25);
      } else if (character.nonVerbalCue !== 'speech' && shouldShowMapAuthoringVisuals(currentRenderState)) {
        drawScenarioMiniLabel('gesture', centre.x, centre.y - radius * 2.05, 'rgba(242, 234, 208, 0.78)');
      }
      ctx.restore();
    });
  }

  function drawScenarioSpeechBubbles(layer) {
    if (!shouldShowMapAuthoringVisuals(currentRenderState)) {
      return;
    }
    const characters = new Map((layer.characters ?? []).map((character) => [character.id, character]));
    (layer.speechBubbles ?? [])
      .filter((bubble) => !bubble.text && bubble.nonVerbalFallback)
      .slice(0, 3)
      .forEach((bubble) => {
        const character = characters.get(bubble.characterId);
        if (!character || !isEntityInView(character.tile, 3)) return;
        const centre = tileCenter(character.tile.x, character.tile.y);
        drawScenarioMiniLabel(bubble.nonVerbalFallback, centre.x, centre.y + Math.max(10, view.tileSize * 0.72), 'rgba(221, 210, 170, 0.78)');
      });
  }

  function drawScenarioBubble(text, x, y) {
    const label = String(text).slice(0, 34);
    const fontSize = Math.max(8, Math.min(12, view.tileSize * 0.34));
    ctx.save();
    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const width = Math.min(180, Math.max(34, ctx.measureText(label).width + 14));
    const height = fontSize + 9;
    ctx.fillStyle = 'rgba(18, 22, 23, 0.86)';
    ctx.strokeStyle = 'rgba(244, 237, 216, 0.72)';
    ctx.lineWidth = 1;
    drawRoundedRect(x - width / 2, y - height, width, height, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f4edd8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - height / 2 + 0.5);
    ctx.restore();
  }

  function drawMouseObserver(state) {
    if (!state?.mousePlaytest?.enabled || state.uiScreen !== 'game') return;
    const commander = (state.game?.leaders ?? []).find((leader) => leader.factionId === 'player');
    if (!commander) return;
    const commanderPosition = getEntityPosition(commander);
    if (!commanderPosition) return;
    const position = { x: commanderPosition.x + 0.62, y: commanderPosition.y + 0.48 };
    if (!isEntityInView(position, 3)) return;
    const centre = tileCenter(position.x, position.y);
    const radius = Math.max(3.5, view.tileSize * 0.16);
    ctx.save();
    ctx.fillStyle = 'rgba(201, 190, 164, 0.96)';
    ctx.strokeStyle = 'rgba(16, 19, 18, 0.9)';
    ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
    ctx.beginPath();
    ctx.ellipse(centre.x, centre.y, radius * 1.1, radius * 0.7, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(centre.x + radius * 0.55, centre.y - radius * 0.46, radius * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(102, 212, 202, 0.92)';
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 0.23, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawScenarioMiniLabel('MOUSE', centre.x, centre.y + radius * 1.6, 'rgba(175, 233, 222, 0.9)');
    const latestAction = state.mousePlaytest.latestAction;
    const actionExecuted = latestAction?.executionStatus === 'executed';
    const actionTarget = latestAction?.targetPosition;
    if (actionExecuted && actionTarget && latestAction.commandId !== 'observe' && isEntityInView(actionTarget, 2)) {
      const target = tileCenter(actionTarget.x, actionTarget.y);
      ctx.save();
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(115, 216, 195, 0.52)';
      ctx.lineWidth = Math.max(1, view.tileSize * 0.045);
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.restore();
    }
    if (actionExecuted && latestAction.commandId !== 'observe') {
      const label = String(latestAction.commandId).replaceAll('_', ' ');
      const targetLabel = latestAction.targetLabel ? ` -> ${latestAction.targetLabel}` : '';
      drawScenarioBubble(`Mouse chooses: ${label}${targetLabel}`, centre.x, centre.y - radius * 2.2);
    } else if (state.mousePlaytest.latestThought) {
      drawScenarioBubble(`Mouse: ${state.mousePlaytest.latestThought}`, centre.x, centre.y - radius * 2.2);
    }
  }

  function drawScenarioMiniLabel(text, x, y, color = '#f4edd8') {
    const label = String(text).slice(0, 42);
    ctx.save();
    ctx.font = `${Math.max(7, Math.min(11, view.tileSize * 0.3))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#101410';
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.strokeText(label, x, y);
    ctx.fillText(label, x, y);
    ctx.restore();
  }

  function drawRoundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawTimeOfDayOverlay(state) {
    const phase = state.game?.time?.phase;
    if (!phase || phase === 'day' || phase === 'dawn') {
      return;
    }
    const alpha = phase === 'night' ? 0.22 : 0.1;
    ctx.save();
    ctx.fillStyle = `rgba(18, 33, 52, ${alpha})`;
    ctx.fillRect(view.mapOffsetX, view.mapOffsetY, view.mapWidth, view.mapHeight);
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
      if (!shouldRenderCombatantForPlayer(state, leader)) {
        return;
      }
      const faction = FACTIONS[leader.factionId];
      const position = getEntityPosition(leader);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const radius = Math.max(3, view.tileSize * 0.17);
      const selected = state.game.selectedEntityId === leader.id;
      const baseAlpha = ctx.globalAlpha;
      applyHiddenDebugAlpha(state, leader);
      drawUnitCoverCue(leader, centre, radius, selected);
      ctx.fillStyle = faction.color;
      ctx.strokeStyle = selected ? '#fff4b8' : '#101410';
      ctx.lineWidth = selected ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = faction.stroke;
      ctx.globalAlpha *= 0.75;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * 1.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
    });
    ctx.restore();
  }

  function drawSquads(state) {
    ctx.save();
    (state.game?.squads ?? []).forEach((squad) => {
      if (squad.occupancy?.state === 'occupied') {
        return;
      }
      if (!shouldRenderCombatantForPlayer(state, squad)) {
        return;
      }
      const faction = FACTIONS[squad.factionId];
      const position = getEntityPosition(squad);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const selected = state.game.selectedEntityId === squad.id;
      const memberRadius = Math.max(2, view.tileSize * 0.095);
      const baseAlpha = ctx.globalAlpha;
      applyHiddenDebugAlpha(state, squad);
      drawUnitCoverCue(squad, centre, Math.max(5, view.tileSize * 0.22), selected);
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
      ctx.globalAlpha *= selected ? 0.82 : 0.42;
      ctx.strokeStyle = faction.stroke;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, Math.max(5, view.tileSize * 0.34), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = baseAlpha;
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

  function drawResourceWorkers(state) {
    ctx.save();
    (state.game?.resourceWorkers ?? []).forEach((worker) => {
      const faction = FACTIONS[worker.factionId] ?? FACTIONS.player;
      const position = getEntityPosition(worker);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const selected = state.game.selectedEntityId === worker.id;
      const radius = Math.max(2.4, view.tileSize * 0.115);
      ctx.fillStyle = worker.resourceId === 'wood' ? '#b59d65' : '#d8c87b';
      ctx.strokeStyle = selected ? '#fff4b8' : faction.stroke;
      ctx.lineWidth = selected ? 2 : 1.1;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if ((worker.carriedAmount ?? 0) > 0) {
        ctx.fillStyle = worker.resourceId === 'wood' ? '#6f5131' : '#9d8744';
        ctx.fillRect(centre.x + radius * 0.3, centre.y - radius * 1.35, radius * 1.45, radius * 0.95);
        ctx.strokeStyle = '#1b1710';
        ctx.strokeRect(centre.x + radius * 0.3, centre.y - radius * 1.35, radius * 1.45, radius * 0.95);
      }

      if (worker.targetTile && (worker.state === 'outbound' || worker.state === 'returning')) {
        const target = tileCenter(worker.targetTile.x, worker.targetTile.y);
        ctx.globalAlpha = 0.32;
        ctx.strokeStyle = worker.state === 'returning' ? '#e2c07a' : '#9ecf91';
        ctx.lineWidth = Math.max(1, view.tileSize * 0.04);
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function drawSupplyTransports(state) {
    ctx.save();
    (state.game?.transports ?? []).forEach((transport) => {
      const faction = FACTIONS[transport.factionId] ?? FACTIONS.player;
      const position = getEntityPosition(transport);
      if (!isEntityInView(position, 2)) {
        stats.entityCullSkips += 1;
        return;
      }
      const centre = tileCenter(position.x, position.y);
      const selected = state.game.selectedEntityId === transport.id;
      const radius = Math.max(2.2, view.tileSize * 0.105);
      ctx.fillStyle = transport.resourceId === 'wood' ? '#c6aa72' : transport.resourceId === 'food' ? '#d7c56c' : faction.color;
      ctx.strokeStyle = selected ? '#fff4b8' : '#111712';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if ((transport.carriedAmount ?? 0) > 0) {
        ctx.fillStyle = transport.resourceId === 'wood' ? '#795938' : '#928235';
        ctx.fillRect(centre.x - radius * 0.82, centre.y - radius * 1.7, radius * 1.64, radius * 0.78);
        ctx.strokeStyle = '#15150f';
        ctx.strokeRect(centre.x - radius * 0.82, centre.y - radius * 1.7, radius * 1.64, radius * 0.78);
      }

      if (transport.targetPosition && (transport.state === 'outbound' || transport.state === 'returning')) {
        const target = tileCenter(transport.targetPosition.x, transport.targetPosition.y);
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = transport.resourceId === 'wood' ? '#d6b26f' : '#d8cc76';
        ctx.lineWidth = Math.max(1, view.tileSize * 0.035);
        ctx.beginPath();
        ctx.moveTo(centre.x, centre.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
    ctx.restore();
  }

  function drawProjectiles(state) {
    const projectiles = state.game?.projectiles ?? [];
    if (projectiles.length === 0) {
      return;
    }
    const interpolationAlpha = getProjectileInterpolationAlpha(state);
    ctx.save();
    projectiles.forEach((projectile) => {
      const position = getProjectileVisualPosition(projectile, interpolationAlpha);
      if (!isEntityInView(position, 1.5)) {
        stats.entityCullSkips += 1;
        return;
      }
      const previous = projectile.previousPosition ?? projectile.origin ?? position;
      const logicalPosition = projectile.position ?? position;
      const end = tileCenter(position.x, position.y);
      const direction = getProjectileDirection(projectile, previous, logicalPosition);
      const ux = direction.x;
      const uy = direction.y;
      const shaft = Math.max(5, Math.min(view.tileSize * 0.72, direction.length * view.tileSize + view.tileSize * 0.18));
      const tail = { x: end.x - ux * shaft, y: end.y - uy * shaft };
      const faction = FACTIONS[projectile.factionId] ?? FACTIONS.neutral;

      if (projectile.weaponId === 'stone') {
        const pulse = projectile.state === 'impacting' ? getProjectileImpactPulse(projectile, interpolationAlpha) : 1;
        ctx.globalAlpha = projectile.state === 'impacting' ? 0.56 * pulse : 0.94;
        ctx.fillStyle = '#bca77a';
        ctx.strokeStyle = '#30271b';
        ctx.lineWidth = Math.max(1, view.tileSize * 0.034);
        ctx.beginPath();
        ctx.arc(end.x, end.y, Math.max(2.1, view.tileSize * 0.09), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (projectile.state === 'impacting') {
          ctx.globalAlpha = 0.66 * pulse;
          ctx.strokeStyle = '#dccb9a';
          ctx.beginPath();
          ctx.arc(end.x, end.y, Math.max(3.6, view.tileSize * 0.2), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        return;
      }

      ctx.globalAlpha = projectile.state === 'impacting' ? 0.72 : 0.88;
      ctx.strokeStyle = faction.stroke;
      ctx.lineWidth = Math.max(1.2, view.tileSize * 0.055);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tail.x, tail.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      ctx.globalAlpha = 0.52;
      ctx.strokeStyle = '#2c2418';
      ctx.lineWidth = Math.max(0.8, view.tileSize * 0.035);
      ctx.beginPath();
      ctx.moveTo(tail.x - uy * 2, tail.y + ux * 2);
      ctx.lineTo(tail.x + uy * 2, tail.y - ux * 2);
      ctx.stroke();

      if (projectile.state === 'impacting') {
        const pulse = getProjectileImpactPulse(projectile, interpolationAlpha);
        ctx.globalAlpha = 0.74 * pulse;
        ctx.strokeStyle = '#fff3b8';
        ctx.lineWidth = Math.max(1, view.tileSize * 0.035);
        ctx.beginPath();
        ctx.arc(end.x, end.y, Math.max(3, view.tileSize * 0.16), 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = 0.52 * pulse;
        ctx.fillStyle = faction.stroke;
        ctx.beginPath();
        ctx.arc(end.x, end.y, Math.max(2, view.tileSize * 0.07), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.84;
        ctx.fillStyle = faction.stroke;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - ux * view.tileSize * 0.18 - uy * view.tileSize * 0.08, end.y - uy * view.tileSize * 0.18 + ux * view.tileSize * 0.08);
        ctx.lineTo(end.x - ux * view.tileSize * 0.18 + uy * view.tileSize * 0.08, end.y - uy * view.tileSize * 0.18 - ux * view.tileSize * 0.08);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function getProjectileInterpolationAlpha(state) {
    return clampNumber(
      state?.renderClock?.alpha ?? state?.runtimeStats?.interpolationAlpha,
      1,
      0,
      1
    );
  }

  function getProjectileVisualPosition(projectile, alpha) {
    const position = projectile.position ?? projectile.origin ?? { x: 0, y: 0 };
    if (projectile.state === 'impacting') {
      return position;
    }
    const previous = projectile.previousPosition ?? projectile.origin ?? position;
    return {
      x: lerp(previous.x, position.x, alpha),
      y: lerp(previous.y, position.y, alpha)
    };
  }

  function getProjectileDirection(projectile, previous, position) {
    let dx = (position?.x ?? 0) - (previous?.x ?? 0);
    let dy = (position?.y ?? 0) - (previous?.y ?? 0);
    let length = Math.hypot(dx, dy);
    if (length <= 0.0001 && projectile?.targetPosition) {
      dx = projectile.targetPosition.x - (position?.x ?? 0);
      dy = projectile.targetPosition.y - (position?.y ?? 0);
      length = Math.hypot(dx, dy);
    }
    if (length <= 0.0001) {
      return { x: 1, y: 0, length: 0 };
    }
    return { x: dx / length, y: dy / length, length };
  }

  function getProjectileImpactPulse(projectile, alpha) {
    const tickLife = Math.max(0.35, Math.min(1, (projectile.impactTicksRemaining ?? 1) / 2));
    const frameFade = 1 - Math.max(0, Math.min(1, alpha)) * 0.55;
    return Math.max(0.22, tickLife * frameFade);
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

  function isJoinRenderedStructure(structure) {
    if (!structure || structure.construction?.state === 'ruined') {
      return false;
    }
    return isLinearJoinStructure(structure) || isJoinAnchorStructure(structure);
  }

  function isLinearJoinStructure(structure) {
    return ['wall_segment', 'gate', 'trench_segment'].includes(structure?.type);
  }

  function isJoinAnchorStructure(structure) {
    return ['watchtower', 'fort'].includes(structure?.type);
  }

  function getDominantJoinFamily(source, target) {
    const sourceFamily = getStructureJoinProfile(source.type).family;
    const targetFamily = getStructureJoinProfile(target.type).family;
    if (source.type === 'trench_segment' || target.type === 'trench_segment') {
      return 'trench';
    }
    if (sourceFamily === 'wall' || targetFamily === 'wall') {
      return 'wall';
    }
    return sourceFamily ?? targetFamily ?? 'wall';
  }

  function getStructureNetworkStyle(family, source, target) {
    const blueprint = source?.construction?.state !== 'complete' || target?.construction?.state !== 'complete';
    if (family === 'trench') {
      return {
        width: Math.max(5, view.tileSize * 0.32),
        shadow: 'rgba(20, 25, 19, 0.72)',
        base: blueprint ? 'rgba(73, 91, 65, 0.8)' : 'rgba(42, 59, 45, 0.92)',
        highlight: 'rgba(182, 204, 160, 0.72)',
        alpha: 0.82,
        highlightAlpha: 0.48
      };
    }
    return {
      width: Math.max(5, view.tileSize * 0.25),
      shadow: 'rgba(15, 17, 15, 0.7)',
      base: blueprint ? 'rgba(91, 84, 67, 0.84)' : 'rgba(61, 66, 58, 0.94)',
      highlight: 'rgba(232, 225, 199, 0.68)',
      alpha: 0.86,
      highlightAlpha: 0.42
    };
  }

  function createStructureJoinRenderPath(source, target, connection) {
    const sourcePoint = source.position ?? source.tile;
    const targetPoint = target.position ?? target.tile;
    if (!sourcePoint || !targetPoint) {
      return [];
    }
    const distance = tileDistance(sourcePoint, targetPoint);
    if (distance <= 1.05 || isJoinAnchorStructure(source) || isJoinAnchorStructure(target)) {
      return [sourcePoint, targetPoint];
    }
    const sourceDirection = connection?.direction ?? directionFromTo(sourcePoint, targetPoint);
    const sourceTangent = directionVector(source.orientation?.outgoing ?? source.orientation?.direction ?? sourceDirection);
    const targetTangent = directionVector(target.orientation?.incoming ?? target.orientation?.direction ?? directionFromTo(targetPoint, sourcePoint));
    const bend = Math.min(0.38, distance * 0.18);
    return [
      sourcePoint,
      { x: sourcePoint.x + sourceTangent.x * bend, y: sourcePoint.y + sourceTangent.y * bend },
      { x: targetPoint.x - targetTangent.x * bend, y: targetPoint.y - targetTangent.y * bend },
      targetPoint
    ];
  }

  function drawScreenPath(points) {
    const screenPoints = points
      .filter(Boolean)
      .map((point) => tileCenter(point.x, point.y));
    if (screenPoints.length < 2) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let index = 1; index < screenPoints.length; index += 1) {
      ctx.lineTo(screenPoints[index].x, screenPoints[index].y);
    }
    ctx.stroke();
  }

  function appendRenderPoint(out, point) {
    if (!point) {
      return;
    }
    const previous = out[out.length - 1];
    if (!previous || tileDistance(previous, point) >= 0.05) {
      out.push({ x: point.x, y: point.y });
    }
  }

  function directionVector(direction) {
    return {
      n: { x: 0, y: -1 },
      e: { x: 1, y: 0 },
      s: { x: 0, y: 1 },
      w: { x: -1, y: 0 },
      ne: { x: 1, y: -1 },
      nw: { x: -1, y: -1 },
      se: { x: 1, y: 1 },
      sw: { x: -1, y: 1 },
      same: { x: 0, y: 0 }
    }[direction] ?? { x: 1, y: 0 };
  }

  function tileCenter(x, y) {
    return {
      x: view.offsetX + x * view.tileSize + view.tileSize / 2,
      y: view.offsetY + y * view.tileSize + view.tileSize / 2
    };
  }

  function getVisibleTileBounds(map, marginTiles = 1) {
    const margin = Math.max(0, Number(marginTiles) || 0);
    return {
      minX: Math.max(0, Math.floor((-view.offsetX) / view.tileSize - margin)),
      maxX: Math.min(map.width - 1, Math.ceil((view.width - view.offsetX) / view.tileSize + margin)),
      minY: Math.max(0, Math.floor((-view.offsetY) / view.tileSize - margin)),
      maxY: Math.min(map.height - 1, Math.ceil((view.height - view.offsetY) / view.tileSize + margin))
    };
  }

  function shouldRenderWorldDetailAt(position, tier = 'detail') {
    if (view.cameraMode !== 'commander_follow_tactical_leash' || !view.commanderAnchor || !position) {
      return true;
    }
    const radius = tier === 'far' ? view.farDetailRadiusTiles : view.detailRadiusTiles;
    if (!Number.isFinite(radius)) {
      return true;
    }
    return Math.hypot(position.x - view.commanderAnchor.x, position.y - view.commanderAnchor.y) <= radius;
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
    return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
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
    if (state.gameOverlay === 'heat') {
      return `rgba(255, 119, 44, ${0.05 + value * 0.42})`;
    }
    if (state.gameOverlay === 'humidity') {
      return `rgba(81, 176, 236, ${0.05 + value * 0.38})`;
    }
    if (state.gameOverlay === 'uplift') {
      return `rgba(224, 230, 255, ${0.04 + value * 0.34})`;
    }
    if (state.gameOverlay === 'stormPotential') {
      return `rgba(126, 92, 255, ${0.06 + value * 0.48})`;
    }
    if (state.gameOverlay === 'cloudCover') {
      return `rgba(44, 73, 116, ${0.06 + value * 0.42})`;
    }
    if (state.gameOverlay === 'rainfall') {
      return `rgba(119, 196, 255, ${0.06 + value * 0.46})`;
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

  function hashUnit(value) {
    const n = Math.sin(Number(value) * 12.9898) * 43758.5453;
    return n - Math.floor(n);
  }

  function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
  }

  function getTerrainBufferSignature(state, bufferTileSize, bufferWidth, bufferHeight) {
    return [
      shouldShowMapAuthoringVisuals(state) ? state.activeField : 'none',
      state.dynamicLighting ? 'dynamic' : 'flat',
      renderScale,
      bufferTileSize,
      bufferWidth,
      bufferHeight,
      state.map.revision ?? 0
    ].join(':');
  }

  function shouldDrawTacticalLayer(state) {
    return Boolean(shouldShowGameDebugVisuals(state) && state.game && (state.gameOverlay !== 'none' || state.showCommandRadii));
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
      state.game?.weather?.weatherPhase ?? 0,
      state.game?.weather?.stormCells ?? 0,
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


function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(min, Math.min(max, fallback));
  return Math.max(min, Math.min(max, numeric));
}

function normaliseRenderScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_RENDER_SCALE;
  }
  return Math.max(MIN_RENDER_SCALE, Math.min(MAX_RENDER_SCALE, Math.round(numeric)));
}
