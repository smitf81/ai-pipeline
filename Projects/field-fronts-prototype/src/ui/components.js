import { FIELD_OVERLAYS, TERRAIN_ORDER, getTerrain } from '../config/terrain.js';
import { EXPERIENCE_MODES } from '../core/appModes.js';
import { BRUSH_SHAPES } from '../editor/brush.js';
import { activateScenario, exportEditorMap, exportGameState, importEditorMap, importGameState, redo, replaceMap, resetMap, undo } from '../editor/editorState.js';
import { GAME_OVERLAYS, MOVEMENT_MODEL, PRESSURE_STANCES, getSelectedGameEntity, resetGameForMap, setPlayerPressureStance, summarizeStructureTopology } from '../game/gameModel.js';
import { RESOURCE_IDS } from '../game/economy.js';
import { getElevation, getTile } from '../world/mapModel.js';
import { MAP_GENERATION_PRESETS, createFirstNightMap, createRandomMapSeed, createSeededMap } from '../world/mapGenerator.js';
import { SCENARIO_CAMERA_MODES, SCENARIO_STORY_PRESETS, createRandomScenarioSeed, createScenarioLayerForMap, normaliseScenarioCameraRig, normaliseScenarioLayer, summarizeScenarioLayer, updateScenarioCameraRig } from '../world/scenarioLayer.js';
import { createDefaultScenarioSpine, normaliseScenarioRuntime, summarizeScenarioSpine, validateScenarioSpine } from '../world/scenarioSpine.js';
import { ensureScenarioCatalogueForMap, getScenarioSelectionSlots, summarizeScenarioCatalogue } from '../world/scenarioCatalogue.js';
import { SCENE_PLACEMENT_TOOLS, createBlankSceneEntity, ensureSceneEntityForMap, getScenePresentation, isNomadicSurvivalScene, placeSceneEntity, summarizeSceneEntity, updateScenePresentation } from '../world/sceneEntity.js';
import { getFieldValue } from '../world/fields.js';

export function mountModeControls(root, state, bus) {
  const section = createSection('Sim / Debug');
  const row = document.createElement('div');
  row.className = 'button-row';
  const playButton = button('Run Sim');
  const editButton = button('Map Maker');
  row.append(playButton, editButton);
  const hint = document.createElement('p');
  hint.className = 'status-line';
  section.append(row, hint);
  root.append(section);

  playButton.addEventListener('click', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.mode = 'play';
    state.status = 'Sim / Debug active: tick tools and command inspectors unlocked';
    bus.emit('render');
  });
  editButton.addEventListener('click', () => {
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.gameOverlay = 'none';
    state.showCommandRadii = false;
    state.showNoisePings = false;
    state.showFieldOfView = false;
    state.status = 'Map Maker active: paint terrain, lighting and field overlays';
    bus.emit('render');
  });

  function render() {
    playButton.setAttribute('aria-pressed', String(state.mode === 'play'));
    editButton.setAttribute('aria-pressed', String(state.mode === 'edit'));
    hint.textContent = state.experienceMode === EXPERIENCE_MODES.SIM_DEBUG
      ? 'Sim: inspect ticks, command graphs and tactical overlays.'
      : 'Map Maker: terrain changes rebuild derived fields.';
  }

  bus.on('render', render);
  render();
}

export function mountTerrainPalette(root, state, bus) {
  const section = createSection('Terrain');
  const grid = document.createElement('div');
  grid.className = 'terrain-grid';
  section.append(grid);
  root.append(section);

  function render() {
    grid.replaceChildren(...TERRAIN_ORDER.map((id) => {
      const terrain = getTerrain(id);
      const terrainButton = document.createElement('button');
      terrainButton.type = 'button';
      terrainButton.className = 'terrain-button';
      terrainButton.dataset.terrain = id;
      terrainButton.setAttribute('aria-pressed', String(state.brush.terrainId === id));
      terrainButton.innerHTML = `<span class="swatch" style="background:${terrain.color}"></span><span>${terrain.label}</span>`;
      terrainButton.addEventListener('click', () => {
        state.brush.tool = 'terrain';
        state.brush.terrainId = id;
        state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
        state.mode = 'edit';
        state.status = `${terrain.label} brush selected`;
        bus.emit('render');
      });
      return terrainButton;
    }));
  }

  bus.on('render', render);
  render();
}

export function mountBrushControls(root, state, bus) {
  const section = createSection('Brush');
  const toolRow = document.createElement('div');
  toolRow.className = 'button-row';
  const terrainTool = button('Terrain');
  const raiseTool = button('Raise');
  const lowerTool = button('Lower');
  toolRow.append(terrainTool, raiseTool, lowerTool);

  const radiusRow = createControlRow('Size');
  const radius = document.createElement('input');
  radius.type = 'range';
  radius.min = '0';
  radius.max = '8';
  radius.step = '1';
  const radiusOut = document.createElement('output');
  radiusRow.append(radius, radiusOut);

  const shape = document.createElement('select');
  BRUSH_SHAPES.forEach((shapeId) => {
    const option = document.createElement('option');
    option.value = shapeId;
    option.textContent = shapeId[0].toUpperCase() + shapeId.slice(1);
    shape.append(option);
  });

  const shapeRow = createControlRow('Shape');

  const heightRow = createControlRow('Height step');
  const heightDelta = document.createElement('input');
  heightDelta.type = 'range';
  heightDelta.min = '0.01';
  heightDelta.max = '0.12';
  heightDelta.step = '0.01';
  const heightOut = document.createElement('output');
  heightRow.append(heightDelta, heightOut);

  const lowerHint = document.createElement('p');
  lowerHint.className = 'status-line';
  lowerHint.textContent = 'Ctrl-drag lowers while painting height.';

  shapeRow.append(shape);
  section.append(toolRow, radiusRow, shapeRow, heightRow, lowerHint);
  root.append(section);

  terrainTool.addEventListener('click', () => {
    state.brush.tool = 'terrain';
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.status = 'Terrain brush active';
    bus.emit('render');
  });
  raiseTool.addEventListener('click', () => {
    state.brush.tool = 'height';
    state.brush.heightDirection = 'raise';
    state.activeField = 'height';
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.status = 'Height brush active: drag to raise terrain';
    bus.emit('render');
  });
  lowerTool.addEventListener('click', () => {
    state.brush.tool = 'height';
    state.brush.heightDirection = 'lower';
    state.activeField = 'height';
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.status = 'Height brush active: drag to lower terrain';
    bus.emit('render');
  });
  radius.addEventListener('input', () => {
    state.brush.radius = Number(radius.value);
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    bus.emit('render');
  });
  shape.addEventListener('change', () => {
    state.brush.shape = shape.value;
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    bus.emit('render');
  });
  heightDelta.addEventListener('input', () => {
    state.brush.heightDelta = Number(heightDelta.value);
    // Only activate height tool if we are already in height mode. This preserves
    // the current raise/lower direction and avoids hijacking a terrain-paint session.
    if (state.brush.tool === 'height') {
      state.activeField = 'height';
    }
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    bus.emit('render');
  });

  function render() {
    terrainTool.setAttribute('aria-pressed', String(state.brush.tool !== 'height'));
    raiseTool.setAttribute('aria-pressed', String(state.brush.tool === 'height' && state.brush.heightDirection !== 'lower'));
    lowerTool.setAttribute('aria-pressed', String(state.brush.tool === 'height' && state.brush.heightDirection === 'lower'));
    radius.value = String(state.brush.radius);
    radiusOut.textContent = String(state.brush.radius);
    shape.value = state.brush.shape;
    heightDelta.value = String(state.brush.heightDelta ?? 0.04);
    heightOut.textContent = Number(state.brush.heightDelta ?? 0.04).toFixed(2);
  }

  bus.on('render', render);
  render();
}

export function mountFieldControls(root, state, bus) {
  const section = createSection('Terrain Field Overlay');
  const select = document.createElement('select');
  Object.values(FIELD_OVERLAYS).forEach((overlay) => {
    const option = document.createElement('option');
    option.value = overlay.id;
    option.textContent = overlay.label;
    select.append(option);
  });
  section.append(select);

  // Dynamic Lighting Toggle
  const lightingRow = document.createElement('label');
  lightingRow.className = 'checkbox-row';
  lightingRow.style.marginTop = '10px';
  lightingRow.style.display = 'flex';
  lightingRow.style.alignItems = 'center';
  lightingRow.style.gap = '6px';
  const lightingToggle = document.createElement('input');
  lightingToggle.type = 'checkbox';
  lightingRow.append(lightingToggle, document.createTextNode(' Dynamic 2D Lighting'));
  section.append(lightingRow);

  // Bake Buttons
  const bakeLabel = document.createElement('p');
  bakeLabel.className = 'field-label';
  bakeLabel.textContent = 'Bake & Export Texture';
  bakeLabel.style.marginTop = '12px';
  
  const bakeRow = document.createElement('div');
  bakeRow.className = 'button-row';
  const bakeNormalsBtn = button('Bake Normals');
  const bakeDisplacementBtn = button('Bake Displacement');
  bakeRow.append(bakeNormalsBtn, bakeDisplacementBtn);
  section.append(bakeLabel, bakeRow);

  root.append(section);

  select.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.activeField = select.value;
    state.status = state.activeField === 'none' ? 'Terrain overlay cleared' : `${FIELD_OVERLAYS[state.activeField].label} terrain overlay`;
    bus.emit('render');
  });

  lightingToggle.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.dynamicLighting = lightingToggle.checked;
    state.status = state.dynamicLighting ? 'Dynamic 2D Lighting enabled' : 'Flat shading enabled';
    bus.emit('render');
  });

  function downloadBakedTexture(type) {
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    const originalField = state.activeField;
    state.activeField = type;
    
    // Trigger render immediately so that offscreen canvas is updated
    bus.emit('render');
    
    try {
      const buffer = state.renderer?.getView?.()?.terrainBufferElement;
      if (buffer) {
        const url = buffer.toDataURL('image/png');
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `map-${type}-bake.png`;
        anchor.click();
        state.status = `${type === 'normal' ? 'Normal' : 'Displacement'} map texture baked & downloaded`;
      } else {
        state.status = 'Error: terrain buffer not found';
      }
    } catch (err) {
      state.status = `Bake failed: ${err.message}`;
    }
    
    state.activeField = originalField;
    bus.emit('render');
  }

  bakeNormalsBtn.addEventListener('click', () => {
    downloadBakedTexture('normal');
  });

  bakeDisplacementBtn.addEventListener('click', () => {
    downloadBakedTexture('displacement');
  });

  bus.on('render', () => {
    select.value = state.activeField;
    lightingToggle.checked = Boolean(state.dynamicLighting);
  });
}

export function mountGameControls(root, state, bus) {
  const section = createSection('Command');
  const liveHint = document.createElement('p');
  liveHint.className = 'status-line';
  liveHint.textContent = 'Battle time advances automatically while the game is running.';

  const playerOrderLabel = document.createElement('p');
  playerOrderLabel.className = 'field-label';
  playerOrderLabel.textContent = 'Player Pressure Order';
  const playerOrderRow = document.createElement('div');
  playerOrderRow.className = 'stance-row';
  const stanceButtons = Object.values(PRESSURE_STANCES).map((stance) => {
    const stanceButton = button(stance.label);
    stanceButton.dataset.playerStance = stance.id;
    stanceButton.title = stance.description;
    stanceButton.addEventListener('click', () => {
      setPlayerPressureStance(state.game, state.map, stance.id);
      state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
      state.mode = 'play';
      state.gameDirty = true;
      state.status = `Player order: ${stance.label} pressure`;
      bus.emit('render');
    });
    return stanceButton;
  });
  playerOrderRow.append(...stanceButtons);

  const quickSummary = document.createElement('div');
  quickSummary.className = 'compact-summary compact-summary--game';

  const advanced = document.createElement('details');
  advanced.className = 'advanced-panel';
  const advancedSummary = document.createElement('summary');
  advancedSummary.textContent = 'Advanced simulation';
  advanced.append(advancedSummary);

  const advancedBody = document.createElement('div');
  advancedBody.className = 'advanced-panel-body';

  const tickRow = document.createElement('div');
  tickRow.className = 'button-row';
  const stepButton = button('Step Tick');
  const resetButton = button('Reset Duel', 'danger-button');
  tickRow.append(stepButton, resetButton);

  const intervalRow = createControlRow('Tick interval');
  const intervalInput = document.createElement('input');
  intervalInput.type = 'range';
  intervalInput.min = '250';
  intervalInput.max = '2000';
  intervalInput.step = '50';
  const intervalOut = document.createElement('output');
  intervalRow.append(intervalInput, intervalOut);

  const stateRow = document.createElement('div');
  stateRow.className = 'button-row';
  const exportStateButton = button('Export State');
  const importStateButton = button('Import State');
  const stateFileInput = document.createElement('input');
  stateFileInput.type = 'file';
  stateFileInput.accept = 'application/json,.json';
  stateFileInput.className = 'hidden-file';
  stateRow.append(exportStateButton, importStateButton);

  const overlayLabel = document.createElement('label');
  overlayLabel.className = 'field-label';
  overlayLabel.textContent = 'Command Overlay';
  const overlaySelect = document.createElement('select');
  Object.values(GAME_OVERLAYS).forEach((overlay) => {
    const option = document.createElement('option');
    option.value = overlay.id;
    option.textContent = overlay.label;
    overlaySelect.append(option);
  });

  const radiiRow = document.createElement('label');
  radiiRow.className = 'checkbox-row';
  const radiiToggle = document.createElement('input');
  radiiToggle.type = 'checkbox';
  radiiRow.append(radiiToggle, document.createTextNode(' Show command radius'));

  const noiseRow = document.createElement('label');
  noiseRow.className = 'checkbox-row';
  const noiseToggle = document.createElement('input');
  noiseToggle.type = 'checkbox';
  noiseRow.append(noiseToggle, document.createTextNode(' Show sound / hearing pings'));

  const facingRow = document.createElement('label');
  facingRow.className = 'checkbox-row';
  const facingToggle = document.createElement('input');
  facingToggle.type = 'checkbox';
  facingRow.append(facingToggle, document.createTextNode(' Show field-of-view cones'));

  const summary = document.createElement('div');
  summary.className = 'compact-summary';
  advancedBody.append(tickRow, intervalRow, stateRow, overlayLabel, overlaySelect, radiiRow, noiseRow, facingRow, summary, stateFileInput);
  advanced.append(advancedBody);
  section.append(liveHint, playerOrderLabel, playerOrderRow, quickSummary, advanced);
  root.append(section);

  stepButton.addEventListener('click', () => {
    bus.emit('game:step-tick');
  });
  resetButton.addEventListener('click', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    resetGameForMap(state);
    state.renderMotion = null;
    bus.emit('render');
  });
  intervalInput.addEventListener('input', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.simTickIntervalMs = Number(intervalInput.value);
    state.status = `Tick interval: ${state.simTickIntervalMs}ms`;
    bus.emit('render');
  });
  exportStateButton.addEventListener('click', () => {
    const blob = new Blob([exportGameState(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'field-fronts-game-state.json';
    anchor.click();
    URL.revokeObjectURL(url);
    state.status = 'Game state exported separately from map data';
    bus.emit('render');
  });
  importStateButton.addEventListener('click', () => stateFileInput.click());
  stateFileInput.addEventListener('change', async () => {
    const file = stateFileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      importGameState(state, await file.text());
    } catch (error) {
      state.status = error.message;
    }
    stateFileInput.value = '';
    bus.emit('render');
  });

  overlaySelect.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.gameOverlay = overlaySelect.value;
    state.status = state.gameOverlay === 'none' ? 'Command overlay cleared' : `${GAME_OVERLAYS[state.gameOverlay].label} overlay`;
    bus.emit('render');
  });
  radiiToggle.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.showCommandRadii = radiiToggle.checked;
    bus.emit('render');
  });
  noiseToggle.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.showNoisePings = noiseToggle.checked;
    bus.emit('render');
  });
  facingToggle.addEventListener('change', () => {
    state.experienceMode = EXPERIENCE_MODES.SIM_DEBUG;
    state.showFieldOfView = facingToggle.checked;
    bus.emit('render');
  });

  function render() {
    overlaySelect.value = state.gameOverlay;
    radiiToggle.checked = state.showCommandRadii;
    noiseToggle.checked = state.showNoisePings;
    facingToggle.checked = state.showFieldOfView;
    const leaders = state.game.leaders;
    const player = leaders.find((leader) => leader.factionId === 'player');
    const enemy = leaders.find((leader) => leader.factionId === 'enemy');
    const objective = state.game.outposts.find((outpost) => outpost.contestable);
    const structureTopology = summarizeStructureTopology(state.game);
    stanceButtons.forEach((stanceButton) => {
      stanceButton.setAttribute('aria-pressed', String(player?.behavior?.stance === stanceButton.dataset.playerStance));
    });
    const intervalMs = Number(state.simTickIntervalMs) || 750;
    intervalInput.value = String(intervalMs);
    intervalOut.textContent = `${(intervalMs / 1000).toFixed(2)}s`;
    liveHint.textContent = state.uiScreen === 'game' && !state.paused
      ? `Running automatically every ${(intervalMs / 1000).toFixed(2)}s.`
      : `Auto-time resumes when the game is active.`;
    quickSummary.replaceChildren(
      metric('Tick', state.game.tick),
      metric('Supplies', formatSupplies(state.game, 'player')),
      metric('Structures', structureTopology.totalStructures),
      metric('Objective', objective?.status ?? 'none'),
      metric('Weather', formatWeatherSummary(state.game)),
      metric('Control', objective ? `${Math.round(objective.control.player * 100)} / ${Math.round(objective.control.enemy * 100)}` : 'n/a')
    );
    summary.replaceChildren(
      metric('Tick', state.game.tick),
      metric('Player Cmd', player?.commandScore ?? 'n/a'),
      metric('Enemy Cmd', enemy?.commandScore ?? 'n/a'),
      metric('Player Order', PRESSURE_STANCES[player?.behavior?.stance]?.label ?? 'n/a'),
      metric('Enemy AI', PRESSURE_STANCES[enemy?.behavior?.stance]?.label ?? 'n/a'),
      metric('P Move', formatMovement(player)),
      metric('E Move', formatMovement(enemy)),
      metric('Objective', objective?.status ?? 'none'),
      metric('Frontline', state.game.frontline ? `${state.game.frontline.segmentCount} segs` : 'n/a'),
      metric('Struct Block', structureTopology.blockerStructures),
      metric('Occupiable', structureTopology.occupiableStructures),
      metric('Trenches', structureTopology.trenchModifiers),
      metric('P Pressure', objective?.projectedPressure?.player?.toFixed?.(2) ?? 'n/a'),
      metric('E Pressure', objective?.projectedPressure?.enemy?.toFixed?.(2) ?? 'n/a'),
      metric('Weather', formatWeatherSummary(state.game)),
      metric('Storm Cells', state.game?.weather?.stormCells ?? 0),
      metric('Rain Cells', state.game?.weather?.rainCells ?? 0),
      metric('Control', objective ? `${Math.round(objective.control.player * 100)} / ${Math.round(objective.control.enemy * 100)}` : 'n/a')
    );
  }

  bus.on('render', render);
  render();
}

export function mountMapControls(root, state, bus) {
  const section = createSection('Map');
  const row = document.createElement('div');
  row.className = 'button-row';
  const undoButton = button('Undo');
  const redoButton = button('Redo');
  const exportButton = button('Export');
  const importButton = button('Import');
  const resetButton = button('Reset Map', 'danger-button');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.className = 'hidden-file';
  row.append(undoButton, redoButton, exportButton, importButton);

  const generatorLabel = document.createElement('p');
  generatorLabel.className = 'field-label';
  generatorLabel.textContent = 'Seeded Generator';

  const seedRow = createControlRow('Seed');
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.placeholder = 'front-...';
  seedInput.value = state.map.scenario?.generator?.seed ?? createRandomMapSeed();
  seedRow.append(seedInput);

  const presetRow = createControlRow('Preset');
  const presetSelect = document.createElement('select');
  Object.values(MAP_GENERATION_PRESETS).forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = `${preset.label} · ${preset.width}x${preset.height} cells · ${preset.targetTextureSize}px bake`;
    presetSelect.append(option);
  });
  presetSelect.value = state.map.scenario?.generator?.preset ?? 'frontier_2k';
  presetRow.append(presetSelect);

  const generatorRow = document.createElement('div');
  generatorRow.className = 'button-row';
  const newSeedButton = button('New Seed');
  const generateButton = button('Generate Map');
  generatorRow.append(newSeedButton, generateButton);

  const generatorHint = document.createElement('p');
  generatorHint.className = 'status-line';

  section.append(row, generatorLabel, seedRow, presetRow, generatorRow, generatorHint, resetButton, fileInput);
  root.append(section);

  undoButton.addEventListener('click', () => {
    undo(state);
    bus.emit('render');
  });
  redoButton.addEventListener('click', () => {
    redo(state);
    bus.emit('render');
  });
  resetButton.addEventListener('click', () => {
    resetMap(state);
    bus.emit('render');
  });
  newSeedButton.addEventListener('click', () => {
    seedInput.value = createRandomMapSeed();
    state.status = `New seed ready: ${seedInput.value}`;
    bus.emit('render');
  });
  generateButton.addEventListener('click', () => {
    const seed = seedInput.value.trim() || createRandomMapSeed();
    seedInput.value = seed;
    const preset = presetSelect.value || 'frontier_2k';
    const nextMap = preset === 'first_night_blockout' ? createFirstNightMap({ seed }) : createSeededMap({ seed, preset });
    replaceMap(state, nextMap, {
      status: preset === 'first_night_blockout'
        ? `Generated The First Night natural shelter blockout (${seed})`
        : `Generated ${nextMap.width}x${nextMap.height} seeded frontier (${seed}) with ${nextMap.scenario?.neutralOutposts?.length ?? 0} neutral outposts`
    });
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    bus.emit('render');
  });
  exportButton.addEventListener('click', () => {
    const blob = new Blob([exportEditorMap(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = state.map.scenario?.generator?.seed
      ? `field-fronts-map-${state.map.scenario.generator.seed}.json`
      : 'field-fronts-map.json';
    anchor.click();
    URL.revokeObjectURL(url);
    state.status = 'Map exported';
    bus.emit('render');
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      importEditorMap(state, await file.text());
    } catch (error) {
      state.status = error.message;
    }
    fileInput.value = '';
    bus.emit('render');
  });

  function render() {
    const generator = state.map.scenario?.generator;
    if (generator?.seed && document.activeElement !== seedInput) {
      seedInput.value = generator.seed;
    }
    if (generator?.preset && MAP_GENERATION_PRESETS[generator.preset]) {
      presetSelect.value = generator.preset;
    }
    generatorHint.textContent = generator
      ? `${generator.preset} · ${state.map.width}x${state.map.height} cells · ${generator.targetTextureSize}px bake target · ${state.map.scenario?.neutralOutposts?.length ?? 0} neutral outposts`
      : 'Generate a deterministic frontier: same seed = same terrain, starts and neutral outposts.';
    if (generator?.preset === 'first_night_blockout') {
      generatorHint.textContent = `The First Night blockout - ${state.map.width}x${state.map.height} cells - natural shelter chain`;
    }
  }

  bus.on('render', render);
  render();
}


export function mountScenarioControls(root, state, bus) {
  const section = createSection('Scenario Spine');

  const modeHint = document.createElement('p');
  modeHint.className = 'status-line';
  modeHint.textContent = 'Build the playable spine only: beginning, middle world-events, and ending. No cutscene lock, no dialogue tree swamp.';

  const scenarioRow = createControlRow('Chapter');
  const scenarioSelect = document.createElement('select');
  scenarioRow.append(scenarioSelect);

  const seedRow = createControlRow('Scene seed');
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.placeholder = 'scene-...';
  seedInput.value = state.map.scenario?.scenarioLayer?.seed ?? createRandomScenarioSeed();
  seedRow.append(seedInput);

  const presetRow = createControlRow('Mood preset');
  const presetSelect = document.createElement('select');
  Object.values(SCENARIO_STORY_PRESETS).forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.label;
    presetSelect.append(option);
  });
  presetSelect.value = state.map.scenario?.scenarioLayer?.preset ?? 'black_sky_arrival';
  presetRow.append(presetSelect);

  ensureScenarioCatalogueForMap(state.map);
  state.activeScenarioId = state.map.scenario?.activeScenarioId ?? state.activeScenarioId ?? 'chapter_001';

  const actionRow = document.createElement('div');
  actionRow.className = 'button-row';
  const newSeedButton = button('New Seed');
  const generateButton = button('Generate Spine');
  actionRow.append(newSeedButton, generateButton);

  const secondaryRow = document.createElement('div');
  secondaryRow.className = 'button-row';
  const activateScenarioButton = button('Use Chapter');
  const previewOmenButton = button('Preview Omen');
  secondaryRow.append(activateScenarioButton, previewOmenButton);

  const blankSceneRow = document.createElement('div');
  blankSceneRow.className = 'button-row';
  const newBlankSceneButton = button('New Blank Scene');
  const clearPlacementButton = button('Clear Placement Tool');
  blankSceneRow.append(newBlankSceneButton, clearPlacementButton);

  const toggleRow = document.createElement('label');
  toggleRow.className = 'checkbox-row';
  const showToggle = document.createElement('input');
  showToggle.type = 'checkbox';
  toggleRow.append(showToggle, document.createTextNode(' Show diegetic event layer'));

  const presentationHeading = document.createElement('p');
  presentationHeading.className = 'scenario-tool-heading';
  presentationHeading.textContent = 'Scene Presentation';
  const presentationToggles = [
    ['ui', 'statusBar', 'Status and pause bar'],
    ['ui', 'playtest', 'Playtest diagnostics'],
    ['ui', 'build', 'Build and order buttons'],
    ['ui', 'resources', 'Resource panel'],
    ['ui', 'selection', 'Selection details'],
    ['visuals', 'weather', 'Clouds and storm weather']
  ].map(([group, id, label]) => {
    const row = document.createElement('label');
    row.className = 'checkbox-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    row.append(input, document.createTextNode(` ${label}`));
    input.addEventListener('change', () => {
      updateScenePresentation(state.map, group, id, input.checked);
      state.map.revision = (state.map.revision ?? 0) + 1;
      state.dirty = true;
      state.status = `${label}: ${input.checked ? 'visible' : 'hidden'} in this scene`;
      bus.emit('render');
    });
    return { group, id, row, input };
  });

  const placementHeading = document.createElement('p');
  placementHeading.className = 'scenario-tool-heading';
  placementHeading.textContent = 'Place Scene Entities';
  const placementHint = document.createElement('p');
  placementHint.className = 'status-line';
  placementHint.textContent = 'Choose an object, then click its tile on the map.';
  const placementGrid = document.createElement('div');
  placementGrid.className = 'scenario-placement-grid';
  const placementButtons = SCENE_PLACEMENT_TOOLS.map((tool) => {
    const toolButton = button(tool.label);
    toolButton.dataset.sceneTool = tool.id;
    toolButton.addEventListener('click', () => {
      state.scenePlacementTool = tool.id;
      state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
      state.mode = 'edit';
      state.status = `${tool.label}: click the map to place`;
      bus.emit('render');
    });
    placementGrid.append(toolButton);
    return toolButton;
  });
  const placementList = document.createElement('div');
  placementList.className = 'scenario-list';

  const cameraModeRow = createControlRow('Opening camera');
  const cameraModeSelect = document.createElement('select');
  ['full_scene', 'commander', 'selected_unit', 'selected_point'].forEach((id) => {
    const mode = SCENARIO_CAMERA_MODES[id];
    const option = document.createElement('option');
    option.value = mode.id;
    option.textContent = mode.label;
    cameraModeSelect.append(option);
  });
  cameraModeSelect.value = state.scenarioCamera?.mode ?? 'commander';
  cameraModeRow.append(cameraModeSelect);

  const zoomRow = createControlRow('Opening zoom');
  const zoomInput = document.createElement('input');
  zoomInput.type = 'range';
  zoomInput.min = '1';
  zoomInput.max = '4';
  zoomInput.step = '0.25';
  zoomInput.value = String(state.scenarioCamera?.zoom ?? 1.25);
  const zoomOutput = document.createElement('output');
  zoomOutput.textContent = `${Number(zoomInput.value).toFixed(2)}x`;
  zoomRow.append(zoomInput, zoomOutput);

  const cameraPointRow = document.createElement('div');
  cameraPointRow.className = 'button-row';
  const setPointButton = button('Set Point From Tile');
  const resetCameraButton = button('Reset Full Scene');
  cameraPointRow.append(setPointButton, resetCameraButton);

  const spineStatus = document.createElement('div');
  spineStatus.className = 'scenario-spine-status';

  const spineGrid = document.createElement('div');
  spineGrid.className = 'scenario-spine-grid';
  const beginningCard = createSpineCard('Beginning');
  const middleCard = createSpineCard('Middle Events');
  const endingCard = createSpineCard('Ending');
  spineGrid.append(beginningCard.card, middleCard.card, endingCard.card);

  const eventList = document.createElement('div');
  eventList.className = 'scenario-list';

  section.append(
    modeHint, scenarioRow, seedRow, presetRow, actionRow, secondaryRow, blankSceneRow,
    presentationHeading, ...presentationToggles.map((entry) => entry.row), toggleRow,
    placementHeading, placementHint, placementGrid, placementList,
    cameraModeRow, zoomRow, cameraPointRow, spineStatus, spineGrid, eventList
  );
  root.append(section);

  newSeedButton.addEventListener('click', () => {
    seedInput.value = createRandomScenarioSeed();
    state.status = `New scenario seed ready: ${seedInput.value}`;
    bus.emit('render');
  });

  generateButton.addEventListener('click', () => {
    const seed = seedInput.value.trim() || createRandomScenarioSeed();
    seedInput.value = seed;
    const preset = presetSelect.value || 'black_sky_arrival';
    const scenarioLayer = createScenarioLayerForMap(state.map, { seed, preset });
    const scenarioSpine = createDefaultScenarioSpine({
      ...state.map,
      scenario: {
        ...(state.map.scenario ?? {}),
        scenarioLayer
      }
    }, scenarioLayer);
    state.map.scenario = {
      ...(state.map.scenario ?? {}),
      scenarioLayer,
      scenarioSpine,
      scenarioRuntime: normaliseScenarioRuntime({}, scenarioSpine)
    };
    ensureScenarioCatalogueForMap(state.map, { seed, preset });
    activateScenario(state, state.map.scenario.activeScenarioId ?? 'chapter_001');
    state.map.revision = (state.map.revision ?? 0) + 1;
    state.showScenarioLayer = true;
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.dirty = true;
    state.gameDirty = true;
    state.scenarioCamera = normaliseScenarioCameraRig(scenarioSpine.beginning.openingCamera, { fallbackPoint: scenarioSpine.beginning.commanderStart });
    state.status = `Scenario spine generated: beginning, ${scenarioSpine.middle.events.length} middle events, ending gate`;
    bus.emit('render');
  });

  activateScenarioButton.addEventListener('click', () => {
    const result = activateScenario(state, scenarioSelect.value);
    state.showScenarioLayer = true;
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.status = result.ok
      ? `Scenario spine selected: ${result.scenario.title}`
      : 'No available scenario selected.';
    bus.emit('render');
  });

  newBlankSceneButton.addEventListener('click', () => {
    const seed = seedInput.value.trim() || createRandomScenarioSeed();
    const preset = presetSelect.value || 'black_sky_arrival';
    state.map.scenario = {
      ...(state.map.scenario ?? {}),
      sceneEntity: createBlankSceneEntity(),
      scenarioLayer: normaliseScenarioLayer({
        seed,
        preset,
        status: 'draft',
        notes: 'Blank scene: add authored beats, entities and presentation options in Map Maker.'
      }),
      scenarioSpine: {
        id: 'chapter_001_spine',
        chapterId: 'chapter_001',
        title: 'Chapter 1',
        designIntent: 'Blank scene awaiting authored beginning, gameplay events and ending.',
        beginning: { commanderStart: null, openingCamera: { mode: 'full_scene', zoom: 1 }, worldCue: null, silhouette: null },
        middle: { events: [] },
        ending: { victory: null, failure: null, nextScenarioId: null }
      }
    };
    ensureSceneEntityForMap(state.map);
    state.scenePlacementTool = null;
    state.showScenarioLayer = false;
    resetGameForMap(state);
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.map.revision = (state.map.revision ?? 0) + 1;
    state.dirty = true;
    state.gameDirty = true;
    state.status = 'Blank Chapter 1 scene ready: place starts, units, nodes and story logic';
    bus.emit('render');
  });

  clearPlacementButton.addEventListener('click', () => {
    state.scenePlacementTool = null;
    state.status = 'Scene placement tool cleared';
    bus.emit('render');
  });

  showToggle.addEventListener('change', () => {
    state.showScenarioLayer = showToggle.checked;
    updateScenePresentation(state.map, 'visuals', 'scenarioLayer', showToggle.checked);
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.dirty = true;
    state.status = state.showScenarioLayer ? 'Scenario spine layer visible' : 'Scenario spine layer hidden';
    bus.emit('render');
  });

  bus.on('scenario:place-entity', ({ tile } = {}) => {
    const tool = SCENE_PLACEMENT_TOOLS.find((candidate) => candidate.id === state.scenePlacementTool);
    if (!tool || !tile) return;
    const result = placeSceneEntity(state.map, tool.id, tile);
    if (!result.ok) {
      state.status = 'Could not place scene entity on this tile';
      bus.emit('render');
      return;
    }
    resetGameForMap(state);
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    state.mode = 'edit';
    state.map.revision = (state.map.revision ?? 0) + 1;
    state.dirty = true;
    state.gameDirty = true;
    state.status = `${tool.label} placed at ${tile.x}, ${tile.y}`;
    bus.emit('render');
  });

  cameraModeSelect.addEventListener('change', () => {
    applyOpeningCameraPatch({ mode: cameraModeSelect.value });
  });

  zoomInput.addEventListener('input', () => {
    applyOpeningCameraPatch({ zoom: Number(zoomInput.value) });
  });

  setPointButton.addEventListener('click', () => {
    const point = state.selectedTile ?? state.hoverTile ?? state.map.scenario?.scenarioSpine?.beginning?.commanderStart ?? null;
    if (!point) {
      state.status = 'Select or hover a map tile before setting the opening camera point.';
      bus.emit('render');
      return;
    }
    applyOpeningCameraPatch({ mode: 'selected_point', point });
  });

  resetCameraButton.addEventListener('click', () => {
    applyOpeningCameraPatch({ mode: 'full_scene', zoom: 1, point: state.scenarioCamera?.point ?? null });
  });

  previewOmenButton.addEventListener('click', () => {
    const cue = state.map.scenario?.scenarioSpine?.beginning?.worldCue ?? state.map.scenario?.scenarioLayer?.cameraCues?.[0];
    if (!cue) {
      state.status = 'Generate a scenario spine before previewing the omen cue.';
      bus.emit('render');
      return;
    }
    state.showScenarioLayer = true;
    applyOpeningCameraPatch({ mode: 'selected_point', point: cue.tile, cueId: cue.id }, { silent: true });
    bus.emit('scenario:camera-shake', { cue: { ...cue, intensity: 0.62, durationMs: 280 } });
  });

  function applyOpeningCameraPatch(patch, { silent = false } = {}) {
    const spine = state.map.scenario?.scenarioSpine ?? createDefaultScenarioSpine(state.map, state.map.scenario?.scenarioLayer);
    const nextCamera = normaliseScenarioCameraRig({
      ...(spine.beginning?.openingCamera ?? {}),
      ...(patch ?? {})
    }, { fallbackPoint: spine.beginning?.commanderStart ?? null });
    const nextSpine = {
      ...spine,
      beginning: {
        ...spine.beginning,
        openingCamera: nextCamera
      }
    };
    state.map.scenario = {
      ...(state.map.scenario ?? {}),
      scenarioSpine: nextSpine
    };
    state.scenarioCamera = nextCamera;
    state.map.revision = (state.map.revision ?? 0) + 1;
    state.dirty = true;
    state.showScenarioLayer = true;
    state.experienceMode = EXPERIENCE_MODES.MAP_MAKER;
    if (!silent) {
      const label = SCENARIO_CAMERA_MODES[nextCamera.mode]?.label ?? nextCamera.mode;
      state.status = `Opening camera: ${label} @ ${nextCamera.zoom.toFixed(2)}x`;
    }
    bus.emit('render');
  }

  function render() {
    ensureScenarioCatalogueForMap(state.map);
    const scene = summarizeSceneEntity(state.map);
    const presentation = getScenePresentation(state.map);
    const layer = state.map.scenario?.scenarioLayer ?? null;
    const spine = state.map.scenario?.scenarioSpine ?? null;
    const layerSummary = summarizeScenarioLayer(layer);
    const spineSummary = summarizeScenarioSpine(spine, { map: state.map, runtime: state.scenarioRuntime ?? state.map.scenario?.scenarioRuntime });
    const validation = validateScenarioSpine(spine, { map: state.map });
    if (layer?.seed && document.activeElement !== seedInput) {
      seedInput.value = layer.seed;
    }
    if (layer?.preset && SCENARIO_STORY_PRESETS[layer.preset]) {
      presetSelect.value = layer.preset;
    }
    const slots = getScenarioSelectionSlots(state.map, { includeLocked: true });
    const activeScenarioId = state.map.scenario?.activeScenarioId ?? state.activeScenarioId ?? slots[0]?.id ?? 'chapter_001';
    const previousScenarioValue = scenarioSelect.value;
    scenarioSelect.replaceChildren(...slots.map((slot) => {
      const option = document.createElement('option');
      option.value = slot.id;
      option.textContent = slot.locked ? `${slot.title} - locked` : `${slot.title} - spine ${slot.spineStatus ?? 'unknown'}`;
      option.disabled = Boolean(slot.locked || !slot.available);
      return option;
    }));
    scenarioSelect.value = slots.some((slot) => slot.id === activeScenarioId) ? activeScenarioId : (previousScenarioValue || slots[0]?.id || 'chapter_001');
    activateScenarioButton.disabled = slots.length === 0 || Boolean(slots.find((slot) => slot.id === scenarioSelect.value)?.locked);

    const cameraRig = normaliseScenarioCameraRig(state.scenarioCamera ?? spine?.beginning?.openingCamera ?? layer?.cameraRig, { fallbackPoint: spine?.beginning?.commanderStart ?? layer?.storyBeats?.[0]?.tile ?? null });
    if (document.activeElement !== cameraModeSelect) cameraModeSelect.value = cameraRig.mode;
    if (document.activeElement !== zoomInput) zoomInput.value = String(cameraRig.zoom);
    zoomOutput.textContent = `${cameraRig.zoom.toFixed(2)}x`;
    zoomInput.disabled = cameraRig.mode === 'full_scene';
    resetCameraButton.disabled = cameraRig.mode === 'full_scene' && cameraRig.zoom === 1;
    showToggle.checked = Boolean(state.showScenarioLayer);
    presentationToggles.forEach(({ group, id, input }) => {
      input.checked = Boolean(presentation[group]?.[id]);
    });
    placementButtons.forEach((toolButton) => {
      const tool = SCENE_PLACEMENT_TOOLS.find((candidate) => candidate.id === toolButton.dataset.sceneTool);
      const allowedInOpening = tool && (
        tool.kind === 'shelter'
        || ['player_start', 'hunter_guard', 'scout_forager', 'tribe_members', 'wounded_survivor', 'supply_bundle', 'scene_beat', 'trigger'].includes(tool.id)
      );
      toolButton.hidden = isNomadicSurvivalScene(state.map) && !allowedInOpening;
      toolButton.setAttribute('aria-pressed', String(toolButton.dataset.sceneTool === state.scenePlacementTool));
    });
    clearPlacementButton.disabled = !state.scenePlacementTool;
    placementList.replaceChildren(...Object.entries(scene.placements)
      .filter(([, count]) => count > 0)
      .map(([toolId, count]) => {
        const tool = SCENE_PLACEMENT_TOOLS.find((candidate) => candidate.id === toolId);
        const row = document.createElement('div');
        row.className = 'scenario-row';
        const title = document.createElement('strong');
        title.textContent = tool?.label ?? toolId;
        const meta = document.createElement('span');
        meta.textContent = `${count} placed`;
        row.append(title, meta);
        return row;
      }));
    if (scene.authoredEntityCount === 0) {
      placementList.textContent = scene.template === 'blank'
        ? 'Blank scene. Place a player start or a narrative marker to begin Chapter 1.'
        : 'Generated chapter uses its existing runtime starts and events.';
    }
    previewOmenButton.disabled = !spineSummary.present;

    spineStatus.dataset.status = spineSummary.status;
    spineStatus.replaceChildren(
      createSpineStatusLine(`${spineSummary.title ?? 'Chapter 1'} · ${spineSummary.status.toUpperCase()} · ${spineSummary.completionPercent}%`, validation.missing.length ? `Missing: ${validation.missing.join(', ')}` : 'Ready: beginning → events → ending gate')
    );

    updateSpineCard(beginningCard, validation.beginningReady, 'Start + omen', spine?.beginning?.worldCue?.label ?? 'No opening cue', spine?.beginning?.commanderStart);
    updateSpineCard(middleCard, validation.middleReady, `${spine?.middle?.events?.length ?? 0} gameplay events`, spine?.middle?.events?.map((event) => event.label).join(' → ') || 'No middle events', null);
    updateSpineCard(endingCard, validation.endingReady, spine?.ending?.victory?.summary ?? 'No ending condition', `Failure: ${spine?.ending?.failure?.summary ?? 'missing'} · Next: ${spine?.ending?.nextScenarioId ?? 'none'}`, null);

    const runtime = state.scenarioRuntime ?? state.map.scenario?.scenarioRuntime;
    const triggered = new Set(runtime?.triggeredEventIds ?? []);
    const events = spine?.middle?.events ?? [];
    eventList.replaceChildren(...events.map((event) => {
      const row = document.createElement('div');
      row.className = 'scenario-row';
      const title = document.createElement('strong');
      title.textContent = `${triggered.has(event.id) ? '✓ ' : '◇ '}${event.label}`;
      const meta = document.createElement('span');
      meta.textContent = `${event.trigger.type} · ${event.effects.map((effect) => effect.type).join(', ')}`;
      row.append(title, meta);
      return row;
    }));
    if (events.length === 0) {
      eventList.textContent = layerSummary.present
        ? 'Scenario layer exists, but no spine events yet. Generate Spine.'
        : 'No scenario spine yet. Generate one over the current map seed.';
    }
  }

  bus.on('render', render);
  render();
}

function createSpineCard(titleText) {
  const card = document.createElement('div');
  card.className = 'scenario-spine-card';
  const title = document.createElement('strong');
  const body = document.createElement('span');
  const detail = document.createElement('small');
  title.textContent = titleText;
  card.append(title, body, detail);
  return { card, title, body, detail };
}

function updateSpineCard(card, ready, bodyText, detailText, tile = null) {
  card.card.dataset.ready = String(Boolean(ready));
  card.body.textContent = bodyText;
  card.detail.textContent = tile ? `${detailText} · tile ${tile.x},${tile.y}` : detailText;
}

function createSpineStatusLine(headline, detail) {
  const wrap = document.createElement('div');
  const head = document.createElement('strong');
  const small = document.createElement('span');
  head.textContent = headline;
  small.textContent = detail;
  wrap.append(head, small);
  return wrap;
}

export function mountInspector(root, state, bus) {
  const section = createSection('Inspector');
  const grid = document.createElement('div');
  grid.className = 'inspector-grid';
  const status = document.createElement('p');
  status.className = 'status-line';
  section.append(grid, status);
  root.append(section);

  function render() {
    const tile = state.selectedTile ?? state.hoverTile;
    const terrainId = tile ? getTile(state.map, tile.x, tile.y) : null;
    const terrain = terrainId ? getTerrain(terrainId) : null;
    const activeField = state.activeField === 'none' ? 'passability' : state.activeField;
    const fieldValue = tile ? getFieldValue(state.fields, activeField, tile.x, tile.y) : null;
    const elevation = tile ? getElevation(state.map, tile.x, tile.y) : null;
    const entity = getSelectedGameEntity(state.game);
    grid.replaceChildren(
      metric('Tile', tile ? `${tile.x}, ${tile.y}` : 'None'),
      metric('Terrain', terrain?.label ?? 'None'),
      metric('Height', elevation == null ? 'None' : elevation.toFixed(2)),
      metric('Brush', state.brush.tool === 'height' ? `Height ${state.brush.heightDirection}` : getTerrain(state.brush.terrainId).label),
      metric(FIELD_OVERLAYS[activeField].label, fieldValue == null ? 'None' : fieldValue.toFixed(2)),
      metric('Selected Entity', entity?.name ?? 'None'),
      metric('Entity Type', entity?.entityType ?? entity?.type ?? 'None'),
      metric('Mode', state.mode)
    );
    status.textContent = state.status;
  }

  bus.on('render', render);
  render();
}

export function mountCommandGraph(root, state, bus) {
  const section = createSection('Leader Command Graph');
  const list = document.createElement('div');
  list.className = 'graph-list';
  section.append(list);
  root.append(section);

  function render() {
    const selected = getSelectedGameEntity(state.game);
    if (selected?.entityType === 'structure') {
      renderStructureInspector(selected);
      return;
    }
    if (selected?.type === 'squad') {
      const title = document.createElement('p');
      title.className = 'status-line';
      const hp = selected.health ? `, HP ${Math.round(selected.health.health)}/${Math.round(selected.health.maxHealth)}` : '';
      const combat = selected.combat ? `, arrows ${selected.combat.attackRange.toFixed(1)}t / ${selected.combat.rateOfFireTicks}t` : '';
      title.textContent = `${selected.name}: ${selected.members.length} soldiers${hp}${combat}, LoS ${selected.sightRadius.toFixed(1)}, ${formatMovement(selected)}`;
      const rows = Object.entries(selected.attributes).map(([key, value]) => {
        const row = document.createElement('div');
        row.className = 'graph-node';
        const head = document.createElement('div');
        head.className = 'graph-node-head';
        head.innerHTML = `<strong>${toLabel(key)}</strong><span>${Math.round(value * 100)}%</span>`;
        const bar = document.createElement('div');
        bar.className = 'graph-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.round(value * 100)}%`;
        bar.append(fill);
        const sources = document.createElement('small');
        sources.textContent = `squad.${key}`;
        row.append(head, bar, sources);
        return row;
      });
      list.replaceChildren(title, ...rows);
      return;
    }

    const leader = selected?.type === 'leader'
      ? selected
      : state.game.leaders.find((candidate) => candidate.factionId === 'player');

    if (!leader?.command?.graph) {
      list.textContent = 'Select a leader unit to inspect command subinfluences.';
      return;
    }

    const title = document.createElement('p');
    title.className = 'status-line';
    const projection = leader.objectiveProjection?.value == null
      ? ''
      : `, objective pressure ${Math.round(leader.objectiveProjection.value * 100)}%`;
    const movement = leader.movement?.speedKph
      ? `, foot ${leader.movement.speedKph.toFixed(1)} km/h`
      : '';
    const hp = leader.health ? `, HP ${Math.round(leader.health.health)}/${Math.round(leader.health.maxHealth)}` : '';
    const combat = leader.combat ? `, arrows ${leader.combat.attackRange.toFixed(1)}t / ${leader.combat.rateOfFireTicks}t` : '';
    title.textContent = `${leader.name}: score ${leader.commandScore}${hp}${combat}, radius ${leader.influenceRadius}${projection}${movement}`;

    const nodes = leader.command.graph.map((node) => {
      const row = document.createElement('div');
      row.className = 'graph-node';
      const head = document.createElement('div');
      head.className = 'graph-node-head';
      head.innerHTML = `<strong>${node.label}</strong><span>${Math.round(node.value * 100)}%</span>`;
      const bar = document.createElement('div');
      bar.className = 'graph-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.round(node.value * 100)}%`;
      bar.append(fill);
      const sources = document.createElement('small');
      sources.textContent = node.sources.join(' + ');
      row.append(head, bar, sources);
      return row;
    });

    list.replaceChildren(title, ...nodes);
  }

  function renderStructureInspector(structure) {
    const title = document.createElement('p');
    title.className = 'status-line';
    title.textContent = `${structure.name}: ${toLabel(structure.type)}, ${structure.construction.state}, ${structure.integrity.health}/${structure.integrity.maxHealth} integrity`;
    const rows = [
      structureMetric('Footprint', `${structure.footprint.shape}, ${structure.footprint.blocksGroundMovement ? 'blocks ground' : 'does not block'}`, 'structure.footprint'),
      structureMetric('Navigation', `${structure.nav.blocksFlowField ? 'flow blocker' : `cost x${structure.nav.movementCostModifier.toFixed(2)}`}${structure.nav.gateState ? `, gate ${structure.nav.gateState}` : ''}`, 'structure.nav'),
      structureMetric('Occupancy', structure.occupancy.enabled ? `${structure.occupancy.mode}, ${structure.occupancy.occupants.length}/${structure.occupancy.capacitySquads} squads` : 'disabled', 'structure.occupancy'),
      structureMetric('Combat', structure.combat.grantsCover ? `cover ${Math.round(structure.combat.coverRating * 100)}%, range x${structure.combat.rangeModifier.toFixed(2)}` : 'no cover metadata', 'structure.combat'),
      structureMetric('Influence', `control ${structure.influence.controlRadius}, vision ${structure.influence.visionRadius}, defence ${structure.influence.defenceRadius}`, 'structure.influence')
    ];
    list.replaceChildren(title, ...rows);
  }

  bus.on('render', render);
  render();
}

function structureMetric(label, value, source) {
  const row = document.createElement('div');
  row.className = 'graph-node';
  const head = document.createElement('div');
  head.className = 'graph-node-head';
  const strong = document.createElement('strong');
  strong.textContent = label;
  const span = document.createElement('span');
  span.textContent = value;
  head.append(strong, span);
  const sources = document.createElement('small');
  sources.textContent = source;
  row.append(head, sources);
  return row;
}

function createSection(title) {
  const section = document.createElement('section');
  section.className = 'panel-section';
  const heading = document.createElement('h2');
  heading.className = 'section-title';
  heading.textContent = title;
  section.append(heading);
  return section;
}

function createControlRow(labelText) {
  const row = document.createElement('label');
  row.className = 'control-row';
  const span = document.createElement('span');
  span.textContent = labelText;
  row.append(span);
  return row;
}

function button(text, extraClass = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = extraClass ? `wide-button ${extraClass}` : 'wide-button';
  element.textContent = text;
  return element;
}

function metric(label, value) {
  const node = document.createElement('div');
  node.className = 'metric';
  node.innerHTML = `<strong>${label}</strong><span>${value}</span>`;
  return node;
}

function formatMovement(leader) {
  if (!leader?.movement) {
    return 'n/a';
  }
  if (leader.movement.status === 'idle') {
    return `idle, ${MOVEMENT_MODEL.tileMeters}m tiles`;
  }
  return `${leader.movement.status} ${leader.movement.speedKph.toFixed(1)} km/h`;
}


function formatWeatherSummary(game) {
  const weather = game?.weather;
  if (!weather) {
    return 'initialising';
  }
  const dominant = String(weather.dominant ?? 'clear').replaceAll('-', ' ');
  const cloud = weather.fields?.cloudCover?.average;
  const rain = weather.fields?.rainfall?.average;
  if (Number.isFinite(Number(cloud)) && Number.isFinite(Number(rain))) {
    return `${dominant} · C${Number(cloud).toFixed(2)} R${Number(rain).toFixed(2)}`;
  }
  return dominant;
}

function formatSupplies(game, factionId) {
  const stockpile = game?.economy?.factions?.[factionId]?.stockpiles?.[RESOURCE_IDS.supplies];
  const income = game?.economy?.factions?.[factionId]?.lastIncome?.[RESOURCE_IDS.supplies];
  if (!stockpile) {
    return 'n/a';
  }
  const amount = Math.floor(stockpile.amount);
  const incomeText = income?.amount ? ` +${income.amount.toFixed(1)}` : '';
  return `${amount}${incomeText}`;
}

function toLabel(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
