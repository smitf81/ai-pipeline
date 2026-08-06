export const THREE_BODY_STATE_SCREEN_CONTRACT = 'black-sky-bound.three-body-state-screen.v1';

export class ThreeBodyStateScreenLayer {
  constructor(parent) {
    this.root = null;
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-body-feedback';
    root.dataset.threeBodyFeedback = '';
    parent.appendChild(root);
    this.root = root;
  }

  update(bodyState) {
    if (!this.root) return;
    const disabled = queryDisabled(bodyState?.debug?.bodyStateQueryParam ?? 'bodyState');
    const view = buildThreeBodyStateView(bodyState, { disabled });
    this.root.style.display = view.active ? 'block' : 'none';
    this.root.style.backdropFilter = view.active ? `saturate(${view.saturation}) contrast(${view.contrast})` : 'none';
    this.root.style.webkitBackdropFilter = this.root.style.backdropFilter;
    this.root.style.background = view.active
      ? `radial-gradient(ellipse at center, rgba(42,8,5,${view.flashAlpha}) 0%, rgba(58,7,4,0) 48%, rgba(82,9,5,${view.edgeAlpha}) 100%),radial-gradient(ellipse at center, rgba(5,13,17,0) 45%, rgba(5,13,17,${view.staminaAlpha}) 100%)`
      : 'transparent';
    this.root.dataset.healthPressure = format(view.healthPressure);
    this.root.dataset.hitPulse = format(view.hitPulse);
    this.root.dataset.staminaPressure = format(view.staminaPressure);
    this.stats = { contract: THREE_BODY_STATE_SCREEN_CONTRACT, ...view };
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; }
}

export function buildThreeBodyStateView(bodyState, options = {}) {
  if (!bodyState || bodyState.enabled === false || options.disabled === true) return inactiveStats();
  const post = bodyState.postProcess ?? {};
  const healthPressure = clamp01(post.healthPressure);
  const hitPulse = clamp01(post.hitPulse);
  const staminaPressure = clamp01(post.staminaPressure);
  const breathPulse = clamp01(post.breathPulse);
  const desaturation = clamp01(post.desaturation);
  const contrastPressure = clamp01(post.contrast);
  const active = healthPressure + hitPulse + staminaPressure > .002;
  return {
    active,
    healthPressure,
    hitPulse,
    staminaPressure,
    breathPulse,
    saturation: format(Math.max(.54, 1 - desaturation * .86)),
    contrast: format(1 + contrastPressure * .42),
    edgeAlpha: format(Math.min(.46, healthPressure * .28 + hitPulse * .18)),
    flashAlpha: format(Math.min(.13, hitPulse * .1)),
    staminaAlpha: format(Math.min(.15, staminaPressure * (.055 + breathPulse * .07)))
  };
}

function queryDisabled(key) {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get(key);
  return ['0', 'false', 'off'].includes(String(value ?? '').toLowerCase());
}

function inactiveStats() { return { active: false, healthPressure: 0, hitPulse: 0, staminaPressure: 0, breathPulse: 0, saturation: '1', contrast: '1', edgeAlpha: '0', flashAlpha: '0', staminaAlpha: '0' }; }
function format(value) { return String(Math.round((Number(value) || 0) * 1000) / 1000); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
