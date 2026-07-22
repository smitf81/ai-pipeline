import { ATMOSPHERIC_POST_PROCESS_POLISH_MODE, resolvePostProcessPolishTuning } from '../../../../data/postProcessPolish.js';

export class WebGLPostProcessLayer {
  constructor() {
    this.id = 'postProcess';
    this.status = 'inactive';
    this.objectCount = 0;
    this.mode = null;
    this.passCount = 0;
    this.renderTargetActive = false;
    this.enabled = true;
    this.tuning = resolvePostProcessPolishTuning();
    this.bodyState = null;
    this.bodyStateEnabled = false;
  }

  update(projection) {
    this.tuning = projection.postProcess?.tuning ?? resolvePostProcessPolishTuning();
    this.enabled = projection.postProcess?.enabled !== false && this.tuning.postEnabled !== false && isPostProcessToggleEnabled(this.tuning);
    this.bodyState = projection.bodyState ?? null;
    this.bodyStateEnabled = isBodyStateEnabled(this.bodyState);
    this.objectCount = 1;
    this.status = this.enabled ? 'active' : 'active_passthrough';
    this.mode = this.enabled ? ATMOSPHERIC_POST_PROCESS_POLISH_MODE : 'copy_passthrough_v0';
  }

  render(context) {
    const result = context.postProcess.compositeToScreen({
      enabled: this.enabled,
      bodyState: this.bodyStateEnabled ? this.bodyState : null,
      tuning: this.tuning,
      width: context.renderTargetWidth,
      height: context.renderTargetHeight,
      renderTime: getRenderSeconds(context)
    });
    this.mode = result.mode;
    this.passCount = result.passCount;
    this.renderTargetActive = result.renderTargetActive;
    this.status = this.renderTargetActive ? (this.enabled ? 'active' : 'active_passthrough') : 'inactive';
  }

  statsFields() {
    return {
      mode: this.mode,
      postProcessMode: this.mode,
      passCount: this.passCount,
      renderTargetActive: this.renderTargetActive,
      postEnabled: this.enabled,
      postProcessToggleParam: this.tuning.debugToggleParam,
      gradeStrength: this.tuning.gradeStrength,
      shadowCoolStrength: this.tuning.shadowCoolStrength,
      fireWarmStrength: this.tuning.fireWarmStrength,
      vignetteStrength: this.tuning.vignetteStrength,
      vignetteRadius: this.tuning.vignetteRadius,
      grainStrength: this.tuning.grainStrength,
      glowProxyStrength: this.tuning.glowProxyStrength,
      lowHealthPostStrength: this.tuning.lowHealthPostStrength,
      bodyStateEnabled: this.bodyStateEnabled,
      healthPressure: this.bodyState?.postProcess?.healthPressure ?? 0,
      hitPulse: this.bodyState?.postProcess?.hitPulse ?? 0,
      staminaPressure: this.bodyState?.postProcess?.staminaPressure ?? 0,
      breathPulse: this.bodyState?.postProcess?.breathPulse ?? 0
    };
  }
}

function isBodyStateEnabled(bodyState) {
  if (!bodyState || bodyState.enabled === false) return false;
  const param = bodyState.debug?.bodyStateQueryParam ?? 'bodyState';
  const value = new URLSearchParams(globalThis.location?.search ?? '').get(param);
  return !['0', 'false', 'off'].includes(String(value ?? '').toLowerCase());
}

function isPostProcessToggleEnabled(tuning) {
  const value = new URLSearchParams(globalThis.location?.search ?? '').get(tuning.debugToggleParam ?? 'post');
  return !['0', 'false', 'off'].includes(String(value ?? '').toLowerCase());
}

function getRenderSeconds(context) {
  const ms = Number(context?.renderTimeMs);
  return Number.isFinite(ms) ? ms / 1000 : 0;
}
