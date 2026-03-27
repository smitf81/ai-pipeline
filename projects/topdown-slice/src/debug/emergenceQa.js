import { getFieldValue } from '../world/fields.js';
import { getTileType } from '../world/tilemap.js';

const FLOW_PRESSURE_THRESHOLD = 0.45;
const OPEN_TRAVERSAL_THRESHOLD = 0.12;
const CONVERGENCE_STABLE_CYCLES = 3;
const CONVERGENCE_SCORE_THRESHOLD = 0.14;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function createEmergenceQaTracker(state) {
  return {
    baselineTiles: cloneTiles(state?.map?.tiles ?? []),
    lastResolveCycle: -1,
    lastEmergentSignature: '',
    stableCycles: 0,
    totalSignatureChanges: 0,
    lastTopCandidateScore: 0,
    lastActivePaintTasks: 0
  };
}

export function evaluateEmergenceQa(state, tracker = createEmergenceQaTracker(state)) {
  const nextTracker = tracker;
  const blocking = analyzeBlockingStructure(state, nextTracker);
  const openness = analyzeFlowOpenness(state);
  const convergence = analyzeConvergence(state, nextTracker, blocking);
  const overallScore = Math.round(
    (blocking.structureCoherence * 0.35
      + blocking.clusteredBlockingRatio * 0.2
      + openness.opennessPreserved * 0.25
      + convergence.convergenceScore * 0.2) * 100
  );

  return {
    overallScore,
    status: scoreToLevel(overallScore / 100),
    summary: buildSummary(overallScore, blocking, openness, convergence),
    signals: {
      blockersCount: blocking.emergentBlockingTiles,
      opennessPreserved: openness.opennessPreserved,
      structureCoherence: blocking.structureCoherence,
      convergenceAchieved: convergence.convergenceScore,
      stableCycles: convergence.stableCycles
    },
    metrics: [
      {
        key: 'structureCoherence',
        label: 'Structure coherence',
        value: blocking.structureCoherence,
        level: scoreToLevel(blocking.structureCoherence),
        detail: blocking.emergentBlockingTiles === 0
          ? 'No emergent blocking tiles committed yet'
          : `${blocking.connectedEmergentTiles}/${blocking.emergentBlockingTiles} emergent blockers reinforce a local pattern`
      },
      {
        key: 'blockingClusters',
        label: 'Blocking tiles clustered',
        value: blocking.clusteredBlockingRatio,
        level: scoreToLevel(blocking.clusteredBlockingRatio),
        detail: blocking.emergentBlockingTiles === 0
          ? 'No blocker clusters have formed yet'
          : `${blocking.clusteredEmergentTiles}/${blocking.emergentBlockingTiles} emergent blockers touch at least two blockers`
      },
      {
        key: 'opennessPreserved',
        label: 'Openness preserved',
        value: openness.opennessPreserved,
        level: scoreToLevel(openness.opennessPreserved),
        detail: openness.strongFlowTiles === 0
          ? 'No strong-flow region is active'
          : `${openness.openFlowTiles}/${openness.strongFlowTiles} strong-flow tiles remain open`
      },
      {
        key: 'convergenceAchieved',
        label: 'Convergence achieved',
        value: convergence.convergenceScore,
        level: convergence.achieved ? 'ok' : convergence.hasEmergentChanges ? 'warn' : 'error',
        detail: convergence.detail
      }
    ],
    tracker: nextTracker
  };
}

function analyzeBlockingStructure(state, tracker) {
  const buildingTiles = new Set((state.store?.buildings ?? []).map((building) => `${building.x},${building.y}`));
  let emergentBlockingTiles = 0;
  let connectedEmergentTiles = 0;
  let clusteredEmergentTiles = 0;

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tileType = getTileType(state.map, x, y);
      const baselineTileType = tracker.baselineTiles[y]?.[x] ?? tileType;
      if (!isEmergentBlockingTile(tileType, baselineTileType)) {
        continue;
      }

      emergentBlockingTiles += 1;
      const neighbors = countBlockingNeighbors(state, buildingTiles, x, y);
      if (neighbors >= 1) {
        connectedEmergentTiles += 1;
      }
      if (neighbors >= 2) {
        clusteredEmergentTiles += 1;
      }
    }
  }

  const connectedRatio = emergentBlockingTiles === 0 ? 0 : connectedEmergentTiles / emergentBlockingTiles;
  const clusteredBlockingRatio = emergentBlockingTiles === 0 ? 0 : clusteredEmergentTiles / emergentBlockingTiles;
  const volumeConfidence = clamp01(emergentBlockingTiles / 4);
  const structureCoherence = clamp01((connectedRatio * 0.55 + clusteredBlockingRatio * 0.45) * volumeConfidence);

  return {
    emergentBlockingTiles,
    connectedEmergentTiles,
    clusteredEmergentTiles,
    connectedRatio,
    clusteredBlockingRatio,
    structureCoherence
  };
}

function analyzeFlowOpenness(state) {
  const flowPressure = state.emergence?.pressures?.flow;
  const traversalField = state.emergence?.fields?.traversal;

  if (!flowPressure || !traversalField) {
    return {
      strongFlowTiles: 0,
      openFlowTiles: 0,
      opennessPreserved: 0
    };
  }

  let strongFlowTiles = 0;
  let openFlowTiles = 0;

  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const pressure = getFieldValue(flowPressure, x, y) ?? 0;
      if (pressure < FLOW_PRESSURE_THRESHOLD) {
        continue;
      }

      strongFlowTiles += 1;
      const tileType = getTileType(state.map, x, y);
      const traversal = getFieldValue(traversalField, x, y) ?? 1;
      if (tileType === 'grass' && traversal <= OPEN_TRAVERSAL_THRESHOLD) {
        openFlowTiles += 1;
      }
    }
  }

  return {
    strongFlowTiles,
    openFlowTiles,
    opennessPreserved: strongFlowTiles === 0 ? 1 : openFlowTiles / strongFlowTiles
  };
}

function analyzeConvergence(state, tracker, blocking) {
  const resolveCycle = state.emergence?.resolveCycle ?? 0;
  const topCandidateScore = state.emergence?.candidates?.[0]?.score ?? 0;
  const activePaintTasks = countActiveEmergencePaintTasks(state);
  const emergentSignature = buildEmergentSignature(state, tracker);
  const hasEmergentChanges = blocking.emergentBlockingTiles > 0 || tracker.totalSignatureChanges > 0;

  if (tracker.lastResolveCycle !== resolveCycle) {
    const signatureChanged = tracker.lastResolveCycle >= 0 && tracker.lastEmergentSignature !== emergentSignature;
    if (signatureChanged) {
      tracker.totalSignatureChanges += 1;
    }

    const stableWindow = hasEmergentChanges
      && !signatureChanged
      && activePaintTasks === 0
      && topCandidateScore <= CONVERGENCE_SCORE_THRESHOLD;

    tracker.stableCycles = stableWindow ? tracker.stableCycles + 1 : 0;
    tracker.lastResolveCycle = resolveCycle;
    tracker.lastEmergentSignature = emergentSignature;
    tracker.lastTopCandidateScore = topCandidateScore;
    tracker.lastActivePaintTasks = activePaintTasks;
  }

  const convergenceScore = hasEmergentChanges
    ? clamp01(tracker.stableCycles / CONVERGENCE_STABLE_CYCLES)
    : 0;
  const achieved = hasEmergentChanges && tracker.stableCycles >= CONVERGENCE_STABLE_CYCLES;

  return {
    achieved,
    hasEmergentChanges,
    convergenceScore,
    stableCycles: tracker.stableCycles,
    detail: achieved
      ? `${tracker.stableCycles}/${CONVERGENCE_STABLE_CYCLES} stable resolve cycles with no queued field changes`
      : hasEmergentChanges
        ? `${tracker.stableCycles}/${CONVERGENCE_STABLE_CYCLES} stable cycles | top score ${topCandidateScore.toFixed(2)} | active paint ${activePaintTasks}`
        : 'No field-emergent blockers committed yet'
  };
}

function buildSummary(overallScore, blocking, openness, convergence) {
  return `${overallScore}/100 | blockers ${blocking.emergentBlockingTiles} | flow ${openness.openFlowTiles}/${openness.strongFlowTiles || 0} open | stable ${convergence.stableCycles}/${CONVERGENCE_STABLE_CYCLES}`;
}

function scoreToLevel(score) {
  if (score >= 0.66) {
    return 'ok';
  }
  if (score >= 0.4) {
    return 'warn';
  }
  return 'error';
}

function isEmergentBlockingTile(tileType, baselineTileType) {
  return tileType === 'stone' && baselineTileType !== 'stone';
}

function isBlockingTile(state, buildingTiles, x, y) {
  const tileType = getTileType(state.map, x, y);
  return tileType === 'stone' || tileType === 'water' || buildingTiles.has(`${x},${y}`);
}

function countBlockingNeighbors(state, buildingTiles, x, y) {
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];

  return offsets.reduce((total, [dx, dy]) => total + (isBlockingTile(state, buildingTiles, x + dx, y + dy) ? 1 : 0), 0);
}

function countActiveEmergencePaintTasks(state) {
  return [state.store.agent, ...state.store.units].reduce((total, actor) => {
    const activeTasks = [
      ...(actor.currentTask ? [actor.currentTask] : []),
      ...actor.taskQueue
    ];

    return total + activeTasks.filter((task) =>
      task.type === 'paintTile'
      && task.payload?.source === 'field-emergence'
    ).length;
  }, 0);
}

function buildEmergentSignature(state, tracker) {
  const entries = [];
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const tileType = getTileType(state.map, x, y);
      const baselineTileType = tracker.baselineTiles[y]?.[x] ?? tileType;
      if (isEmergentBlockingTile(tileType, baselineTileType)) {
        entries.push(`${x},${y}`);
      }
    }
  }
  return entries.join('|');
}

function cloneTiles(tiles) {
  return tiles.map((row) => [...row]);
}
