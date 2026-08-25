export const MAP_FORGE_SPATIAL_SCORECARD_CONTRACT = 'axiom.map-forge-spatial-scorecard.v1';

const REQUIRED_FAMILIES = Object.freeze(['tree', 'undergrowth', 'geology']);
const NEXT_ACTION_KINDS = new Set(['route_revision_required', 'boundary_enforcement_required', 'repair_integrity', 'add_family', 'strengthen_zone', 'complete']);
const ROUTE_COVERAGE_TARGET = .55;
const LONGEST_UNTREATED_TARGET = .24;
const ZONE_COVERAGE_TARGET = .32;
const MINIMUM_ZONE_FAMILIES = 2;

export function evaluateMapForgeSpatialQuality(session, document, options = {}) {
  assertDocument(document);
  const activeBatches = (session?.batches || []).filter(batch => !batch.undoneAt);
  const createdIds = [...new Set(activeBatches.flatMap(batch => batch.receipt?.createdIds || []))];
  const recordsById = new Map((document.sceneObjects || []).map(record => [record.id, record]));
  const pathTiles = Array.isArray(options.pathTiles) && options.pathTiles.length
    ? options.pathTiles.map(pointValue)
    : collectPathTiles(document);
  const familyCoverage = [...new Set(activeBatches.map(batch => batch.family).filter(Boolean))];
  const missingFamilies = REQUIRED_FAMILIES.filter(family => !familyCoverage.includes(family));
  const missingReadbackIds = createdIds.filter(id => !recordsById.has(id));
  const minimumClearance = finite(session?.successCriteria?.minimumPathClearanceTiles, 1.5);
  const pathClearanceViolations = createdIds.filter(id => {
    const record = recordsById.get(id);
    return record && distanceToPoints(record.x, record.y, pathTiles) < minimumClearance;
  });
  const minimumCreated = finite(session?.successCriteria?.minimumCreated, 12);
  const integrityReasons = [];
  if (missingFamilies.length) integrityReasons.push(reason('missing_families', `Still needs ${missingFamilies.join(', ')}.`, { actual: familyCoverage.length, target: REQUIRED_FAMILIES.length }));
  if (createdIds.length < minimumCreated) integrityReasons.push(reason('minimum_created', `${createdIds.length}/${minimumCreated} session objects read back.`, { actual: createdIds.length, target: minimumCreated }));
  if (missingReadbackIds.length) integrityReasons.push(reason('canonical_readback', `${missingReadbackIds.length} applied objects are missing from canonical readback.`, { actual: missingReadbackIds.length, target: 0, severity: 'blocking' }));
  if (pathClearanceViolations.length) integrityReasons.push(reason('path_clearance', `${pathClearanceViolations.length} session objects breach path clearance.`, { actual: pathClearanceViolations.length, target: 0, severity: 'blocking' }));
  const integrityGate = {
    pass: integrityReasons.length === 0,
    reasons: integrityReasons,
    createdCount: createdIds.length,
    familyCoverage,
    missingFamilies,
    missingReadbackIds,
    pathClearanceViolations
  };

  const route = observeAuthoredRoute(document, pathTiles);
  const routeQuality = evaluateRouteQuality(document, route);
  const boundaryQuality = evaluateBoundaryQuality(document);
  const zones = derivePacingZones(document, route.points);
  const environment = mapEnvironmentToRoute(document.sceneObjects || [], route.points, minimumClearance, document.playableSpace?.route?.widthTiles);
  const coverage = evaluateCoverage(route.points, environment);
  const zoneScores = zones.map(zone => evaluateZone(zone, route.points, environment, coverage.binCount));
  const designReasons = [...routeQuality.reasons, ...boundaryQuality.reasons];
  if (coverage.ratio < ROUTE_COVERAGE_TARGET) {
    designReasons.push(reason('route_treatment_coverage', `Only ${percent(coverage.ratio)} of the route has environmental treatment.`, { actual: coverage.ratio, target: ROUTE_COVERAGE_TARGET }));
  }
  if (coverage.longestUntreatedRatio > LONGEST_UNTREATED_TARGET) {
    designReasons.push(reason('untreated_route_span', `The longest untreated route span is ${percent(coverage.longestUntreatedRatio)}.`, { actual: coverage.longestUntreatedRatio, target: LONGEST_UNTREATED_TARGET }));
  }
  for (const zone of zoneScores) {
    if (zone.coverageRatio < ZONE_COVERAGE_TARGET) {
      designReasons.push(reason('zone_coverage', `${zone.label} treatment covers only ${percent(zone.coverageRatio)}.`, { zoneId: zone.id, actual: zone.coverageRatio, target: ZONE_COVERAGE_TARGET }));
    }
    if (zone.familyCoverage.length < MINIMUM_ZONE_FAMILIES) {
      designReasons.push(reason('zone_family_balance', `${zone.label} uses ${zone.familyCoverage.length}/${MINIMUM_ZONE_FAMILIES} environmental families.`, { zoneId: zone.id, actual: zone.familyCoverage.length, target: MINIMUM_ZONE_FAMILIES }));
    }
    if (zone.requiresLandmark && zone.landmarkCount < 1) {
      designReasons.push(reason('zone_landmark', `${zone.label} has no readable landmark.`, { zoneId: zone.id, actual: 0, target: 1 }));
    }
  }
  const designScore = calculateDesignScore(routeQuality, coverage, zoneScores);
  const designGate = {
    pass: designReasons.length === 0,
    score: designScore,
    reasons: designReasons,
    routeQuality,
    boundaryQuality,
    coverage,
    zones: zoneScores
  };
  const nextAction = chooseNextAction(integrityGate, designGate);
  const criteriaMet = integrityGate.pass && designGate.pass && nextAction.kind === 'complete';
  const previousScore = Number(session?.latestEvaluation?.designGate?.score);
  const improvement = Number.isFinite(previousScore) ? round(designScore - previousScore, 2) : 0;
  const signature = criteriaMet
    ? 'integrity_and_design_pass'
    : [...integrityReasons, ...designReasons].slice(0, 5).map(item => `${item.code}${item.zoneId ? `:${item.zoneId}` : ''}`).join('|') || nextAction.kind;
  const summary = criteriaMet
    ? `Integrity and design quality pass at ${designScore}/100 across ${zoneScores.length} pacing zones.`
    : nextAction.kind === 'route_revision_required'
      ? `Integrity ${integrityGate.pass ? 'passes' : 'is incomplete'}; design is blocked because the authored route must be revised before decoration continues.`
      : `Design quality is ${designScore}/100; ${nextAction.summary}`;

  return normalizeMapForgeSpatialScorecard({
    contract: MAP_FORGE_SPATIAL_SCORECARD_CONTRACT,
    revision: document.revision,
    criteriaMet,
    improvement,
    signature,
    summary,
    integrityGate,
    designGate,
    nextAction,
    metrics: {
      createdCount: createdIds.length,
      familyCoverage,
      missingFamilies,
      missingReadbackIds,
      pathTileCount: pathTiles.length,
      pathClearanceViolations,
      spatialQuality: {
        score: designScore,
        routeCoverageRatio: coverage.ratio,
        longestUntreatedRatio: coverage.longestUntreatedRatio,
        routeBlocking: routeQuality.blocking,
        boundaryEnforcementStatus: boundaryQuality.enforcementStatus,
        weakestZoneId: nextAction.zoneId || null
      }
    }
  }, document.revision);
}

export function normalizeMapForgeSpatialScorecard(input, expectedRevision = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('map_forge_spatial_scorecard_object_required');
  if (input.contract !== MAP_FORGE_SPATIAL_SCORECARD_CONTRACT) throw new Error(`map_forge_spatial_scorecard_contract_invalid:${input.contract || 'missing'}`);
  const revision = integer(input.revision, 'scorecard_revision', 0, Number.MAX_SAFE_INTEGER);
  if (expectedRevision != null && revision !== expectedRevision) throw new Error(`map_forge_spatial_scorecard_revision_stale:${revision}:${expectedRevision}`);
  const integrityGate = normalizeGate(input.integrityGate, 'integrity');
  const designGate = normalizeDesignGate(input.designGate);
  const nextAction = normalizeNextAction(input.nextAction);
  const criteriaMet = input.criteriaMet === true;
  if (criteriaMet !== (integrityGate.pass && designGate.pass)) throw new Error('map_forge_spatial_scorecard_gate_mismatch');
  if (criteriaMet !== (nextAction.kind === 'complete')) throw new Error('map_forge_spatial_scorecard_completion_action_mismatch');
  if (nextAction.kind === 'route_revision_required' && designGate.routeQuality?.blocking !== true) throw new Error('map_forge_spatial_scorecard_route_blocker_mismatch');
  if (nextAction.kind === 'boundary_enforcement_required' && designGate.boundaryQuality?.pass !== false) throw new Error('map_forge_spatial_scorecard_boundary_blocker_mismatch');
  const normalized = {
    contract: MAP_FORGE_SPATIAL_SCORECARD_CONTRACT,
    revision,
    criteriaMet,
    improvement: boundedFinite(input.improvement, 'scorecard_improvement', -100000, 100000),
    signature: text(input.signature, 300) || null,
    summary: text(input.summary, 1000) || 'Spatial evaluation recorded.',
    integrityGate,
    designGate,
    nextAction,
    metrics: input.metrics && typeof input.metrics === 'object' && !Array.isArray(input.metrics) ? clone(input.metrics) : {}
  };
  if (JSON.stringify(normalized).length > 120000) throw new Error('map_forge_spatial_scorecard_too_large');
  return normalized;
}

export function observeAuthoredRoute(document, fallbackPathTiles = null) {
  assertDocument(document);
  const waypoints = document.playableSpace?.route?.waypoints;
  if (Array.isArray(waypoints) && waypoints.length >= 2) {
    const points = [pointValue(waypoints[0])];
    for (let index = 1; index < waypoints.length; index += 1) appendManhattanLine(points, pointValue(waypoints[index]));
    return { source: 'playable_space_waypoints', ordered: true, points, waypoints: waypoints.map(pointValue) };
  }
  const points = Array.isArray(fallbackPathTiles) && fallbackPathTiles.length ? fallbackPathTiles.map(pointValue) : collectPathTiles(document);
  return { source: 'terrain_path_tiles', ordered: false, points, waypoints: [] };
}

export function deriveTargetedStrokeCenters(document, plan, candidates) {
  if (!Array.isArray(candidates)) throw new Error('level_design_target_candidates_required');
  const start = boundedFinite(plan?.targetStartFraction ?? 0, 'target_start_fraction', 0, 1);
  const end = boundedFinite(plan?.targetEndFraction ?? 1, 'target_end_fraction', start, 1);
  if (start <= 0 && end >= 1) return candidates;
  const route = observeAuthoredRoute(document);
  if (!route.ordered || !route.points.length) throw new Error('level_design_target_route_observation_missing');
  return candidates.filter(candidate => {
    const nearest = nearestRoutePoint(candidate.x, candidate.y, route.points);
    const fraction = nearest.index / Math.max(1, route.points.length - 1);
    return fraction >= start && fraction <= end;
  });
}

function evaluateRouteQuality(document, route) {
  if (!route.ordered || route.waypoints.length < 2) {
    return {
      pass: false,
      blocking: true,
      score: 0,
      source: route.source,
      reasons: [reason('route_observation_missing', 'No ordered authored route is available for spatial assessment.', { severity: 'blocking' })],
      segmentCount: 0,
      longestStraightRun: null,
      longStraightFraction: null,
      repeatedLongRuns: null,
      turnCadencePer100Tiles: null
    };
  }
  const segments = [];
  for (let index = 1; index < route.waypoints.length; index += 1) {
    const from = route.waypoints[index - 1];
    const to = route.waypoints[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.abs(dx) + Math.abs(dy);
    if (!length) continue;
    segments.push({ length, axis: dx === 0 ? 'vertical' : 'horizontal', direction: dx === 0 ? Math.sign(dy) : Math.sign(dx) });
  }
  const totalLength = Math.max(1, segments.reduce((sum, segment) => sum + segment.length, 0));
  const longThreshold = Math.max(24, Math.floor(Math.max(document.width, document.height) * .42));
  const longSegments = segments.filter(segment => segment.length >= longThreshold);
  const longestStraightRun = Math.max(0, ...segments.map(segment => segment.length));
  const longStraightFraction = longSegments.reduce((sum, segment) => sum + segment.length, 0) / totalLength;
  const repeatedLongRuns = Math.max(
    longSegments.filter(segment => segment.axis === 'horizontal').length,
    longSegments.filter(segment => segment.axis === 'vertical').length
  );
  const turnCadencePer100Tiles = segments.length / totalLength * 100;
  const problems = [];
  if (longStraightFraction > .68 && repeatedLongRuns >= 4) {
    problems.push(reason('route_lawnmower_repetition', `${percent(longStraightFraction)} of the route repeats ${repeatedLongRuns} long parallel runs.`, { actual: longStraightFraction, target: .68, severity: 'blocking' }));
  }
  if (longestStraightRun > Math.max(document.width, document.height) * .7) {
    problems.push(reason('route_straight_run_monotony', `The longest uninterrupted run is ${longestStraightRun} tiles.`, { actual: longestStraightRun, target: Math.round(Math.max(document.width, document.height) * .7), severity: 'blocking' }));
  }
  if (turnCadencePer100Tiles < 2 && totalLength > 120) {
    problems.push(reason('route_turn_cadence', `The route changes direction only ${round(turnCadencePer100Tiles, 1)} times per 100 tiles.`, { actual: turnCadencePer100Tiles, target: 2 }));
  }
  const blocking = problems.some(item => item.severity === 'blocking');
  const score = clamp(Math.round(100 - longStraightFraction * 55 - Math.max(0, repeatedLongRuns - 2) * 7 - (turnCadencePer100Tiles < 2 ? 15 : 0)), 0, 100);
  return {
    pass: problems.length === 0,
    blocking,
    score,
    source: route.source,
    reasons: problems,
    segmentCount: segments.length,
    routeLengthTiles: totalLength + 1,
    longestStraightRun,
    longStraightFraction: round(longStraightFraction, 4),
    repeatedLongRuns,
    turnCadencePer100Tiles: round(turnCadencePer100Tiles, 2)
  };
}

function derivePacingZones(document, routePoints) {
  const beats = Array.isArray(document.playableSpace?.pacingBeats) && document.playableSpace.pacingBeats.length >= 2
    ? document.playableSpace.pacingBeats.map((beat, index) => ({
      id: text(beat.id, 120) || `zone_${index + 1}`,
      kind: text(beat.kind, 80) || `beat_${index + 1}`,
      label: text(beat.label, 160) || text(beat.kind, 80) || `Beat ${index + 1}`,
      atFraction: clamp(finite(beat.atFraction, index / Math.max(1, document.playableSpace.pacingBeats.length - 1)), 0, 1)
    })).sort((left, right) => left.atFraction - right.atFraction)
    : [
      { id: 'zone_arrival', kind: 'arrival', label: 'Arrival', atFraction: .08 },
      { id: 'zone_development', kind: 'development', label: 'Development', atFraction: .38 },
      { id: 'zone_climax', kind: 'climax', label: 'Climax', atFraction: .72 },
      { id: 'zone_exit', kind: 'exit', label: 'Exit', atFraction: .94 }
    ];
  return beats.map((beat, index) => {
    const previous = beats[index - 1];
    const next = beats[index + 1];
    const startFraction = index === 0 ? 0 : (previous.atFraction + beat.atFraction) / 2;
    const endFraction = index === beats.length - 1 ? 1 : (beat.atFraction + next.atFraction) / 2;
    return {
      ...beat,
      startFraction: round(startFraction, 4),
      endFraction: round(endFraction, 4),
      startIndex: Math.floor(startFraction * Math.max(0, routePoints.length - 1)),
      endIndex: Math.ceil(endFraction * Math.max(0, routePoints.length - 1))
    };
  });
}

function mapEnvironmentToRoute(records, routePoints, minimumClearance, routeWidth = 3) {
  const maximumDistance = Math.max(12, finite(routeWidth, 3) / 2 + 11);
  if (!routePoints.length) return [];
  return records.map(record => {
    const family = classifyFamily(record);
    if (!family || !Number.isFinite(Number(record.x)) || !Number.isFinite(Number(record.y))) return null;
    const nearest = nearestRoutePoint(Number(record.x), Number(record.y), routePoints);
    if (nearest.distance < minimumClearance || nearest.distance > maximumDistance) return null;
    return {
      id: String(record.id || ''),
      family,
      landmark: isLandmark(record, family),
      x: Number(record.x),
      y: Number(record.y),
      routeIndex: nearest.index,
      routeFraction: nearest.index / Math.max(1, routePoints.length - 1),
      distanceToRoute: round(nearest.distance, 2)
    };
  }).filter(Boolean);
}

function evaluateCoverage(routePoints, environment) {
  const binCount = clamp(Math.round(routePoints.length / 40), 8, 24);
  const coveredBins = new Set(environment.map(item => clamp(Math.floor(item.routeFraction * binCount), 0, binCount - 1)));
  const untreated = Array.from({ length: binCount }, (_, index) => !coveredBins.has(index));
  let current = 0;
  let longest = 0;
  for (const missing of untreated) {
    current = missing ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return {
    binCount,
    coveredBins: [...coveredBins].sort((a, b) => a - b),
    coveredCount: coveredBins.size,
    ratio: round(coveredBins.size / binCount, 4),
    longestUntreatedBins: longest,
    longestUntreatedRatio: round(longest / binCount, 4)
  };
}

function evaluateZone(zone, routePoints, environment, overallBinCount) {
  const members = environment.filter(item => item.routeFraction >= zone.startFraction && item.routeFraction <= zone.endFraction);
  const familyCounts = Object.fromEntries(REQUIRED_FAMILIES.map(family => [family, members.filter(item => item.family === family).length]));
  const familyCoverage = REQUIRED_FAMILIES.filter(family => familyCounts[family] > 0);
  const zoneBinCount = Math.max(2, Math.round((zone.endFraction - zone.startFraction) * overallBinCount));
  const covered = new Set(members.map(item => {
    const local = (item.routeFraction - zone.startFraction) / Math.max(.0001, zone.endFraction - zone.startFraction);
    return clamp(Math.floor(local * zoneBinCount), 0, zoneBinCount - 1);
  }));
  const routeSpan = Math.max(1, zone.endIndex - zone.startIndex + 1);
  const landmarkCount = members.filter(item => item.landmark).length;
  const requiresLandmark = ['encounter', 'climax'].includes(zone.kind);
  const coverageRatio = round(covered.size / zoneBinCount, 4);
  const score = Math.round(
    Math.min(1, coverageRatio / ZONE_COVERAGE_TARGET) * 55
    + Math.min(1, familyCoverage.length / MINIMUM_ZONE_FAMILIES) * 30
    + (!requiresLandmark || landmarkCount ? 15 : 0)
  );
  return {
    id: zone.id,
    kind: zone.kind,
    label: zone.label,
    startFraction: zone.startFraction,
    endFraction: zone.endFraction,
    routeSpanTiles: routeSpan,
    objectCount: members.length,
    densityPer100Tiles: round(members.length / routeSpan * 100, 2),
    familyCoverage,
    familyCounts,
    landmarkCount,
    requiresLandmark,
    coverageRatio,
    score,
    pass: coverageRatio >= ZONE_COVERAGE_TARGET
      && familyCoverage.length >= MINIMUM_ZONE_FAMILIES
      && (!requiresLandmark || landmarkCount > 0)
  };
}

function calculateDesignScore(routeQuality, coverage, zones) {
  const zoneAverage = zones.length ? zones.reduce((sum, zone) => sum + zone.score, 0) / zones.length : 0;
  const gapScore = Math.max(0, 1 - coverage.longestUntreatedRatio / Math.max(.01, LONGEST_UNTREATED_TARGET));
  return clamp(Math.round(
    routeQuality.score * .3
    + Math.min(1, coverage.ratio / ROUTE_COVERAGE_TARGET) * 30
    + gapScore * 10
    + zoneAverage * .3
  ), 0, 100);
}

function evaluateBoundaryQuality(document) {
  const boundaries = document.playableSpace?.boundaries;
  if (!boundaries) {
    return {
      pass: false,
      shortcutPolicy: 'unknown',
      style: 'unknown',
      enforcementStatus: 'missing',
      reasons: [reason('boundary_intent_missing', 'The playable envelope and shortcut policy have not been authored.', { severity: 'needs_work' })]
    };
  }
  const shortcutPolicy = String(boundaries.shortcutPolicy || 'controlled');
  const enforcementStatus = String(boundaries.enforcementStatus || 'pending_runtime_validation');
  const requiresEnforcement = shortcutPolicy !== 'open';
  const pass = !requiresEnforcement || enforcementStatus === 'runtime_verified';
  return {
    pass,
    shortcutPolicy,
    style: String(boundaries.style || 'mixed_natural'),
    enforcementStatus,
    corridorHalfWidthTiles: Number(boundaries.corridorHalfWidthTiles || 0),
    envelopeCount: Array.isArray(boundaries.envelope) ? boundaries.envelope.length : 0,
    reasons: pass ? [] : [reason('boundary_enforcement_unverified', `Shortcut policy is ${shortcutPolicy}, but runtime collision enforcement is still unverified.`, { severity: 'needs_work' })]
  };
}

function chooseNextAction(integrityGate, designGate) {
  if (designGate.routeQuality.blocking) {
    return {
      kind: 'route_revision_required',
      family: null,
      zoneId: null,
      zoneKind: null,
      startFraction: null,
      endFraction: null,
      summary: designGate.routeQuality.reasons[0]?.label || 'Revise the authored route before environmental decoration continues.'
    };
  }
  if (integrityGate.missingReadbackIds.length || integrityGate.pathClearanceViolations.length) {
    return {
      kind: 'repair_integrity',
      family: null,
      zoneId: null,
      zoneKind: null,
      startFraction: null,
      endFraction: null,
      summary: 'Pause for canonical readback or clearance repair before another brush batch.'
    };
  }
  if (integrityGate.pass && designGate.pass) {
    return { kind: 'complete', family: null, zoneId: null, zoneKind: null, startFraction: null, endFraction: null, summary: 'Both integrity and design-quality gates pass.' };
  }
  const remainingCompositionReasons = designGate.reasons.filter(item => !['boundary_enforcement_unverified', 'boundary_intent_missing'].includes(item.code));
  if (integrityGate.pass && remainingCompositionReasons.length === 0 && designGate.boundaryQuality?.pass === false) {
    return {
      kind: 'boundary_enforcement_required',
      family: null,
      zoneId: null,
      zoneKind: null,
      startFraction: null,
      endFraction: null,
      summary: 'Validate and enforce the authored shortcut policy through real runtime collision before completion.'
    };
  }
  const weakest = [...designGate.zones].sort((left, right) => left.score - right.score || left.startFraction - right.startFraction)[0];
  const missingOverall = integrityGate.missingFamilies[0];
  const landmarkFamily = weakest?.requiresLandmark && !weakest.landmarkCount ? 'geology' : null;
  const missingInZone = REQUIRED_FAMILIES.find(family => !weakest?.familyCoverage.includes(family));
  const leastUsed = weakest
    ? [...REQUIRED_FAMILIES].sort((left, right) => weakest.familyCounts[left] - weakest.familyCounts[right])[0]
    : REQUIRED_FAMILIES[0];
  const family = missingOverall || landmarkFamily || missingInZone || leastUsed;
  return {
    kind: missingOverall ? 'add_family' : 'strengthen_zone',
    family,
    zoneId: weakest?.id || null,
    zoneKind: weakest?.kind || null,
    startFraction: weakest?.startFraction ?? 0,
    endFraction: weakest?.endFraction ?? 1,
    summary: `${missingOverall ? `Add the missing ${family} layer in` : `Strengthen ${family} treatment through`} ${weakest?.label || 'the weakest route zone'}.`
  };
}

function normalizeGate(input, name) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`map_forge_spatial_scorecard_${name}_gate_required`);
  if (typeof input.pass !== 'boolean' || !Array.isArray(input.reasons)) throw new Error(`map_forge_spatial_scorecard_${name}_gate_shape_invalid`);
  return clone(input);
}

function normalizeDesignGate(input) {
  const gate = normalizeGate(input, 'design');
  gate.score = boundedFinite(gate.score, 'design_score', 0, 100);
  if (!gate.routeQuality || typeof gate.routeQuality !== 'object') throw new Error('map_forge_spatial_scorecard_route_quality_required');
  if (!Array.isArray(gate.reasons) || !Array.isArray(gate.zones)) throw new Error('map_forge_spatial_scorecard_design_detail_required');
  return gate;
}

function normalizeNextAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('map_forge_spatial_scorecard_next_action_required');
  const kind = text(input.kind, 80);
  if (!NEXT_ACTION_KINDS.has(kind)) throw new Error(`map_forge_spatial_scorecard_next_action_invalid:${kind || 'missing'}`);
  const family = input.family == null ? null : text(input.family, 80);
  if (family && !REQUIRED_FAMILIES.includes(family)) throw new Error(`map_forge_spatial_scorecard_family_invalid:${family}`);
  const startFraction = input.startFraction == null ? null : boundedFinite(input.startFraction, 'next_action_start_fraction', 0, 1);
  const endFraction = input.endFraction == null ? null : boundedFinite(input.endFraction, 'next_action_end_fraction', 0, 1);
  if (startFraction != null && endFraction != null && endFraction < startFraction) throw new Error('map_forge_spatial_scorecard_next_action_range_invalid');
  return {
    kind,
    family,
    zoneId: input.zoneId == null ? null : text(input.zoneId, 120),
    zoneKind: input.zoneKind == null ? null : text(input.zoneKind, 80),
    startFraction,
    endFraction,
    summary: text(input.summary, 500) || kind.replace(/_/g, ' ')
  };
}

function appendManhattanLine(points, target) {
  let current = points.at(-1);
  while (current.x !== target.x) {
    current = { x: current.x + Math.sign(target.x - current.x), y: current.y };
    points.push(current);
  }
  while (current.y !== target.y) {
    current = { x: current.x, y: current.y + Math.sign(target.y - current.y) };
    points.push(current);
  }
}

function nearestRoutePoint(x, y, points) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const distance = Math.hypot(x - points[index].x, y - points[index].y);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return { index: bestIndex, distance: bestDistance };
}

function collectPathTiles(document) {
  const result = [];
  for (let y = 0; y < document.height; y += 1) {
    for (let x = 0; x < document.width; x += 1) {
      if (document.tiles[y]?.[x] === 'dirt') result.push({ x, y });
    }
  }
  return result;
}

function classifyFamily(record) {
  if (record?.tree) return 'tree';
  if (record?.undergrowth) return 'undergrowth';
  if (record?.geology) return 'geology';
  const type = String(record?.type || '').toLowerCase();
  if (/tree|snag/.test(type)) return 'tree';
  if (/fern|shrub|bramble|undergrowth/.test(type)) return 'undergrowth';
  if (/rock|boulder|outcrop|geology/.test(type)) return 'geology';
  return null;
}

function isLandmark(record, family) {
  if (family === 'geology') return true;
  return /snag|fire_arrow|gate|ruin|shrine|landmark/i.test(String(record?.type || ''));
}

function distanceToPoints(x, y, points) {
  if (!points.length) return Number.POSITIVE_INFINITY;
  return nearestRoutePoint(x, y, points).distance;
}

function assertDocument(document) {
  if (!document || typeof document !== 'object' || !Number.isInteger(document.width) || !Number.isInteger(document.height) || !Array.isArray(document.tiles)) {
    throw new Error('map_forge_spatial_document_invalid');
  }
  integer(document.revision, 'document_revision', 0, Number.MAX_SAFE_INTEGER);
}

function reason(code, label, options = {}) {
  return {
    code,
    label,
    severity: options.severity || 'needs_work',
    zoneId: options.zoneId || null,
    actual: options.actual ?? null,
    target: options.target ?? null
  };
}

function pointValue(value) {
  return { x: finite(value?.x, 0), y: finite(value?.y, 0) };
}

function percent(value) {
  return `${Math.round(finite(value, 0) * 100)}%`;
}

function integer(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error(`${label}_invalid`);
  return number;
}

function boundedFinite(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label}_invalid`);
  return number;
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function text(value, limit) {
  return String(value ?? '').trim().slice(0, limit);
}

function round(value, digits = 0) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
