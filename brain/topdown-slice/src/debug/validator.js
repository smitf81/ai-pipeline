import { BUILDER_SPAWNER_TYPE, getBuilderUnitsForSpawner } from '../buildings/builderSpawner.js';
import { CONFLICT_FACTIONS, isConflictUnit } from '../units/conflict.js';
import { TILE_TYPES, getTileType } from '../world/tilemap.js';

export function runValidation(state) {
  const messages = [];

  if (state.map.tiles.length !== state.map.height) {
    messages.push({ level: 'error', text: 'Map height does not match tile rows.' });
  }

  const badRow = state.map.tiles.find((row) => row.length !== state.map.width);
  if (badRow) {
    messages.push({ level: 'error', text: 'Map width does not match one or more rows.' });
  }

  const ids = new Set();
  [...state.store.units, ...state.store.buildings, state.store.agent].forEach((entity) => {
    if (ids.has(entity.id)) {
      messages.push({ level: 'error', text: `Duplicate entity id found: ${entity.id}` });
    }
    ids.add(entity.id);
  });

  state.store.units
    .filter((unit) => isConflictUnit(unit))
    .forEach((unit) => {
      if (![CONFLICT_FACTIONS.RED, CONFLICT_FACTIONS.BLUE].includes(unit.faction)) {
        messages.push({ level: 'error', text: `Conflict unit ${unit.id} has invalid faction ${unit.faction}.` });
      }

      const hp = Number(unit.hp ?? NaN);
      const maxHp = Number(unit.maxHp ?? NaN);
      if (!Number.isFinite(hp) || !Number.isFinite(maxHp) || hp < 0 || hp > maxHp) {
        messages.push({ level: 'error', text: `Conflict unit ${unit.id} has invalid hp state.` });
      }
    });

  const occupied = new Set();
  state.store.buildings.forEach((building) => {
    const key = `${building.x},${building.y}`;
    if (occupied.has(key)) {
      messages.push({ level: 'error', text: `Building overlap at ${key}` });
    }
    occupied.add(key);

    const tile = getTileType(state.map, building.x, building.y);
    if (!tile || !TILE_TYPES[tile].buildable) {
      messages.push({ level: 'error', text: `Building ${building.id} is on invalid tile.` });
    }

    const progress = building.buildProgress ?? 0;
    const required = building.buildRequired ?? 1;
    if (progress < 0 || progress > required) {
      messages.push({ level: 'error', text: `Building ${building.id} has invalid build progress.` });
    }

    if (building.type === BUILDER_SPAWNER_TYPE) {
      const spawner = building.spawner;
      if (!spawner) {
        messages.push({ level: 'error', text: `Builder spawner ${building.id} is missing spawner state.` });
        return;
      }

      if ((spawner.cooldownRemaining ?? 0) < 0) {
        messages.push({ level: 'error', text: `Builder spawner ${building.id} has negative cooldown.` });
      }

      const activeBuilders = getBuilderUnitsForSpawner(state, building.id);
      if (activeBuilders.length > (spawner.spawnCap ?? 1)) {
        messages.push({ level: 'error', text: `Builder spawner ${building.id} exceeds its builder cap.` });
      }

      const staleBuilderId = (spawner.activeBuilderIds ?? []).find((unitId) =>
        !activeBuilders.some((unit) => unit.id === unitId)
      );
      if (staleBuilderId) {
        messages.push({ level: 'warn', text: `Builder spawner ${building.id} still references missing builder ${staleBuilderId}.` });
      }
    }
  });

  const emergenceFields = state.emergence?.fields;
  if (emergenceFields) {
    ['cover', 'visibility', 'traversal', 'defensibility', 'reinforcement'].forEach((fieldName) => {
      const field = emergenceFields[fieldName];
      if (!field) {
        messages.push({ level: 'error', text: `Field ${fieldName} is missing.` });
        return;
      }

      if (field.width !== state.map.width || field.height !== state.map.height) {
        messages.push({ level: 'error', text: `Field ${fieldName} dimensions do not match the map.` });
      }

      if (field.values.length !== field.height || field.values.some((row) => row.length !== field.width)) {
        messages.push({ level: 'error', text: `Field ${fieldName} storage does not match declared dimensions.` });
      }
    });
  }

  const emergenceIntents = state.emergence?.intents ?? [];
  const intentTypes = new Set(emergenceIntents.map((intent) => intent.type));
  if (emergenceIntents.length > 0 && !intentTypes.has('defensibility')) {
    messages.push({ level: 'error', text: 'Emergence demo is missing a defensibility intent.' });
  }
  if (emergenceIntents.length > 0 && !intentTypes.has('flow')) {
    messages.push({ level: 'error', text: 'Emergence demo is missing a flow intent.' });
  }
  if (emergenceIntents.length > 0 && !intentTypes.has('threat')) {
    messages.push({ level: 'error', text: 'Emergence demo is missing a threat intent.' });
  }

  const candidates = state.emergence?.candidates ?? [];
  if (candidates.length > (state.emergence?.maxCandidates ?? 0)) {
    messages.push({ level: 'error', text: 'Emergence resolver returned more candidates than the configured cap.' });
  }

  for (let index = 1; index < candidates.length; index += 1) {
    if ((candidates[index]?.score ?? 0) > (candidates[index - 1]?.score ?? 0)) {
      messages.push({ level: 'error', text: 'Emergence candidate scores are not sorted deterministically.' });
      break;
    }
  }

  const candidateKeys = new Set();
  candidates.forEach((candidate) => {
    const key = `${candidate.type}:${candidate.target?.x},${candidate.target?.y}:${candidate.payload?.tileType}`;
    if (candidateKeys.has(key)) {
      messages.push({ level: 'error', text: `Emergence candidate duplicated tile ${candidate.target?.x},${candidate.target?.y}.` });
    }
    candidateKeys.add(key);

    if (candidate.payload?.source === 'field-emergence') {
      validateFieldAttributedTask(candidate, `candidate ${candidate.target?.x},${candidate.target?.y}`, messages);
    }
  });

  [state.store.agent, ...state.store.units].forEach((actor) => {
    const tasks = [
      ...(actor.currentTask ? [actor.currentTask] : []),
      ...(actor.taskQueue ?? [])
    ];

    tasks.forEach((task) => {
      if (task.payload?.source === 'field-emergence') {
        validateFieldAttributedTask(task, `${actor.id}:${task.id}`, messages);
      }
    });
  });

  const strongFlowOpenings = countStrongFlowOpenings(state);
  if (state.emergence?.pressures?.flow && strongFlowOpenings === 0) {
    messages.push({ level: 'warn', text: 'Flow pressure has no remaining low-cost opening in its strongest area.' });
  }

  if (messages.length === 0) {
    messages.push({ level: 'ok', text: 'All validation checks passed.' });
  }

  const emergenceQa = state.emergence?.qa;
  if (emergenceQa) {
    messages.push({
      level: emergenceQa.status === 'error' ? 'warn' : emergenceQa.status,
      text: `Emergence QA | ${emergenceQa.summary}`
    });
  }

  return messages;
}

function countStrongFlowOpenings(state) {
  const flowPressure = state.emergence?.pressures?.flow;
  if (!flowPressure || !state.emergence?.fields?.traversal) {
    return 0;
  }

  let openings = 0;
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const flowValue = getTileType(state.map, x, y) ? (flowPressure.values[y]?.[x] ?? 0) : 0;
      const traversal = state.emergence.fields.traversal.values[y]?.[x] ?? 1;
      const tileType = getTileType(state.map, x, y);
      if (flowValue >= 0.45 && traversal <= 0.12 && tileType === 'grass') {
        openings += 1;
      }
    }
  }

  return openings;
}

function validateFieldAttributedTask(task, label, messages) {
  if (!task.sourceField) {
    messages.push({ level: 'error', text: `Emergence ${label} is missing sourceField attribution.` });
  }

  if (!Number.isFinite(task.localGradientValue)) {
    messages.push({ level: 'error', text: `Emergence ${label} is missing localGradientValue.` });
  }

  if (!Number.isFinite(task.threatValue)) {
    messages.push({ level: 'error', text: `Emergence ${label} is missing threatValue.` });
  }

  const scores = task.contributingScores;
  const requiredScores = ['def', 'flow', 'traversal', 'corridor'];
  const missingScore = requiredScores.find((key) => !Number.isFinite(scores?.[key]));
  if (missingScore) {
    messages.push({ level: 'error', text: `Emergence ${label} is missing contributingScores.${missingScore}.` });
  }
}
