export const THREE_BODY_STATE_SCREEN_CONTRACT = 'black-sky-bound.three-body-state-screen.v1';

export class ThreeBodyStateScreenLayer {
  constructor(parent) {
    this.root = null;
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-body-feedback';
    root.dataset.threeBodyFeedback = '';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="bsb-body-pressure-layer bsb-health-pressure"></div><div class="bsb-body-pressure-layer bsb-stamina-pressure"></div><div class="bsb-body-pressure-layer bsb-hit-pressure"></div>';
    parent.appendChild(root);
    this.root = root;
    this.healthLayer = root.querySelector('.bsb-health-pressure');
    this.staminaLayer = root.querySelector('.bsb-stamina-pressure');
    this.hitLayer = root.querySelector('.bsb-hit-pressure');
  }

  update(bodyState) {
    if (!this.root) return;
    const disabled = queryDisabled(bodyState?.debug?.bodyStateQueryParam ?? 'bodyState');
    const view = buildThreeBodyStateView(bodyState, { disabled });
    this.root.style.display = view.active ? 'block' : 'none';
    setVariable(this.healthLayer, '--bsb-health-clear', `${view.healthClearRadiusPct}%`);
    setVariable(this.healthLayer, '--bsb-health-edge-alpha', view.healthEdgeAlpha);
    setVariable(this.healthLayer, '--bsb-health-blood-alpha', view.healthBloodAlpha);
    setVariable(this.healthLayer, '--bsb-health-pulse', view.healthPulseScale);
    setVariable(this.staminaLayer, '--bsb-stamina-clear', `${view.staminaClearRadiusPct}%`);
    setVariable(this.staminaLayer, '--bsb-stamina-edge-alpha', view.staminaAlpha);
    setVariable(this.staminaLayer, '--bsb-stamina-saturation', view.staminaSaturation);
    setVariable(this.staminaLayer, '--bsb-stamina-contrast', view.staminaContrast);
    setVariable(this.staminaLayer, '--bsb-stamina-brightness', view.staminaBrightness);
    setVariable(this.hitLayer, '--bsb-hit-alpha', view.flashAlpha);
    this.root.dataset.healthPressure = format(view.healthPressure);
    this.root.dataset.hitPulse = format(view.hitPulse);
    this.root.dataset.staminaPressure = format(view.staminaPressure);
    this.root.dataset.healthBand = view.healthBand;
    this.root.dataset.staminaBand = view.staminaBand;
    this.root.dataset.healthClearRadius = format(view.healthClearRadiusPct);
    this.root.dataset.staminaClearRadius = format(view.staminaClearRadiusPct);
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
  const dangerPulse = clamp01(bodyState.health?.dangerPulse);
  const active = healthPressure + hitPulse + staminaPressure > .002;
  const healthPulseScale = 1 + dangerPulse * .12;
  const healthEdgeAlpha = Math.min(
    pick(post.healthMaxEdgeOpacity, .78),
    (healthPressure * pick(post.healthMaxEdgeOpacity, .78) + hitPulse * .16) * healthPulseScale
  );
  const healthBloodAlpha = Math.min(
    pick(post.healthMaxBloodOpacity, .36),
    Math.pow(healthPressure, 1.08) * pick(post.healthMaxBloodOpacity, .36) * healthPulseScale
  );
  const staminaSaturation = Math.max(.72, 1 - staminaPressure * pick(post.staminaMaxDesaturation, .22));
  const staminaContrast = Math.max(.78, 1 - staminaPressure * pick(post.staminaMaxContrastLoss, .1));
  const staminaBrightness = Math.max(.76, 1 - staminaPressure * pick(post.staminaMaxBrightnessLoss, .08));
  return {
    active,
    healthPressure,
    hitPulse,
    staminaPressure,
    breathPulse,
    healthBand: healthBand(bodyState.health?.ratio),
    staminaBand: staminaBand(bodyState.stamina?.ratio),
    healthClearRadiusPct: round(pick(post.healthRestingClearRadius, 82) - healthPressure * pick(post.healthMaxContraction, 34) - dangerPulse * .8),
    staminaClearRadiusPct: round(pick(post.staminaRestingClearRadius, 76) - staminaPressure * pick(post.staminaMaxContraction, 18)),
    healthPulseScale: format(healthPulseScale),
    healthEdgeAlpha: format(healthEdgeAlpha),
    healthBloodAlpha: format(healthBloodAlpha),
    staminaSaturation: format(staminaSaturation),
    staminaContrast: format(staminaContrast),
    staminaBrightness: format(staminaBrightness),
    saturation: format(staminaSaturation),
    contrast: format(staminaContrast),
    edgeAlpha: format(healthEdgeAlpha),
    flashAlpha: format(Math.min(.18, hitPulse * .14)),
    staminaAlpha: format(Math.min(pick(post.staminaMaxEdgeOpacity, .38), staminaPressure * pick(post.staminaMaxEdgeOpacity, .38) * (1 + breathPulse * .16)))
  };
}

function queryDisabled(key) {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get(key);
  return ['0', 'false', 'off'].includes(String(value ?? '').toLowerCase());
}

function inactiveStats() { return { active: false, healthPressure: 0, hitPulse: 0, staminaPressure: 0, breathPulse: 0, healthBand: 'safe', staminaBand: 'ready', healthClearRadiusPct: 82, staminaClearRadiusPct: 76, healthPulseScale: '1', healthEdgeAlpha: '0', healthBloodAlpha: '0', staminaSaturation: '1', staminaContrast: '1', staminaBrightness: '1', saturation: '1', contrast: '1', edgeAlpha: '0', flashAlpha: '0', staminaAlpha: '0' }; }
function healthBand(ratio) { const value = clamp01(ratio ?? 1); return value <= .15 ? 'terminal' : value <= .35 ? 'critical' : value < .62 ? 'warning' : 'safe'; }
function staminaBand(ratio) { const value = clamp01(ratio ?? 1); return value <= .16 ? 'exhausted' : value <= .3 ? 'critical' : value < .42 ? 'low' : 'ready'; }
function setVariable(element, name, value) { element?.style?.setProperty(name, String(value)); }
function pick(value, fallback) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; }
function round(value) { return Math.round((Number(value) || 0) * 10) / 10; }
function format(value) { return String(Math.round((Number(value) || 0) * 1000) / 1000); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
