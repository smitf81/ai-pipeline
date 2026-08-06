export const THREE_ARENA_SCREEN_CONTRACT = 'black-sky-bound.three-arena-screen.v2';

export class ThreeArenaScreenLayer {
  constructor(parent) {
    this.root = null;
    this.signature = '';
    this.stats = inactiveStats();
    if (!parent) return;
    const root = document.createElement('div');
    root.className = 'bsb-screen-layer bsb-arena-banner';
    root.dataset.threeArenaBanner = '';
    parent.appendChild(root);
    this.root = root;
  }

  update(arena) {
    if (!this.root) return;
    const view = buildThreeArenaView(arena);
    const signature = view.active ? `${view.title}:${view.detail}:${view.kind}` : 'inactive';
    this.root.classList.toggle('is-visible', view.active);
    this.root.setAttribute('aria-hidden', view.active ? 'false' : 'true');
    if (signature !== this.signature) {
      this.signature = signature;
      this.root.innerHTML = view.active
        ? `<div class="bsb-arena-card" data-arena-banner-kind="${attribute(view.kind)}"><div class="bsb-arena-eyebrow">${html(view.eyebrow)}</div><div class="bsb-arena-title">${html(view.title)}</div><div class="bsb-arena-detail">${html(view.detail)}</div></div>`
        : '';
    }
    this.stats = view.active ? {
      contract: THREE_ARENA_SCREEN_CONTRACT,
      active: true,
      kind: view.kind,
      title: view.title,
      waveNumber: Number(arena?.waveNumber ?? 0),
      unlockedInstinctCount: arena?.unlockedAbilityIds?.length ?? 0
    } : inactiveStats();
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; this.signature = ''; }
}

export function buildThreeArenaView(arena) {
  const active = !!arena?.banner && Number(arena.bannerSeconds ?? 0) > 0;
  if (!active) return { active: false };
  const title = displayText(arena.banner);
  const instinct = /INSTINCT\s+AWAKENED/i.test(title);
  const victory = arena.phase === 'complete';
  return {
    active: true,
    kind: instinct ? 'instinct_unlock' : victory ? 'victory' : 'wave',
    eyebrow: instinct ? 'NEW INSTINCT' : victory ? 'TRIAL COMPLETE' : `WAVE ${Math.max(1, Number(arena.waveNumber ?? 0))} / ${Math.max(1, Number(arena.totalWaves ?? 1))}`,
    title,
    detail: displayText(arena.bannerDetail)
  };
}

function inactiveStats() { return { contract: THREE_ARENA_SCREEN_CONTRACT, active: false, kind: null, title: '', waveNumber: 0, unlockedInstinctCount: 0 }; }
function displayText(value) { return String(value ?? '').replaceAll('Â·', '·'); }
function html(value) { return displayText(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]); }
function attribute(value) { return html(value).replaceAll(' ', '_'); }
