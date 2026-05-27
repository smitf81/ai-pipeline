export const STRUCTURE_ENTITY_KIND = 'structure';

export const CONSTRUCTION_STATES = Object.freeze({
  blueprint: 'blueprint',
  underConstruction: 'under_construction',
  complete: 'complete',
  ruined: 'ruined'
});

export const STRUCTURE_OCCUPANCY_MODES = Object.freeze({
  garrison: 'garrison',
  platform: 'platform',
  wallTop: 'wall_top',
  trench: 'trench',
  gatehouse: 'gatehouse',
  none: 'none'
});

export const GATE_STATES = Object.freeze({
  open: 'open',
  closed: 'closed'
});

const STRUCTURE_DEFINITION_DATA = {
  outpost: {
    id: 'outpost',
    label: 'Outpost',
    role: 'control',
    construction: {
      requiredWork: 100,
      maxAssignedBuilders: 2,
      workPerTick: 10,
      supplyCost: 80,
      resourceCost: { gold: 25, food: 8, wood: 18 },
      logisticsDistanceModifier: 1,
      materials: { timber: 0.35, stone: 0.25, labour: 0.4 }
    },
    footprint: {
      shape: 'circle',
      width: 1.6,
      height: 1.6,
      radius: 0.8,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.8,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: true,
      receivesProjectiles: true,
      separationWeight: 1
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    joinery: {
      family: 'stronghold',
      sketchable: false,
      connectable: false,
      allowsPathBlueprint: false,
      canConnectTo: [],
      acceptsConnectionsFrom: [],
      placement: 'single',
      builtOn: [],
      adjacentTo: []
    },
    occupancy: {
      enabled: true,
      mode: STRUCTURE_OCCUPANCY_MODES.garrison,
      capacitySquads: 2,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.58,
      heightAdvantage: 0.18,
      firingArcs: [],
      allowedWeapons: ['infantry'],
      rangeModifier: 1.05,
      accuracyModifier: 1.05,
      aimModifier: 0.95
    },
    influence: {
      controlRadius: 7.5,
      visionRadius: 8.5,
      defenceRadius: 5,
      threatModifier: 1
    },
    integrity: {
      maxHealth: 360,
      health: 360,
      armour: 0.32,
      breachState: 'intact'
    },
    storage: {
      enabled: true,
      capacityBonus: 180,
      transportSlots: 2
    },
    workforce: {
      enabled: true,
      canTrainBuilders: true,
      builderCapacityBonus: 2,
      initialBuilderCrews: 1
    },
    gathering: {
      enabled: true,
      mode: 'outpost-native',
      resourceId: 'food',
      assignedWorkers: 1,
      radiusTiles: 3,
      ratePerWorker: 0,
      carryCapacity: 0,
      requiresReturn: false,
      sourceTerrain: []
    }
  },
  watchtower: {
    id: 'watchtower',
    label: 'Watchtower',
    role: 'vision',
    construction: {
      requiredWork: 70,
      maxAssignedBuilders: 2,
      workPerTick: 12,
      supplyCost: 45,
      resourceCost: { gold: 30, wood: 22 },
      logisticsDistanceModifier: 1,
      materials: { timber: 0.62, stone: 0.1, labour: 0.28 }
    },
    footprint: {
      shape: 'circle',
      width: 1.1,
      height: 1.1,
      radius: 0.55,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.55,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: true,
      receivesProjectiles: true,
      separationWeight: 0.8
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    joinery: {
      family: 'stronghold',
      sketchable: false,
      connectable: true,
      allowsPathBlueprint: false,
      canConnectTo: ['wall_segment', 'trench_segment', 'gate'],
      acceptsConnectionsFrom: ['wall_segment', 'trench_segment', 'gate'],
      placement: 'anchor',
      builtOn: [],
      adjacentTo: ['wall_segment', 'trench_segment']
    },
    occupancy: {
      enabled: true,
      mode: STRUCTURE_OCCUPANCY_MODES.platform,
      capacitySquads: 1,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.38,
      heightAdvantage: 0.5,
      firingArcs: [],
      allowedWeapons: ['infantry', 'recon'],
      rangeModifier: 1.28,
      accuracyModifier: 1.16,
      aimModifier: 0.78
    },
    influence: {
      controlRadius: 4,
      visionRadius: 13,
      defenceRadius: 4.5,
      threatModifier: 0.85
    },
    integrity: {
      maxHealth: 180,
      health: 180,
      armour: 0.16,
      breachState: 'intact'
    }
  },
  hunting_tent: {
    id: 'hunting_tent',
    label: 'Hunting Tent',
    role: 'food-gathering',
    construction: {
      requiredWork: 42,
      maxAssignedBuilders: 1,
      workPerTick: 14,
      supplyCost: 35,
      resourceCost: { gold: 10, food: 2, wood: 8 },
      logisticsDistanceModifier: 0.9,
      materials: { timber: 0.28, hide: 0.18, labour: 0.54 }
    },
    footprint: {
      shape: 'circle',
      width: 1.15,
      height: 0.9,
      radius: 0.58,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.58,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: false,
      receivesProjectiles: true,
      separationWeight: 0.55
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    occupancy: {
      enabled: false,
      mode: STRUCTURE_OCCUPANCY_MODES.none,
      capacitySquads: 0,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: false,
      coverRating: 0.18,
      heightAdvantage: 0,
      firingArcs: [],
      allowedWeapons: [],
      rangeModifier: 1,
      accuracyModifier: 1
    },
    influence: {
      controlRadius: 1.5,
      visionRadius: 2.5,
      defenceRadius: 1.2,
      threatModifier: 0.18
    },
    integrity: {
      maxHealth: 120,
      health: 120,
      armour: 0.08,
      breachState: 'intact'
    },
    gathering: {
      enabled: true,
      mode: 'passive-field',
      resourceId: 'food',
      assignedWorkers: 2,
      radiusTiles: 4,
      ratePerWorker: 0.9,
      carryCapacity: 0,
      requiresReturn: false,
      sourceTerrain: []
    }
  },
  wood_gathering_post: {
    id: 'wood_gathering_post',
    label: 'Wood Post',
    role: 'wood-gathering',
    construction: {
      requiredWork: 55,
      maxAssignedBuilders: 1,
      workPerTick: 12,
      supplyCost: 45,
      resourceCost: { gold: 8, food: 3 },
      logisticsDistanceModifier: 1,
      materials: { labour: 0.85, rigging: 0.15 }
    },
    footprint: {
      shape: 'circle',
      width: 1.25,
      height: 1.1,
      radius: 0.62,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.62,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: false,
      receivesProjectiles: true,
      separationWeight: 0.62
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    occupancy: {
      enabled: false,
      mode: STRUCTURE_OCCUPANCY_MODES.none,
      capacitySquads: 0,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: false,
      coverRating: 0.2,
      heightAdvantage: 0,
      firingArcs: [],
      allowedWeapons: [],
      rangeModifier: 1,
      accuracyModifier: 1
    },
    influence: {
      controlRadius: 1.8,
      visionRadius: 2.8,
      defenceRadius: 1.4,
      threatModifier: 0.2
    },
    integrity: {
      maxHealth: 145,
      health: 145,
      armour: 0.1,
      breachState: 'intact'
    },
    gathering: {
      enabled: true,
      mode: 'haul-forest',
      resourceId: 'wood',
      assignedWorkers: 2,
      radiusTiles: 12,
      ratePerWorker: 1.2,
      carryCapacity: 3,
      requiresReturn: true,
      sourceTerrain: ['forest']
    }
  },
  builder_lodge: {
    id: 'builder_lodge',
    label: 'Builder Lodge',
    role: 'builder-capacity',
    construction: {
      requiredWork: 58,
      maxAssignedBuilders: 2,
      workPerTick: 13,
      supplyCost: 55,
      resourceCost: { gold: 22, food: 6, wood: 14 },
      logisticsDistanceModifier: 0.95,
      materials: { timber: 0.42, canvas: 0.16, labour: 0.42 }
    },
    footprint: {
      shape: 'circle',
      width: 1.25,
      height: 1.05,
      radius: 0.62,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.62,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: false,
      receivesProjectiles: true,
      separationWeight: 0.64
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    joinery: {
      family: 'camp',
      sketchable: false,
      connectable: false,
      allowsPathBlueprint: false,
      canConnectTo: [],
      acceptsConnectionsFrom: [],
      placement: 'single',
      builtOn: [],
      adjacentTo: []
    },
    occupancy: {
      enabled: false,
      mode: STRUCTURE_OCCUPANCY_MODES.none,
      capacitySquads: 0,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: false,
      coverRating: 0.18,
      heightAdvantage: 0,
      firingArcs: [],
      allowedWeapons: [],
      rangeModifier: 1,
      accuracyModifier: 1
    },
    influence: {
      controlRadius: 1.6,
      visionRadius: 2.2,
      defenceRadius: 1.2,
      threatModifier: 0.12
    },
    integrity: {
      maxHealth: 150,
      health: 150,
      armour: 0.08,
      breachState: 'intact'
    },
    workforce: {
      enabled: true,
      canTrainBuilders: true,
      builderCapacityBonus: 2,
      initialBuilderCrews: 0
    }
  },
  storage_tent: {
    id: 'storage_tent',
    label: 'Storage Tent',
    role: 'storage',
    construction: {
      requiredWork: 46,
      maxAssignedBuilders: 1,
      workPerTick: 13,
      supplyCost: 40,
      resourceCost: { gold: 18, wood: 16 },
      logisticsDistanceModifier: 0.9,
      materials: { timber: 0.36, canvas: 0.2, labour: 0.44 }
    },
    footprint: {
      shape: 'circle',
      width: 1.2,
      height: 1,
      radius: 0.6,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'circle',
      radius: 0.6,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: false,
      receivesProjectiles: true,
      separationWeight: 0.58
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    occupancy: {
      enabled: false,
      mode: STRUCTURE_OCCUPANCY_MODES.none,
      capacitySquads: 0,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: false,
      coverRating: 0.2,
      heightAdvantage: 0,
      firingArcs: [],
      allowedWeapons: [],
      rangeModifier: 1,
      accuracyModifier: 1
    },
    influence: {
      controlRadius: 1.4,
      visionRadius: 2.4,
      defenceRadius: 1.2,
      threatModifier: 0.18
    },
    integrity: {
      maxHealth: 135,
      health: 135,
      armour: 0.08,
      breachState: 'intact'
    },
    storage: {
      enabled: true,
      capacityBonus: 140,
      transportSlots: 1
    }
  },
  wall_segment: {
    id: 'wall_segment',
    label: 'Wall Segment',
    role: 'barrier',
    construction: {
      requiredWork: 55,
      maxAssignedBuilders: 2,
      workPerTick: 14,
      supplyCost: 30,
      resourceCost: { gold: 8, wood: 8 },
      logisticsDistanceModifier: 1,
      materials: { timber: 0.2, stone: 0.55, labour: 0.25 }
    },
    footprint: {
      shape: 'line',
      width: 2.2,
      height: 0.34,
      radius: 0,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'rect',
      radius: 0,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: true,
      receivesProjectiles: true,
      separationWeight: 1.2
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    joinery: {
      family: 'wall',
      sketchable: true,
      connectable: true,
      allowsPathBlueprint: true,
      canConnectTo: ['wall_segment', 'gate', 'watchtower', 'fort'],
      acceptsConnectionsFrom: ['wall_segment', 'gate', 'watchtower', 'fort'],
      placement: 'path',
      builtOn: ['watchtower', 'fort'],
      adjacentTo: ['wall_segment', 'gate', 'watchtower', 'fort']
    },
    occupancy: {
      enabled: true,
      mode: STRUCTURE_OCCUPANCY_MODES.wallTop,
      capacitySquads: 1,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.72,
      heightAdvantage: 0.24,
      firingArcs: [],
      allowedWeapons: ['infantry', 'recon'],
      rangeModifier: 1.08,
      accuracyModifier: 1.03,
      aimModifier: 0.96
    },
    influence: {
      controlRadius: 0,
      visionRadius: 0,
      defenceRadius: 2,
      threatModifier: 0.35
    },
    integrity: {
      maxHealth: 280,
      health: 280,
      armour: 0.48,
      breachState: 'intact'
    }
  },
  gate: {
    id: 'gate',
    label: 'Gate',
    role: 'passage-control',
    construction: {
      requiredWork: 90,
      maxAssignedBuilders: 2,
      workPerTick: 12,
      supplyCost: 45,
      resourceCost: { gold: 16, wood: 14 },
      logisticsDistanceModifier: 1,
      materials: { timber: 0.38, ironwork: 0.22, stone: 0.2, labour: 0.2 }
    },
    footprint: {
      shape: 'rect',
      width: 1.8,
      height: 0.75,
      radius: 0,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'rect',
      radius: 0,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: true,
      receivesProjectiles: true,
      separationWeight: 1
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: true,
      allowsEnemyPassage: false,
      gateState: GATE_STATES.closed
    },
    joinery: {
      family: 'wall',
      sketchable: false,
      connectable: true,
      allowsPathBlueprint: false,
      canConnectTo: ['wall_segment', 'watchtower', 'fort'],
      acceptsConnectionsFrom: ['wall_segment', 'watchtower', 'fort'],
      placement: 'single',
      builtOn: ['wall_segment'],
      adjacentTo: ['wall_segment', 'watchtower', 'fort']
    },
    occupancy: {
      enabled: false,
      mode: STRUCTURE_OCCUPANCY_MODES.gatehouse,
      capacitySquads: 0,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.62,
      heightAdvantage: 0.12,
      firingArcs: [],
      allowedWeapons: [],
      rangeModifier: 1,
      accuracyModifier: 1
    },
    influence: {
      controlRadius: 1,
      visionRadius: 2,
      defenceRadius: 3,
      threatModifier: 0.45
    },
    integrity: {
      maxHealth: 320,
      health: 320,
      armour: 0.38,
      breachState: 'intact'
    }
  },
  trench_segment: {
    id: 'trench_segment',
    label: 'Trench Segment',
    role: 'cover',
    construction: {
      requiredWork: 45,
      maxAssignedBuilders: 1,
      workPerTick: 18,
      supplyCost: 25,
      resourceCost: { gold: 4, food: 2, wood: 2 },
      logisticsDistanceModifier: 1,
      materials: { labour: 0.72, timber: 0.12, earthworks: 0.16 }
    },
    footprint: {
      shape: 'line',
      width: 2.4,
      height: 0.5,
      radius: 0,
      blocksGroundMovement: false
    },
    collision: {
      layer: 'building',
      shape: 'rect',
      radius: 0,
      solid: false,
      blocksMovement: false,
      blocksProjectiles: false,
      receivesProjectiles: false,
      separationWeight: 0.15
    },
    nav: {
      blocksFlowField: false,
      movementCostModifier: 1.18,
      allowsFriendlyPassage: true,
      allowsEnemyPassage: true,
      gateState: null
    },
    joinery: {
      family: 'trench',
      sketchable: true,
      connectable: true,
      allowsPathBlueprint: true,
      canConnectTo: ['trench_segment', 'watchtower', 'fort', 'gate'],
      acceptsConnectionsFrom: ['trench_segment', 'watchtower', 'fort', 'gate'],
      placement: 'path',
      builtOn: [],
      adjacentTo: ['trench_segment', 'wall_segment', 'gate', 'watchtower', 'fort']
    },
    occupancy: {
      enabled: true,
      mode: STRUCTURE_OCCUPANCY_MODES.trench,
      capacitySquads: 1,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.78,
      heightAdvantage: -0.08,
      firingArcs: [],
      allowedWeapons: ['infantry', 'recon'],
      rangeModifier: 0.96,
      accuracyModifier: 1.08,
      aimModifier: 1.12
    },
    influence: {
      controlRadius: 0.5,
      visionRadius: 1.5,
      defenceRadius: 2.8,
      threatModifier: 0.55
    },
    integrity: {
      maxHealth: 140,
      health: 140,
      armour: 0.24,
      breachState: 'intact'
    }
  },
  fort: {
    id: 'fort',
    label: 'Fort',
    role: 'stronghold',
    construction: {
      requiredWork: 260,
      maxAssignedBuilders: 4,
      workPerTick: 8,
      supplyCost: 160,
      resourceCost: { gold: 75, food: 20, wood: 55 },
      logisticsDistanceModifier: 1,
      materials: { stone: 0.5, timber: 0.15, ironwork: 0.12, labour: 0.23 }
    },
    footprint: {
      shape: 'rect',
      width: 3.2,
      height: 3.2,
      radius: 1.6,
      blocksGroundMovement: true
    },
    collision: {
      layer: 'building',
      shape: 'rect',
      radius: 1.6,
      solid: true,
      blocksMovement: true,
      blocksProjectiles: true,
      receivesProjectiles: true,
      separationWeight: 1.45
    },
    nav: {
      blocksFlowField: true,
      movementCostModifier: 1,
      allowsFriendlyPassage: false,
      allowsEnemyPassage: false,
      gateState: null
    },
    joinery: {
      family: 'stronghold',
      sketchable: false,
      connectable: true,
      allowsPathBlueprint: false,
      canConnectTo: ['wall_segment', 'trench_segment', 'gate'],
      acceptsConnectionsFrom: ['wall_segment', 'trench_segment', 'gate'],
      placement: 'anchor',
      builtOn: [],
      adjacentTo: ['wall_segment', 'trench_segment', 'gate']
    },
    occupancy: {
      enabled: true,
      mode: STRUCTURE_OCCUPANCY_MODES.garrison,
      capacitySquads: 4,
      occupants: [],
      entryPoints: [],
      exitPoints: []
    },
    combat: {
      grantsCover: true,
      coverRating: 0.86,
      heightAdvantage: 0.35,
      firingArcs: [],
      allowedWeapons: ['infantry', 'recon', 'artillery'],
      rangeModifier: 1.18,
      accuracyModifier: 1.12,
      aimModifier: 0.9
    },
    influence: {
      controlRadius: 11,
      visionRadius: 10,
      defenceRadius: 9,
      threatModifier: 1.35
    },
    integrity: {
      maxHealth: 900,
      health: 900,
      armour: 0.62,
      breachState: 'intact'
    }
  }
};

export const STRUCTURE_DEFINITIONS = deepFreeze(clonePlain(STRUCTURE_DEFINITION_DATA));
export const STRUCTURE_TYPE_IDS = Object.freeze(Object.keys(STRUCTURE_DEFINITIONS));

export function getStructureDefinition(type) {
  return STRUCTURE_DEFINITIONS[type] ?? null;
}

export function listStructureDefinitions() {
  return STRUCTURE_TYPE_IDS.map((type) => STRUCTURE_DEFINITIONS[type]);
}

export function createStructureInstance(type, options = {}) {
  const definition = getStructureDefinition(type);
  if (!definition) {
    throw new Error(`Unknown structure type: ${type}`);
  }

  const position = normalisePosition(options.position, options.tile);
  const tile = normaliseTile(options.tile, position);
  const factionId = typeof options.factionId === 'string' ? options.factionId : 'neutral';
  const id = typeof options.id === 'string'
    ? options.id
    : `${type}_${factionId}_${tile.x}_${tile.y}`;

  return normaliseStructureInstance({
    id,
    entityType: STRUCTURE_ENTITY_KIND,
    type: definition.id,
    factionId,
    name: options.name ?? definition.label,
    tile,
    position,
    orientation: options.orientation,
    joinery: options.joinery,
    construction: {
      state: options.construction?.state ?? CONSTRUCTION_STATES.complete,
      progress: options.construction?.progress,
      requiredWork: options.construction?.requiredWork ?? definition.construction.requiredWork,
      assignedBuilders: options.construction?.assignedBuilders,
      createdAtTick: options.construction?.createdAtTick,
      completedAtTick: options.construction?.completedAtTick,
      maxAssignedBuilders: options.construction?.maxAssignedBuilders ?? definition.construction.maxAssignedBuilders,
      workPerTick: options.construction?.workPerTick ?? definition.construction.workPerTick,
      supplyCost: options.construction?.supplyCost ?? definition.construction.supplyCost,
      resourceCost: options.construction?.resourceCost ?? definition.construction.resourceCost,
      logisticsDistanceModifier: options.construction?.logisticsDistanceModifier ?? definition.construction.logisticsDistanceModifier,
      materials: options.construction?.materials ?? definition.construction.materials
    },
    footprint: mergeLayer(definition.footprint, options.footprint),
    collision: mergeLayer(definition.collision, options.collision),
    nav: mergeLayer(definition.nav, options.nav),
    occupancy: mergeLayer(definition.occupancy, options.occupancy),
    combat: mergeLayer(definition.combat, options.combat),
    influence: mergeLayer(definition.influence, options.influence),
    integrity: mergeLayer(definition.integrity, options.integrity),
    storage: mergeLayer(definition.storage ?? { enabled: false }, options.storage),
    workforce: mergeLayer(definition.workforce ?? { enabled: false }, options.workforce)
  });
}

export function normaliseStructureInstance(structure) {
  const definition = getStructureDefinition(structure?.type);
  if (!definition) {
    throw new Error(`Unknown structure type: ${structure?.type}`);
  }

  const position = normalisePosition(structure.position, structure.tile);
  const tile = normaliseTile(structure.tile, position);
  const construction = normaliseConstruction(structure.construction, definition);
  const integrity = normaliseIntegrity(mergeLayer(definition.integrity, structure.integrity));
  const footprint = normaliseFootprint(mergeLayer(definition.footprint, structure.footprint));
  const occupancy = normaliseOccupancy(mergeLayer(definition.occupancy, structure.occupancy), footprint, position);

  return {
    id: String(structure.id),
    entityType: STRUCTURE_ENTITY_KIND,
    type: definition.id,
    factionId: String(structure.factionId ?? 'neutral'),
    name: structure.name ?? definition.label,
    tile,
    position,
    orientation: normaliseOrientation(structure.orientation),
    construction,
    footprint,
    collision: normaliseCollision(mergeLayer(definition.collision, structure.collision)),
    nav: normaliseNav(mergeLayer(definition.nav, structure.nav)),
    joinery: normaliseJoinery(mergeLayer(definition.joinery, structure.joinery)),
    occupancy,
    combat: normaliseCombat(mergeLayer(definition.combat, structure.combat)),
    influence: normaliseInfluence(mergeLayer(definition.influence, structure.influence)),
    integrity,
    gathering: normaliseGathering(mergeLayer(definition.gathering ?? { enabled: false }, structure.gathering)),
    storage: normaliseStorage(mergeLayer(definition.storage ?? { enabled: false }, structure.storage)),
    workforce: normaliseWorkforce(mergeLayer(definition.workforce ?? { enabled: false }, structure.workforce))
  };
}

export function isStructureEntity(entity) {
  return entity?.entityType === STRUCTURE_ENTITY_KIND && Boolean(getStructureDefinition(entity.type));
}


function normaliseResourceCost(cost = {}) {
  if (Number.isFinite(cost)) {
    return Number(cost) > 0 ? { supplies: Math.max(0, Math.floor(Number(cost))) } : {};
  }
  if (!cost || typeof cost !== 'object') {
    return {};
  }
  return Object.fromEntries(Object.entries(cost)
    .map(([resourceId, amount]) => [resourceId, Math.max(0, Math.floor(Number(amount) || 0))])
    .filter(([, amount]) => amount > 0));
}

function normaliseConstruction(construction = {}, definition) {
  const state = Object.values(CONSTRUCTION_STATES).includes(construction.state)
    ? construction.state
    : CONSTRUCTION_STATES.complete;
  const requiredWork = positiveNumber(construction.requiredWork, definition.construction.requiredWork);
  const fallbackProgress = state === CONSTRUCTION_STATES.complete ? 1 : 0;
  return {
    state,
    progress: clamp01(Number.isFinite(construction.progress) ? construction.progress : fallbackProgress),
    requiredWork,
    assignedBuilders: Array.isArray(construction.assignedBuilders)
      ? construction.assignedBuilders.filter((id) => typeof id === 'string')
      : [],
    createdAtTick: Number.isInteger(construction.createdAtTick) ? Math.max(0, construction.createdAtTick) : null,
    completedAtTick: Number.isInteger(construction.completedAtTick) ? Math.max(0, construction.completedAtTick) : null,
    maxAssignedBuilders: Math.max(1, Math.floor(positiveNumber(construction.maxAssignedBuilders, definition.construction.maxAssignedBuilders ?? 1))),
    workPerTick: positiveNumber(construction.workPerTick, definition.construction.workPerTick ?? 1),
    supplyCost: Math.max(0, Math.floor(positiveNumber(construction.supplyCost, definition.construction.supplyCost ?? 0))),
    resourceCost: normaliseResourceCost(construction.resourceCost ?? definition.construction.resourceCost ?? { supplies: construction.supplyCost ?? definition.construction.supplyCost ?? 0 }),
    logisticsDistanceModifier: positiveNumber(construction.logisticsDistanceModifier, definition.construction.logisticsDistanceModifier ?? 1),
    materials: clonePlain(construction.materials ?? definition.construction.materials ?? {})
  };
}

function normaliseFootprint(footprint) {
  const shape = ['circle', 'rect', 'line'].includes(footprint.shape) ? footprint.shape : 'circle';
  return {
    shape,
    width: nonNegativeNumber(footprint.width, 0),
    height: nonNegativeNumber(footprint.height, 0),
    radius: nonNegativeNumber(footprint.radius, 0),
    blocksGroundMovement: Boolean(footprint.blocksGroundMovement)
  };
}

function normaliseCollision(collision) {
  const shape = ['circle', 'rect'].includes(collision.shape) ? collision.shape : 'circle';
  return {
    layer: collision.layer ?? 'building',
    shape,
    radius: nonNegativeNumber(collision.radius, 0),
    solid: Boolean(collision.solid),
    blocksMovement: Boolean(collision.blocksMovement),
    blocksProjectiles: Boolean(collision.blocksProjectiles),
    receivesProjectiles: Boolean(collision.receivesProjectiles),
    separationWeight: nonNegativeNumber(collision.separationWeight, 0)
  };
}

function normaliseNav(nav) {
  const gateState = Object.values(GATE_STATES).includes(nav.gateState) ? nav.gateState : null;
  return {
    blocksFlowField: Boolean(nav.blocksFlowField),
    movementCostModifier: positiveNumber(nav.movementCostModifier, 1),
    allowsFriendlyPassage: Boolean(nav.allowsFriendlyPassage),
    allowsEnemyPassage: Boolean(nav.allowsEnemyPassage),
    gateState
  };
}


function normaliseJoinery(joinery = {}) {
  return {
    family: joinery.family ?? null,
    sketchable: Boolean(joinery.sketchable),
    connectable: Boolean(joinery.connectable),
    allowsPathBlueprint: Boolean(joinery.allowsPathBlueprint),
    canConnectTo: Array.isArray(joinery.canConnectTo) ? joinery.canConnectTo.map(String) : [],
    acceptsConnectionsFrom: Array.isArray(joinery.acceptsConnectionsFrom) ? joinery.acceptsConnectionsFrom.map(String) : [],
    placement: joinery.placement ?? 'single',
    builtOn: Array.isArray(joinery.builtOn) ? joinery.builtOn.map(String) : [],
    adjacentTo: Array.isArray(joinery.adjacentTo) ? joinery.adjacentTo.map(String) : [],
    pathBlueprint: Boolean(joinery.pathBlueprint),
    pathId: typeof joinery.pathId === 'string' ? joinery.pathId : null,
    segmentIndex: Number.isInteger(joinery.segmentIndex) ? Math.max(0, joinery.segmentIndex) : null,
    segmentCount: Number.isInteger(joinery.segmentCount) ? Math.max(0, joinery.segmentCount) : null,
    connections: Array.isArray(joinery.connections) ? joinery.connections.map(normaliseJoinConnection) : [],
    joinMask: normaliseJoinMask(joinery.joinMask),
    junction: normaliseJoinJunction(joinery.junction),
    builtOnStructureId: typeof joinery.builtOnStructureId === 'string' ? joinery.builtOnStructureId : null,
    replacedStructureId: typeof joinery.replacedStructureId === 'string' ? joinery.replacedStructureId : null,
    socketRole: typeof joinery.socketRole === 'string' ? joinery.socketRole : null
  };
}

function normaliseJoinConnection(connection = {}) {
  return {
    kind: connection.kind ?? 'structure',
    direction: connection.direction ?? 'same',
    structureId: typeof connection.structureId === 'string' ? connection.structureId : null,
    structureType: typeof connection.structureType === 'string' ? connection.structureType : null,
    distance: nonNegativeNumber(connection.distance, 0),
    socket: typeof connection.socket === 'string' ? connection.socket : null,
    socketRole: typeof connection.socketRole === 'string' ? connection.socketRole : null
  };
}

function normaliseJoinMask(mask = {}) {
  return Object.freeze(['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw', 'same'].reduce((out, key) => {
    out[key] = Boolean(mask[key]);
    return out;
  }, {}));
}

function normaliseJoinJunction(junction = {}) {
  return {
    role: typeof junction.role === 'string' ? junction.role : 'single',
    kind: typeof junction.kind === 'string' ? junction.kind : typeof junction.role === 'string' ? junction.role : 'single',
    pathDirections: Array.isArray(junction.pathDirections) ? junction.pathDirections.map(String) : [],
    structureDirections: Array.isArray(junction.structureDirections) ? junction.structureDirections.map(String) : [],
    directions: Array.isArray(junction.directions) ? junction.directions.map(String) : [],
    degree: Math.max(0, Math.floor(Number(junction.degree) || 0)),
    capStart: Boolean(junction.capStart),
    capEnd: Boolean(junction.capEnd)
  };
}

function normaliseOrientation(orientation = {}) {
  const radians = Number(orientation?.angleRadians);
  const degrees = Number(orientation?.degrees);
  const angleRadians = Number.isFinite(radians)
    ? radians
    : Number.isFinite(degrees)
      ? degrees * Math.PI / 180
      : 0;
  const normalisedDegrees = Number.isFinite(degrees) ? degrees : angleRadians * 180 / Math.PI;
  return {
    angleRadians: round3(angleRadians),
    degrees: round3(normaliseDegrees(normalisedDegrees)),
    direction: orientation?.direction ?? 'e',
    tangent: {
      x: Number.isFinite(orientation?.tangent?.x) ? Math.sign(orientation.tangent.x) : 1,
      y: Number.isFinite(orientation?.tangent?.y) ? Math.sign(orientation.tangent.y) : 0
    },
    incoming: typeof orientation?.incoming === 'string' ? orientation.incoming : null,
    outgoing: typeof orientation?.outgoing === 'string' ? orientation.outgoing : null,
    role: typeof orientation?.role === 'string' ? orientation.role : 'single'
  };
}

function normaliseOccupancy(occupancy, footprint = null, position = null) {
  const mode = Object.values(STRUCTURE_OCCUPANCY_MODES).includes(occupancy.mode)
    ? occupancy.mode
    : STRUCTURE_OCCUPANCY_MODES.none;
  const capacitySquads = Math.max(0, Math.floor(Number(occupancy.capacitySquads) || 0));
  const fallbackAccessPoints = occupancy.enabled && capacitySquads > 0
    ? createDefaultAccessPoints(footprint, position)
    : [];
  return {
    enabled: Boolean(occupancy.enabled),
    mode,
    capacitySquads,
    occupants: Array.isArray(occupancy.occupants) ? occupancy.occupants.map(String).slice(0, capacitySquads) : [],
    entryPoints: normalisePoints(occupancy.entryPoints).length > 0 ? normalisePoints(occupancy.entryPoints) : fallbackAccessPoints,
    exitPoints: normalisePoints(occupancy.exitPoints).length > 0 ? normalisePoints(occupancy.exitPoints) : fallbackAccessPoints
  };
}

function normaliseCombat(combat) {
  return {
    grantsCover: Boolean(combat.grantsCover),
    coverRating: clamp01(Number(combat.coverRating) || 0),
    heightAdvantage: boundedNumber(combat.heightAdvantage, -1, 1, 0),
    firingArcs: Array.isArray(combat.firingArcs) ? combat.firingArcs.map(clonePlain) : [],
    allowedWeapons: Array.isArray(combat.allowedWeapons) ? combat.allowedWeapons.map(String) : [],
    rangeModifier: positiveNumber(combat.rangeModifier, 1),
    accuracyModifier: positiveNumber(combat.accuracyModifier, 1)
  };
}

function normaliseInfluence(influence) {
  return {
    controlRadius: nonNegativeNumber(influence.controlRadius, 0),
    visionRadius: nonNegativeNumber(influence.visionRadius, 0),
    defenceRadius: nonNegativeNumber(influence.defenceRadius, 0),
    threatModifier: nonNegativeNumber(influence.threatModifier, 0)
  };
}

function normaliseIntegrity(integrity) {
  const maxHealth = positiveNumber(integrity.maxHealth, 1);
  return {
    maxHealth,
    health: boundedNumber(integrity.health, 0, maxHealth, maxHealth),
    armour: clamp01(Number(integrity.armour) || 0),
    breachState: integrity.breachState ?? 'intact'
  };
}

function normaliseGathering(gathering = {}) {
  const mode = ['none', 'passive-field', 'haul-forest', 'outpost-native'].includes(gathering.mode)
    ? gathering.mode
    : (gathering.enabled ? 'passive-field' : 'none');
  return {
    enabled: Boolean(gathering.enabled),
    mode,
    resourceId: typeof gathering.resourceId === 'string' ? gathering.resourceId : null,
    assignedWorkers: Math.max(0, Math.floor(Number(gathering.assignedWorkers) || 0)),
    radiusTiles: nonNegativeNumber(gathering.radiusTiles, 0),
    ratePerWorker: nonNegativeNumber(gathering.ratePerWorker, 0),
    carryCapacity: nonNegativeNumber(gathering.carryCapacity, 0),
    requiresReturn: Boolean(gathering.requiresReturn),
    sourceTerrain: Array.isArray(gathering.sourceTerrain) ? gathering.sourceTerrain.map(String) : []
  };
}

function normaliseStorage(storage = {}) {
  return {
    enabled: Boolean(storage.enabled),
    capacityBonus: nonNegativeNumber(storage.capacityBonus, 0),
    transportSlots: Math.max(0, Math.floor(Number(storage.transportSlots) || 0))
  };
}

function normaliseWorkforce(workforce = {}) {
  return {
    enabled: Boolean(workforce.enabled),
    canTrainBuilders: Boolean(workforce.canTrainBuilders),
    builderCapacityBonus: Math.max(0, Math.floor(Number(workforce.builderCapacityBonus) || 0)),
    initialBuilderCrews: Math.max(0, Math.floor(Number(workforce.initialBuilderCrews) || 0))
  };
}

function normalisePosition(position, tile = null) {
  const source = position ?? tile ?? { x: 0, y: 0 };
  return {
    x: round3(Number.isFinite(source.x) ? source.x : 0),
    y: round3(Number.isFinite(source.y) ? source.y : 0)
  };
}

function normaliseTile(tile, position) {
  return {
    x: Math.round(Number.isFinite(tile?.x) ? tile.x : position.x),
    y: Math.round(Number.isFinite(tile?.y) ? tile.y : position.y)
  };
}

function normalisePoints(points) {
  return Array.isArray(points)
    ? points.map((point) => normalisePosition(point))
    : [];
}

function createDefaultAccessPoints(footprint = {}, position = { x: 0, y: 0 }) {
  const origin = normalisePosition(position);
  if (footprint?.shape === 'line') {
    const halfWidth = Math.max(0.5, Number(footprint.width) / 2 || 0.5);
    return [
      roundPosition({ x: origin.x - halfWidth, y: origin.y }),
      roundPosition({ x: origin.x + halfWidth, y: origin.y })
    ];
  }
  const halfHeight = Math.max(0.55, Number(footprint?.height) / 2 || Number(footprint?.radius) || 0.55);
  return [
    roundPosition({ x: origin.x, y: origin.y - halfHeight - 0.35 }),
    roundPosition({ x: origin.x, y: origin.y + halfHeight + 0.35 })
  ];
}

function mergeLayer(base, override = {}) {
  return {
    ...clonePlain(base),
    ...clonePlain(override)
  };
}

function clonePlain(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function nonNegativeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function boundedNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, numeric));
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}


function normaliseDegrees(value) {
  let degrees = Number.isFinite(value) ? value : 0;
  while (degrees < 0) degrees += 360;
  while (degrees >= 360) degrees -= 360;
  return degrees;
}

function roundPosition(position) {
  return {
    x: round3(position.x),
    y: round3(position.y)
  };
}
