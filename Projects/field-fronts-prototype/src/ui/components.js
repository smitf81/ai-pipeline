import { FIELD_OVERLAYS, TERRAIN_ORDER, getTerrain } from '../config/terrain.js';
import { BRUSH_SHAPES } from '../editor/brush.js';
import { exportEditorMap, exportGameState, importEditorMap, importGameState, redo, resetMap, undo } from '../editor/editorState.js';
import { GAME_OVERLAYS, MOVEMENT_MODEL, PRESSURE_STANCES, getSelectedGameEntity, resetGameForMap, setPlayerPressureStance, summarizeStructureTopology } from '../game/gameModel.js';
import { RESOURCE_IDS } from '../game/economy.js';
import { getElevation, getTile } from '../world/mapModel.js';
import { getFieldValue } from '../world/fields.js';

export function mountModeControls(root, state, bus) {
  const section = createSection('Prototype Mode');
  const row = document.createElement('div');
  row.className = 'button-row';
  const playButton = button('Play Loop');
  const editButton = button('Edit Map');
  row.append(playButton, editButton);
  const hint = document.createElement('p');
  hint.className = 'status-line';
  section.append(row, hint);
  root.append(section);

  playButton.addEventListener('click', () => {
    state.mode = 'play';
    state.status = 'Play loop active: click leaders/outposts to inspect command';
    bus.emit('render');
  });
  editButton.addEventListener('click', () => {
    state.mode = 'edit';
    state.status = 'Edit mode active: paint terrain, then return to play loop';
    bus.emit('render');
  });

  function render() {
    playButton.setAttribute('aria-pressed', String(state.mode === 'play'));
    editButton.setAttribute('aria-pressed', String(state.mode === 'edit'));
    hint.textContent = state.mode === 'play'
      ? 'Play: select command units and read their influence graph.'
      : 'Edit: terrain changes immediately alter derived command pressure.';
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
  toolRow.append(terrainTool, raiseTool);

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

  const shapeLabel = document.createElement('label');
  shapeLabel.className = 'field-label';
  shapeLabel.textContent = 'Shape';

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

  section.append(toolRow, lowerTool, radiusRow, shapeLabel, shape, heightRow, lowerHint);
  root.append(section);

  terrainTool.addEventListener('click', () => {
    state.brush.tool = 'terrain';
    state.mode = 'edit';
    state.status = 'Terrain brush active';
    bus.emit('render');
  });
  raiseTool.addEventListener('click', () => {
    state.brush.tool = 'height';
    state.brush.heightDirection = 'raise';
    state.activeField = 'height';
    state.mode = 'edit';
    state.status = 'Height brush active: drag to raise terrain';
    bus.emit('render');
  });
  lowerTool.addEventListener('click', () => {
    state.brush.tool = 'height';
    state.brush.heightDirection = 'lower';
    state.activeField = 'height';
    state.mode = 'edit';
    state.status = 'Height brush active: drag to lower terrain';
    bus.emit('render');
  });
  radius.addEventListener('input', () => {
    state.brush.radius = Number(radius.value);
    state.mode = 'edit';
    bus.emit('render');
  });
  shape.addEventListener('change', () => {
    state.brush.shape = shape.value;
    state.mode = 'edit';
    bus.emit('render');
  });
  heightDelta.addEventListener('input', () => {
    state.brush.heightDelta = Number(heightDelta.value);
    state.brush.tool = 'height';
    state.activeField = 'height';
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
    state.activeField = select.value;
    state.status = state.activeField === 'none' ? 'Terrain overlay cleared' : `${FIELD_OVERLAYS[state.activeField].label} terrain overlay`;
    bus.emit('render');
  });

  lightingToggle.addEventListener('change', () => {
    state.dynamicLighting = lightingToggle.checked;
    state.status = state.dynamicLighting ? 'Dynamic 2D Lighting enabled' : 'Flat shading enabled';
    bus.emit('render');
  });

  function downloadBakedTexture(type) {
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

  const summary = document.createElement('div');
  summary.className = 'compact-summary';
  advancedBody.append(tickRow, intervalRow, stateRow, overlayLabel, overlaySelect, radiiRow, summary, stateFileInput);
  advanced.append(advancedBody);
  section.append(liveHint, playerOrderLabel, playerOrderRow, quickSummary, advanced);
  root.append(section);

  stepButton.addEventListener('click', () => {
    bus.emit('game:step-tick');
  });
  resetButton.addEventListener('click', () => {
    resetGameForMap(state);
    state.renderMotion = null;
    bus.emit('render');
  });
  intervalInput.addEventListener('input', () => {
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
    state.gameOverlay = overlaySelect.value;
    state.status = state.gameOverlay === 'none' ? 'Command overlay cleared' : `${GAME_OVERLAYS[state.gameOverlay].label} overlay`;
    bus.emit('render');
  });
  radiiToggle.addEventListener('change', () => {
    state.showCommandRadii = radiiToggle.checked;
    bus.emit('render');
  });

  function render() {
    overlaySelect.value = state.gameOverlay;
    radiiToggle.checked = state.showCommandRadii;
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
  section.append(row, resetButton, fileInput);
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
  exportButton.addEventListener('click', () => {
    const blob = new Blob([exportEditorMap(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'field-fronts-map.json';
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
      title.textContent = `${selected.name}: ${selected.members.length} soldiers, radius ${selected.influenceRadius.toFixed(1)}, LoS ${selected.sightRadius.toFixed(1)}, ${formatMovement(selected)}`;
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
    title.textContent = `${leader.name}: score ${leader.commandScore}, radius ${leader.influenceRadius}${projection}${movement}`;

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
