export const RESOURCE_IDS = Object.freeze({
  supplies: 'supplies',
  gold: 'gold',
  food: 'food',
  wood: 'wood',
  population: 'population'
});

export const SUPPLIES_COMPONENT_IDS = Object.freeze([
  'provisions',
  'materiel',
  'transit'
]);

export const SUPPLY_INCOME_PER_OUTPOST_TICK = 3;
export const OUTPOST_GOLD_INCOME_PER_TICK = 3;
export const OUTPOST_POPULATION_INCOME_PER_TICK = 0.06;
export const DEFAULT_STORAGE_CAPACITY = 0;

export const RESOURCE_DEFINITIONS = deepFreeze([
  {
    id: RESOURCE_IDS.supplies,
    label: 'Logistics',
    role: 'aggregate',
    description: 'Abstract logistics pressure retained for compatibility and internal sustainment signals.',
    components: SUPPLIES_COMPONENT_IDS.map((id) => ({
      id,
      label: toLabel(id),
      weight: 1
    }))
  },

  {
    id: RESOURCE_IDS.gold,
    label: 'Gold',
    role: 'currency',
    description: 'Pay, tribute, and portable wealth used to recruit labour and fighting men.',
    components: [
      { id: RESOURCE_IDS.gold, label: 'Gold', weight: 1 }
    ]
  },
  {
    id: RESOURCE_IDS.food,
    label: 'Food',
    role: 'raw',
    description: 'Local forage, game, and field rations gathered from hunting camps.',
    components: [
      { id: RESOURCE_IDS.food, label: 'Food', weight: 1 }
    ]
  },
  {
    id: RESOURCE_IDS.wood,
    label: 'Wood',
    role: 'raw',
    description: 'Timber hauled from forest tiles by wood gathering posts.',
    components: [
      { id: RESOURCE_IDS.wood, label: 'Wood', weight: 1 }
    ]
  },
  {
    id: RESOURCE_IDS.population,
    label: 'Population',
    role: 'people',
    description: 'Available camp followers, workers, nomads, and recruits who can be assigned to work or war.',
    components: [
      { id: RESOURCE_IDS.population, label: 'Population', weight: 1 }
    ]
  }
]);

export function createInitialEconomy(factionIds = ['player', 'enemy']) {
  return normaliseEconomy({
    resources: Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [resource.id, createResourceState(resource)])),
    factions: Object.fromEntries(factionIds.map((factionId) => [
      factionId,
      createFactionEconomyState()
    ]))
  });
}

export function normaliseEconomy(economy = {}, factionIds = ['player', 'enemy']) {
  const resources = Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [
    resource.id,
    normaliseResourceState(economy.resources?.[resource.id], resource)
  ]));

  const factions = Object.fromEntries(factionIds.map((factionId) => [
    factionId,
    normaliseFactionEconomyState(economy.factions?.[factionId])
  ]));

  return {
    contract: 'field-fronts.economy-state.v1',
    resources,
    factions
  };
}

export function summarizeEconomy(economy) {
  const normalised = normaliseEconomy(economy);
  return {
    contract: normalised.contract,
    resources: normalised.resources,
    factions: normalised.factions
  };
}

export function applySupplyIncomeTick(economy, outposts, factionIds = ['player', 'enemy']) {
  const normalised = normaliseEconomy(economy, factionIds);
  const income = calculateOutpostIncomeTick(outposts, factionIds);
  return {
    ...normalised,
    factions: Object.fromEntries(factionIds.map((factionId) => {
      const faction = normalised.factions[factionId];
      let nextStockpiles = { ...faction.stockpiles };
      let lastIncome = { ...faction.lastIncome };
      for (const [resourceId, incomeEntry] of Object.entries(income[factionId] ?? {})) {
        const definition = getResourceDefinition(resourceId);
        if (!definition) continue;
        const acceptedAmount = incomeEntry?.amount ?? 0;
        nextStockpiles = {
          ...nextStockpiles,
          [resourceId]: addResourceToStockpile(nextStockpiles[resourceId], definition, acceptedAmount)
        };
        lastIncome = {
          ...lastIncome,
          [resourceId]: resizeIncomeAmount(incomeEntry ?? createEmptyIncome(resourceId), definition, acceptedAmount)
        };
      }
      return [
        factionId,
        {
          ...faction,
          stockpiles: nextStockpiles,
          storage: normaliseStorageState(faction.storage, nextStockpiles),
          lastIncome
        }
      ];
    }))
  };
}

export function calculateSupplyIncomeTick(outposts = [], factionIds = ['player', 'enemy']) {
  return Object.fromEntries(Object.entries(calculateOutpostIncomeTick(outposts, factionIds)).map(([factionId, resources]) => [
    factionId,
    resources[RESOURCE_IDS.gold] ?? createEmptyIncome(RESOURCE_IDS.gold)
  ]));
}

export function calculateOutpostIncomeTick(outposts = [], factionIds = ['player', 'enemy']) {
  const income = Object.fromEntries(factionIds.map((factionId) => [
    factionId,
    {
      [RESOURCE_IDS.gold]: createEmptyIncome(RESOURCE_IDS.gold),
      [RESOURCE_IDS.population]: createEmptyIncome(RESOURCE_IDS.population)
    }
  ]));

  outposts.forEach((outpost) => {
    const supplyValue = Number.isFinite(outpost?.supply) ? Math.max(0, outpost.supply) : 1;
    const goldAmount = OUTPOST_GOLD_INCOME_PER_TICK * supplyValue;
    const populationAmount = OUTPOST_POPULATION_INCOME_PER_TICK * supplyValue;
    if (goldAmount <= 0 && populationAmount <= 0) return;

    const addForFaction = (factionId, share = 1) => {
      if (!income[factionId]) return;
      addIncome(income[factionId][RESOURCE_IDS.gold], goldAmount * share, outpost);
      addIncome(income[factionId][RESOURCE_IDS.population], populationAmount * share, outpost);
    };

    if (outpost.contestable) {
      factionIds.forEach((factionId) => addForFaction(factionId, getControlShare(outpost, factionId)));
      return;
    }

    addForFaction(outpost.ownerFactionId ?? outpost.factionId, 1);
  });

  Object.values(income).forEach((factionIncome) => {
    Object.values(factionIncome).forEach((entry) => {
      entry.amount = round3(entry.amount);
      entry.components = splitResourceComponents(getResourceDefinition(entry.resourceId), entry.amount);
    });
  });
  return income;
}

export function applyResourceIncomeTick(economy, incomeByFaction = {}, factionIds = ['player', 'enemy']) {
  const normalised = normaliseEconomy(economy, factionIds);
  return {
    ...normalised,
    factions: Object.fromEntries(factionIds.map((factionId) => {
      const faction = normalised.factions[factionId];
      const incomeEntries = incomeByFaction[factionId] ?? {};
      let stockpiles = { ...faction.stockpiles };
      let lastIncome = { ...faction.lastIncome };
      let remainingStorage = faction.storage.free;

      Object.entries(incomeEntries).forEach(([resourceId, rawIncome]) => {
        const definition = getResourceDefinition(resourceId);
        if (!definition) {
          return;
        }
        const income = normaliseIncome(rawIncome, definition);
        const acceptedAmount = isStorageBoundResource(resourceId)
          ? Math.min(income.amount, remainingStorage)
          : income.amount;
        if (isStorageBoundResource(resourceId)) {
          remainingStorage = Math.max(0, round3(remainingStorage - acceptedAmount));
        }
        stockpiles = {
          ...stockpiles,
          [resourceId]: addResourceToStockpile(stockpiles[resourceId], definition, acceptedAmount)
        };
        lastIncome = {
          ...lastIncome,
          [resourceId]: resizeIncomeAmount(income, definition, acceptedAmount)
        };
      });

      return [
        factionId,
        {
          ...faction,
          stockpiles,
          storage: normaliseStorageState(faction.storage, stockpiles),
          lastIncome
        }
      ];
    }))
  };
}

export function setFactionStorageCapacity(economy, capacityByFaction = {}, factionIds = ['player', 'enemy']) {
  const normalised = normaliseEconomy(economy, factionIds);
  return {
    ...normalised,
    factions: Object.fromEntries(factionIds.map((factionId) => {
      const faction = normalised.factions[factionId];
      const capacity = Number.isFinite(capacityByFaction[factionId])
        ? Math.max(0, capacityByFaction[factionId])
        : faction.storage.capacity;
      return [
        factionId,
        {
          ...faction,
          storage: normaliseStorageState({ ...faction.storage, capacity }, faction.stockpiles)
        }
      ];
    }))
  };
}

export function normaliseResourceCost(cost = {}) {
  if (Number.isFinite(cost)) {
    return normaliseResourceCost({ [RESOURCE_IDS.supplies]: cost });
  }
  const rawCost = cost?.resources && typeof cost.resources === 'object' ? cost.resources : cost;
  return Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [
    resource.id,
    round3(Math.max(0, Number(rawCost?.[resource.id]) || 0))
  ]).filter(([, amount]) => amount > 0));
}

export function scaleResourceCost(cost = {}, multiplier = 1) {
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  return Object.fromEntries(Object.entries(normaliseResourceCost(cost)).map(([resourceId, amount]) => [
    resourceId,
    round3(amount * safeMultiplier)
  ]).filter(([, amount]) => amount > 0));
}

export function canAffordCost(economy, factionId, cost = {}) {
  const normalised = normaliseEconomy(economy);
  const faction = normalised.factions?.[factionId];
  const resources = normaliseResourceCost(cost);
  const missing = Object.entries(resources)
    .map(([resourceId, required]) => {
      const available = faction?.stockpiles?.[resourceId]?.amount ?? 0;
      return { resourceId, required, available, missing: round3(Math.max(0, required - available)) };
    })
    .filter((entry) => entry.missing > 0);

  return {
    ok: Boolean(faction) && missing.length === 0,
    economy: normalised,
    factionId,
    resources,
    missing,
    reason: !faction ? 'missing-faction' : missing.length > 0 ? 'insufficient-resources' : null
  };
}

export function spendCost(economy, factionId, cost = {}) {
  const affordability = canAffordCost(economy, factionId, cost);
  if (!affordability.ok) {
    return affordability;
  }

  let nextEconomy = affordability.economy;
  const spent = {};
  for (const [resourceId, amount] of Object.entries(affordability.resources)) {
    const result = spendResource(nextEconomy, factionId, resourceId, amount);
    if (!result.ok) {
      return {
        ok: false,
        economy: affordability.economy,
        factionId,
        resources: affordability.resources,
        spent,
        reason: result.reason,
        resourceId
      };
    }
    nextEconomy = result.economy;
    spent[resourceId] = amount;
  }

  return {
    ok: true,
    economy: nextEconomy,
    factionId,
    resources: affordability.resources,
    spent
  };
}

export function describeResourceCost(cost = {}) {
  const resources = normaliseResourceCost(cost);
  const parts = Object.entries(resources).map(([resourceId, amount]) => {
    const label = getResourceDefinition(resourceId)?.label ?? resourceId;
    return `${round3(amount)} ${label}`;
  });
  return parts.length > 0 ? parts.join(', ') : 'No cost';
}

export function canAffordSupplies(economy, factionId, amount) {
  return canAffordCost(economy, factionId, { [RESOURCE_IDS.supplies]: amount }).ok;
}

export function spendSupplies(economy, factionId, amount) {
  const result = spendResource(economy, factionId, RESOURCE_IDS.supplies, amount);
  if (!result.ok && result.reason === 'insufficient-resource') {
    return { ...result, reason: 'insufficient-supplies' };
  }
  return result;
}

export function spendResource(economy, factionId, resourceId, amount) {
  const normalised = normaliseEconomy(economy);
  const cost = normalisePositiveAmount(amount);
  const faction = normalised.factions?.[factionId];
  const definition = getResourceDefinition(resourceId);
  const stockpile = definition ? faction?.stockpiles?.[resourceId] : null;

  if (!faction || !stockpile) {
    return {
      ok: false,
      economy: normalised,
      reason: 'missing-faction',
      amount: stockpile?.amount ?? 0,
      cost
    };
  }

  if (stockpile.amount < cost) {
    return {
      ok: false,
      economy: normalised,
      reason: 'insufficient-resource',
      resourceId,
      amount: stockpile.amount,
      cost
    };
  }

  const spentStockpile = subtractResourceFromStockpile(stockpile, definition, cost);
  const stockpiles = {
    ...faction.stockpiles,
    [resourceId]: spentStockpile
  };
  return {
    ok: true,
    economy: {
      ...normalised,
      factions: {
        ...normalised.factions,
        [factionId]: {
          ...faction,
          stockpiles,
          storage: normaliseStorageState(faction.storage, stockpiles)
        }
      }
    },
    resourceId,
    amount: spentStockpile.amount,
    cost
  };
}

function createResourceState(definition) {
  return normaliseResourceState(null, definition);
}

function normaliseResourceState(resourceState = {}, definition) {
  return {
    id: definition.id,
    label: definition.label,
    role: definition.role,
    components: Object.fromEntries(definition.components.map((component) => [
      component.id,
      normaliseComponentState(resourceState?.components?.[component.id], component)
    ]))
  };
}

function createFactionEconomyState() {
  return normaliseFactionEconomyState();
}

function normaliseFactionEconomyState(factionEconomy = {}) {
  const stockpiles = Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [
    resource.id,
    normaliseStockpile(factionEconomy.stockpiles?.[resource.id], resource)
  ]));
  return {
    stockpiles,
    storage: normaliseStorageState(factionEconomy.storage, stockpiles),
    lastIncome: Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [
      resource.id,
      normaliseIncome(factionEconomy.lastIncome?.[resource.id], resource)
    ]))
  };
}

function normaliseComponentState(componentState = {}, component) {
  return {
    id: component.id,
    label: component.label,
    weight: Number.isFinite(componentState?.weight) ? Math.max(0, componentState.weight) : component.weight
  };
}

function normaliseStockpile(stockpile = {}, resource) {
  const components = Object.fromEntries(resource.components.map((component) => [
    component.id,
    Number.isFinite(stockpile?.components?.[component.id]) ? Math.max(0, stockpile.components[component.id]) : 0
  ]));

  return {
    resourceId: resource.id,
    amount: round3(Object.values(components).reduce((sum, value) => sum + value, 0)),
    components
  };
}

function normaliseStorageState(storage = {}, stockpiles = {}) {
  const used = round3(Object.values(stockpiles).reduce((sum, stockpile) => {
    const resourceId = stockpile?.resourceId;
    return sum + (isStorageBoundResource(resourceId) ? (Number(stockpile?.amount) || 0) : 0);
  }, 0));
  const capacity = Number.isFinite(storage?.capacity) ? Math.max(0, storage.capacity) : DEFAULT_STORAGE_CAPACITY;
  return {
    capacity: round3(capacity),
    used,
    free: round3(Math.max(0, capacity - used))
  };
}

function normaliseIncome(income = {}, resource) {
  const amount = Number.isFinite(income?.amount) ? Math.max(0, income.amount) : 0;
  return {
    resourceId: resource.id,
    amount,
    components: normaliseComponentAmounts(income?.components, resource),
    sources: Array.isArray(income?.sources) ? income.sources.map(normaliseIncomeSource) : []
  };
}

function addResourceToStockpile(stockpile, resource, amount) {
  const current = normaliseStockpile(stockpile, resource);
  const nextAmount = round3(current.amount + Math.max(0, amount));
  return {
    ...current,
    amount: nextAmount,
    components: Object.fromEntries(Object.entries(current.components).map(([componentId, value]) => [
      componentId,
      round3(value + splitResourceComponents(resource, amount)[componentId])
    ]))
  };
}

function subtractSupplyFromStockpile(stockpile, amount) {
  return subtractResourceFromStockpile(stockpile, getResourceDefinition(RESOURCE_IDS.supplies), amount);
}

function subtractResourceFromStockpile(stockpile, resource, amount) {
  const current = normaliseStockpile(stockpile, resource);
  const cost = Math.min(current.amount, normalisePositiveAmount(amount));
  const nextAmount = round3(current.amount - cost);
  if (nextAmount <= 0) {
    return normaliseStockpile({ components: splitResourceComponents(resource, 0) }, resource);
  }

  const ratio = nextAmount / current.amount;
  let assigned = 0;
  const entries = Object.entries(current.components);
  const components = Object.fromEntries(entries.map(([componentId, value], index) => {
    const nextValue = index === entries.length - 1
      ? round3(nextAmount - assigned)
      : round3(value * ratio);
    assigned += nextValue;
    return [componentId, nextValue];
  }));

  return {
    resourceId: resource.id,
    amount: nextAmount,
    components
  };
}

function resizeIncomeAmount(income, resource, amount) {
  return {
    ...normaliseIncome(income, resource),
    amount: round3(Math.max(0, amount)),
    components: splitResourceComponents(resource, amount)
  };
}

function addIncome(income, amount, outpost) {
  const roundedAmount = round3(Math.max(0, amount));
  if (roundedAmount <= 0) {
    return;
  }
  income.amount += roundedAmount;
  income.sources.push({
    outpostId: outpost.id,
    kind: outpost.contestable ? 'contest-gradient' : 'base-outpost',
    amount: roundedAmount
  });
}

function createEmptyIncome(resourceId = RESOURCE_IDS.supplies) {
  const resource = getResourceDefinition(resourceId);
  return {
    resourceId,
    amount: 0,
    components: splitResourceComponents(resource, 0),
    sources: []
  };
}

function splitSupplyComponents(amount) {
  return splitResourceComponents(getResourceDefinition(RESOURCE_IDS.supplies), amount);
}

function splitResourceComponents(resource, amount) {
  const totalWeight = resource.components.reduce((sum, component) => sum + component.weight, 0);
  const roundedAmount = round3(Math.max(0, amount));
  let assigned = 0;
  return Object.fromEntries(resource.components.map((component, index) => {
    const value = index === resource.components.length - 1
      ? round3(roundedAmount - assigned)
      : round3((roundedAmount * component.weight) / totalWeight);
    assigned += value;
    return [component.id, value];
  }));
}

function normaliseComponentAmounts(components = {}, resource) {
  return Object.fromEntries(resource.components.map((component) => [
    component.id,
    Number.isFinite(components?.[component.id]) ? Math.max(0, components[component.id]) : 0
  ]));
}

function normaliseIncomeSource(source = {}) {
  return {
    outpostId: typeof source.outpostId === 'string' ? source.outpostId : 'unknown',
    structureId: typeof source.structureId === 'string' ? source.structureId : null,
    workerId: typeof source.workerId === 'string' ? source.workerId : null,
    tile: source.tile && Number.isFinite(source.tile.x) && Number.isFinite(source.tile.y)
      ? { x: Math.round(source.tile.x), y: Math.round(source.tile.y) }
      : null,
    kind: typeof source.kind === 'string' ? source.kind : 'unknown',
    amount: Number.isFinite(source.amount) ? Math.max(0, source.amount) : 0
  };
}

export function getResourceDefinition(resourceId) {
  return RESOURCE_DEFINITIONS.find((resource) => resource.id === resourceId) ?? null;
}

function isStorageBoundResource(resourceId) {
  const definition = getResourceDefinition(resourceId);
  return Boolean(definition && definition.role === 'raw');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  Object.freeze(value);
  Object.values(value).forEach((entry) => deepFreeze(entry));
  return value;
}

function getControlShare(outpost, factionId) {
  if (Number.isFinite(outpost.control?.[factionId])) {
    return clamp01(outpost.control[factionId]);
  }
  if ((outpost.ownerFactionId ?? outpost.factionId) === factionId) {
    return 1;
  }
  return 0;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function normalisePositiveAmount(value) {
  return round3(Number.isFinite(value) ? Math.max(0, value) : 0);
}

function toLabel(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
