export const THREE_TUTORIAL_SCREEN_CONTRACT = 'black-sky-bound.three-tutorial-screen.v2';

export class ThreeTutorialScreenLayer {
  constructor(parent) {
    this.root = null;
    this.signature = '';
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-tutorial';
    root.dataset.threeTutorial = '';
    parent.appendChild(root);
    this.root = root;
  }

  update(cue, settings = {}) {
    if (!this.root) return;
    const view = buildThreeTutorialView(cue);
    const signature = view.active ? JSON.stringify(view) : 'inactive';
    if (signature !== this.signature) {
      this.signature = signature;
      this.root.classList.toggle('is-visible', view.active);
      this.root.classList.toggle('is-entering', view.phase === 'entering');
      this.root.classList.toggle('is-exiting', view.phase === 'exiting');
      this.root.setAttribute('aria-hidden', view.active ? 'false' : 'true');
      this.root.innerHTML = view.active ? renderTutorial(view) : '';
    }
    this.root.classList.toggle('is-reduced', settings.reducedMotion === true);
    this.root.style.opacity = String(view.opacity ?? 0);
    this.stats = view.active ? {
      contract: THREE_TUTORIAL_SCREEN_CONTRACT,
      active: true,
      cueId: view.id,
      presentationType: view.presentationType,
      keyCount: view.keys.length,
      completedKeyCount: view.keys.filter((keyEntry) => keyEntry.complete).length,
      opacity: view.opacity
    } : inactiveStats();
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; this.signature = ''; }
}

export function buildThreeTutorialView(cue) {
  if (!cue) return { active: false, opacity: 0, keys: [] };
  const presentationType = cue.presentationType ?? 'single_key';
  const progress = cue.progress ?? {};
  const pressed = new Set(progress.pressedLabels ?? []);
  const firstBindings = cue.inputRows?.[0]?.bindings ?? cue.bindings ?? [];
  let keys = [];
  let separator = null;
  if (presentationType === 'movement_keys') {
    keys = firstBindings.map((label) => key(label, pressed.has(label), pressed.has(label)));
  } else if (presentationType === 'combo_only') {
    const label = cue.inputRows?.find((row) => row.actionId === 'melee')?.bindings?.[0] ?? firstBindings[0] ?? 'LMB';
    keys = Array.from({ length: 3 }, (_, index) => key(label, pressed.has(label), Number(progress.comboAccepted ?? 0) > index));
    separator = '\u00b7';
  } else if (presentationType === 'dodge_charge_sequence') {
    const label = firstBindings[0] ?? 'SPACE';
    keys = [
      key(label, pressed.has(label), progress.dodgeAccepted === true),
      key(label, pressed.has(label) && progress.dodgeAccepted === true, progress.chargeAccepted === true)
    ];
    separator = '\u203a';
  } else if (presentationType !== 'message') {
    keys = firstBindings.map((label) => key(label, pressed.has(label), progress.dodgeAccepted === true || progress.accepted === true));
  }
  return {
    active: true,
    id: cue.id ?? cue.actionId ?? 'prompt',
    phase: cue.phase ?? 'active',
    presentationType,
    title: displayText(cue.title),
    supportingText: displayText(cue.supportingText),
    comboText: presentationType === 'combo_only' ? (cue.comboLabels ?? []).map(displayText).join(' \u00b7 ') : '',
    opacity: cueOpacity(cue),
    keys,
    separator
  };
}

function renderTutorial(view) {
  const keys = view.keys.length ? `<div class="bsb-key-row">${view.keys.map((entry, index) => {
    const marker = index > 0 && view.separator ? `<span class="bsb-key-arrow">${html(view.separator)}</span>` : '';
    const classes = `bsb-keycap${entry.active ? ' is-active' : ''}${entry.complete ? ' is-complete' : ''}`;
    return `${marker}<span class="${classes}" data-key-label="${attribute(entry.label)}">${html(entry.label)}</span>`;
  }).join('')}</div>` : '';
  const messageClass = view.presentationType === 'message' ? ' is-message' : '';
  return `<div class="bsb-tutorial-card" data-cue-id="${attribute(view.id)}">${keys}<div class="bsb-cue-title${messageClass}">${html(view.title)}</div>`
    + (view.comboText ? `<div class="bsb-cue-combo">${html(view.comboText)}</div>` : '')
    + (view.supportingText ? `<div class="bsb-cue-support">${html(view.supportingText)}</div>` : '')
    + '</div>';
}

function cueOpacity(cue) {
  if (cue.phase === 'exiting') return smooth01(1 - Number(cue.exitElapsed ?? 0) / 0.22);
  if (Number.isFinite(cue.elapsedReal)) return smooth01(Number(cue.elapsedReal) / 0.18);
  return 1;
}

function key(label, active, complete) { return { label: displayText(label), active: active === true, complete: complete === true }; }
function inactiveStats() { return { contract: THREE_TUTORIAL_SCREEN_CONTRACT, active: false, cueId: null, presentationType: null, keyCount: 0, completedKeyCount: 0, opacity: 0 }; }
function displayText(value) {
  return String(value ?? '')
    .replaceAll('\u00c3\u201a\u00c2\u00b7', '\u00b7')
    .replaceAll('\u00c2\u00b7', '\u00b7');
}
function html(value) { return displayText(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function attribute(value) { return html(value).replaceAll(' ', '_'); }
function smooth01(value) { const t = Math.max(0, Math.min(1, Number(value) || 0)); return t * t * (3 - 2 * t); }
