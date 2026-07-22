import { getProfileOverrideValue } from '../data/creatures/creatureTuning.js';
import { resolveCreatureProjectionRecipe } from '../data/creatureProjections.js';
import { getHumanoidProjectionProfile } from '../data/humanoids/raiderHumanoid.js';

export function createCreatureTuningOverlay({ state, onChange }) {
  if (typeof document === 'undefined') return noopOverlay();
  injectStyles();
  const root = document.createElement('aside');
  root.className = 'bsb-tuning-overlay';
  root.setAttribute('aria-live', 'polite');
  root.hidden = true;
  document.body.appendChild(root);
  let lastSignature = '';

  function update() {
    const tuning = state.tuning;
    root.hidden = !tuning?.active;
    if (!tuning?.active) return;
    const signature = [
      tuning.selectedEntityId,
      tuning.selectedProfileId,
      tuning.overrideCount,
      tuning.saveStatus,
      tuning.saveError,
      state.game?.creatureTuning ? JSON.stringify(state.game.creatureTuning.profiles?.[tuning.selectedProfileId] ?? {}) : ''
    ].join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;
    root.replaceChildren(buildPanel(state, onChange));
  }

  return {
    update,
    destroy() {
      root.remove();
    }
  };
}

function buildPanel(state, onChange) {
  const tuning = state.tuning;
  const actor = state.game.actors.find((item) => item.id === tuning.selectedEntityId);
  const target = resolveTuningTarget(actor, state.game.creatureTuning);
  const panel = el('div', 'bsb-tuning-panel');
  panel.append(
    header(target?.title ?? 'Actor Tuning', tuning.saveStatus, tuning.saveError),
    metaRows([
      ['Selected', tuning.selectedEntityId ?? 'none'],
      ['Profile', tuning.selectedProfileId ?? 'none'],
      ['Overrides', String(tuning.overrideCount)],
      ['Bounds', formatBounds(tuning.visualBounds)]
    ])
  );

  if (!target?.profile || !tuning.selectedProfileId) {
    panel.append(el('p', 'bsb-tuning-empty', 'Click a tunable actor.'));
    return panel;
  }

  const groups = groupFields(tuning.manifest);
  for (const [group, fields] of groups) {
    const section = el('section', 'bsb-tuning-section');
    section.append(el('h3', '', group));
    for (const field of fields) {
      section.append(controlRow(field, target.profile, state.game.creatureTuning, tuning.selectedProfileId, onChange));
    }
    panel.append(section);
  }
  return panel;
}

function resolveTuningTarget(actor, tuning) {
  if (actor?.wyvernProjection?.recipeId) {
    const recipe = resolveCreatureProjectionRecipe(actor.wyvernProjection.recipeId, tuning);
    return { title: 'Wyvern Tuning', profile: recipe.proportionProfile };
  }
  if (actor?.humanoidProjection?.profileId) {
    return { title: 'Humanoid Tuning', profile: getHumanoidProjectionProfile(actor.humanoidProjection.profileId, tuning) };
  }
  return null;
}

function header(title, status, error) {
  const wrap = el('div', 'bsb-tuning-head');
  wrap.append(el('h2', '', title), el('span', `bsb-save bsb-save-${status}`, error ? `${status}: ${error}` : status));
  return wrap;
}

function metaRows(rows) {
  const wrap = el('dl', 'bsb-tuning-meta');
  for (const [key, value] of rows) {
    wrap.append(el('dt', '', key), el('dd', '', value));
  }
  return wrap;
}

function controlRow(field, profile, tuning, profileId, onChange) {
  const value = Number(getAtPath(profile, field.path) ?? 0);
  const overridden = getProfileOverrideValue(tuning, profileId, field.path) !== undefined;
  const row = el('label', `bsb-tuning-control${overridden ? ' is-overridden' : ''}`);
  const top = el('span', 'bsb-control-top');
  top.append(el('span', 'bsb-control-label', field.label), el('span', 'bsb-control-value', value.toFixed(2)));
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(field.min);
  range.max = String(field.max);
  range.step = String(field.step);
  range.value = String(value);
  range.dataset.path = field.path;
  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(field.min);
  number.max = String(field.max);
  number.step = String(field.step);
  number.value = value.toFixed(2);
  const update = (next) => {
    const numeric = Number(next);
    if (!Number.isFinite(numeric)) return;
    top.querySelector('.bsb-control-value').textContent = numeric.toFixed(2);
    range.value = String(numeric);
    number.value = numeric.toFixed(2);
    onChange(field.path, numeric);
  };
  range.addEventListener('input', () => update(range.value));
  number.addEventListener('change', () => update(number.value));
  row.append(top, range, number);
  return row;
}

function groupFields(fields) {
  const groups = new Map();
  for (const field of fields) {
    if (!groups.has(field.group)) groups.set(field.group, []);
    groups.get(field.group).push(field);
  }
  return groups;
}

function getAtPath(target, path) {
  let cursor = target;
  for (const part of path.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function formatBounds(bounds) {
  if (!bounds) return 'none';
  return `${bounds.width.toFixed(2)} x ${bounds.height.toFixed(2)}`;
}

function el(tag, className = '', text = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== null) node.textContent = text;
  return node;
}

function injectStyles() {
  if (document.getElementById('bsb-tuning-style')) return;
  const style = document.createElement('style');
  style.id = 'bsb-tuning-style';
  style.textContent = `
    .bsb-tuning-overlay {
      position: fixed;
      top: 16px;
      right: 16px;
      bottom: 16px;
      width: min(420px, calc(100vw - 32px));
      z-index: 20;
      color: #f2eadb;
      font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
    }
    .bsb-tuning-panel {
      height: 100%;
      overflow: auto;
      pointer-events: auto;
      background: rgba(10, 13, 16, 0.92);
      border: 1px solid rgba(213, 153, 88, 0.34);
      border-radius: 8px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42);
      backdrop-filter: blur(10px);
    }
    .bsb-tuning-head {
      position: sticky;
      top: 0;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 16px 10px;
      background: rgba(10, 13, 16, 0.96);
      border-bottom: 1px solid rgba(213, 153, 88, 0.18);
    }
    .bsb-tuning-head h2,
    .bsb-tuning-section h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 650;
      letter-spacing: 0;
    }
    .bsb-save {
      color: #b9c7c4;
      font-size: 11px;
    }
    .bsb-save-saved { color: #9bd8aa; }
    .bsb-save-saving { color: #efc472; }
    .bsb-save-error, .bsb-save-blocked { color: #f19a84; }
    .bsb-tuning-meta {
      display: grid;
      grid-template-columns: 76px 1fr;
      gap: 4px 10px;
      padding: 12px 16px;
      margin: 0;
      color: #c9d1ce;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .bsb-tuning-meta dt { color: #8e9c9a; }
    .bsb-tuning-meta dd {
      margin: 0;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .bsb-tuning-section {
      padding: 12px 16px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .bsb-tuning-section h3 {
      margin-bottom: 9px;
      color: #f0c986;
    }
    .bsb-tuning-control {
      display: grid;
      grid-template-columns: 1fr 72px;
      gap: 5px 10px;
      align-items: center;
      margin: 8px 0;
    }
    .bsb-control-top {
      grid-column: 1 / 3;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .bsb-control-label { color: #d8dfda; }
    .bsb-control-value { color: #91aaa5; }
    .bsb-tuning-control.is-overridden .bsb-control-label { color: #ffd28b; }
    .bsb-tuning-control input[type="range"] {
      width: 100%;
      accent-color: #d99b5d;
    }
    .bsb-tuning-control input[type="number"] {
      width: 72px;
      box-sizing: border-box;
      color: #f2eadb;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 5px 6px;
    }
    .bsb-tuning-empty {
      margin: 16px;
      color: #a8b4b1;
    }
  `;
  document.head.appendChild(style);
}

function noopOverlay() {
  return { update() {}, destroy() {} };
}
