export const THREE_TRANSITION_SCREEN_CONTRACT = 'black-sky-bound.three-transition-screen.v2';

const MAX_DEBRIS = 40;

export class ThreeTransitionScreenLayer {
  constructor(parent) {
    this.root = null;
    this.smoke = null;
    this.impact = null;
    this.breath = null;
    this.debris = null;
    this.prompt = null;
    this.shards = [];
    this.promptSignature = '';
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-transition';
    root.dataset.threeTransition = '';
    root.innerHTML = '<div class="bsb-transition-smoke" data-transition-smoke></div><div class="bsb-transition-impact" data-transition-impact></div><div class="bsb-transition-breath" data-transition-breath></div><div class="bsb-transition-debris" data-transition-debris></div><div class="bsb-awakening-prompt" data-awakening-prompt></div>';
    parent.appendChild(root);
    this.root = root;
    this.smoke = root.querySelector('[data-transition-smoke]');
    this.impact = root.querySelector('[data-transition-impact]');
    this.breath = root.querySelector('[data-transition-breath]');
    this.debris = root.querySelector('[data-transition-debris]');
    this.prompt = root.querySelector('[data-awakening-prompt]');
    for (let index = 0; index < MAX_DEBRIS; index += 1) {
      const shard = document.createElement('i');
      shard.className = 'bsb-transition-shard';
      this.debris.appendChild(shard);
      this.shards.push(shard);
    }
  }

  update(authoredTransition, smokeAwakening) {
    if (!this.root) return;
    const authored = buildAuthoredTransitionVisual(authoredTransition);
    const awakening = buildSmokeAwakeningVisual(smokeAwakening);
    const view = authored.active ? authored : awakening;
    this.root.classList.toggle('is-visible', view.active);
    this.root.dataset.mode = view.mode ?? 'inactive';
    this.root.dataset.phase = view.phase ?? 'inactive';
    this.root.dataset.smokeOpacity = format(view.opacity);
    this.root.dataset.pocket = format(view.pocket01);
    this.root.setAttribute('aria-hidden', view.active ? 'false' : 'true');
    if (!view.active) {
      this.hideAll();
      this.stats = inactiveStats();
      return;
    }
    this.smoke.style.background = view.mode === 'authored_transition'
      ? authoredSmokeBackground(view)
      : awakeningSmokeBackground(view);
    this.smoke.style.boxShadow = `inset 0 0 ${Math.round(90 + view.coverage * 180)}px rgba(0,0,0,${format(Math.min(.72, view.coverage * .62))})`;
    this.impact.style.opacity = format(view.impactPulse);
    this.breath.style.opacity = format(view.exhalePulse * .8 + view.pocket01 * .12);
    this.updateDebris(view.debris);
    this.updatePrompt(view.prompt, view.acceptedInputCount, view.requiredInputCount);
    this.stats = {
      contract: THREE_TRANSITION_SCREEN_CONTRACT,
      active: true,
      mode: view.mode,
      phase: view.phase,
      smokeOpacity: view.opacity,
      smokeCoverage: view.coverage,
      pocket01: view.pocket01,
      debrisCount: Math.min(view.debris.length, MAX_DEBRIS),
      promptVisible: !!view.prompt,
      acceptedInputCount: view.acceptedInputCount
    };
  }

  updateDebris(packets) {
    this.shards.forEach((shard, index) => {
      const packet = packets[index];
      shard.style.display = packet ? 'block' : 'none';
      if (!packet) return;
      shard.style.left = `${format(packet.x01 * 100)}%`;
      shard.style.top = `${format(packet.y01 * 100)}%`;
      shard.style.width = `${format(Math.max(3, packet.size * 1.8))}px`;
      shard.style.height = `${format(Math.max(4, packet.size * 2.1))}px`;
      shard.style.opacity = format(packet.opacity);
      shard.style.transform = `rotate(${format(packet.rotation)}rad)`;
    });
  }

  updatePrompt(prompt, accepted = 0, required = 0) {
    const signature = prompt ? `${prompt.title}:${(prompt.bindings ?? []).join('|')}:${accepted}:${required}` : 'inactive';
    this.prompt.classList.toggle('is-visible', !!prompt);
    if (signature === this.promptSignature) return;
    this.promptSignature = signature;
    if (!prompt) { this.prompt.innerHTML = ''; return; }
    const binding = prompt.bindings?.[0] ?? 'RMB';
    const stages = Array.from({ length: required }, (_, index) => `<span class="bsb-breath-stage${index < accepted ? ' is-complete' : ''}"></span>`).join('');
    this.prompt.innerHTML = `<span class="bsb-keycap">${html(binding)}</span><div class="bsb-cue-title">${html(prompt.title)}</div><div class="bsb-breath-stages">${stages}</div>`;
  }

  hideAll() {
    this.smoke.style.background = 'transparent';
    this.smoke.style.boxShadow = 'none';
    this.impact.style.opacity = '0';
    this.breath.style.opacity = '0';
    this.updateDebris([]);
    this.updatePrompt(null, 0, 0);
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; this.shards.length = 0; }
}

export function buildAuthoredTransitionVisual(scene) {
  if (!scene?.screenActive) return inactiveVisual();
  const coverage = clamp01(scene.smoke?.coverage);
  const threshold = clamp01(scene.smoke?.threshold ?? 1);
  const opacity = coverage >= threshold && threshold > 0 ? 1 : clamp01(coverage * 1.015);
  const impactPulse = scene.phase === 'impact' ? clamp01(1 - Number(scene.phaseProgress ?? 0) * 1.7) : 0;
  return {
    active: true,
    mode: 'authored_transition',
    phase: scene.phase,
    coverage,
    opacity,
    threshold,
    pocket01: 0,
    impactPulse,
    exhalePulse: 0,
    acceptedInputCount: 0,
    requiredInputCount: 0,
    prompt: null,
    debris: (scene.landing?.debris ?? []).slice(0, MAX_DEBRIS)
  };
}

export function buildSmokeAwakeningVisual(scene) {
  if (!scene?.screenActive) return inactiveVisual();
  const coverage = clamp01(scene.smokeCoverage);
  const held = scene.phase === 'blackout_hold' || scene.phase === 'exhale';
  const opacity = held ? clamp01(scene.fullSmokeOpacity ?? .985) : clamp01(coverage * .985);
  const impactPulse = clamp01(scene.impactPulse);
  return {
    active: true,
    mode: 'smoke_awakening',
    phase: scene.phase,
    coverage,
    opacity,
    threshold: 1,
    pocket01: clamp01(scene.pocket01),
    impactPulse,
    exhalePulse: clamp01(scene.exhalePulse),
    acceptedInputCount: Number(scene.acceptedInputCount ?? 0),
    requiredInputCount: Number(scene.requiredInputCount ?? 0),
    prompt: scene.prompt ?? null,
    debris: scene.phase === 'impact' || scene.phase === 'scatter' ? buildAwakeningDebris(scene) : []
  };
}

function authoredSmokeBackground(view) {
  const edge = Math.max(2, Math.min(108, view.coverage * 112));
  const alpha = view.opacity;
  const lobe = format(Math.min(.94, .38 + view.coverage * .54));
  const base = format(Math.min(1, view.coverage * view.coverage));
  return `radial-gradient(ellipse at 8% ${edge}%, rgba(16,24,25,${lobe}) 0 16%, rgba(4,8,9,0) 40%),radial-gradient(ellipse at 35% ${edge - 4}%, rgba(8,14,15,${lobe}) 0 20%, rgba(4,8,9,0) 44%),radial-gradient(ellipse at 68% ${edge + 2}%, rgba(12,19,20,${lobe}) 0 18%, rgba(4,8,9,0) 43%),radial-gradient(ellipse at 94% ${edge - 3}%, rgba(8,14,15,${lobe}) 0 17%, rgba(4,8,9,0) 42%),linear-gradient(to bottom, rgba(3,6,7,${format(alpha)}) 0 ${edge}%, rgba(3,6,7,${base}) 100%)`;
}

function awakeningSmokeBackground(view) {
  const inner = Math.round(3 + view.pocket01 * 35);
  const outer = Math.round(15 + view.pocket01 * 43);
  const centerAlpha = view.opacity * (1 - view.pocket01 * .94);
  const middleAlpha = view.opacity * (1 - view.pocket01 * .36);
  return `radial-gradient(ellipse at 50% 49%, rgba(8,13,15,${format(centerAlpha)}) 0%, rgba(5,9,10,${format(middleAlpha)}) ${inner}%, rgba(3,6,7,${format(view.opacity)}) ${outer}%, rgba(2,4,5,${format(view.opacity)}) 100%)`;
}

function buildAwakeningDebris(scene) {
  const progress = clamp01(scene.phaseProgress);
  const reduced = scene.settings?.reducedMotion === true;
  return Array.from({ length: 18 }, (_, index) => {
    const lane = fract((index + 1) * .61803398875);
    const travel = reduced ? .02 : progress * (.05 + index % 5 * .018);
    return {
      x01: .59 + lane * .36,
      y01: .07 + Math.floor(index / 6) * .055 + travel,
      size: 2.2 + index % 4 * 1.1,
      rotation: index * 1.31 + progress * (1.7 + index % 3),
      opacity: .28 + (1 - progress) * .42
    };
  });
}

function inactiveVisual() { return { active: false, mode: 'inactive', phase: 'inactive', coverage: 0, opacity: 0, pocket01: 0, impactPulse: 0, exhalePulse: 0, debris: [], prompt: null, acceptedInputCount: 0, requiredInputCount: 0 }; }
function inactiveStats() { return { contract: THREE_TRANSITION_SCREEN_CONTRACT, active: false, mode: 'inactive', phase: 'inactive', smokeOpacity: 0, smokeCoverage: 0, pocket01: 0, debrisCount: 0, promptVisible: false, acceptedInputCount: 0 }; }
function html(value) { return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function format(value) { return String(Math.round((Number(value) || 0) * 1000) / 1000); }
function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function fract(value) { return value - Math.floor(value); }
