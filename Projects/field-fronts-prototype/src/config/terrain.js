export const TERRAIN_TYPES = {
  land: {
    id: 'land',
    label: 'Land',
    color: '#6fa856',
    stroke: '#3e6f36',
    field: { passability: 0.88, cover: 0.15, water: 0, height: 0.18, logistics: 0.72 }
  },
  forest: {
    id: 'forest',
    label: 'Forest',
    color: '#2f6b43',
    stroke: '#1f4930',
    field: { passability: 0.5, cover: 0.78, water: 0.08, height: 0.24, logistics: 0.32 }
  },
  river: {
    id: 'river',
    label: 'River',
    color: '#3f8fc6',
    stroke: '#21658e',
    field: { passability: 0.3, cover: 0.08, water: 0.86, height: 0.06, logistics: 0.28 }
  },
  sea: {
    id: 'sea',
    label: 'Sea',
    color: '#255f8d',
    stroke: '#173e60',
    field: { passability: 0.05, cover: 0.02, water: 1, height: 0, logistics: 0.06 }
  },
  mountains: {
    id: 'mountains',
    label: 'Mountains',
    color: '#8a8a7c',
    stroke: '#5b5b53',
    field: { passability: 0.16, cover: 0.62, water: 0.02, height: 0.95, logistics: 0.11 }
  }
};

export const TERRAIN_ORDER = ['land', 'forest', 'river', 'sea', 'mountains'];

export const FIELD_OVERLAYS = {
  none: { id: 'none', label: 'None' },
  passability: { id: 'passability', label: 'Passability', color: [151, 210, 124] },
  cover: { id: 'cover', label: 'Cover', color: [74, 145, 93] },
  water: { id: 'water', label: 'Water', color: [76, 161, 218] },
  height: { id: 'height', label: 'Height', color: [222, 220, 195] },
  logistics: { id: 'logistics', label: 'Logistics', color: [229, 195, 93] },
  normal: { id: 'normal', label: 'Normal Map' },
  displacement: { id: 'displacement', label: 'Displacement Map' }
};

export function getTerrain(id) {
  return TERRAIN_TYPES[id] ?? TERRAIN_TYPES.land;
}

export function isTerrainId(id) {
  return Object.prototype.hasOwnProperty.call(TERRAIN_TYPES, id);
}
