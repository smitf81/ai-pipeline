export const THREE_OPENING_SCREEN_CONTRACT = 'black-sky-bound.three-opening-screen.v1';

export class ThreeOpeningScreenLayer {
  constructor(parent) {
    this.root = null;
    this.svg = null;
    this.cracks = [];
    this.rays = [];
    this.fragments = [];
    this.stats = { contract: THREE_OPENING_SCREEN_CONTRACT, active: false, cracks: 0, rays: 0, fragments: 0 };
    if (!parent) return;
    const root = document.createElement('div');
    root.dataset.openingInterior = '';
    root.style.cssText = 'position:absolute;inset:0;display:none;overflow:hidden;background:rgba(1,2,2,.98);z-index:10;';
    root.innerHTML = '<svg viewBox="0 0 1 1" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;mix-blend-mode:screen"></svg>';
    parent.prepend(root);
    this.root = root;
    this.svg = root.querySelector('svg');
  }

  update(opening) {
    if (!this.root) return;
    const active = !!opening?.screenActive || Number(opening?.shellInteriorOpacity ?? 0) > 0.001;
    this.root.style.display = active ? 'block' : 'none';
    if (!active) {
      this.stats = { contract: THREE_OPENING_SCREEN_CONTRACT, active: false, cracks: 0, rays: 0, fragments: 0 };
      return;
    }
    const darkness = clamp01(opening.darknessOpacity);
    const interior = clamp01(opening.shellInteriorOpacity);
    this.root.style.background = `rgba(1,2,2,${Math.max(darkness, interior * 0.82)})`;
    this.updateCracks(opening.cracks ?? [], interior);
    this.updateRays(opening.lightRays ?? [], opening.lightPulse ?? 0);
    this.updateFragments(opening.shellFragments ?? []);
    this.stats = { contract: THREE_OPENING_SCREEN_CONTRACT, active: true, cracks: opening.cracks?.length ?? 0, rays: opening.lightRays?.length ?? 0, fragments: opening.shellFragments?.length ?? 0 };
  }

  updateCracks(packets, interior) {
    ensureSvgElements(this.svg, this.cracks, packets.length, 'line', 'opening-crack');
    this.cracks.forEach((line, index) => {
      const packet = packets[index];
      line.style.display = packet ? 'block' : 'none';
      if (!packet) return;
      setAttributes(line, { x1: packet.ax, y1: packet.ay, x2: packet.bx, y2: packet.by, stroke: '#d9e7e2', 'stroke-width': Number(packet.width ?? 1) / 900, 'stroke-linecap': 'round', opacity: Math.max(0.2, 1 - interior * 0.45) });
      line.style.filter = 'drop-shadow(0 0 3px rgba(190,220,230,.7))';
    });
  }

  updateRays(packets, pulse) {
    ensureSvgElements(this.svg, this.rays, packets.length, 'polygon', 'opening-ray');
    this.rays.forEach((polygon, index) => {
      const packet = packets[index];
      polygon.style.display = packet ? 'block' : 'none';
      if (!packet) return;
      setAttributes(polygon, {
        points: `${packet.originX},${packet.originY} ${packet.ax},${packet.ay} ${packet.bx},${packet.by}`,
        fill: '#bdd9e7',
        opacity: clamp01(Number(packet.strength ?? 0.2) * (0.22 + clamp01(packet.pulse ?? pulse) * 0.24))
      });
      polygon.style.filter = 'blur(1.5px)';
    });
  }

  updateFragments(packets) {
    ensureSvgElements(this.svg, this.fragments, packets.length, 'polygon', 'opening-fragment');
    this.fragments.forEach((polygon, index) => {
      const packet = packets[index];
      polygon.style.display = packet ? 'block' : 'none';
      if (!packet) return;
      const progress = clamp01(packet.progress);
      const size = Number(packet.size ?? 0.05);
      const x = Number(packet.x ?? 0.5) + Number(packet.directionX ?? 0) * Number(packet.travel ?? 0) * progress * 0.15;
      const y = Number(packet.y ?? 0.5) + Number(packet.directionY ?? 0) * Number(packet.travel ?? 0) * progress * 0.15;
      const points = (packet.shape ?? []).map((point) => `${x + point.x * size},${y + point.y * size}`).join(' ');
      setAttributes(polygon, { points, fill: '#82745f', stroke: '#b4a78e', 'stroke-width': 0.001, opacity: 0.9 - progress * 0.45 });
      polygon.style.transformOrigin = `${x * 100}% ${y * 100}%`;
      polygon.style.transform = `rotate(${Number(packet.rotation ?? 0) + Number(packet.spin ?? 0) * progress}rad)`;
    });
  }

  diagnostics() { return { ...this.stats }; }
  dispose() { this.root?.remove(); this.root = null; this.svg = null; }
}

function ensureSvgElements(svg, collection, count, tag, className) {
  while (collection.length < count) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    element.setAttribute('class', className);
    svg.appendChild(element);
    collection.push(element);
  }
}

function setAttributes(element, values) {
  for (const [name, value] of Object.entries(values)) element.setAttribute(name, String(value));
}

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
