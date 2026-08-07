export const WORKER_MAX_ENERGY = 16;
export const MOVE_ENERGY_COST = 1;
export const RELAY_RECHARGE_AMOUNT = 1;
export const RELAY_RECHARGE_FRAMES = 12;

const TASK_ENERGY_RULES = {
  moveTo: {
    cost: 0,
    label: '1/tile',
    reason: 'move'
  },
  placeBuilding: {
    cost: 2,
    label: '2/tick + 1/tile',
    reason: 'build tick'
  },
  deleteBuilding: {
    cost: 2,
    label: '2 + 1/tile',
    reason: 'delete action'
  },
  paintTile: {
    cost: 1,
    label: '1 + 1/tile',
    reason: 'paint action'
  },
  spawnUnit: {
    cost: 3,
    label: '3',
    reason: 'spawn action'
  }
};

export function getInitialActorEnergyState(type) {
  if (type !== 'worker') {
    return { energy: null, maxEnergy: null };
  }

  return {
    energy: WORKER_MAX_ENERGY,
    maxEnergy: WORKER_MAX_ENERGY
  };
}

export function actorUsesEnergy(actor) {
  return Number.isFinite(actor?.energy) && Number.isFinite(actor?.maxEnergy);
}

export function getTaskEnergyCost(task) {
  return TASK_ENERGY_RULES[task?.type]?.cost ?? 0;
}

export function getTaskEnergyLabel(task) {
  return TASK_ENERGY_RULES[task?.type]?.label ?? '0';
}

export function getTaskEnergyReason(task) {
  return TASK_ENERGY_RULES[task?.type]?.reason ?? 'task';
}

export function getActorEnergyText(actor) {
  if (!actorUsesEnergy(actor)) {
    return 'n/a';
  }

  return `${actor.energy}/${actor.maxEnergy}`;
}

export function getActorEnergyRatio(actor) {
  if (!actorUsesEnergy(actor) || actor.maxEnergy <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, actor.energy / actor.maxEnergy));
}

export function isActorExhausted(actor) {
  return actorUsesEnergy(actor) && actor.energy <= 0;
}

export function actorNeedsEnergy(actor) {
  return actorUsesEnergy(actor) && actor.energy < actor.maxEnergy;
}

export function canActorAffordMovement(actor) {
  return canActorAffordCost(actor, MOVE_ENERGY_COST, 'move');
}

export function canActorAffordTask(actor, task) {
  return canActorAffordCost(actor, getTaskEnergyCost(task), getTaskEnergyReason(task));
}

export function spendActorMovementEnergy(actor) {
  return spendActorCost(actor, MOVE_ENERGY_COST);
}

export function spendActorTaskEnergy(actor, task) {
  return spendActorCost(actor, getTaskEnergyCost(task));
}

export function restoreActorEnergy(actor) {
  if (!actorUsesEnergy(actor)) {
    return { ok: false, restored: false };
  }

  actor.energy = actor.maxEnergy;
  if (actor.state === 'exhausted') {
    actor.state = actor.currentTask ? 'working' : 'idle';
  }

  return { ok: true, restored: true, energy: actor.energy };
}

export function rechargeActorEnergy(actor, amount = RELAY_RECHARGE_AMOUNT) {
  if (!actorUsesEnergy(actor)) {
    return { ok: false, restored: 0, energy: null };
  }

  const previous = actor.energy;
  actor.energy = Math.min(actor.maxEnergy, actor.energy + amount);
  return {
    ok: true,
    restored: actor.energy - previous,
    energy: actor.energy,
    full: actor.energy >= actor.maxEnergy
  };
}

function canActorAffordCost(actor, cost, reason) {
  if (!actorUsesEnergy(actor) || cost === 0) {
    return { ok: true, cost };
  }

  if (actor.energy < cost) {
    return {
      ok: false,
      cost,
      error: `needs ${cost} energy for ${reason}, has ${actor.energy}`
    };
  }

  return { ok: true, cost };
}

function spendActorCost(actor, cost) {
  const check = canActorAffordCost(actor, cost, 'action');
  if (!check.ok) {
    return check;
  }

  if (actorUsesEnergy(actor) && cost > 0) {
    actor.energy = Math.max(0, actor.energy - cost);
  }

  return { ok: true, cost };
}
