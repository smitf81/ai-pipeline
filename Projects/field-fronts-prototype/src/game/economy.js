export const RESOURCE_IDS = Object.freeze({
  supplies: 'supplies'
});

export const SUPPLIES_COMPONENT_IDS = Object.freeze([
  'provisions',
  'materiel',
  'transit'
]);

export const SUPPLY_INCOME_PER_OUTPOST_TICK = 10;

export const RESOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: RESOURCE_IDS.supplies,
    label: 'Supplies',
    role: 'aggregate',
    description: 'The first player-facing resource pool, assembled from field sustainment components.',
    components: Object.freeze(SUPPLIES_COMPONENT_IDS.map((id) => Object.freeze({
      id,
      label: toLabel(id),
      weight: 1
    })))
  })
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
  const income = calculateSupplyIncomeTick(outposts, factionIds);
  return {
    ...normalised,
    factions: Object.fromEntries(factionIds.map((factionId) => {
      const faction = normalised.factions[factionId];
      const incomeAmount = income[factionId]?.amount ?? 0;
      return [
        factionId,
        {
          ...faction,
          stockpiles: {
            ...faction.stockpiles,
            [RESOURCE_IDS.supplies]: addSupplyToStockpile(faction.stockpiles[RESOURCE_IDS.supplies], incomeAmount)
          },
          lastIncome: {
            [RESOURCE_IDS.supplies]: income[factionId] ?? createEmptyIncome()
          }
        }
      ];
    }))
  };
}

export function calculateSupplyIncomeTick(outposts = [], factionIds = ['player', 'enemy']) {
  const income = Object.fromEntries(factionIds.map((factionId) => [factionId, createEmptyIncome()]));

  outposts.forEach((outpost) => {
    const supplyValue = Number.isFinite(outpost?.supply) ? Math.max(0, outpost.supply) : 1;
    const baseAmount = SUPPLY_INCOME_PER_OUTPOST_TICK * supplyValue;
    if (baseAmount <= 0) {
      return;
    }

    if (outpost.contestable) {
      factionIds.forEach((factionId) => {
        addIncome(income[factionId], baseAmount * getControlShare(outpost, factionId), outpost);
      });
      return;
    }

    const owner = outpost.ownerFactionId ?? outpost.factionId;
    if (income[owner]) {
      addIncome(income[owner], baseAmount, outpost);
    }
  });

  Object.values(income).forEach((entry) => {
    entry.amount = round3(entry.amount);
    entry.components = splitSupplyComponents(entry.amount);
  });
  return income;
}

export function canAffordSupplies(economy, factionId, amount) {
  const normalised = normaliseEconomy(economy);
  const cost = normalisePositiveAmount(amount);
  const stockpile = normalised.factions?.[factionId]?.stockpiles?.[RESOURCE_IDS.supplies];
  return Boolean(stockpile && stockpile.amount >= cost);
}

export function spendSupplies(economy, factionId, amount) {
  const normalised = normaliseEconomy(economy);
  const cost = normalisePositiveAmount(amount);
  const faction = normalised.factions?.[factionId];
  const stockpile = faction?.stockpiles?.[RESOURCE_IDS.supplies];

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
      reason: 'insufficient-supplies',
      amount: stockpile.amount,
      cost
    };
  }

  const spentStockpile = subtractSupplyFromStockpile(stockpile, cost);
  return {
    ok: true,
    economy: {
      ...normalised,
      factions: {
        ...normalised.factions,
        [factionId]: {
          ...faction,
          stockpiles: {
            ...faction.stockpiles,
            [RESOURCE_IDS.supplies]: spentStockpile
          }
        }
      }
    },
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
  return {
    stockpiles: Object.fromEntries(RESOURCE_DEFINITIONS.map((resource) => [
      resource.id,
      normaliseStockpile(factionEconomy.stockpiles?.[resource.id], resource)
    ])),
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
    amount: Object.values(components).reduce((sum, value) => sum + value, 0),
    components
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

function addSupplyToStockpile(stockpile, amount) {
  const current = normaliseStockpile(stockpile, RESOURCE_DEFINITIONS[0]);
  const nextAmount = round3(current.amount + Math.max(0, amount));
  return {
    ...current,
    amount: nextAmount,
    components: Object.fromEntries(Object.entries(current.components).map(([componentId, value]) => [
      componentId,
      round3(value + splitSupplyComponents(amount)[componentId])
    ]))
  };
}

function subtractSupplyFromStockpile(stockpile, amount) {
  const current = normaliseStockpile(stockpile, RESOURCE_DEFINITIONS[0]);
  const cost = Math.min(current.amount, normalisePositiveAmount(amount));
  const nextAmount = round3(current.amount - cost);
  if (nextAmount <= 0) {
    return normaliseStockpile({ components: splitSupplyComponents(0) }, RESOURCE_DEFINITIONS[0]);
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
    resourceId: RESOURCE_IDS.supplies,
    amount: nextAmount,
    components
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

function createEmptyIncome() {
  return {
    resourceId: RESOURCE_IDS.supplies,
    amount: 0,
    components: splitSupplyComponents(0),
    sources: []
  };
}

function splitSupplyComponents(amount) {
  const resource = RESOURCE_DEFINITIONS[0];
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
    kind: typeof source.kind === 'string' ? source.kind : 'unknown',
    amount: Number.isFinite(source.amount) ? Math.max(0, source.amount) : 0
  };
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
