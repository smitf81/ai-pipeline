export const THREE_PAUSE_SCREEN_CONTRACT = 'black-sky-bound.three-pause-screen.v2';

export class ThreePauseScreenLayer {
  constructor(parent) {
    this.root = null;
    this.signature = '';
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-pause';
    root.dataset.threePause = '';
    parent.appendChild(root);
    this.root = root;
  }

  update(menu) {
    if (!this.root) return;
    const view = buildThreePauseView(menu);
    const signature = view.active ? JSON.stringify(view) : 'inactive';
    if (signature === this.signature) return;
    this.signature = signature;
    this.root.classList.toggle('is-visible', view.active);
    this.root.setAttribute('aria-hidden', view.active ? 'false' : 'true');
    if (!view.active) {
      this.root.innerHTML = '';
      this.stats = inactiveStats();
      return;
    }
    this.root.innerHTML = renderPause(view);
    this.stats = {
      contract: THREE_PAUSE_SCREEN_CONTRACT,
      active: true,
      compact: view.layout.compact,
      controls: view.controls.length,
      settings: view.settings.length,
      interactiveLevelRows: view.settings.filter((row) => row.kind === 'level').length,
      selectedSettingIndex: view.selectedSettingIndex
    };
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; this.signature = ''; }
}

export function buildThreePauseView(menu) {
  if (!menu?.layout) return { active: false };
  return {
    active: true,
    title: displayText(menu.title),
    footer: displayText(menu.footer),
    pointerHint: displayText(menu.pointerHint),
    selectedSettingIndex: Number(menu.selectedSettingIndex ?? 0),
    learnedCueIds: [...(menu.learnedCueIds ?? [])],
    controls: (menu.layout.controls ?? []).map((row) => ({ ...row, label: displayText(row.label), bindings: displayText(row.bindings), detail: displayText(row.detail) })),
    sections: (menu.layout.sections ?? []).map((section) => ({ ...section, label: displayText(section.label) })),
    settings: (menu.layout.settingsRows ?? []).map((row) => ({ ...row, label: displayText(row.label), value: displayText(row.value) })),
    layout: { ...menu.layout }
  };
}

function renderPause(view) {
  const controls = view.controls.map((row) => {
    const fontSize = row.scale > 1 ? 15 : 11;
    return `<div class="bsb-pause-control" data-ability-id="${attribute(row.abilityId)}">`
      + `<div class="bsb-pause-control-key" style="left:${px(row.x)};top:${px(row.y)};font-size:${fontSize}px">${html(row.bindings)}</div>`
      + `<div class="bsb-pause-control-label" style="left:${px(row.labelX)};top:${px(row.y + 3)};font-size:${fontSize}px">${html(row.label)}</div>`
      + (row.detail ? `<div class="bsb-pause-control-detail" style="left:${px(row.labelX)};top:${px(row.y + (view.layout.compact ? 18 : 23))}">${html(row.detail)}</div>` : '')
      + '</div>';
  }).join('');
  const firstWidth = view.settings[0]?.width ?? 250;
  const sections = view.sections.map((section) => `<div class="bsb-pause-section" style="left:${px(section.x)};top:${px(section.y)}">${html(section.label)}</div>`
    + (section.label === 'SOUND' && view.pointerHint
      ? `<div class="bsb-pause-pointer-hint" style="left:${px(section.x + firstWidth - 150)};top:${px(section.y + 4)};width:150px">${html(view.pointerHint)}</div>`
      : '')).join('');
  const settings = view.settings.map((row) => renderSetting(row, row.index === view.selectedSettingIndex)).join('');
  const footerSize = view.layout.footer.scale > 1 ? 12 : 9;
  return '<div class="bsb-pause-rule"></div>'
    + `<div class="bsb-pause-title">${html(view.title)}</div><div class="bsb-pause-state">PAUSED</div>`
    + controls + sections + settings
    + `<div class="bsb-pause-footer" style="left:${px(view.layout.footer.x)};top:${px(view.layout.footer.y)};max-width:${px(view.layout.footer.maxWidth)};font-size:${footerSize}px">${html(view.footer)}</div>`;
}

function renderSetting(row, selected) {
  const selectedClass = selected ? ' is-selected' : '';
  const selection = selected
    ? `<div class="bsb-pause-selection" style="left:${px(row.bounds.x)};top:${px(row.bounds.y)};width:${px(row.bounds.w)};height:${px(row.bounds.h)}"></div>`
    : '';
  const valueLeft = row.x + Math.max(110, row.width - 92);
  const level = row.kind === 'level' ? renderLevel(row) : '';
  return `${selection}<div class="bsb-pause-setting${selectedClass}" data-setting-row="${attribute(row.id)}">`
    + `<div class="bsb-pause-setting-label" style="left:${px(row.x)};top:${px(row.y)}">${html(row.label)}</div>`
    + `<div class="bsb-pause-setting-value" data-setting-value="${attribute(row.id)}" style="left:${px(valueLeft)};top:${px(row.y)};width:${px(row.x + row.width - valueLeft)}">${html(row.value)}</div>`
    + level + '</div>';
}

function renderLevel(row) {
  const level = clamp01(row.level);
  const knobX = row.rail.x + row.rail.w * level;
  return `<div class="bsb-pause-mini" data-setting-id="${attribute(row.id)}" data-pause-target="decrease" style="left:${px(row.minusBounds.x)};top:${px(row.minusBounds.y)};width:${px(row.minusBounds.w)};height:${px(row.minusBounds.h)}">−</div>`
    + `<div class="bsb-pause-rail" data-setting-id="${attribute(row.id)}" data-pause-target="rail" style="left:${px(row.rail.x)};top:${px(row.rail.y)};width:${px(row.rail.w)};height:${px(row.rail.h)}"><div class="bsb-pause-rail-fill" style="width:${Math.round(level * 100)}%"></div></div>`
    + `<div class="bsb-pause-knob" style="left:${px(knobX)};top:${px(row.rail.y - 3)};height:${px(row.rail.h + 6)}"></div>`
    + `<div class="bsb-pause-mini" data-setting-id="${attribute(row.id)}" data-pause-target="increase" style="left:${px(row.plusBounds.x)};top:${px(row.plusBounds.y)};width:${px(row.plusBounds.w)};height:${px(row.plusBounds.h)}">+</div>`;
}

function inactiveStats() {
  return { contract: THREE_PAUSE_SCREEN_CONTRACT, active: false, compact: false, controls: 0, settings: 0, interactiveLevelRows: 0, selectedSettingIndex: null };
}

function displayText(value) { return String(value ?? '').replaceAll('Â·', '·'); }
function html(value) { return displayText(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function attribute(value) { return html(value).replaceAll(' ', '_'); }
function px(value) { return `${Math.round((Number(value) || 0) * 10) / 10}px`; }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
