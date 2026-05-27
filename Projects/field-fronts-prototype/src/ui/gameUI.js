/**
 * gameUI.js — Field Fronts game-layer UI
 *
 * Provides three screens layered over the canvas:
 *   1. Main Menu  – mode select, map picker, map maker entry
 *   2. Pause Menu – resume, settings stub, exit to menu, quit
 *   3. In-Game HUD – collapsible build panel, economy readout, tick/status bar
 *
 * Nothing in here touches mechanics, world state, or the renderer directly.
 * It emits events on the bus and reads the top-level `state` object only
 * through the narrow surface that already existed.
 */

import { EXPERIENCE_MODES, isMapMakerMode } from '../core/appModes.js';
import { BUILDING_OPTIONS, UNIT_OPTIONS } from '../game/buildCatalog.js';
import { RESOURCE_IDS, canAffordCost, describeResourceCost } from '../game/economy.js';
import { getBuildOptionLockReason, isBuildOptionUnlocked } from '../game/progressionSystem.js';
import { COMMAND_WHEEL_ACTIONS, commandFeedbackTone } from '../game/commandWheel.js';
import { buildPlaytestSnapshot, getWeatherQualityLabel } from '../game/playtestStabilization.js';
import { PRESSURE_STANCES } from '../game/gameModel.js';
import { getScenarioSelectionSlots, selectScenario, summarizeScenarioCatalogue } from '../world/scenarioCatalogue.js';
import { getScenePresentation, isNomadicSurvivalScene } from '../world/sceneEntity.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function el(tag, cls, ...children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const child of children) {
    if (child == null) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function btn(text, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls || 'ui-btn';
  b.textContent = text;
  return b;
}

function setUiScreen(state, bus, screen, { paused = screen === 'pause', status } = {}) {
  state.uiScreen = screen;
  state.paused = paused;
  if (status) state.status = status;
  bus.emit('ui:screen', screen);
  bus.emit('render');
}

function getResourceState(state, resourceId = RESOURCE_IDS.gold, factionId = 'player') {
  return state.game?.economy?.factions?.[factionId]?.stockpiles?.[resourceId] ?? null;
}

function getResourceIncome(state, resourceId = RESOURCE_IDS.gold, factionId = 'player') {
  return state.game?.economy?.factions?.[factionId]?.lastIncome?.[resourceId] ?? null;
}

function isBuildOptionVisible(state, option) {
  return isBuildOptionUnlocked(state.game?.progression, option);
}

function canAffordBuildOption(state, option, factionId = 'player') {
  if (!option) return false;
  return canAffordCost(state.game?.economy, factionId, option.resourceCost ?? { [RESOURCE_IDS.gold]: option.cost ?? 0 }).ok;
}

function getBuildCostLabel(option) {
  return option?.costLabel ?? describeResourceCost(option?.resourceCost ?? { [RESOURCE_IDS.gold]: option?.cost ?? 0 });
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '0';
  return digits > 0 ? value.toFixed(digits) : String(Math.floor(value));
}

function formatSupplyStatus(status) {
  return {
    ready: 'Ready',
    supplied: 'Supplied',
    thin: 'Thin rations',
    hungry: 'Hungry',
    starving: 'Starving'
  }[status] ?? 'Unknown';
}

function formatPhaseLabel(phase) {
  return {
    dawn: 'Dawn',
    day: 'Day',
    dusk: 'Dusk',
    night: 'Night'
  }[phase] ?? phase;
}

function getSupplyRatio(supply = {}) {
  if (Number.isFinite(supply.foodRatio)) {
    return Math.max(0, Math.min(1, supply.foodRatio));
  }
  return Math.max(0, Math.min(1, (Number(supply.food) || 0) / Math.max(1, Number(supply.foodCapacity) || 1)));
}

function getSupplyTone(ratio) {
  if (ratio <= 0.05) return 'starving';
  if (ratio <= 0.3) return 'hungry';
  if (ratio <= 0.62) return 'thin';
  return 'supplied';
}

function getRatio(value, maxValue, fallback = 0) {
  const max = Number(maxValue);
  const current = Number(value);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(current)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, current / max));
}

function getMeterTone(ratio) {
  if (ratio <= 0.18) return 'critical';
  if (ratio <= 0.42) return 'warn';
  return 'ok';
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatEntityKind(entity) {
  if (entity?.scenarioRole === 'hunter') return 'Hunter';
  if (entity?.scenarioRole === 'scout') return 'Forager Scout';
  if (entity?.scenarioRole === 'vulnerable') return 'Survivors';
  if (entity?.scenarioRole === 'wounded') return 'Wounded Survivor';
  if (entity?.scenarioRole === 'commander') return 'Tribal Leader';
  if (entity?.entityType === 'structure') return 'Structure';
  if (entity?.type === 'squad') return 'Infantry';
  if (entity?.type === 'leader') return 'Command';
  if (entity?.type === 'builder') return 'Builder';
  if (entity?.type === 'resource_worker') return 'Gatherer';
  if (entity?.type === 'transport') return 'Transport';
  if (entity?.type === 'outpost') return 'Outpost';
  return 'Selection';
}

function formatStanceLabel(stanceId) {
  return PRESSURE_STANCES[stanceId]?.label ?? stanceId ?? 'Probe';
}

function isPlayerOrderable(entity) {
  return entity?.factionId === 'player' && (entity.type === 'leader' || entity.type === 'squad');
}

function getMoraleRatio(entity) {
  if (entity?.type === 'squad') {
    return Number(entity.attributes?.morale ?? entity.attributes?.cohesion ?? Number.NaN);
  }
  if (entity?.type === 'leader') {
    const moraleNode = entity?.command?.graph?.find((node) => node.id === 'morale-cohesion');
    return Number(moraleNode?.value ?? Number.NaN);
  }
  return Number.NaN;
}

function getEmergencyStates(entity) {
  const states = [];
  const healthRatio = entity?.health ? getRatio(entity.health.health, entity.health.maxHealth, 1) : 1;
  const integrityRatio = entity?.integrity ? getRatio(entity.integrity.health, entity.integrity.maxHealth, 1) : 1;
  const morale = getMoraleRatio(entity);
  const supply = entity?.supply;
  if (supply?.status === 'starving' || (Number.isFinite(supply?.food) && supply.food <= 0)) {
    states.push({ tone: 'critical', label: 'Starving' });
  } else if (supply?.status === 'hungry') {
    states.push({ tone: 'warn', label: 'Hungry' });
  }
  if (entity?.behavior?.intent === 'return-for-food' || entity?.movementOrder?.routeMode === 'starvation-retreat') {
    states.push({ tone: 'warn', label: 'Retreating' });
  }
  if (entity?.combat?.enabled && supply?.status === 'starving') {
    states.push({ tone: 'critical', label: 'No volleys' });
  } else if (entity?.combat?.enabled && entity.combat.canAttack === false && entity.combat.lastBlockedReason) {
    states.push({ tone: 'muted', label: entity.combat.lastBlockedReason.replaceAll('-', ' ') });
  }
  if (healthRatio <= 0.25 || integrityRatio <= 0.25) {
    states.push({ tone: 'critical', label: 'Damaged' });
  }
  if (entity?.ai?.emotionalState && entity.ai.emotionalState !== 'calm') {
    const tone = ['panicked', 'routed'].includes(entity.ai.emotionalState) ? 'critical' : entity.ai.emotionalState === 'pressured' ? 'warn' : 'muted';
    states.push({ tone, label: entity.ai.emotionalState.replaceAll('_', ' ') });
  }
  if (entity?.ai?.lastIntentResponse?.status && entity.ai.lastIntentResponse.status !== 'accepted') {
    const tone = entity.ai.lastIntentResponse.status === 'rejected' ? 'critical' : 'warn';
    states.push({ tone, label: entity.ai.lastIntentResponse.status.replaceAll('_', ' ') });
  }
  if (Number.isFinite(morale) && morale <= 0.28) {
    states.push({ tone: 'critical', label: 'Morale broken' });
  }
  if (entity?.stealth?.coverState === 'hidden') {
    states.push({ tone: 'ok', label: `Hidden · ${entity.stealth.coverLabel ?? 'cover'}` });
  } else if (entity?.stealth?.coverState === 'in_cover') {
    states.push({ tone: 'muted', label: `Cover · ${entity.stealth.coverLabel ?? 'cover'}` });
  }
  if (entity?.stealth?.posture === 'crouched') {
    states.push({ tone: 'muted', label: 'Crouched' });
  }
  if (states.length === 0) {
    states.push({ tone: 'ok', label: 'Ready' });
  }
  return states.slice(0, 4);
}

function formatSourceLabel(source) {
  if (source.kind === 'contest-gradient') return 'Signal gradient';
  if (source.kind === 'base-outpost') return 'Base outpost';
  if (source.kind === 'hunting-field') return 'Hunting tent';
  if (source.kind === 'wood-delivery') return 'Wood delivery';
  return source.kind ?? 'Source';
}

function formatCommandMode(state) {
  if (isNomadicSurvivalScene(state.map)) {
    return 'Mode: guide survivors | Shelter route';
  }
  const enemyState = state.game?.enemyAI?.state ?? 'boot';
  if (state.placement?.active) {
    const selected = BUILDING_OPTIONS.find((option) => option.id === state.placement.selectedStructureType);
    const label = selected?.label ?? state.placement.selectedStructureType ?? 'structure';
    return `Mode: build ${label} | Enemy: ${enemyState}`;
  }
  if (state.intentPreview) {
    return `Mode: move | Enemy: ${enemyState}`;
  }
  return `Mode: inspect | Enemy: ${enemyState}`;
}

function getAllGameEntities(state) {
  const game = state.game ?? {};
  return [
    ...(game.leaders ?? []),
    ...(game.squads ?? []),
    ...(game.builders ?? []),
    ...(game.resourceWorkers ?? []),
    ...(game.transports ?? []),
    ...(game.structures ?? []),
    ...(game.outposts ?? [])
  ];
}

function getSelectedGameEntityForHud(state) {
  const id = state.game?.selectedEntityId;
  return id ? getAllGameEntities(state).find((entity) => entity.id === id) ?? null : null;
}

function getStructureOccupantNames(state, structure) {
  const ids = structure?.occupancy?.occupants ?? [];
  const squads = new Map((state.game?.squads ?? []).map((squad) => [squad.id, squad]));
  return ids.map((id) => squads.get(id)?.name ?? id);
}

function getStructureJoinerySummary(structure) {
  const joinery = structure?.joinery ?? {};
  const connections = Array.isArray(joinery.connections) ? joinery.connections : [];
  const liveLinks = connections.filter((connection) => connection.kind === 'structure');
  const replaced = connections.find((connection) => connection.kind === 'replaces');
  const bits = [];
  if (joinery.pathBlueprint && Number.isInteger(joinery.segmentIndex) && Number.isInteger(joinery.segmentCount)) {
    bits.push(`path segment ${joinery.segmentIndex + 1}/${joinery.segmentCount}`);
  }
  if (replaced?.structureType) {
    bits.push(`replaces ${replaced.structureType}`);
  }
  if (liveLinks.length > 0) {
    const types = [...new Set(liveLinks.map((connection) => connection.structureType).filter(Boolean))];
    bits.push(`joins ${liveLinks.length} ${types.join('/') || 'structure'} link${liveLinks.length === 1 ? '' : 's'}`);
  }
  return bits.length > 0 ? `Joinery: ${bits.join(' · ')}.` : '';
}

function setActiveScenarioForMenu(state, scenarioId) {
  const result = selectScenario(state.map, scenarioId ?? state.activeScenarioId ?? state.map?.scenario?.activeScenarioId);
  if (result.ok) {
    state.activeScenarioId = result.scenario.id;
    state.showScenarioLayer = true;
  }
  return result;
}

function getScenarioStartStatus(state, fallback = 'Chapter selected') {
  const active = getScenarioSelectionSlots(state.map, { includeLocked: false }).find((slot) => slot.id === (state.activeScenarioId ?? state.map?.scenario?.activeScenarioId));
  return active ? `${active.title} active — ${active.subtitle}` : fallback;
}

function getOpeningObjectiveProgress(state) {
  const objectives = state.map?.scenario?.scenarioSpine?.objectives ?? [];
  const complete = new Set(state.scenarioRuntime?.completedObjectiveIds ?? []);
  const active = objectives.find((objective) => !complete.has(objective.id));
  return {
    complete: complete.size,
    total: objectives.length,
    label: active?.label ?? 'Shelter reached'
  };
}

function countOpeningSurvivors(state) {
  return [...(state.game?.leaders ?? []), ...(state.game?.squads ?? [])]
    .filter((entity) => entity.factionId === 'player' && Number(entity.health?.health ?? 1) > 0)
    .reduce((count, entity) => count + (Number(entity.survivorCount) || (entity.type === 'leader' ? 1 : entity.members?.length ?? 1)), 0);
}

// ─── Splash Screen ───────────────────────────────────────────────────────────

export function mountSplashScreen(root) {
  const overlay = el('div', 'ui-overlay ui-splash');
  overlay.setAttribute('aria-label', 'Black Sky Bound loading screen');

  const storm = el('div', 'ui-splash-storm');
  const cloudA = el('div', 'ui-splash-cloud ui-splash-cloud--a');
  const cloudB = el('div', 'ui-splash-cloud ui-splash-cloud--b');
  const lightning = el('div', 'ui-splash-lightning');
  const horizon = el('div', 'ui-splash-horizon');
  const sigil = el('div', 'ui-splash-sigil');
  const title = el('div', 'ui-splash-title');
  title.append(
    el('span', 'ui-splash-title-top', 'BLACK SKY'),
    el('span', 'ui-splash-title-main', 'BOUND')
  );
  const doctrine = el('p', 'ui-splash-doctrine', 'ESCAPE IS NOT FREEDOM — IT IS DESTINY');
  const loader = el('div', 'ui-splash-loader', el('span', 'ui-splash-loader-bar'));
  const skip = el('p', 'ui-splash-skip', 'Click or press any key to skip');

  overlay.append(storm, cloudA, cloudB, lightning, horizon, sigil, title, doctrine, loader, skip);
  root.append(overlay);

  let closed = false;
  function closeSplash() {
    if (closed) return;
    closed = true;
    overlay.classList.add('ui-splash--closing');
    window.removeEventListener('keydown', closeSplash);
    window.setTimeout(() => {
      overlay.hidden = true;
      overlay.remove();
    }, 520);
  }

  overlay.addEventListener('click', closeSplash);
  window.addEventListener('keydown', closeSplash, { once: true });
  window.setTimeout(closeSplash, 2600);
}

// ─── Main Menu ───────────────────────────────────────────────────────────────

export function mountMainMenu(root, state, bus) {
  const overlay = el('div', 'ui-overlay ui-menu');

  const storm = el('div', 'ui-menu-storm');
  const cloudDeck = el('div', 'ui-menu-clouds');
  const lightning = el('div', 'ui-menu-lightning');
  const horizon = el('div', 'ui-menu-horizon');
  const silhouette = el('div', 'ui-menu-silhouette');

  // Scanline grain texture via SVG filter embedded inline
  const noise = el('div', 'ui-menu-noise');
  overlay.append(storm, cloudDeck, lightning, horizon, silhouette, noise);

  const inner = el('div', 'ui-menu-inner');

  // Header
  const header = el('div', 'ui-menu-header');
  const eyebrow = el('span', 'ui-eyebrow', 'Design Doctrine / Prototype Front');
  const wordmark = el('h1', 'ui-menu-title ui-wordmark');
  wordmark.append(
    el('span', 'ui-wordmark-top', 'BLACK SKY'),
    el('span', 'ui-wordmark-line'),
    el('span', 'ui-wordmark-main', 'BOUND')
  );
  const subtitle = el('p', 'ui-menu-sub', 'Escape is not freedom — it is destiny');
  const doctrineRail = el('div', 'ui-menu-doctrine-rail');
  doctrineRail.append(
    el('span', null, 'Weight & Scar'),
    el('span', null, 'Constrained Light'),
    el('span', null, 'Structural Tension'),
    el('span', null, 'Implied Motion')
  );
  header.append(eyebrow, wordmark, subtitle, doctrineRail);

  // Mode cards
  const modes = el('div', 'ui-mode-grid');

  const modeOptions = [
    {
      id: EXPERIENCE_MODES.GAME,
      label: 'Play The First Night',
      glyph: 'I',
      desc: 'Guide frightened survivors through concealment, torch risk and natural shelter.',
      meta: 'Ready for playtest'
    },
    {
      id: EXPERIENCE_MODES.SIM_DEBUG,
      label: 'War Table',
      glyph: 'II',
      desc: 'Inspect ticks, overlays, command graphs, QA signals and enemy intent',
      meta: 'Diagnostics unlocked'
    },
    {
      id: EXPERIENCE_MODES.MAP_MAKER,
      label: 'Map Forge',
      glyph: 'III',
      desc: 'Author terrain, field overlays, structure paths and future sectors',
      meta: 'Cartography tools'
    }
  ];

  for (const opt of modeOptions) {
    const card = el('button', 'ui-mode-card');
    card.type = 'button';
    card.dataset.modeId = opt.id;

    const glyph = el('span', 'ui-mode-glyph', opt.glyph);
    const label = el('span', 'ui-mode-label', opt.label);
    const desc  = el('span', 'ui-mode-desc', opt.desc);
    const meta  = el('span', 'ui-mode-meta', opt.meta);
    card.append(glyph, label, desc, meta);

    card.addEventListener('click', () => {
      state.experienceMode = opt.id;
      const scenarioActivation = setActiveScenarioForMenu(state);

      if (opt.id === EXPERIENCE_MODES.MAP_MAKER) {
        state.mode = 'edit';
        state.gameOverlay = 'none';
        state.showCommandRadii = false;
        setUiScreen(state, bus, 'game', {
          paused: false,
          status: 'Map Maker / Scenario Creator — terrain, chapters and authoring tools unlocked'
        });
        return;
      }

      state.mode = 'play';
      if (opt.id === EXPERIENCE_MODES.GAME) {
        state.gameOverlay = 'none';
        state.showCommandRadii = false;
        state.activeField = 'none';
      }
      setUiScreen(state, bus, 'game', {
        paused: false,
        status: opt.id === EXPERIENCE_MODES.SIM_DEBUG
          ? 'Sim / Debug — overlays, ticks, chapters and inspectors unlocked'
          : getScenarioStartStatus(state, scenarioActivation.ok ? `${scenarioActivation.scenario.title} active` : 'The First Night active')
      });
    });

    modes.append(card);
  }

  // Scenario / chapter selector strip
  const mapSection = el('div', 'ui-map-section ui-chapter-section');
  const mapLabel = el('p', 'ui-section-label', 'Story / Chapter Select');
  const mapStrip = el('div', 'ui-map-strip ui-chapter-strip');
  const chapterSummary = el('p', 'ui-chapter-summary');
  mapSection.append(mapLabel, mapStrip, chapterSummary);

  function renderScenarioTiles() {
    const slots = getScenarioSelectionSlots(state.map);
    mapStrip.replaceChildren(...slots.map((slot) => {
      const tile = el('button', `ui-map-tile ui-chapter-tile${slot.locked ? ' ui-map-tile--locked' : ''}`);
      tile.type = 'button';
      tile.disabled = Boolean(slot.locked || !slot.available);
      tile.dataset.scenarioId = slot.id;
      tile.setAttribute('aria-pressed', String(Boolean(slot.active)));

      const chapter = el('span', 'ui-map-tile-tag', slot.locked ? `Chapter ${slot.chapter} · Locked` : `Chapter ${slot.chapter} · ${slot.active ? 'Selected' : 'Available'}`);
      const tileLabel = el('span', 'ui-map-tile-label', slot.title);
      const desc = el('span', 'ui-chapter-desc', slot.subtitle ?? 'Scenario');
      tile.append(chapter, tileLabel, desc);

      if (!tile.disabled) {
        tile.addEventListener('click', () => {
          const result = setActiveScenarioForMenu(state, slot.id);
          state.status = result.ok ? `Selected ${result.scenario.title}` : 'Scenario selection failed';
          bus.emit('render');
        });
      }
      return tile;
    }));

    const catalogue = summarizeScenarioCatalogue(state.map);
    chapterSummary.textContent = `${catalogue.availableCount} playable scenario${catalogue.availableCount === 1 ? '' : 's'} available · progression scaffold active`;
  }

  // Footer
  const footer = el('div', 'ui-menu-footer');
  const version = el('span', 'ui-version', 'Black Sky Bound · Chapter 1 Survival Playtest v0 · Field Fronts Prototype');
  footer.append(version);

  inner.append(header, modes, mapSection, footer);
  overlay.append(inner);
  root.append(overlay);

  function render() {
    overlay.hidden = state.uiScreen !== 'menu';
    renderScenarioTiles();
  }


  bus.on('ui:screen', render);
  bus.on('render', render);

  // Show menu on boot unless already in-game
  if (!state.uiScreen) state.uiScreen = 'menu';
  render();
}

// ─── Pause Menu ──────────────────────────────────────────────────────────────

export function mountPauseMenu(root, state, bus) {
  const overlay = el('div', 'ui-overlay ui-pause');
  overlay.hidden = true;

  const backdrop = el('div', 'ui-pause-backdrop');
  const panel    = el('div', 'ui-pause-panel');

  const heading = el('h2', 'ui-pause-title', 'PAUSED');
  const divider = el('div', 'ui-pause-divider');

  const resumeBtn   = btn('Resume',          'ui-btn ui-btn--primary');
  const settingsBtn = btn('Settings',        'ui-btn ui-btn--secondary');
  const menuBtn     = btn('Exit to Menu',    'ui-btn ui-btn--secondary');
  const quitBtn     = btn('Quit Game',       'ui-btn ui-btn--danger');

  // Settings stub sub-panel
  const settingsPanel = el('div', 'ui-settings-stub');
  settingsPanel.hidden = true;
  const settingsHeading = el('p', 'ui-section-label', 'Settings');
  const settingsNote    = el('p', 'ui-settings-note', 'Performance and session behaviour.');
  const autosaveRow = el('div', 'ui-settings-row');
  const autosaveLabel = el('label', 'ui-settings-label', 'Autosave');
  const autosaveControl = el('div', 'ui-settings-control');
  const autosaveInput = document.createElement('input');
  autosaveInput.type = 'range';
  autosaveInput.min = '15';
  autosaveInput.max = '180';
  autosaveInput.step = '15';
  autosaveInput.value = String(Math.round((state.gameAutosaveIntervalMs ?? 60000) / 1000));
  const autosaveValue = el('span', 'ui-settings-value', `${autosaveInput.value}s`);
  autosaveControl.append(autosaveInput, autosaveValue);
  autosaveRow.append(autosaveLabel, autosaveControl);
  autosaveInput.addEventListener('input', () => {
    const seconds = Number(autosaveInput.value) || 60;
    autosaveValue.textContent = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
    bus.emit('settings:game-autosave-interval', seconds * 1000);
  });
  const settingsPlaceholders = [
    ['Sound', 'range'],
    ['Music', 'range'],
    ['UI Scale', 'range'],
  ].map(([label, type]) => {
    const row = el('div', 'ui-settings-row');
    const lbl = el('label', 'ui-settings-label', label);
    const input = document.createElement('input');
    input.type = type;
    input.min = '0'; input.max = '100'; input.value = '80';
    input.disabled = true; // placeholder — wired in a later pass
    row.append(lbl, input);
    return row;
  });
  settingsPanel.append(settingsHeading, settingsNote, autosaveRow, ...settingsPlaceholders);

  // Prototype-safe quit confirmation. Browser tabs usually cannot be closed
  // by page scripts unless the page opened the tab, so this keeps the state
  // transition inside our own UI rather than relying on window.confirm().
  const quitConfirmPanel = el('div', 'ui-confirm-panel');
  quitConfirmPanel.hidden = true;
  const quitHeading = el('p', 'ui-section-label', 'Quit Game');
  const quitCopy = el('p', 'ui-confirm-copy', 'Return to the main menu and pause the current prototype session?');
  const quitActions = el('div', 'ui-confirm-row');
  const cancelQuitBtn = btn('Cancel', 'ui-btn ui-btn--secondary');
  const confirmQuitBtn = btn('Return to Menu', 'ui-btn ui-btn--danger');
  quitActions.append(cancelQuitBtn, confirmQuitBtn);
  quitConfirmPanel.append(quitHeading, quitCopy, quitActions);

  const actions = el('div', 'ui-pause-actions');
  actions.append(resumeBtn, settingsBtn, settingsPanel, menuBtn, quitBtn, quitConfirmPanel);
  panel.append(heading, divider, actions);
  overlay.append(backdrop, panel);
  root.append(overlay);

  let pauseSubscreen = 'main';

  function setPauseSubscreen(next) {
    pauseSubscreen = next;
    render();
  }

  settingsBtn.addEventListener('click', () => {
    setPauseSubscreen(pauseSubscreen === 'settings' ? 'main' : 'settings');
  });

  resumeBtn.addEventListener('click', () => {
    pauseSubscreen = 'main';
    setUiScreen(state, bus, 'game', { paused: false, status: state.status });
  });

  menuBtn.addEventListener('click', () => {
    pauseSubscreen = 'main';
    state.experienceMode = EXPERIENCE_MODES.MENU;
    state.mode = 'play';
    state.gameOverlay = 'none';
    state.showCommandRadii = false;
    state.activeField = 'none';
    setUiScreen(state, bus, 'menu', { paused: false, status: 'Returned to main menu' });
  });

  quitBtn.addEventListener('click', () => {
    setPauseSubscreen('quit');
  });

  cancelQuitBtn.addEventListener('click', () => {
    setPauseSubscreen('main');
  });

  confirmQuitBtn.addEventListener('click', () => {
    pauseSubscreen = 'main';
    state.experienceMode = EXPERIENCE_MODES.MENU;
    state.mode = 'play';
    state.gameOverlay = 'none';
    state.showCommandRadii = false;
    state.activeField = 'none';
    setUiScreen(state, bus, 'menu', { paused: false, status: 'Prototype session closed to menu' });
  });

  // Keyboard shortcut: Escape pauses, resumes, or backs out of pause subpanels.
  // Use AbortController so the listener is torn down if the overlay is removed from the DOM.
  const escController = new AbortController();
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state.uiScreen === 'menu') return;

    e.preventDefault();

    if (state.uiScreen === 'pause' && pauseSubscreen !== 'main') {
      setPauseSubscreen('main');
      return;
    }

    if (state.uiScreen === 'pause') {
      pauseSubscreen = 'main';
      setUiScreen(state, bus, 'game', { paused: false });
      return;
    }

    setUiScreen(state, bus, 'pause', { paused: true });
  }, { signal: escController.signal });

  // Tear down the global listener when the overlay leaves the DOM.
  if (typeof MutationObserver !== 'undefined') {
    const escCleanupObserver = new MutationObserver(() => {
      if (!overlay.isConnected) {
        escController.abort();
        escCleanupObserver.disconnect();
      }
    });
    escCleanupObserver.observe(document.body, { childList: true, subtree: true });
  }

  function render() {
    const isPause = state.uiScreen === 'pause';
    overlay.hidden = !isPause;

    const showingSettings = isPause && pauseSubscreen === 'settings';
    const showingQuit = isPause && pauseSubscreen === 'quit';

    settingsPanel.hidden = !showingSettings;
    quitConfirmPanel.hidden = !showingQuit;

    resumeBtn.hidden = showingQuit;
    settingsBtn.hidden = showingQuit;
    menuBtn.hidden = showingQuit || showingSettings;
    quitBtn.hidden = showingQuit || showingSettings;

    settingsBtn.textContent = showingSettings ? 'Back' : 'Settings';
    settingsBtn.setAttribute('aria-pressed', String(showingSettings));
    const seconds = Math.round((state.gameAutosaveIntervalMs ?? 60000) / 1000);
    autosaveInput.value = String(seconds);
    autosaveValue.textContent = seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
  }

  bus.on('ui:screen', render);
  bus.on('render', render);
  render();
}

// ─── In-Game HUD ─────────────────────────────────────────────────────────────

export function mountGameHUD(root, state, bus) {
  const hud = el('div', 'ui-hud');
  hud.hidden = true;

  // ── Top bar ────────────────────────────────────────────
  const topBar = el('div', 'ui-hud-topbar');

  const topLeft  = el('div', 'ui-hud-tl');
  const gameName = el('span', 'ui-hud-game-name', 'FIELD FRONTS');
  const tickBadge = el('span', 'ui-hud-tick', 'T·0');
  const fpsBadge = el('span', 'ui-hud-fps', 'FPS·--');
  topLeft.append(gameName, tickBadge, fpsBadge);

  const topCenter = el('div', 'ui-hud-tc');
  const modeText = el('span', 'ui-hud-mode', 'Inspect');
  const statusText = el('span', 'ui-hud-status', '');
  statusText.setAttribute('aria-live', 'polite');
  statusText.setAttribute('aria-atomic', 'true');
  topCenter.append(modeText, statusText);

  const topRight = el('div', 'ui-hud-tr');
  const weatherBtn = btn('Weather: Medium', 'ui-hud-tool-btn');
  weatherBtn.title = 'Cycle weather visual quality';
  const clarityBtn = btn('Clarity: Off', 'ui-hud-tool-btn');
  clarityBtn.title = 'Reduce storm visuals for map readability';
  const restartBtn = btn('Restart', 'ui-hud-tool-btn');
  restartBtn.title = 'Restart Chapter 1 with the current seed';
  const aiDebugBtn = btn('AI', 'ui-hud-tool-btn');
  aiDebugBtn.title = 'Toggle AI/playtest debug chips';
  const pauseBtn = btn('❙❙', 'ui-hud-pause-btn');
  pauseBtn.title = 'Pause (Esc)';
  topRight.append(weatherBtn, clarityBtn, restartBtn, aiDebugBtn, pauseBtn);

  topBar.append(topLeft, topCenter, topRight);

  const playtestHud = el('div', 'ui-playtest-hud');
  const playtestFps = el('span', 'ui-playtest-chip', 'FPS --');
  const playtestScenario = el('span', 'ui-playtest-chip', 'Scenario Chapter 1');
  const playtestCommander = el('span', 'ui-playtest-chip', 'Commander ready');
  const playtestCommand = el('span', 'ui-playtest-chip', 'Command --');
  const playtestWeather = el('span', 'ui-playtest-chip', 'Weather Medium');
  const playtestAi = el('span', 'ui-playtest-chip', 'AI active');
  playtestHud.append(playtestFps, playtestScenario, playtestCommander, playtestCommand, playtestWeather, playtestAi);

  const mousePanel = el('aside', 'ui-mouse-panel');
  mousePanel.hidden = true;
  mousePanel.dataset.mousePanel = 'true';
  const mouseHeading = el('div', 'ui-mouse-heading');
  const mouseTitle = el('strong', 'ui-mouse-title', 'Mouse Playtester');
  const mouseStatus = el('span', 'ui-mouse-status', 'Waiting');
  mouseHeading.append(mouseTitle, mouseStatus);
  const mouseModel = el('p', 'ui-mouse-meta', 'Local model not connected');
  const mouseThought = el('p', 'ui-mouse-thought', 'Mouse is waiting for local model connection');
  mouseThought.setAttribute('aria-live', 'polite');
  const mouseActionLabel = el('p', 'ui-mouse-label', 'Latest command');
  const mouseAction = el('p', 'ui-mouse-action', 'No command chosen yet.');
  const mouseOutcome = el('p', 'ui-mouse-outcome', 'Waiting for a safe decision.');
  const mouseRecentLabel = el('p', 'ui-mouse-label', 'Recent thoughts');
  const mouseRecent = el('ol', 'ui-mouse-recent');
  const mouseActionsLabel = el('p', 'ui-mouse-label', 'Recent actions');
  const mouseActions = el('ol', 'ui-mouse-recent');
  const mouseUpdated = el('p', 'ui-mouse-meta', 'No observations yet');
  mousePanel.append(mouseHeading, mouseModel, mouseThought, mouseActionLabel, mouseAction, mouseOutcome, mouseRecentLabel, mouseRecent, mouseActionsLabel, mouseActions, mouseUpdated);

  pauseBtn.addEventListener('click', () => {
    setUiScreen(state, bus, 'pause', { paused: true });
  });
  weatherBtn.addEventListener('click', () => bus.emit('playtest:cycle-weather-quality'));
  clarityBtn.addEventListener('click', () => bus.emit('playtest:toggle-map-clarity'));
  restartBtn.addEventListener('click', () => bus.emit('playtest:restart-chapter', { sameSeed: true }));
  aiDebugBtn.addEventListener('click', () => bus.emit('playtest:toggle-ai-debug'));

  // ── Build panel (bottom-left, collapsible) ─────────────
  const commandContainer = el('div', 'ui-command-container');

  const commandToggle = btn('Build', 'ui-command-toggle');
  commandToggle.setAttribute('aria-expanded', 'false');
  commandToggle.setAttribute('aria-controls', 'ui-command-panel');

  const commandPanel = el('div', 'ui-command-panel');
  commandPanel.id = 'ui-command-panel';
  commandPanel.hidden = true;

  const commandTabs = el('div', 'ui-command-tabs');
  const buildTab = btn('Build', 'ui-command-tab');
  const ordersTab = btn('Orders', 'ui-command-tab');
  buildTab.dataset.commandTab = 'build';
  ordersTab.dataset.commandTab = 'orders';
  commandTabs.append(buildTab, ordersTab);

  const buildView = el('div', 'ui-command-view');
  const ordersView = el('div', 'ui-command-view');
  ordersView.hidden = true;

  // Buildings sub-section
  const buildingsLabel = el('p', 'ui-panel-label', 'Structures');
  const buildingsGrid  = el('div', 'ui-build-grid');

  for (const b of BUILDING_OPTIONS) {
    const tile = btn('', 'ui-build-tile');
    tile.dataset.buildId = b.id;
    tile.title = `${b.label} — ${getBuildCostLabel(b)}`;
    const glyph = el('span', 'ui-build-glyph', b.glyph);
    const label = el('span', 'ui-build-tile-label', b.label);
    const cost  = el('span', 'ui-build-tile-cost', getBuildCostLabel(b));
    tile.append(glyph, label, cost);
    tile.addEventListener('click', () => {
      bus.emit('purchase:request', { type: b.type, id: b.id });
    });
    tile.setAttribute('aria-pressed', 'false');
    buildingsGrid.append(tile);
  }

  // Units sub-section
  const unitsLabel = el('p', 'ui-panel-label', 'Units');
  const unitsGrid  = el('div', 'ui-build-grid');

  for (const u of UNIT_OPTIONS) {
    const tile = btn('', 'ui-build-tile');
    tile.dataset.unitId = u.id;
    tile.title = `${u.label} — ${getBuildCostLabel(u)}`;
    const glyph = el('span', 'ui-build-glyph', u.glyph);
    const label = el('span', 'ui-build-tile-label', u.label);
    const cost  = el('span', 'ui-build-tile-cost', getBuildCostLabel(u));
    tile.append(glyph, label, cost);
    tile.addEventListener('click', () => {
      bus.emit('purchase:request', { type: u.type, id: u.id });
    });
    tile.setAttribute('aria-pressed', 'false');
    unitsGrid.append(tile);
  }

  bus.on('purchase:completed', ({ type, id }) => {
    buildingsGrid.querySelectorAll('.ui-build-tile').forEach(t => {
      t.setAttribute('aria-pressed', 'false');
    });
    unitsGrid.querySelectorAll('.ui-build-tile').forEach(t => {
      t.setAttribute('aria-pressed', String(type === 'unit' && t.dataset.unitId === id));
    });
  });

  bus.on('placement:selected', ({ id }) => {
    buildingsGrid.querySelectorAll('.ui-build-tile').forEach(t => {
      t.setAttribute('aria-pressed', String(t.dataset.buildId === id));
    });
    unitsGrid.querySelectorAll('.ui-build-tile').forEach(t => t.setAttribute('aria-pressed', 'false'));
  });

  bus.on('purchase:failed', () => {
    if (!state.placement?.active) {
      buildingsGrid.querySelectorAll('.ui-build-tile').forEach(t => t.setAttribute('aria-pressed', 'false'));
    }
    unitsGrid.querySelectorAll('.ui-build-tile').forEach(t => t.setAttribute('aria-pressed', 'false'));
  });

  bus.on('placement:cancelled', () => {
    buildingsGrid.querySelectorAll('.ui-build-tile').forEach(t => t.setAttribute('aria-pressed', 'false'));
  });

  const ordersLabel = el('p', 'ui-panel-label', 'Army posture');
  const ordersCopy = el('p', 'ui-command-note', 'Applies Hold, Probe, or Commit to every friendly command unit and infantry squad.');
  const ordersGrid = el('div', 'ui-order-grid');
  const armyOrderButtons = Object.values(PRESSURE_STANCES).map((stance) => {
    const orderButton = btn(stance.label, 'ui-order-button');
    orderButton.dataset.stanceId = stance.id;
    orderButton.title = stance.description;
    orderButton.addEventListener('click', () => {
      bus.emit('orders:army-stance', { stanceId: stance.id });
    });
    ordersGrid.append(orderButton);
    return orderButton;
  });
  ordersView.append(ordersLabel, ordersCopy, ordersGrid);

  buildView.append(buildingsLabel, buildingsGrid, unitsLabel, unitsGrid);
  commandPanel.append(commandTabs, buildView, ordersView);
  commandContainer.append(commandToggle, commandPanel);

  let commandOpen = false;
  let activeCommandTab = 'build';

  function setCommandTab(tabId) {
    activeCommandTab = tabId === 'orders' ? 'orders' : 'build';
    buildView.hidden = activeCommandTab !== 'build';
    ordersView.hidden = activeCommandTab !== 'orders';
    buildTab.setAttribute('aria-pressed', String(activeCommandTab === 'build'));
    ordersTab.setAttribute('aria-pressed', String(activeCommandTab === 'orders'));
    commandToggle.textContent = commandOpen
      ? `Close ${activeCommandTab === 'orders' ? 'Orders' : 'Build'}`
      : (activeCommandTab === 'orders' ? 'Orders' : 'Build');
  }

  buildTab.addEventListener('click', () => setCommandTab('build'));
  ordersTab.addEventListener('click', () => setCommandTab('orders'));

  commandToggle.addEventListener('click', () => {
    commandOpen = !commandOpen;
    commandPanel.hidden = !commandOpen;
    commandToggle.setAttribute('aria-expanded', String(commandOpen));
    setCommandTab(activeCommandTab);
    syncViewportSafeArea();
    bus.emit('render');
  });
  setCommandTab('build');

  // ── Economy readout (bottom-right, collapsible) ───────
  const econContainer = el('div', 'ui-econ-container');

  const econToggle = btn('Economy', 'ui-econ-toggle');
  econToggle.setAttribute('aria-expanded', 'false');
  econToggle.setAttribute('aria-controls', 'ui-econ-panel');

  const econPanel = el('div', 'ui-econ-panel');
  econPanel.id = 'ui-econ-panel';
  econPanel.hidden = true;

  const econHeadline = el('div', 'ui-econ-resource');
  const econTitle = el('span', 'ui-econ-resource-label', 'Gold');
  const econAmount = el('span', 'ui-econ-resource-value', '0');
  econHeadline.append(econTitle, econAmount);

  const econIncome = el('div', 'ui-econ-income');
  const incomeLabel = el('span', 'ui-econ-label', 'Income');
  const incomeValue = el('span', 'ui-econ-value', '+0.0 / tick');
  econIncome.append(incomeLabel, incomeValue);

  const componentGrid = el('div', 'ui-econ-components');
  const sourceList = el('div', 'ui-econ-sources');
  econPanel.append(econHeadline, econIncome, componentGrid, sourceList);

  econContainer.append(econToggle, econPanel);

  // ── Context action panel (bottom-centre) ───────────────
  const actionContainer = el('div', 'ui-action-container');
  const actionPanel = el('div', 'ui-action-panel');
  const actionHeader = el('div', 'ui-action-header');
  const actionTitle = el('div', 'ui-action-title', 'Base overview');
  const actionKind = el('div', 'ui-action-kind', 'Player force');
  actionHeader.append(actionTitle, actionKind);
  const actionResources = el('div', 'ui-action-resources');
  const actionChips = el('div', 'ui-action-chips');
  const actionMeters = el('div', 'ui-action-meters');
  const actionStances = el('div', 'ui-action-stances');
  const actionBody = el('div', 'ui-action-body', 'Select a squad or structure.');
  const actionButton = btn('Action', 'ui-action-button');
  actionButton.hidden = true;
  actionPanel.append(actionHeader, actionResources, actionChips, actionMeters, actionStances, actionBody, actionButton);
  actionContainer.append(actionPanel);

  actionButton.addEventListener('click', () => {
    const selected = getSelectedGameEntityForHud(state);
    if (selected?.entityType === 'structure' && selected.occupancy?.occupants?.length > 0) {
      bus.emit('occupancy:evacuate-structure', { structureId: selected.id });
    }
  });

  const orderWheel = el('div', 'ui-order-wheel');
  orderWheel.hidden = true;
  orderWheel.setAttribute('role', 'menu');
  orderWheel.setAttribute('aria-label', 'Context order wheel');
  const orderWheelButtons = COMMAND_WHEEL_ACTIONS.map((action) => {
    const wheelButton = btn('', `ui-order-wheel-slot ui-order-wheel-slot--${action.slot}`);
    wheelButton.id = `ui-order-wheel-action-${action.id}`;
    wheelButton.dataset.actionId = action.id;
    wheelButton.dataset.intentType = action.intentType;
    wheelButton.title = action.description;
    wheelButton.append(el('span', 'ui-order-wheel-slot-label', action.shortLabel));
    wheelButton.addEventListener('pointerdown', (event) => event.stopPropagation());
    wheelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wheel = state.orderWheel;
      if (!wheel?.active) return;
      bus.emit('orders:survival-intent', {
        actionId: action.id,
        intentType: action.intentType,
        priority: action.priority,
        tile: wheel.tile,
        source: 'command-wheel'
      });
      state.orderWheel = null;
      bus.emit('render');
    });
    return wheelButton;
  });
  const orderWheelContext = el('div', 'ui-order-wheel-center');
  const orderWheelLabel = el('strong', 'ui-order-wheel-label', 'MoveTo');
  const orderWheelSubLabel = el('span', 'ui-order-wheel-sublabel', 'Release to confirm');
  orderWheelContext.append(orderWheelLabel, orderWheelSubLabel);
  const usedSlots = new Set(COMMAND_WHEEL_ACTIONS.map((action) => action.slot));
  const orderWheelPlaceholders = ['primary', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].filter((slot) => !usedSlots.has(slot)).map((slot) => {
    const placeholder = el('div', `ui-order-wheel-slot ui-order-wheel-slot--placeholder ui-order-wheel-slot--${slot}`);
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  });
  orderWheel.append(...orderWheelButtons, ...orderWheelPlaceholders, orderWheelContext);

  function renderContextActionPanel() {
    const selected = getSelectedGameEntityForHud(state);
    const openingSurvival = isNomadicSurvivalScene(state.map);
    const showResources = getScenePresentation(state.map).ui.resources;
    actionButton.hidden = true;
    actionButton.disabled = false;
    actionResources.replaceChildren();
    actionChips.replaceChildren();
    actionMeters.replaceChildren();
    actionStances.replaceChildren();
    actionResources.hidden = !showResources;

    if (!selected) {
      renderBaseOverviewPanel();
      return;
    }

    actionTitle.textContent = selected.name ?? 'Selection';
    actionKind.textContent = formatEntityKind(selected);
    if (showResources) renderGlobalResourceStrip();
    renderStatusChips(selected);
    renderCommandFeedbackChip(selected);
    renderSelectionMeters(selected);
    renderSelectionStances(selected);

    const activeFeedback = state.commandFeedback;
    const aiReason = activeFeedback?.reason
      ? ` Command: ${activeFeedback.reason}.`
      : selected.ai?.lastIntentResponse?.reason ? ` AI: ${selected.ai.lastIntentResponse.reason}.` : '';

    if (selected.type === 'squad') {
      const occupancy = selected.occupancy ?? {};
      if (occupancy.state === 'occupied') {
        const structure = (state.game?.structures ?? []).find((candidate) => candidate.id === occupancy.structureId);
        actionBody.textContent = `Garrisoned inside ${structure?.name ?? 'structure'}.`;
        return;
      }
      if (occupancy.state === 'moving_to_occupy') {
        const structure = (state.game?.structures ?? []).find((candidate) => candidate.id === occupancy.structureId);
        actionBody.textContent = `Moving to occupy ${structure?.name ?? 'structure'}.`;
        return;
      }
      actionBody.textContent = openingSurvival
        ? 'Guide this group between natural shelters. Keep light and exposure low.'
        : selected.behavior?.intent === 'return-for-food'
        ? 'Returning to outpost for food.'
        : `Click a friendly occupiable structure to garrison this squad.${aiReason}`;
      return;
    }

    if (selected.type === 'leader' && openingSurvival) {
      actionBody.textContent = 'Lead the band from concealment to concealment. Middle-drag to look ahead within calling reach.';
      return;
    }

    if (selected.entityType === 'structure') {
      const occupancy = selected.occupancy ?? {};
      const occupantNames = getStructureOccupantNames(state, selected);
      const joinerySummary = getStructureJoinerySummary(selected);
      if (selected.gathering?.enabled) {
        const workers = (state.game?.resourceWorkers ?? []).filter((worker) => worker.homeStructureId === selected.id);
        const active = workers.filter((worker) => worker.state !== 'idle').length;
        const carried = workers.reduce((sum, worker) => sum + (worker.carriedAmount ?? 0), 0);
        const resource = selected.gathering.resourceId ?? 'resource';
        const workerText = `${active}/${selected.gathering.assignedWorkers} workers gathering ${resource}`;
        const carriedText = carried > 0 ? `, ${formatNumber(carried, 1)} carried` : '';
        actionBody.textContent = `${workerText}${carriedText}. ${joinerySummary}`;
        return;
      }
      if (selected.storage?.enabled) {
        const transports = (state.game?.transports ?? []).filter((transport) => transport.homeStructureId === selected.id);
        const carrying = transports.reduce((sum, transport) => sum + (transport.carriedAmount ?? 0), 0);
        const capacityText = `storage +${formatNumber(selected.storage.capacityBonus)}`;
        const transportText = `${transports.length}/${selected.storage.transportSlots} transports`;
        const carriedText = carrying > 0 ? `, ${formatNumber(carrying, 1)} carried` : '';
        actionBody.textContent = `${capacityText}; ${transportText}${carriedText}. ${joinerySummary}`;
        return;
      }
      if (!occupancy.enabled || occupancy.capacitySquads <= 0) {
        actionBody.textContent = joinerySummary || 'This structure is not occupiable.';
        return;
      }
      const occupancyText = occupantNames.length > 0
        ? `${occupancy.mode}: ${occupantNames.length}/${occupancy.capacitySquads} squads — ${occupantNames.join(', ')}`
        : `${occupancy.mode}: empty, capacity ${occupancy.capacitySquads} squad${occupancy.capacitySquads === 1 ? '' : 's'}.`;
      actionBody.textContent = joinerySummary ? `${occupancyText} ${joinerySummary}` : occupancyText;
      actionButton.hidden = occupantNames.length === 0;
      actionButton.textContent = 'Evacuate';
      return;
    }

    if (selected.type === 'builder') {
      actionTitle.textContent = selected.name ?? 'Builder';
      const job = (state.game?.constructionJobs ?? []).find((candidate) => candidate.id === selected.jobId);
      const base = (state.game?.structures ?? []).find((candidate) => candidate.id === selected.baseStructureId);
      const jobText = job ? `assigned to ${job.structureType ?? 'build job'} (${formatPercent(job.progress ?? 0)})` : 'waiting for construction work';
      const moveText = selected.movement?.status && selected.movement.status !== 'idle' ? ` · ${selected.movement.status}` : '';
      const baseText = base ? ` · home: ${base.name ?? base.type}` : '';
      actionBody.textContent = `${selected.state ?? 'idle'} — ${jobText}${moveText}${baseText}.`;
      return;
    }

    if (selected.type === 'resource_worker') {
      actionTitle.textContent = selected.name ?? 'Gatherer';
      const carried = selected.carriedAmount > 0 ? ` carrying ${formatNumber(selected.carriedAmount, 1)} ${selected.resourceId}` : '';
      actionBody.textContent = `${selected.state ?? 'idle'}${carried}.`;
      return;
    }

    if (selected.type === 'transport') {
      actionTitle.textContent = selected.name ?? 'Transport';
      const carried = selected.carriedAmount > 0 ? ` carrying ${formatNumber(selected.carriedAmount, 1)} ${selected.resourceId}` : '';
      const target = selected.targetKind && selected.targetId ? ` to ${selected.targetKind}` : '';
      actionBody.textContent = `${selected.state ?? 'idle'}${carried}${target}.`;
      return;
    }

    actionTitle.textContent = selected.name ?? 'Selection';
    actionBody.textContent = selected.type ? `${selected.type} selected.` : 'Selected.';
  }

  function renderBaseOverviewPanel() {
    const factionEconomy = state.game?.economy?.factions?.player;
    const storage = factionEconomy?.storage;
    const playerLeader = (state.game?.leaders ?? []).find((leader) => leader.factionId === 'player');
    const squads = (state.game?.squads ?? []).filter((squad) => squad.factionId === 'player');
    const hungry = squads.filter((squad) => ['hungry', 'starving'].includes(squad.supply?.status)).length;
    const builders = state.game?.builderCapacity?.player ?? { used: (state.game?.builders ?? []).filter((builder) => builder.factionId === 'player').length, capacity: 0 };

    if (isNomadicSurvivalScene(state.map)) {
      const objective = getOpeningObjectiveProgress(state);
      actionTitle.textContent = 'Travelling band';
      actionKind.textContent = 'Survival command';
      actionResources.hidden = true;
      actionChips.replaceChildren(
        createStatusChip('ok', `${countOpeningSurvivors(state)} survivors`),
        createStatusChip('muted', `Shelter ${objective.complete}/${objective.total}`),
        createStatusChip('warn', 'Torch glow risks exposure')
      );
      actionMeters.replaceChildren(
        createMeter('Objective', objective.total ? objective.complete / objective.total : 0, objective.label, 'muted')
      );
      actionBody.textContent = 'Select the leader or a group, move cover to cover, and middle-drag to look ahead within calling reach.';
      return;
    }

    actionTitle.textContent = 'Base overview';
    actionKind.textContent = `Army: ${formatStanceLabel(playerLeader?.behavior?.stance ?? 'probe')}`;
    renderGlobalResourceStrip();
    actionChips.replaceChildren(
      createStatusChip(hungry > 0 ? 'warn' : 'ok', hungry > 0 ? `${hungry} hungry` : 'Fed'),
      createStatusChip('muted', `${squads.length} squads`),
      createStatusChip(builders.used >= builders.capacity ? 'warn' : 'muted', `Builders ${builders.used}/${builders.capacity}`),
      createStatusChip('muted', `${(state.game?.structures ?? []).filter((structure) => structure.factionId === 'player').length} structures`)
    );
    actionMeters.replaceChildren(
      createMeter('Storage', getRatio(storage?.used ?? 0, storage?.capacity ?? 1, 0), `${formatNumber(storage?.free ?? 0)} free`, 'warn')
    );
    actionBody.textContent = 'Select a squad or structure for local orders, health, morale, logistics and emergency state.';
  }

  function renderGlobalResourceStrip() {
    const factionEconomy = state.game?.economy?.factions?.player;
    const gold = factionEconomy?.stockpiles?.[RESOURCE_IDS.gold]?.amount ?? 0;
    const population = factionEconomy?.stockpiles?.[RESOURCE_IDS.population]?.amount ?? 0;
    const food = factionEconomy?.stockpiles?.[RESOURCE_IDS.food]?.amount ?? 0;
    const wood = factionEconomy?.stockpiles?.[RESOURCE_IDS.wood]?.amount ?? 0;
    const storage = factionEconomy?.storage;
    actionResources.replaceChildren(
      createResourcePill('Gold', formatNumber(gold)),
      createResourcePill('Population', formatNumber(population)),
      createResourcePill('Food', formatNumber(food)),
      createResourcePill('Wood', formatNumber(wood)),
      createResourcePill('Storage', `${formatNumber(storage?.used ?? 0)}/${formatNumber(storage?.capacity ?? 0)}`)
    );
  }

  function renderStatusChips(entity) {
    actionChips.replaceChildren(...getEmergencyStates(entity).map((item) => createStatusChip(item.tone, item.label)));
  }

  function renderCommandFeedbackChip(entity) {
    const feedback = state.commandFeedback;
    const response = entity?.ai?.lastIntentResponse;
    if (!feedback && !response) {
      return;
    }
    const status = feedback?.status ?? response?.status;
    const label = feedback?.label ?? response?.chosenState ?? 'Command';
    const tone = commandFeedbackTone(status);
    actionChips.append(createStatusChip(tone, `${label}: ${String(status ?? 'pending').replaceAll('_', ' ')}`));
    if (feedback?.repeatCount > 1 || feedback?.overrideRisk > 0.55) {
      actionChips.append(createStatusChip(feedback.overrideRisk > 0.72 ? 'critical' : 'warn', feedback.repeatCount > 1 ? `Urgency x${feedback.repeatCount}` : 'forced pressure'));
    }
  }

  function renderSelectionMeters(entity) {
    const meters = [];
    if (entity.health) {
      const ratio = getRatio(entity.health.health, entity.health.maxHealth, 1);
      meters.push(createMeter('Health', ratio, `${Math.round(entity.health.health)}/${Math.round(entity.health.maxHealth)}`, getMeterTone(ratio)));
    }
    if (entity.integrity) {
      const ratio = getRatio(entity.integrity.health, entity.integrity.maxHealth, 1);
      meters.push(createMeter('Integrity', ratio, `${Math.round(entity.integrity.health)}/${Math.round(entity.integrity.maxHealth)}`, getMeterTone(ratio)));
    }
    if (entity.supply) {
      const ratio = getSupplyRatio(entity.supply);
      const food = `${formatNumber(entity.supply.food ?? 0, 1)}/${formatNumber(entity.supply.foodCapacity ?? 0, 1)}`;
      meters.push(createMeter('Food', ratio, `${formatSupplyStatus(entity.supply.status)} ${food}`, getSupplyTone(ratio)));
    }
    const morale = Number.isFinite(entity?.ai?.morale) ? entity.ai.morale : getMoraleRatio(entity);
    if (Number.isFinite(morale) && morale > 0) {
      meters.push(createMeter(entity.type === 'leader' ? 'Cohesion' : 'Morale', morale, formatPercent(morale), getMeterTone(morale)));
    }
    if (Number.isFinite(entity?.ai?.commandConfidence)) {
      meters.push(createMeter('Command', entity.ai.commandConfidence, formatPercent(entity.ai.commandConfidence), getMeterTone(entity.ai.commandConfidence)));
    }
    if (Number.isFinite(entity?.ai?.mentalStrain) && entity.ai.mentalStrain > 0.03) {
      meters.push(createMeter('Strain', 1 - entity.ai.mentalStrain, formatPercent(entity.ai.mentalStrain), entity.ai.mentalStrain > 0.65 ? 'critical' : 'warn'));
    }
    if (entity.combat?.enabled) {
      const combatText = entity.combat.state === 'melee-strike' || entity.combat.state === 'engaged-melee'
        ? `Melee ${entity.combat.lastMeleeOutcome?.replaceAll('-', ' ') ?? 'engaged'}`
        : (entity.combat.canAttack ? 'Volley ready' : (entity.combat.lastBlockedReason?.replaceAll('-', ' ') ?? 'Searching'));
      meters.push(createMeter('Combat', entity.combat.canAttack ? 1 : 0.45, combatText, entity.combat.canAttack || entity.combat.state === 'melee-strike' ? 'ok' : 'muted'));
    }
    if (entity.stealth) {
      const coverRatio = Math.max(0, Math.min(1, Number(entity.stealth.concealment ?? entity.stealth.coverRating) || 0));
      const coverLabel = entity.stealth.coverState === 'hidden'
        ? `Hidden · ${entity.stealth.coverLabel ?? 'cover'}`
        : entity.stealth.coverState === 'in_cover'
          ? `In cover · ${entity.stealth.coverLabel ?? 'cover'}`
          : `Exposed · ${entity.stealth.coverLabel ?? 'open'}`;
      meters.push(createMeter('Cover', coverRatio, coverLabel, entity.stealth.coverState === 'hidden' ? 'ok' : entity.stealth.coverState === 'in_cover' ? 'muted' : 'warn'));
    }
    if (entity.occupancy?.enabled) {
      const used = entity.occupancy.occupants?.length ?? 0;
      const capacity = entity.occupancy.capacitySquads ?? 0;
      meters.push(createMeter('Garrison', getRatio(used, capacity, 0), `${used}/${capacity}`, 'muted'));
    }
    actionMeters.replaceChildren(...meters);
  }

  function renderSelectionStances(entity) {
    if (!isPlayerOrderable(entity) || isNomadicSurvivalScene(state.map)) {
      return;
    }
    const label = el('span', 'ui-action-stances-label', 'Override');
    const row = el('div', 'ui-action-stances-row');
    Object.values(PRESSURE_STANCES).forEach((stance) => {
      const stanceButton = btn(stance.label, 'ui-action-stance-button');
      stanceButton.dataset.stanceId = stance.id;
      stanceButton.title = stance.description;
      stanceButton.setAttribute('aria-pressed', String(entity.behavior?.stance === stance.id));
      stanceButton.addEventListener('click', () => {
        bus.emit('orders:selected-stance', { entityId: entity.id, stanceId: stance.id });
      });
      row.append(stanceButton);
    });
    actionStances.replaceChildren(label, row);
  }

  function createResourcePill(label, value) {
    const pill = el('div', 'ui-action-resource');
    pill.append(el('span', 'ui-action-resource-label', label), el('strong', 'ui-action-resource-value', value));
    return pill;
  }

  function createStatusChip(tone, label) {
    const chip = el('span', 'ui-action-chip', label);
    chip.dataset.tone = tone;
    return chip;
  }

  function createMeter(label, ratio, value, tone = 'ok') {
    const meter = el('div', 'ui-action-meter');
    meter.dataset.tone = tone;
    const head = el('div', 'ui-action-meter-head');
    head.append(el('span', null, label), el('strong', null, value));
    const track = el('div', 'ui-action-meter-track');
    const fill = el('span', 'ui-action-meter-fill');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
    track.append(fill);
    meter.append(head, track);
    return meter;
  }

  let econOpen = false;
  econToggle.addEventListener('click', () => {
    econOpen = !econOpen;
    econPanel.hidden = !econOpen;
    econToggle.setAttribute('aria-expanded', String(econOpen));
    syncViewportSafeArea();
    bus.emit('render');
  });

  // ── Bottom bar ─────────────────────────────────────────
  const bottomBar = el('div', 'ui-hud-bottombar');
  bottomBar.append(commandContainer, actionContainer, econContainer);

  hud.append(topBar, playtestHud, mousePanel, orderWheel, bottomBar);
  root.append(hud);


  function syncViewportSafeArea() {
    if (state.uiScreen !== 'game') {
      state.uiViewportSafeArea = { top: 20, right: 20, bottom: 28, left: 20 };
      return;
    }

    const authoringMode = isMapMakerMode(state);
    const presentation = getScenePresentation(state.map);
    const topVisible = authoringMode || presentation.ui.statusBar;
    const bottomVisible = authoringMode || presentation.ui.build || presentation.ui.resources || presentation.ui.selection;
    state.uiViewportSafeArea = {
      top: topVisible ? (authoringMode ? 24 : 58) : 20,
      right: 18,
      // Keep the tactical canvas/map scale stable when build/economy menus open.
      // The HUD panels are overlays; opening them should not resize the world underneath.
      bottom: bottomVisible ? (authoringMode ? 28 : 88) : 28,
      left: 18
    };
  }

  function render() {
    hud.hidden = state.uiScreen !== 'game';
    syncViewportSafeArea();
    if (state.uiScreen !== 'game') return;

    const authoringMode = isMapMakerMode(state);
    const presentation = getScenePresentation(state.map);
    topBar.hidden = !authoringMode && !presentation.ui.statusBar;
    playtestHud.hidden = authoringMode || !presentation.ui.playtest;
    commandContainer.hidden = authoringMode || !presentation.ui.build;
    econContainer.hidden = authoringMode || !presentation.ui.resources;
    actionContainer.hidden = authoringMode || !presentation.ui.selection;
    renderMousePanel(authoringMode);

    // sync tick badge
    const tick = state.game?.tick ?? 0;
    const time = state.game?.time;
    tickBadge.textContent = time?.clockLabel ? `D${time.day} ${time.clockLabel}` : `T·${tick}`;
    updateRuntimeStats(state.runtimeStats);
    renderPlaytestHud();

    // sync command/status readout
    const phase = state.game?.time?.phase;
    modeText.textContent = authoringMode
      ? 'Mode: map maker'
      : `${formatCommandMode(state)}${phase ? ` | ${formatPhaseLabel(phase)}` : ''}`;
    statusText.textContent = state.status ?? '';

    const gold = getResourceState(state, RESOURCE_IDS.gold);
    const income = getResourceIncome(state, RESOURCE_IDS.gold);
    const amount = gold?.amount ?? 0;
    const incomeAmount = income?.amount ?? 0;

    const playerLeader = (state.game?.leaders ?? []).find((leader) => leader.factionId === 'player');
    armyOrderButtons.forEach((orderButton) => {
      orderButton.setAttribute('aria-pressed', String(playerLeader?.behavior?.stance === orderButton.dataset.stanceId));
    });
    const activePlacementId = state.placement?.active ? state.placement.selectedStructureType : null;
    buildingsGrid.querySelectorAll('.ui-build-tile').forEach((tile) => {
      const option = BUILDING_OPTIONS.find((item) => item.id === tile.dataset.buildId);
      const visible = isBuildOptionVisible(state, option);
      const affordable = visible && canAffordBuildOption(state, option);
      tile.hidden = !visible;
      tile.disabled = !visible || !affordable;
      const lock = option ? getBuildOptionLockReason(state.game?.progression, option) : null;
      tile.title = option
        ? `${option.label} — ${getBuildCostLabel(option)}${visible ? (affordable ? '' : ' (need more resources)') : ` (${lock?.message ?? 'locked'})`}`
        : tile.title;
      if (activePlacementId !== null) {
        tile.setAttribute('aria-pressed', String(tile.dataset.buildId === activePlacementId));
      }
    });
    unitsGrid.querySelectorAll('.ui-build-tile').forEach((tile) => {
      const option = UNIT_OPTIONS.find((item) => item.id === tile.dataset.unitId);
      const visible = isBuildOptionVisible(state, option);
      const affordable = visible && canAffordBuildOption(state, option);
      tile.hidden = !visible;
      tile.disabled = !visible || !affordable;
      const lock = option ? getBuildOptionLockReason(state.game?.progression, option) : null;
      tile.title = option
        ? `${option.label} — ${getBuildCostLabel(option)}${visible ? (affordable ? '' : ' (need more resources)') : ` (${lock?.message ?? 'locked'})`}`
        : tile.title;
    });

    renderContextActionPanel();
    renderOrderWheel(authoringMode || !presentation.ui.selection);

    econToggle.textContent = econOpen
      ? `Close Gold ${formatNumber(amount)}`
      : `Gold ${formatNumber(amount)}`;
    econAmount.textContent = formatNumber(amount);
    incomeValue.textContent = `+${formatNumber(incomeAmount, 1)} / tick`;

    const factionEconomy = state.game?.economy?.factions?.player;
    const storage = factionEconomy?.storage;
    const storageRow = el('div', 'ui-econ-component');
    storageRow.append(
      el('span', 'ui-econ-component-label', 'Storage'),
      el('span', 'ui-econ-component-value', `${formatNumber(storage?.used ?? 0)} / ${formatNumber(storage?.capacity ?? 0)}`)
    );
    const resourceRows = Object.entries(state.game?.economy?.resources ?? {}).map(([id, resource]) => {
      const stockpile = factionEconomy?.stockpiles?.[id];
      const incomeForResource = factionEconomy?.lastIncome?.[id];
      const item = el('div', 'ui-econ-component');
      item.append(
        el('span', 'ui-econ-component-label', resource.label ?? id),
        el('span', 'ui-econ-component-value', `${formatNumber(stockpile?.amount ?? 0)} +${formatNumber(incomeForResource?.amount ?? 0, 1)}`)
      );
      return item;
    });
    componentGrid.replaceChildren(storageRow, ...resourceRows);

    const sources = Object.values(factionEconomy?.lastIncome ?? {})
      .flatMap((entry) => entry?.sources ?? [])
      .filter((source) => (source.amount ?? 0) > 0);
    if (sources.length === 0) {
      sourceList.replaceChildren(el('p', 'ui-econ-note', 'Income starts on the next tick.'));
      return;
    }

    sourceList.replaceChildren(...sources.map((source) => {
      const row = el('div', 'ui-econ-source');
      row.append(
        el('span', 'ui-econ-source-label', formatSourceLabel(source)),
        el('span', 'ui-econ-source-value', `+${formatNumber(source.amount, 1)}`)
      );
      return row;
    }));
  }


  function renderPlaytestHud() {
    const snapshot = buildPlaytestSnapshot(state);
    const frameBudget = state.runtimeStats?.frameBudget ?? {};
    playtestFps.textContent = `FPS ${snapshot.fps ?? '--'} · ${snapshot.frameMs ?? '--'}ms`;
    playtestFps.dataset.tone = Number(frameBudget?.badFrameRatio) > 0.05 || Number(snapshot.frameMs) > 33 ? 'warn' : 'ok';
    playtestScenario.textContent = `Scenario ${snapshot.scenario === 'chapter_001' ? 'The First Night' : snapshot.scenario}`;
    playtestCommander.textContent = `Commander ${String(snapshot.commanderState ?? 'ready').replaceAll('_', ' ')}`;
    playtestCommander.dataset.tone = ['panicked', 'routed', 'failed'].includes(snapshot.commanderState) ? 'critical' : ['pressured', 'alert'].includes(snapshot.commanderState) ? 'warn' : 'ok';
    playtestCommand.textContent = snapshot.latestCommand ? `Command ${String(snapshot.latestCommand).replaceAll('_', ' ')}` : 'Command --';
    playtestCommand.dataset.tone = snapshot.latestCommand === 'accepted' ? 'ok' : snapshot.latestCommand ? 'warn' : 'muted';
    const requested = snapshot.requestedWeatherMode !== snapshot.weatherMode ? `>${getWeatherQualityLabel(snapshot.weatherMode)}` : '';
    playtestWeather.textContent = `Weather ${getWeatherQualityLabel(snapshot.requestedWeatherMode)}${requested}${snapshot.mapClarityMode ? ' · clarity' : ''}`;
    playtestWeather.dataset.tone = snapshot.weatherMode === 'off' ? 'muted' : snapshot.weatherMode === 'cinematic' ? 'warn' : 'ok';
    playtestAi.textContent = snapshot.aiDebug ? 'Debug visibility' : isNomadicSurvivalScene(state.map) ? 'Avoid threats' : 'AI active';
    weatherBtn.textContent = `Weather: ${getWeatherQualityLabel(snapshot.requestedWeatherMode)}`;
    clarityBtn.textContent = `Clarity: ${snapshot.mapClarityMode ? 'On' : 'Off'}`;
    clarityBtn.setAttribute('aria-pressed', String(snapshot.mapClarityMode));
    aiDebugBtn.setAttribute('aria-pressed', String(snapshot.aiDebug));
  }

  function renderMousePanel(authoringMode) {
    const mouse = state.mousePlaytest;
    mousePanel.hidden = authoringMode || !mouse?.enabled;
    if (mousePanel.hidden) return;
    mousePanel.dataset.status = mouse.status ?? 'waiting';
    mouseStatus.textContent = String(mouse.currentMouseMode ?? mouse.status ?? 'waiting').replaceAll('_', ' ');
    mouseModel.textContent = mouse.modelAvailable && mouse.model
      ? `Local model: ${mouse.model}`
      : mouse.stateLabel ?? 'Mouse is waiting for local model connection';
    mouseThought.textContent = mouse.latestThought ?? 'Mouse is waiting for local model connection';
    const latestAction = mouse.latestAction;
    mouseAction.textContent = latestAction
      ? `${formatMouseCommand(latestAction.commandId)}${latestAction.targetLabel ? ` -> ${latestAction.targetLabel}` : ''}`
      : 'No command chosen yet.';
    mouseAction.dataset.tone = latestAction?.commandResponseStatus && latestAction.commandResponseStatus !== 'accepted' ? 'warn'
      : latestAction?.executionStatus === 'executed' ? 'ok'
      : latestAction?.executionStatus === 'not_executed' ? 'critical'
        : 'muted';
    mouseOutcome.textContent = latestAction
      ? `${String(latestAction.validationStatus ?? 'pending').replaceAll('_', ' ')} / ${String(latestAction.executionStatus ?? 'pending').replaceAll('_', ' ')}${latestAction.commandResponseStatus ? ` / ${String(latestAction.commandResponseStatus).replaceAll('_', ' ')}` : ''}: ${latestAction.outcomeSummary ?? 'Awaiting outcome.'}`
      : 'Waiting for a safe decision.';
    const thoughts = Array.isArray(mouse.recentThoughts) ? mouse.recentThoughts.slice(-3).reverse() : [];
    mouseRecent.replaceChildren(...(thoughts.length
      ? thoughts.map((entry) => el('li', 'ui-mouse-recent-item', entry.thought ?? String(entry)))
      : [el('li', 'ui-mouse-recent-item ui-mouse-recent-item--muted', 'Listening for the first thought.')]));
    const actions = Array.isArray(mouse.recentActions) ? mouse.recentActions.slice(-3).reverse() : [];
    mouseActions.replaceChildren(...(actions.length
      ? actions.map((entry) => el('li', 'ui-mouse-recent-item', `${formatMouseCommand(entry.commandId)}: ${entry.commandResponseStatus ?? entry.executionStatus ?? 'pending'}`))
      : [el('li', 'ui-mouse-recent-item ui-mouse-recent-item--muted', 'No resolved command yet.')]));
    const updated = mouse.updatedAt ? new Date(mouse.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--';
    mouseUpdated.textContent = `Scenario: The First Night | updated ${updated}`;
  }

  function formatMouseCommand(commandId) {
    return String(commandId ?? 'observe')
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderOrderWheel(authoringMode) {
    const wheel = state.orderWheel;
    const visible = state.uiScreen === 'game' && !authoringMode && wheel?.active;
    orderWheel.hidden = !visible;
    if (!visible) {
      return;
    }
    const position = clampWheelPosition(wheel.position ?? {});
    orderWheel.style.left = `${position.x}px`;
    orderWheel.style.top = `${position.y}px`;
    orderWheelLabel.textContent = wheel.highlightedLabel ?? wheel.context?.label ?? 'Move order';
    orderWheelSubLabel.textContent = wheel.highlightedActionId
      ? 'release to confirm'
      : wheel.context?.sublabel ?? `${wheel.tile?.x ?? '-'}, ${wheel.tile?.y ?? '-'}`;
    orderWheel.dataset.context = wheel.context?.kind ?? 'terrain';
    orderWheel.dataset.highlightedActionId = wheel.highlightedActionId ?? '';
    orderWheel.setAttribute('aria-activedescendant', wheel.highlightedActionId ? `ui-order-wheel-action-${wheel.highlightedActionId}` : '');
    orderWheelButtons.forEach((wheelButton) => {
      const actionId = wheelButton.dataset.actionId;
      const enabled = wheel.moveEnabled !== false || actionId === 'distract';
      wheelButton.disabled = !enabled;
      wheelButton.dataset.enabled = String(enabled);
      wheelButton.dataset.highlighted = String(enabled && actionId === wheel.highlightedActionId);
    });
  }

  function clampWheelPosition(position) {
    const margin = 92;
    const viewportWidth = window.innerWidth || 1;
    const viewportHeight = window.innerHeight || 1;
    return {
      x: Math.max(margin, Math.min(viewportWidth - margin, Number(position.x) || margin)),
      y: Math.max(margin, Math.min(viewportHeight - margin, Number(position.y) || margin))
    };
  }

  bus.on('ui:screen', render);
  bus.on('render', render);
  bus.on('game:tick', render);
  bus.on('runtime:stats', updateRuntimeStats);
  render();

  function updateRuntimeStats(stats = {}) {
    const fps = Number.isFinite(stats?.fps) && stats.fps > 0 ? Math.round(stats.fps) : '--';
    fpsBadge.textContent = `FPS·${fps}`;
    fpsBadge.dataset.state = Number.isFinite(stats?.fps) && stats.fps < 45 ? 'warn' : 'ok';
  }
}

// ─── Mount all UI layers ─────────────────────────────────────────────────────

/**
 * Call once after the canvas stage is in the DOM.
 *
 * @param {HTMLElement} canvasStage  – the `.canvas-stage` element
 * @param {object}      state        – shared editor/game state
 * @param {object}      bus          – event bus
 */
export function mountGameUI(canvasStage, state, bus) {
  mountSplashScreen(canvasStage);
  mountMainMenu(canvasStage, state, bus);
  mountPauseMenu(canvasStage, state, bus);
  mountGameHUD(canvasStage, state, bus);
}
