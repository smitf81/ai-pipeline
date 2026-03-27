import { ADAPTIVE_WEIGHT_KEYS, ADAPTIVE_WEIGHT_LIMIT } from './adaptiveResolverWeights.js';
import {
  computeDefensibilityField,
  computeVisibilityAt,
  createRegionalAverageField,
  estimateTileFieldValues,
  getFieldValue,
  sampleFieldAverage
} from '../world/fields.js';
import { getTileType } from '../world/tilemap.js';

const DEFENSIBILITY_TILE_TYPE = 'stone';
const MINIMUM_CANDIDATE_SCORE = 0.12;
const INSPECTOR_HIGHLIGHT_LIMIT = 3;
const TRAVERSAL_STOP_THRESHOLD = 0.78;
const SCORE_TIE_EPSILON = 0.000001;

export const RESOLVER_WEIGHTS = {
  defensibilityGain: 1,
  flowPenalty: 0.45,
  traversalCostPenalty: 0.2,
  corridorPenalty: 0.35,
  reinforcementPreference: 0.18,
  replacementResistance: 0.12
};

const RESOLVER_SOURCE_FIELD = 'defensibility';
const THREAT_DEFENSIBILITY_BOOST = 0.8;
const THREAT_OPEN_TILE_WEIGHT = 0.18;
const THREAT_FLOW_SUPPRESSION = 0.2;
const REGIONAL_DEFENSIBILITY_COLUMNS = 5;
const REGIONAL_DEFENSIBILITY_ROWS = 5;
const REGIONAL_DEFENSIBILITY_TARGET = 0.4;
const REGIONAL_DEFENSIBILITY_BIAS = 0.45;
const MIN_REGIONAL_NEED_MULTIPLIER = 0.88;
const MAX_REGIONAL_NEED_MULTIPLIER = 1.12;

export function resolveIntentChanges(options) {
  return inspectIntentResolution(options).candidates;
}

export function inspectIntentResolution({
  world,
  fields,
  intents,
  pressureFields,
  maxCandidates = 4,
  adaptiveWeights = null,
  isAlreadyQueued = () => false,
  getCooldownRemaining = () => 0
}) {
  const buildingTiles = new Set(world.store.buildings.map((building) => `${building.x},${building.y}`));
  const occupiedUnitTiles = new Set([
    `${world.store.agent.x},${world.store.agent.y}`,
    ...world.store.units.map((unit) => `${unit.x},${unit.y}`)
  ]);
  const diagnostics = [];
  const focus = getWeightedIntentFocus(intents);
  const adaptive = normalizeAdaptiveWeights(adaptiveWeights);
  const localDefensibilityField = computeDefensibilityField(fields);
  const regionalDefensibilityField = createRegionalAverageField(
    localDefensibilityField,
    REGIONAL_DEFENSIBILITY_COLUMNS,
    REGIONAL_DEFENSIBILITY_ROWS
  );

  for (let y = 0; y < world.map.height; y += 1) {
    for (let x = 0; x < world.map.width; x += 1) {
      diagnostics.push(evaluateTileDiagnostic({
        world,
        fields,
        intents,
        pressureFields,
        adaptive,
        localDefensibilityField,
        regionalDefensibilityField,
        buildingTiles,
        occupiedUnitTiles,
        x,
        y
      }));
    }
  }

  const rankedDiagnostics = diagnostics
    .filter((diagnostic) => diagnostic.candidate)
    .sort((left, right) => compareRankedDiagnostics(left, right, focus));

  annotateRankMetadata(rankedDiagnostics, focus);

  rankedDiagnostics.forEach((diagnostic, index) => {
    const cooldownRemaining = Number(getCooldownRemaining(diagnostic.target.x, diagnostic.target.y) ?? 0);
    const guard = inspectCandidateGuards(diagnostic, {
      isAlreadyQueued,
      cooldownRemaining
    });

    diagnostic.cooldownRemaining = cooldownRemaining;
    diagnostic.highlighted = index < INSPECTOR_HIGHLIGHT_LIMIT;
    diagnostic.shortlistAccepted = index < maxCandidates;
    diagnostic.selectionStatus = index < maxCandidates && !guard ? 'chosen' : 'rejected';

    if (guard) {
      diagnostic.rejectionCategory = guard.category;
      diagnostic.rejectionReason = guard.reason;
    } else if (index >= maxCandidates) {
      diagnostic.rejectionCategory = 'shortlist-cutoff';
      diagnostic.rejectionReason = buildShortlistCutoffReason(diagnostic, maxCandidates);
    }

    diagnostic.candidate.guardRejection = guard?.category ?? null;
    diagnostic.candidate.guardReason = guard?.reason ?? null;
    diagnostic.candidate.selectionStatus = diagnostic.selectionStatus;
    diagnostic.candidate.rank = diagnostic.rank;
    diagnostic.candidate.tieBreakReason = diagnostic.tieBreakReason;
  });

  return {
    candidates: rankedDiagnostics.slice(0, maxCandidates).map((diagnostic) => diagnostic.candidate),
    topRanked: rankedDiagnostics.slice(0, INSPECTOR_HIGHLIGHT_LIMIT),
    tileDiagnostics: Object.fromEntries(diagnostics.map((diagnostic) => [diagnostic.tileKey, diagnostic]))
  };
}

function evaluateTileDiagnostic({
  world,
  fields,
  intents,
  pressureFields,
  adaptive,
  localDefensibilityField,
  regionalDefensibilityField,
  buildingTiles,
  occupiedUnitTiles,
  x,
  y
}) {
  const tileKey = `${x},${y}`;
  const tileType = getTileType(world.map, x, y);
  const defensibilityPressure = getFieldValue(pressureFields.defensibility, x, y) ?? 0;
  const currentCover = getFieldValue(fields.cover, x, y) ?? 0;
  const currentVisibility = getFieldValue(fields.visibility, x, y) ?? 0;
  const currentTraversal = getFieldValue(fields.traversal, x, y) ?? 1;
  const currentReinforcement = getFieldValue(fields.reinforcement, x, y) ?? 0;
  const projected = estimateTileFieldValues(DEFENSIBILITY_TILE_TYPE, {
    reinforcement: currentReinforcement
  });
  const projectedVisibility = computeVisibilityAt(fields.cover, x, y, projected.cover);
  const localExposure = sampleFieldAverage(fields.visibility, [
    { x, y },
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ]);
  const flowPressure = getFieldValue(pressureFields.flow, x, y) ?? 0;
  const threatValue = getFieldValue(pressureFields.threat, x, y) ?? 0;
  const localDefensibility = getFieldValue(localDefensibilityField, x, y) ?? 0;
  const regionalDefensibility = getFieldValue(regionalDefensibilityField, x, y) ?? localDefensibility;
  const localFlowPressure = sampleFieldAverage(pressureFields.flow, [
    { x, y },
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ]);
  const localReinforcement = sampleFieldAverage(fields.reinforcement, [
    { x, y },
    { x: x + 1, y },
    { x: x - 1, y },
    { x, y: y + 1 },
    { x, y: y - 1 }
  ]);
  const corridorPressure = Math.max(
    sampleFieldAverage(pressureFields.flow, [{ x: x - 1, y }, { x: x + 1, y }]),
    sampleFieldAverage(pressureFields.flow, [{ x, y: y - 1 }, { x, y: y + 1 }])
  );

  const coverGain = Math.max(0, projected.cover - currentCover);
  const visibilityGain = Math.max(0, currentVisibility - projectedVisibility);
  const traversalCostDelta = Math.max(0, projected.traversal - currentTraversal);
  const baseDefensibilityScore = defensibilityPressure * (coverGain * 0.6 + visibilityGain * 0.4) * (0.72 + localExposure * 0.28);
  const threatAdjustedOpenTilePenalty = threatValue * localExposure * (1 - currentCover) * THREAT_OPEN_TILE_WEIGHT;
  const threatAdjustedDefensibilityScore = baseDefensibilityScore * (1 + threatValue * THREAT_DEFENSIBILITY_BOOST) + threatAdjustedOpenTilePenalty;
  const regionalNeedMultiplier = getRegionalNeedMultiplier(regionalDefensibility);
  const defensibilityScore = threatAdjustedDefensibilityScore * regionalNeedMultiplier;
  const flowPenalty = (flowPressure * 0.7 + localFlowPressure * 0.3) * traversalCostDelta;
  const traversalCostPenalty = traversalCostDelta;
  const corridorPenalty = corridorPressure * traversalCostDelta;
  const threatFlowPreferenceScale = 1 - threatValue * THREAT_FLOW_SUPPRESSION;
  const weightedPreRegionalDefensibilityContribution = RESOLVER_WEIGHTS.defensibilityGain * threatAdjustedDefensibilityScore;
  const baseWeightedDefensibilityContribution = RESOLVER_WEIGHTS.defensibilityGain * defensibilityScore;
  const baseWeightedFlowPenalty = RESOLVER_WEIGHTS.flowPenalty * flowPenalty * threatFlowPreferenceScale;
  const baseWeightedTraversalCostPenalty = RESOLVER_WEIGHTS.traversalCostPenalty * traversalCostPenalty;
  const baseWeightedCorridorPenalty = RESOLVER_WEIGHTS.corridorPenalty * corridorPenalty * threatFlowPreferenceScale;
  const baseWeightedReinforcementPreference = RESOLVER_WEIGHTS.reinforcementPreference * localReinforcement;
  const baseWeightedReplacementResistance = RESOLVER_WEIGHTS.replacementResistance * currentReinforcement;
  const baseRegionalBiasContribution = baseWeightedDefensibilityContribution - weightedPreRegionalDefensibilityContribution;
  const weightedRegionalBiasContribution = baseRegionalBiasContribution * (1 + adaptive.reg);
  const weightedDefCoreContribution = weightedPreRegionalDefensibilityContribution * (1 + adaptive.def);
  const weightedDefensibilityContribution = weightedDefCoreContribution + weightedRegionalBiasContribution;
  const weightedFlowPenalty = baseWeightedFlowPenalty * (1 + adaptive.flow);
  const weightedTraversalCostPenalty = baseWeightedTraversalCostPenalty * (1 + adaptive.trav);
  const weightedCorridorPenalty = baseWeightedCorridorPenalty * (1 + adaptive.corr);
  const weightedReinforcementPreference = baseWeightedReinforcementPreference * (1 + adaptive.mem);
  const weightedReplacementResistance = baseWeightedReplacementResistance * (1 + adaptive.hold);
  const score = weightedDefensibilityContribution
    + weightedReinforcementPreference
    - weightedFlowPenalty
    - weightedTraversalCostPenalty
    - weightedCorridorPenalty
    - weightedReplacementResistance;

  const diagnostic = {
    tileKey,
    target: { x, y },
    tileType,
    gradient: defensibilityPressure,
    currentCover,
    currentVisibility,
    currentTraversal,
    projectedCover: projected.cover,
    projectedVisibility,
    projectedTraversal: projected.traversal,
    coverDelta: coverGain,
    visibilityDelta: visibilityGain,
    traversalCost: traversalCostDelta,
    finalScore: score,
    rank: null,
    tieGroupSize: 1,
    tieBreakReason: null,
    tieBreakKey: null,
    highlighted: false,
    shortlistAccepted: false,
    selectionStatus: 'rejected',
    rejectionCategory: null,
    rejectionReason: null,
    cooldownRemaining: 0,
    scoreBreakdown: null,
    candidate: null
  };

  if (defensibilityPressure <= 0) {
    diagnostic.rejectionCategory = 'locality';
    diagnostic.rejectionReason = 'Outside the active defensibility locality gradient.';
    return diagnostic;
  }

  if (buildingTiles.has(tileKey) || occupiedUnitTiles.has(tileKey) || currentTraversal >= TRAVERSAL_STOP_THRESHOLD || tileType === 'water') {
    diagnostic.rejectionCategory = 'traversal-stop';
    diagnostic.rejectionReason = buildTraversalStopReason({
      tileType,
      buildingTiles,
      occupiedUnitTiles,
      tileKey,
      currentTraversal
    });
    return diagnostic;
  }

  if (tileType !== 'grass') {
    diagnostic.rejectionCategory = 'not-paintable';
    diagnostic.rejectionReason = `Tile is already ${tileType}; only open grass tiles are paint candidates.`;
    return diagnostic;
  }

  if (score < MINIMUM_CANDIDATE_SCORE) {
    diagnostic.rejectionCategory = 'score-threshold';
    diagnostic.rejectionReason = `Final score ${score.toFixed(2)} is below the ${MINIMUM_CANDIDATE_SCORE.toFixed(2)} shortlist threshold.`;
    return diagnostic;
  }

  const contributingScores = {
    def: weightedDefensibilityContribution,
    region: weightedRegionalBiasContribution,
    reinforce: weightedReinforcementPreference,
    flow: -weightedFlowPenalty,
    traversal: -weightedTraversalCostPenalty,
    corridor: -weightedCorridorPenalty,
    resistance: -weightedReplacementResistance
  };

  diagnostic.scoreBreakdown = {
    gradient: defensibilityPressure,
    currentCover,
    currentVisibility,
    currentTraversal,
    projectedCover: projected.cover,
    projectedVisibility,
    projectedTraversal: projected.traversal,
    coverDelta: coverGain,
    visibilityDelta: visibilityGain,
    traversalCost: traversalCostDelta,
    baseLocalDefensibilityContribution: RESOLVER_WEIGHTS.defensibilityGain * baseDefensibilityScore,
    preRegionalDefensibilityContribution: weightedPreRegionalDefensibilityContribution,
    baseWeightedDefensibilityContribution,
    defensibilityContribution: weightedDefensibilityContribution,
    threatOpenTileContribution: threatAdjustedOpenTilePenalty,
    threatValue,
    localDefensibility,
    regionalDefensibility,
    regionalNeedMultiplier,
    adaptiveModifiers: { ...adaptive },
    regionalBiasContribution: weightedRegionalBiasContribution,
    baseRegionalBiasContribution,
    localReinforcement,
    currentReinforcement,
    flowPreferenceScale: threatFlowPreferenceScale,
    baseReinforcementPreference: baseWeightedReinforcementPreference,
    reinforcementPreference: weightedReinforcementPreference,
    baseReplacementResistancePenalty: baseWeightedReplacementResistance,
    replacementResistancePenalty: weightedReplacementResistance,
    baseFlowPenalty: baseWeightedFlowPenalty,
    flowPenalty: weightedFlowPenalty,
    baseTraversalCostPenalty: baseWeightedTraversalCostPenalty,
    traversalCostPenalty: weightedTraversalCostPenalty,
    baseCorridorPenalty: baseWeightedCorridorPenalty,
    corridorPenalty: weightedCorridorPenalty,
    finalScore: score
  };

  diagnostic.candidate = {
    type: 'paintTile',
    target: { x, y },
    payload: {
      tileType: DEFENSIBILITY_TILE_TYPE,
      source: 'field-emergence',
      intentIds: intents.map((intent) => intent.id)
    },
    sourceField: RESOLVER_SOURCE_FIELD,
    localGradientValue: defensibilityPressure,
    threatValue,
    contributingScores,
    score,
    scoreBreakdown: diagnostic.scoreBreakdown,
    reason: buildCandidateReason({
      sourceField: RESOLVER_SOURCE_FIELD,
      localGradientValue: defensibilityPressure,
      threatValue,
      regionalDefensibility,
      regionalNeedMultiplier,
      contributingScores,
      finalScore: score
    })
  };

  return diagnostic;
}

function getWeightedIntentFocus(intents) {
  if (!intents.length) {
    return { x: 0, y: 0 };
  }

  const scoringIntents = intents.filter((intent) => intent.type !== 'threat');
  const weightedIntents = scoringIntents.length > 0 ? scoringIntents : intents;

  const totals = weightedIntents.reduce((accumulator, intent) => {
    const position = intent.position ?? intent.center;
    accumulator.weight += intent.weight;
    accumulator.x += position.x * intent.weight;
    accumulator.y += position.y * intent.weight;
    return accumulator;
  }, { x: 0, y: 0, weight: 0 });

  if (totals.weight === 0) {
    return weightedIntents[0].position ?? weightedIntents[0].center;
  }

  return {
    x: totals.x / totals.weight,
    y: totals.y / totals.weight
  };
}

function compareRankedDiagnostics(left, right, focus) {
  if (right.finalScore !== left.finalScore) {
    return right.finalScore - left.finalScore;
  }

  const leftDistance = getTileDistance(left.target, focus);
  const rightDistance = getTileDistance(right.target, focus);
  if (leftDistance !== rightDistance) {
    return leftDistance - rightDistance;
  }

  if (left.target.y !== right.target.y) {
    return left.target.y - right.target.y;
  }

  return left.target.x - right.target.x;
}

function annotateRankMetadata(rankedDiagnostics, focus) {
  let start = 0;
  while (start < rankedDiagnostics.length) {
    let end = start + 1;
    while (end < rankedDiagnostics.length && isScoreTie(rankedDiagnostics[start].finalScore, rankedDiagnostics[end].finalScore)) {
      end += 1;
    }

    for (let index = start; index < end; index += 1) {
      const diagnostic = rankedDiagnostics[index];
      diagnostic.rank = index + 1;
      diagnostic.tieGroupSize = end - start;
      diagnostic.tieBreakKey = {
        distance: Number(getTileDistance(diagnostic.target, focus).toFixed(2)),
        y: diagnostic.target.y,
        x: diagnostic.target.x
      };
      diagnostic.tieBreakReason = diagnostic.tieGroupSize > 1
        ? `Score tie resolved by locality distance ${diagnostic.tieBreakKey.distance.toFixed(2)}, then y ${diagnostic.tieBreakKey.y}, x ${diagnostic.tieBreakKey.x}.`
        : 'Unique final score.';
    }

    start = end;
  }
}

function inspectCandidateGuards(diagnostic, { isAlreadyQueued, cooldownRemaining }) {
  if (isAlreadyQueued(diagnostic.candidate)) {
    return {
      category: 'already-queued',
      reason: 'Tile already has a queued field-emergence paint task.'
    };
  }

  if (cooldownRemaining > 0) {
    return {
      category: 'cooldown',
      reason: `Tile is on cooldown for ${cooldownRemaining} more resolve cycle${cooldownRemaining === 1 ? '' : 's'}.`
    };
  }

  return null;
}

function buildCandidateReason({
  sourceField,
  localGradientValue,
  threatValue,
  regionalDefensibility,
  regionalNeedMultiplier,
  contributingScores,
  finalScore
}) {
  return `source ${sourceField} @ ${localGradientValue.toFixed(2)} | threat ${threatValue.toFixed(2)} | region ${regionalDefensibility.toFixed(2)} x${regionalNeedMultiplier.toFixed(2)} | def ${formatSignedScore(contributingScores.def)} | reg ${formatSignedScore(contributingScores.region)} | mem ${formatSignedScore(contributingScores.reinforce)} | hold ${formatSignedScore(contributingScores.resistance)} | flow ${formatSignedScore(contributingScores.flow)} | trav ${formatSignedScore(contributingScores.traversal)} | corr ${formatSignedScore(contributingScores.corridor)} | final ${finalScore.toFixed(2)}`;
}

function buildTraversalStopReason({ tileType, buildingTiles, occupiedUnitTiles, tileKey, currentTraversal }) {
  if (buildingTiles.has(tileKey)) {
    return 'Traversal stop condition: building occupies the execution tile.';
  }

  if (occupiedUnitTiles.has(tileKey)) {
    return 'Traversal stop condition: actor already occupies the execution tile.';
  }

  if (tileType === 'water') {
    return `Traversal stop condition: ${tileType} is blocked with traversal ${currentTraversal.toFixed(2)}.`;
  }

  return `Traversal stop condition: traversal ${currentTraversal.toFixed(2)} is above the execution threshold ${TRAVERSAL_STOP_THRESHOLD.toFixed(2)}.`;
}

function buildShortlistCutoffReason(diagnostic, maxCandidates) {
  const cutoffReason = `Ranked #${diagnostic.rank}, outside the top ${maxCandidates} shortlist.`;
  if (diagnostic.tieGroupSize <= 1) {
    return cutoffReason;
  }

  return `${cutoffReason} ${diagnostic.tieBreakReason}`;
}

function formatSignedScore(value) {
  const numeric = Number(value ?? 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}

function getRegionalNeedMultiplier(regionalDefensibility) {
  const rawMultiplier = 1 + (REGIONAL_DEFENSIBILITY_TARGET - regionalDefensibility) * REGIONAL_DEFENSIBILITY_BIAS;
  return clamp(rawMultiplier, MIN_REGIONAL_NEED_MULTIPLIER, MAX_REGIONAL_NEED_MULTIPLIER);
}

function getTileDistance(tile, focus) {
  return Math.abs(tile.x - focus.x) + Math.abs(tile.y - focus.y);
}

function isScoreTie(left, right) {
  return Math.abs(left - right) <= SCORE_TIE_EPSILON;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAdaptiveWeights(adaptiveWeights) {
  const next = {};
  ADAPTIVE_WEIGHT_KEYS.forEach((key) => {
    next[key] = clamp(Number(adaptiveWeights?.[key] ?? 0), -ADAPTIVE_WEIGHT_LIMIT, ADAPTIVE_WEIGHT_LIMIT);
  });
  return next;
}
