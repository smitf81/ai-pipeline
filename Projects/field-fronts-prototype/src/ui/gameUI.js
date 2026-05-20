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

import { BUILDING_OPTIONS, UNIT_OPTIONS } from '../game/buildCatalog.js';

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

function getSuppliesState(state, factionId = 'player') {
  return state.game?.economy?.factions?.[factionId]?.stockpiles?.supplies ?? null;
}

function getSuppliesIncome(state, factionId = 'player') {
  return state.game?.economy?.factions?.[factionId]?.lastIncome?.supplies ?? null;
}

function getAvailableSupplies(state, factionId = 'player') {
  return getSuppliesState(state, factionId)?.amount ?? 0;
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return '0';
  return digits > 0 ? value.toFixed(digits) : String(Math.floor(value));
}

function formatSourceLabel(source) {
  if (source.kind === 'contest-gradient') return 'Signal gradient';
  if (source.kind === 'base-outpost') return 'Base outpost';
  return source.kind ?? 'Source';
}

// ─── Main Menu ───────────────────────────────────────────────────────────────

export function mountMainMenu(root, state, bus) {
  const overlay = el('div', 'ui-overlay ui-menu');

  // Scanline grain texture via SVG filter embedded inline
  const noise = el('div', 'ui-menu-noise');
  overlay.append(noise);

  const inner = el('div', 'ui-menu-inner');

  // Header
  const header = el('div', 'ui-menu-header');
  const eyebrow = el('span', 'ui-eyebrow', 'Field Fronts');
  const title = el('h1', 'ui-menu-title', 'COMMAND');
  const subtitle = el('p', 'ui-menu-sub', 'A strategy prototype');
  header.append(eyebrow, title, subtitle);

  // Mode cards
  const modes = el('div', 'ui-mode-grid');

  const modeOptions = [
    {
      id: 'skirmish',
      label: 'Skirmish',
      glyph: '⚔',
      desc: 'Player vs AI — apply pressure orders, contest the objective'
    },
    {
      id: 'sandbox',
      label: 'Sandbox',
      glyph: '◈',
      desc: 'Open loop — step ticks freely, inspect command graphs'
    },
    {
      id: 'mapmaker',
      label: 'Map Maker',
      glyph: '⬡',
      desc: 'Author terrain, paint intent layers, export maps'
    }
  ];

  for (const opt of modeOptions) {
    const card = el('button', 'ui-mode-card');
    card.type = 'button';
    card.dataset.modeId = opt.id;

    const glyph = el('span', 'ui-mode-glyph', opt.glyph);
    const label = el('span', 'ui-mode-label', opt.label);
    const desc  = el('span', 'ui-mode-desc', opt.desc);
    card.append(glyph, label, desc);

    card.addEventListener('click', () => {
      if (opt.id === 'mapmaker') {
        state.mode = 'edit';
        setUiScreen(state, bus, 'game', {
          paused: false,
          status: 'Map Maker — paint terrain, then switch to Play'
        });
      } else {
        state.mode = 'play';
        setUiScreen(state, bus, 'game', {
          paused: false,
          status: opt.label + ' mode active'
        });
      }
    });

    modes.append(card);
  }

  // Map selector strip
  const mapSection = el('div', 'ui-map-section');
  const mapLabel = el('p', 'ui-section-label', 'Map');
  const mapStrip = el('div', 'ui-map-strip');

  const mapSlots = [
    { id: 'field-fronts-map', label: 'Signal Knoll', tag: 'Default' },
    { id: 'placeholder-a',    label: 'Ashwater Ridge', tag: 'Coming soon', disabled: true },
    { id: 'placeholder-b',    label: 'Iron Ford',      tag: 'Coming soon', disabled: true },
  ];

  for (const slot of mapSlots) {
    const tile = el('button', `ui-map-tile${slot.disabled ? ' ui-map-tile--locked' : ''}`);
    tile.type = 'button';
    if (slot.disabled) tile.disabled = true;
    tile.dataset.mapId = slot.id;

    const tileLabel = el('span', 'ui-map-tile-label', slot.label);
    const tileTag   = el('span', 'ui-map-tile-tag', slot.tag);
    tile.append(tileLabel, tileTag);

    if (!slot.disabled) {
      tile.setAttribute('aria-pressed', 'true'); // default selection
    }

    mapStrip.append(tile);
  }

  mapSection.append(mapLabel, mapStrip);

  // Footer
  const footer = el('div', 'ui-menu-footer');
  const version = el('span', 'ui-version', 'Prototype Build · 2025');
  footer.append(version);

  inner.append(header, modes, mapSection, footer);
  overlay.append(inner);
  root.append(overlay);

  function render() {
    overlay.hidden = state.uiScreen !== 'menu';
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
    state.mode = state.mode === 'edit' ? 'edit' : 'play';
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
    setUiScreen(state, bus, 'menu', { paused: false, status: 'Prototype session closed to menu' });
  });

  // Keyboard shortcut: Escape pauses, resumes, or backs out of pause subpanels.
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
  });

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
  const statusText = el('span', 'ui-hud-status', '');
  topCenter.append(statusText);

  const topRight = el('div', 'ui-hud-tr');
  const pauseBtn = btn('❙❙', 'ui-hud-pause-btn');
  pauseBtn.title = 'Pause (Esc)';
  topRight.append(pauseBtn);

  topBar.append(topLeft, topCenter, topRight);

  pauseBtn.addEventListener('click', () => {
    setUiScreen(state, bus, 'pause', { paused: true });
  });

  // ── Build panel (bottom-left, collapsible) ─────────────
  const buildContainer = el('div', 'ui-build-container');

  const buildToggle = btn('⊞ Build', 'ui-build-toggle');
  buildToggle.setAttribute('aria-expanded', 'false');
  buildToggle.setAttribute('aria-controls', 'ui-build-panel');

  const buildPanel = el('div', 'ui-build-panel');
  buildPanel.id = 'ui-build-panel';
  buildPanel.hidden = true;

  // Buildings sub-section
  const buildingsLabel = el('p', 'ui-panel-label', 'Structures');
  const buildingsGrid  = el('div', 'ui-build-grid');

  for (const b of BUILDING_OPTIONS) {
    const tile = btn('', 'ui-build-tile');
    tile.dataset.buildId = b.id;
    tile.title = `${b.label} — ${b.cost} supply`;
    const glyph = el('span', 'ui-build-glyph', b.glyph);
    const label = el('span', 'ui-build-tile-label', b.label);
    const cost  = el('span', 'ui-build-tile-cost', String(b.cost));
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
    tile.title = `${u.label} — ${u.cost} supply`;
    const glyph = el('span', 'ui-build-glyph', u.glyph);
    const label = el('span', 'ui-build-tile-label', u.label);
    const cost  = el('span', 'ui-build-tile-cost', String(u.cost));
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

  buildPanel.append(buildingsLabel, buildingsGrid, unitsLabel, unitsGrid);
  buildContainer.append(buildToggle, buildPanel);

  let buildOpen = false;
  buildToggle.addEventListener('click', () => {
    buildOpen = !buildOpen;
    buildPanel.hidden = !buildOpen;
    buildToggle.setAttribute('aria-expanded', String(buildOpen));
    buildToggle.textContent = buildOpen ? '✕ Close' : '⊞ Build';
  });

  // ── Economy readout (bottom-right, collapsible) ───────
  const econContainer = el('div', 'ui-econ-container');

  const econToggle = btn('Economy', 'ui-econ-toggle');
  econToggle.setAttribute('aria-expanded', 'false');
  econToggle.setAttribute('aria-controls', 'ui-econ-panel');

  const econPanel = el('div', 'ui-econ-panel');
  econPanel.id = 'ui-econ-panel';
  econPanel.hidden = true;

  const econHeadline = el('div', 'ui-econ-resource');
  const econTitle = el('span', 'ui-econ-resource-label', 'Supplies');
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

  let econOpen = false;
  econToggle.addEventListener('click', () => {
    econOpen = !econOpen;
    econPanel.hidden = !econOpen;
    econToggle.setAttribute('aria-expanded', String(econOpen));
    econToggle.textContent = econOpen ? 'Close' : 'Economy';
  });

  // ── Bottom bar ─────────────────────────────────────────
  const bottomBar = el('div', 'ui-hud-bottombar');
  bottomBar.append(buildContainer, econContainer);

  hud.append(topBar, bottomBar);
  root.append(hud);

  function render() {
    hud.hidden = state.uiScreen !== 'game';
    if (state.uiScreen !== 'game') return;

    // sync tick badge
    const tick = state.game?.tick ?? 0;
    tickBadge.textContent = `T·${tick}`;
    updateRuntimeStats(state.runtimeStats);

    // sync status
    statusText.textContent = state.status ?? '';

    const supplies = getSuppliesState(state);
    const income = getSuppliesIncome(state);
    const amount = supplies?.amount ?? 0;
    const incomeAmount = income?.amount ?? 0;

    const availableSupplies = getAvailableSupplies(state);
    buildingsGrid.querySelectorAll('.ui-build-tile').forEach((tile) => {
      const option = BUILDING_OPTIONS.find((item) => item.id === tile.dataset.buildId);
      const affordable = option ? availableSupplies >= option.cost : false;
      tile.disabled = !affordable;
      tile.title = option
        ? `${option.label} — ${option.cost} supply${affordable ? '' : ' (need more Supplies)'}`
        : tile.title;
    });
    unitsGrid.querySelectorAll('.ui-build-tile').forEach((tile) => {
      const option = UNIT_OPTIONS.find((item) => item.id === tile.dataset.unitId);
      const affordable = option ? availableSupplies >= option.cost : false;
      tile.disabled = !affordable;
      tile.title = option
        ? `${option.label} — ${option.cost} supply${affordable ? '' : ' (need more Supplies)'}`
        : tile.title;
    });

    econToggle.textContent = econOpen
      ? `Close ${formatNumber(amount)}`
      : `Supplies ${formatNumber(amount)}`;
    econAmount.textContent = formatNumber(amount);
    incomeValue.textContent = `+${formatNumber(incomeAmount, 1)} / tick`;

    const componentRows = Object.entries(supplies?.components ?? {}).map(([id, value]) => {
      const item = el('div', 'ui-econ-component');
      item.append(
        el('span', 'ui-econ-component-label', id),
        el('span', 'ui-econ-component-value', formatNumber(value))
      );
      return item;
    });
    componentGrid.replaceChildren(...componentRows);

    const sources = income?.sources ?? [];
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

  bus.on('ui:screen', render);
  bus.on('render', render);
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
  mountMainMenu(canvasStage, state, bus);
  mountPauseMenu(canvasStage, state, bus);
  mountGameHUD(canvasStage, state, bus);
}
