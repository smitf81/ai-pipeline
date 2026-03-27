import { createTask, enqueueActorTask } from '../ai/agentStub.js';
import { spawnUnit } from '../units/units.js';
import {
  CONFLICT_FACTIONS,
  CONFLICT_RULES,
  CONFLICT_UNIT_TYPE,
  buildConflictTaskSpec,
  collectDefeatedConflictUnits,
  createConflictUnitState,
  getConflictUnits,
  isConflictSpawnTileOpen,
  removeConflictUnits,
  summarizeConflict,
  tickConflictCooldowns
} from '../units/conflict.js';

const CONFLICT_UNITS_PER_FACTION = 3;
const CONFLICT_SEARCH_AREAS = {
  [CONFLICT_FACTIONS.RED]: { minX: 2, maxX: 7, minY: 2, maxY: 8 },
  [CONFLICT_FACTIONS.BLUE]: { minX: 17, maxX: 22, minY: 2, maxY: 8 }
};

export function createConflictState() {
  return {
    enabled: true,
    seeded: false,
    rules: { ...CONFLICT_RULES },
    casualtyCounts: {
      [CONFLICT_FACTIONS.RED]: 0,
      [CONFLICT_FACTIONS.BLUE]: 0
    },
    totalDeaths: 0,
    lastOutcome: null,
    lastOutcomeFrame: null,
    recentAttacks: [],
    recentEliminations: []
  };
}

export function seedConflictScenario(store, map) {
  const spawnedUnits = [];
  const errors = [];

  [CONFLICT_FACTIONS.RED, CONFLICT_FACTIONS.BLUE].forEach((faction) => {
    const spawnTiles = findConflictSpawnTiles(map, store, faction, CONFLICT_UNITS_PER_FACTION);
    if (spawnTiles.length < CONFLICT_UNITS_PER_FACTION) {
      errors.push(`Could not find ${CONFLICT_UNITS_PER_FACTION} open ${faction} spawn tiles.`);
      return;
    }

    spawnTiles.forEach((tile, index) => {
      const spawnResult = spawnUnit(store, map, {
        type: CONFLICT_UNIT_TYPE,
        x: tile.x,
        y: tile.y,
        ...createConflictUnitState({
          faction,
          label: `${faction} skirmisher ${index + 1}`
        })
      });

      if (!spawnResult.ok) {
        errors.push(spawnResult.error);
        return;
      }

      spawnedUnits.push(spawnResult.unit);
    });
  });

  return {
    ok: errors.length === 0 && spawnedUnits.length > 0,
    spawnedUnits,
    errors
  };
}

export function tickConflictLoop(state, reportEvent) {
  if (!state?.conflict?.enabled) {
    return summarizeConflictState(state);
  }

  tickConflictCooldowns(state.store);

  const defeated = collectDefeatedConflictUnits(state.store);
  if (defeated.length > 0) {
    defeated.forEach((unit) => {
      if (state.conflict.casualtyCounts[unit.faction] != null) {
        state.conflict.casualtyCounts[unit.faction] += 1;
      }
      state.conflict.totalDeaths += 1;
      reportEvent(
        `Conflict casualty | ${unit.lastEliminationExplanation ?? `${unit.faction} ${unit.id} eliminated`}`,
        'warn'
      );
    });
    removeConflictUnits(state.store, defeated.map((unit) => unit.id));
  }

  const summary = summarizeConflict(state.store);
  if (summary.outcome && state.conflict.lastOutcome !== summary.outcome) {
    state.conflict.lastOutcome = summary.outcome;
    state.conflict.lastOutcomeFrame = Number(state.emergence?.frame ?? 0);
    reportEvent(
      `Conflict outcome | ${summary.outcome === 'draw' ? 'draw' : `${summary.outcome} wins`} | red ${summary.livingByFaction.red} blue ${summary.livingByFaction.blue}`,
      summary.outcome === 'draw' ? 'warn' : 'ok'
    );
  }

  getConflictUnits(state.store).forEach((unit) => {
    if (unit.currentTask || unit.taskQueue.length > 0) {
      return;
    }

    const taskSpec = buildConflictTaskSpec(state, unit);
    if (!taskSpec) {
      unit.state = summary.outcome ? 'victorious' : 'idle';
      return;
    }

    const task = createTask(state.store, {
      ...taskSpec,
      assignedActorId: unit.id,
      issuedByActorId: unit.id
    });
    enqueueActorTask(unit, task);
  });

  return summarizeConflictState(state);
}

export function summarizeConflictState(state) {
  const liveSummary = summarizeConflict(state?.store);
  return {
    ...liveSummary,
    rules: { ...(state?.conflict?.rules ?? CONFLICT_RULES) },
    casualtyCounts: {
      [CONFLICT_FACTIONS.RED]: Number(state?.conflict?.casualtyCounts?.[CONFLICT_FACTIONS.RED] ?? 0),
      [CONFLICT_FACTIONS.BLUE]: Number(state?.conflict?.casualtyCounts?.[CONFLICT_FACTIONS.BLUE] ?? 0)
    },
    totalDeaths: Number(state?.conflict?.totalDeaths ?? 0),
    lastOutcome: state?.conflict?.lastOutcome ?? null,
    lastOutcomeFrame: state?.conflict?.lastOutcomeFrame ?? null,
    recentAttacks: (state?.conflict?.recentAttacks ?? []).map((entry) => ({
      ...entry,
      rules: { ...entry.rules }
    })),
    recentEliminations: (state?.conflict?.recentEliminations ?? []).map((entry) => ({
      ...entry,
      rules: { ...entry.rules }
    })),
    units: getConflictUnits(state?.store, { includeDefeated: false }).map((unit) => ({
      id: unit.id,
      faction: unit.faction,
      position: { x: unit.x, y: unit.y, z: unit.z ?? 0 },
      hp: unit.hp,
      maxHp: unit.maxHp,
      state: unit.state,
      currentTaskType: unit.currentTask?.type ?? null,
      combat: {
        attacksResolved: Number(unit.combat?.attacksResolved ?? 0),
        damageDealt: Number(unit.combat?.damageDealt ?? 0),
        damageTaken: Number(unit.combat?.damageTaken ?? 0),
        kills: Number(unit.combat?.kills ?? 0)
      }
    }))
  };
}

function findConflictSpawnTiles(map, store, faction, count) {
  const area = CONFLICT_SEARCH_AREAS[faction];
  const tiles = [];

  for (let y = area.minY; y <= area.maxY && tiles.length < count; y += 1) {
    for (let x = area.minX; x <= area.maxX && tiles.length < count; x += 1) {
      if (!isConflictSpawnTileOpen(map, store, x, y)) {
        continue;
      }

      tiles.push({ x, y });
    }
  }

  return tiles;
}
