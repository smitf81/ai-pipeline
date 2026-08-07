import { ThreeArenaScreenLayer } from './ThreeArenaScreenLayer.js';
import { ThreeBodyStateScreenLayer } from './ThreeBodyStateScreenLayer.js';
import { ThreeOpeningScreenLayer } from './ThreeOpeningScreenLayer.js';
import { ThreePauseScreenLayer } from './ThreePauseScreenLayer.js';
import { installThreeScreenTheme, THREE_SCREEN_STYLE_ID } from './ThreeScreenTheme.js';
import { ThreeTransitionScreenLayer } from './ThreeTransitionScreenLayer.js';
import { ThreeTutorialScreenLayer } from './ThreeTutorialScreenLayer.js';

export class ThreeScreenOverlay {
  constructor() {
    this.element = null;
    this.signatures = new Map();
    this.revision = 0;
    this.topologySignature = '';
    this.domNodeCount = 0;
    this.ownsTheme = false;
    if (!globalThis.document?.body) return;
    this.ownsTheme = !document.getElementById(THREE_SCREEN_STYLE_ID);
    this.theme = installThreeScreenTheme(document);
    const element = document.createElement('div');
    element.id = 'bsb-three-screen-overlay';
    element.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:18;overflow:hidden;';
    element.innerHTML = '<div data-lifecycle class="bsb-screen-layer bsb-lifecycle" style="display:none"></div><div data-hud class="bsb-hud"></div><div data-message class="bsb-message"></div>';
    document.body.appendChild(element);
    this.element = element;
    this.lifecycle = element.querySelector('[data-lifecycle]');
    this.hud = element.querySelector('[data-hud]');
    this.message = element.querySelector('[data-message]');
    this.bodyState = new ThreeBodyStateScreenLayer(element);
    this.arena = new ThreeArenaScreenLayer(element);
    this.transition = new ThreeTransitionScreenLayer(element);
    this.tutorial = new ThreeTutorialScreenLayer(element);
    this.opening = new ThreeOpeningScreenLayer(element);
    this.pause = new ThreePauseScreenLayer(element);
  }

  update(projection) {
    if (!this.element) return;
    this.opening.update(projection.opening);
    this.bodyState.update(projection.bodyState);
    this.transition.update(projection.authoredTransition, projection.smokeAwakening);
    this.arena.update(projection.hud?.arena);
    const cue = projection.tutorial?.activeCue ?? projection.opening?.prompt ?? null;
    this.tutorial.update(cue, projection.tutorial?.settings ?? projection.opening?.settings ?? {});
    this.pause.update(projection.tutorial?.pauseMenu);
    this.updateHud(projection.hud ?? {});
    this.updateMessage(projection, cue);
    this.updateLifecycle(projection.playerLifecycle);
    this.updateDomDiagnostics();
  }

  updateHud(hud) {
    const hp = `${Math.max(0, Math.ceil(hud.playerHp ?? 0))}/${Math.max(0, Math.ceil(hud.playerMaxHp ?? 0))}`;
    const stamina = `${Math.max(0, Math.round(hud.playerStamina ?? 0))}/${Math.max(0, Math.round(hud.playerMaxStamina ?? 0))}`;
    const arena = hud.arena ? `<div class="bsb-hud-arena">${html(arenaLine(hud.arena))}</div>` : '';
    const signature = `${hp}:${stamina}:${hud.objective ?? ''}:${arena}`;
    if (!this.changed('hud', signature)) return;
    this.hud.innerHTML = `<div class="bsb-hud-kicker">BLACK SKY BOUND</div><div class="bsb-hud-vitals">VITAL ${hp} · STAMINA ${stamina}</div><div class="bsb-hud-objective">${html(hud.objective ?? '')}</div>${arena}`;
  }

  updateMessage(projection, cue) {
    const cinematic = projection.authoredTransition?.screenActive || projection.smokeAwakening?.screenActive || projection.opening?.screenActive;
    const arenaBanner = Number(projection.hud?.arena?.bannerSeconds ?? 0) > 0;
    const paused = !!projection.tutorial?.pauseMenu;
    const message = !cue && !cinematic && !arenaBanner && !paused ? projection.hud?.message ?? '' : '';
    if (this.changed('message', message)) this.message.textContent = displayText(message);
  }

  updateLifecycle(playerLifecycle) {
    const overlay = playerLifecycle?.overlay ?? {};
    const opacity = clamp01(overlay.opacity);
    const colour = Array.isArray(overlay.colour) ? overlay.colour : [0, 0, 0, 1];
    const signature = `${opacity.toFixed(3)}:${colour.join(':')}`;
    if (!this.changed('lifecycle', signature)) return;
    this.lifecycle.style.display = opacity > .001 ? 'block' : 'none';
    this.lifecycle.style.background = `rgba(${channel(colour[0])},${channel(colour[1])},${channel(colour[2])},${opacity})`;
  }

  changed(key, value) {
    if (this.signatures.get(key) === value) return false;
    this.signatures.set(key, value);
    this.revision += 1;
    return true;
  }

  updateDomDiagnostics() {
    const opening = this.opening?.diagnostics?.() ?? {};
    const pause = this.pause?.diagnostics?.() ?? {};
    const tutorial = this.tutorial?.diagnostics?.() ?? {};
    const arena = this.arena?.diagnostics?.() ?? {};
    const transition = this.transition?.diagnostics?.() ?? {};
    const signature = [opening.cracks, opening.rays, opening.fragments, pause.active, pause.settings, tutorial.active, tutorial.keyCount, arena.active, transition.active, transition.debrisCount].join(':');
    if (signature === this.topologySignature) return;
    this.topologySignature = signature;
    this.domNodeCount = this.element?.querySelectorAll('*').length ?? 0;
    this.revision += 1;
  }

  diagnostics() {
    return {
      domNodeCount: this.domNodeCount,
      revision: this.revision,
      opening: this.opening?.diagnostics?.() ?? null,
      transition: this.transition?.diagnostics?.() ?? null,
      tutorial: this.tutorial?.diagnostics?.() ?? null,
      pause: this.pause?.diagnostics?.() ?? null,
      arena: this.arena?.diagnostics?.() ?? null,
      bodyState: this.bodyState?.diagnostics?.() ?? null
    };
  }

  dispose() {
    this.opening?.dispose();
    this.transition?.dispose();
    this.tutorial?.dispose();
    this.pause?.dispose();
    this.arena?.dispose();
    this.bodyState?.dispose();
    this.element?.remove();
    if (this.ownsTheme) this.theme?.remove();
    this.element = null;
    this.signatures.clear();
  }
}

function arenaLine(arena) {
  const phase = arena.phase === 'intermission' ? `RECOVER ${Math.ceil(arena.timeRemaining ?? 0)}S` : `${arena.remainingThreats ?? 0} THREATS`;
  const instincts = arena.unlockedAbilityIds?.length ?? 0;
  return `WAVE ${arena.waveNumber}/${arena.totalWaves} · ${phase} · ${instincts} INSTINCTS`;
}

function displayText(value) { return String(value ?? '').replaceAll('Â·', '·'); }
function html(value) { return displayText(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function channel(value) { return Math.round(clamp01(value) * 255); }
