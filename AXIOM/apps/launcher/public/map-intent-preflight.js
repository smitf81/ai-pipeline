export const MAP_INTENT_PREFLIGHT_CONTRACT = 'axiom.map-intent-preflight.v1';
export const PLAYABLE_SPACE_BRIEF_CONTRACT = 'axiom.playable-space-brief.v1';
export const PLAYABLE_SPACE_PROFILE_CONTRACT = 'axiom.playable-space-profile.v1';

const MAP_ACTIONS = Object.freeze(['use_existing', 'edit_current', 'create_new']);
const BIOMES = Object.freeze(['forest', 'ash', 'grassland', 'rocky', 'wetland', 'mixed']);
const BEAT_KINDS = Object.freeze(['arrival', 'orientation', 'exploration', 'pressure', 'encounter', 'recovery', 'landmark', 'climax', 'exit']);
const ROUTE_DIRECTIONS = Object.freeze(['northbound', 'southbound', 'eastbound', 'westbound']);
const ROUTE_TOPOLOGIES = Object.freeze(['meander', 'braided', 'looped', 'processional']);
const SHORTCUT_POLICIES = Object.freeze(['prevent', 'controlled', 'open']);
const BOUNDARY_STYLES = Object.freeze(['dense_forest', 'rocky_ridge', 'water_edge', 'mixed_natural']);

export function buildMapIntentSystemPrompt(context = {}) {
  const catalogue = normalizeCatalogue(context.catalogue);
  const current = normalizeCurrentMap(context.currentMap, catalogue);
  return `You are AXIOM's Map Forge preflight planner. Interpret the user's natural-language level-design brief before any map mutation or brush work.

Choose exactly one map action:
- use_existing: the user names or clearly refers to one map in the supplied catalogue.
- edit_current: the user explicitly wants the currently active map and does not name another map.
- create_new: the user wants a new/additional map, region, level or playable space.

The catalogue is canonical. For use_existing or edit_current, targetCatalogueMapId MUST be one exact supplied id. Never treat a transition label on the current map as the current map. Never silently use the active map when another map is named.

Return one JSON object only, with no markdown and no hidden reasoning:
{"action":"use_existing","targetCatalogueMapId":"exact_id_or_null","newMapTitle":null,"playableMinutes":10,"biome":"forest","route":{"from":"southern arrival","to":"northern gate","direction":"northbound","topology":"meander","shortcutPolicy":"prevent","boundaryStyle":"mixed_natural"},"pacingBeats":[{"kind":"arrival","label":"read the route","atFraction":0.08,"lateralOffset":-0.25,"openness":0.7,"boundaryPressure":0.45,"landmarkIntent":"broken waystone"},{"kind":"encounter","label":"first pressure","atFraction":0.42,"lateralOffset":0.45,"openness":0.5,"boundaryPressure":0.75,"landmarkIntent":"burned watch tree"},{"kind":"climax","label":"threshold fight","atFraction":0.82,"lateralOffset":-0.35,"openness":0.85,"boundaryPressure":0.9,"landmarkIntent":"ash gate ridge"},{"kind":"exit","label":"reach the gate","atFraction":0.96,"lateralOffset":0.05,"openness":0.45,"boundaryPressure":0.8,"landmarkIntent":"gate silhouette"}],"requestedDimensions":{"width":null,"height":null},"summary":"one concise visible interpretation","rationale":"one concise reason"}

Rules:
- playableMinutes is a number from 1 to 30 only when duration is requested or strongly implied; otherwise null.
- biome must be one of: ${BIOMES.join(', ')}.
- route.from and route.to are short human-readable endpoint labels. When playable duration or pacing is requested, route.direction must be one of ${ROUTE_DIRECTIONS.join(', ')}, route.topology one of ${ROUTE_TOPOLOGIES.join(', ')}, route.shortcutPolicy one of ${SHORTCUT_POLICIES.join(', ')}, and route.boundaryStyle one of ${BOUNDARY_STYLES.join(', ')}.
- pacingBeats may be empty when no playable-space pacing is requested; otherwise provide 2-8 ordered beats using kinds: ${BEAT_KINDS.join(', ')}. Each requested pacing beat must include lateralOffset (-0.72 to 0.72), openness (0 to 1), boundaryPressure (0 to 1), and a short landmarkIntent. Vary lateralOffset so the route composes space rather than drawing parallel rows.
- requestedDimensions are both integers 16-256 only when the user explicitly requests dimensions; otherwise both null.
- create_new requires newMapTitle and targetCatalogueMapId null.
- Do not output coordinates, authoring paths, runtime ids or success claims.

Current map: ${JSON.stringify(current)}
Available maps: ${JSON.stringify(catalogue.maps.map(map => ({ id: map.id, title: map.title, runtimeMapId: map.runtimeMapId })))}`;
}

export function createMapIntentPreflight(input = {}) {
  const prompt = boundedText(input.prompt, 4000).trim();
  if (!prompt) throw new Error('map_intent_prompt_required');
  const catalogue = normalizeCatalogue(input.catalogue);
  const currentMap = normalizeCurrentMap(input.currentMap, catalogue);
  const profile = normalizePlayableSpaceProfile(input.profile);
  const interpreted = normalizeModelIntent(input.modelOutput, { catalogue, currentMap });
  const target = resolveTarget(interpreted, catalogue, currentMap);
  const playableSpace = compilePlayableSpaceBrief(interpreted, target, currentMap, profile);
  const modelInvocation = normalizeInvocation(input.modelInvocation);
  const id = safeIdentifier(input.id || `preflight_${Date.now()}_${stableHash(`${prompt}:${target.catalogueMapId}`)}`, 'preflight_id');
  return Object.freeze({
    contract: MAP_INTENT_PREFLIGHT_CONTRACT,
    id,
    status: 'ready',
    prompt,
    action: interpreted.action,
    summary: interpreted.summary,
    rationale: interpreted.rationale,
    previousMap: Object.freeze({
      catalogueMapId: currentMap.catalogueMapId,
      mapId: currentMap.mapId,
      title: currentMap.title,
      authoringPath: currentMap.authoringPath,
      revision: currentMap.revision
    }),
    target,
    playableSpace,
    modelInvocation,
    binding: Object.freeze({
      catalogueValidated: true,
      targetExists: interpreted.action !== 'create_new',
      targetMustMatchBeforeBrush: true,
      noActiveMapFallback: true
    }),
    createdAt: String(input.createdAt || new Date().toISOString())
  });
}

export function normalizePlayableSpaceProfile(source = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('playable_space_profile_missing');
  if (source.contract !== PLAYABLE_SPACE_PROFILE_CONTRACT) {
    throw new Error(`playable_space_profile_contract_invalid:${source.contract || 'missing'}`);
  }
  const limits = source.mapLimits || {};
  const minDimension = integer(limits.minDimension, 'profile_min_dimension', 16, 128);
  const maxDimension = integer(limits.maxDimension, 'profile_max_dimension', minDimension, 256);
  const defaultWidth = integer(limits.defaultWidth, 'profile_default_width', minDimension, maxDimension);
  const defaultHeight = integer(limits.defaultHeight, 'profile_default_height', minDimension, maxDimension);
  const routeWidthTiles = integer(source.route?.widthTiles, 'profile_route_width', 1, 9);
  const routeRowSpacingTiles = integer(source.route?.rowSpacingTiles, 'profile_route_spacing', routeWidthTiles + 2, 24);
  return Object.freeze({
    contract: PLAYABLE_SPACE_PROFILE_CONTRACT,
    classification: 'project_planning_profile',
    player: Object.freeze({
      movementSpeedTilesPerSecond: number(source.player?.movementSpeedTilesPerSecond, 'profile_player_speed', .1, 30),
      sourcePath: boundedText(source.player?.sourcePath, 500).trim(),
      sourceSymbol: boundedText(source.player?.sourceSymbol, 300).trim()
    }),
    pacing: Object.freeze({
      traversalShare: number(source.pacing?.traversalShare, 'profile_traversal_share', .05, .95)
    }),
    route: Object.freeze({
      widthTiles: routeWidthTiles,
      rowSpacingTiles: routeRowSpacingTiles,
      areaShare: number(source.route?.areaShare, 'profile_route_area_share', .03, .6)
    }),
    mapLimits: Object.freeze({ minDimension, maxDimension, defaultWidth, defaultHeight }),
    assumptions: Object.freeze((Array.isArray(source.assumptions) ? source.assumptions : []).map((value) => boundedText(value, 500).trim()).filter(Boolean).slice(0, 12))
  });
}

export function normalizeModelIntent(value, context = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('map_intent_model_object_required');
  const action = String(value.action || '').trim();
  if (!MAP_ACTIONS.includes(action)) throw new Error(`map_intent_action_invalid:${action || 'missing'}`);
  const targetCatalogueMapId = value.targetCatalogueMapId == null ? null : safeIdentifier(value.targetCatalogueMapId, 'target_catalogue_map_id');
  const newMapTitle = value.newMapTitle == null ? null : boundedText(value.newMapTitle, 160).trim();
  if (action === 'create_new') {
    if (!newMapTitle) throw new Error('map_intent_new_map_title_required');
    if (targetCatalogueMapId) throw new Error('map_intent_new_map_target_must_be_null');
  } else {
    if (!targetCatalogueMapId) throw new Error('map_intent_existing_target_required');
    const catalogue = normalizeCatalogue(context.catalogue);
    if (!catalogue.maps.some(map => map.id === targetCatalogueMapId)) throw new Error(`map_intent_catalogue_target_missing:${targetCatalogueMapId}`);
    if (action === 'edit_current' && targetCatalogueMapId !== context.currentMap?.catalogueMapId) {
      throw new Error(`map_intent_edit_current_mismatch:${targetCatalogueMapId}:${context.currentMap?.catalogueMapId || 'missing'}`);
    }
  }
  const playableMinutes = value.playableMinutes == null ? null : number(value.playableMinutes, 'playable_minutes', 1, 30);
  const biome = String(value.biome || '').trim().toLowerCase();
  if (!BIOMES.includes(biome)) throw new Error(`map_intent_biome_invalid:${biome || 'missing'}`);
  const route = value.route && typeof value.route === 'object' && !Array.isArray(value.route) ? value.route : {};
  const from = boundedText(route.from, 120).trim() || 'arrival';
  const to = boundedText(route.to, 120).trim() || 'destination';
  const pacingBeats = normalizePacingBeats(value.pacingBeats, playableMinutes);
  const routeDesignRequired = playableMinutes != null || pacingBeats.length > 0;
  const direction = normalizeChoice(route.direction, ROUTE_DIRECTIONS, 'route_direction', routeDesignRequired, 'northbound');
  const topology = normalizeChoice(route.topology, ROUTE_TOPOLOGIES, 'route_topology', routeDesignRequired, 'meander');
  const shortcutPolicy = normalizeChoice(route.shortcutPolicy, SHORTCUT_POLICIES, 'route_shortcut_policy', routeDesignRequired, 'controlled');
  const boundaryStyle = normalizeChoice(route.boundaryStyle, BOUNDARY_STYLES, 'route_boundary_style', routeDesignRequired, 'mixed_natural');
  const requestedDimensions = normalizeRequestedDimensions(value.requestedDimensions);
  const summary = boundedText(value.summary, 240).trim();
  const rationale = boundedText(value.rationale, 360).trim();
  if (!summary || !rationale) throw new Error('map_intent_summary_required');
  return Object.freeze({
    action,
    targetCatalogueMapId,
    newMapTitle,
    playableMinutes,
    biome,
    route: Object.freeze({ from, to, direction, topology, shortcutPolicy, boundaryStyle }),
    pacingBeats,
    requestedDimensions,
    summary,
    rationale
  });
}

export function compilePlayableSpaceBrief(intent, target, currentMap, profile) {
  const durationRequested = intent.playableMinutes != null;
  const explicitDimensions = intent.requestedDimensions.width != null;
  const needsRouteSetup = intent.action === 'create_new' || durationRequested || intent.pacingBeats.length > 0 || explicitDimensions;
  const existingWidth = target.exists ? target.width : 0;
  const existingHeight = target.exists ? target.height : 0;
  const estimate = durationRequested
    ? estimateDimensionsForDuration(intent.playableMinutes, profile)
    : { width: profile.mapLimits.defaultWidth, height: profile.mapLimits.defaultHeight, targetRouteTiles: null, traversalSeconds: null };
  const requestedWidth = explicitDimensions ? intent.requestedDimensions.width : estimate.width;
  const requestedHeight = explicitDimensions ? intent.requestedDimensions.height : estimate.height;
  const width = needsRouteSetup ? Math.max(existingWidth, requestedWidth) : existingWidth;
  const height = needsRouteSetup ? Math.max(existingHeight, requestedHeight) : existingHeight;
  if (width > profile.mapLimits.maxDimension || height > profile.mapLimits.maxDimension) throw new Error(`playable_space_dimensions_exceed_mapforge:${width}x${height}`);
  const targetRouteTiles = durationRequested
    ? estimate.targetRouteTiles
    : needsRouteSetup ? Math.max(24, Math.round((width + height) * .72)) : null;
  if (needsRouteSetup && targetRouteTiles > routeCapacity(width, height, profile.route.rowSpacingTiles)) {
    throw new Error(`playable_space_route_capacity_insufficient:${targetRouteTiles}:${width}x${height}`);
  }
  return Object.freeze({
    contract: PLAYABLE_SPACE_BRIEF_CONTRACT,
    classification: 'planning_estimate',
    requestedMinutes: intent.playableMinutes,
    biome: intent.biome,
    route: Object.freeze({
      from: intent.route.from,
      to: intent.route.to,
      direction: intent.route.direction,
      topology: intent.route.topology,
      shortcutPolicy: intent.route.shortcutPolicy,
      boundaryStyle: intent.route.boundaryStyle,
      targetLengthTiles: targetRouteTiles,
      widthTiles: profile.route.widthTiles,
      rowSpacingTiles: profile.route.rowSpacingTiles
    }),
    pacingBeats: intent.pacingBeats,
    boundaryIntent: Object.freeze({
      contract: 'axiom.playable-boundary-intent.v1',
      classification: 'authoring_intent',
      shortcutPolicy: intent.route.shortcutPolicy,
      style: intent.route.boundaryStyle,
      enforcementStatus: 'pending_runtime_validation'
    }),
    dimensions: Object.freeze({
      before: target.exists ? Object.freeze({ width: existingWidth, height: existingHeight }) : null,
      target: Object.freeze({ width, height }),
      source: explicitDimensions ? 'user_requested' : durationRequested ? 'duration_estimate' : intent.action === 'create_new' ? 'project_default' : 'unchanged'
    }),
    estimate: Object.freeze({
      traversalSeconds: durationRequested ? estimate.traversalSeconds : null,
      movementSpeedTilesPerSecond: profile.player.movementSpeedTilesPerSecond,
      traversalShare: profile.pacing.traversalShare,
      movementSource: [profile.player.sourcePath, profile.player.sourceSymbol].filter(Boolean).join('#') || null,
      assumptions: profile.assumptions
    }),
    requiresPreparation: needsRouteSetup,
    automaticSave: false,
    automaticBake: false
  });
}

export function estimateDimensionsForDuration(minutes, profileInput) {
  const profile = profileInput.contract === PLAYABLE_SPACE_PROFILE_CONTRACT ? profileInput : normalizePlayableSpaceProfile(profileInput);
  const traversalSeconds = Math.round(number(minutes, 'playable_minutes', 1, 30) * 60 * profile.pacing.traversalShare);
  const targetRouteTiles = Math.max(24, Math.round(traversalSeconds * profile.player.movementSpeedTilesPerSecond));
  const routeArea = targetRouteTiles * profile.route.widthTiles / profile.route.areaShare;
  const aspect = 1.4;
  let height = Math.ceil(Math.sqrt(routeArea / aspect));
  let width = Math.ceil(height * aspect);
  width = clamp(roundUpEven(width), profile.mapLimits.minDimension, profile.mapLimits.maxDimension);
  height = clamp(roundUpEven(height), profile.mapLimits.minDimension, profile.mapLimits.maxDimension);
  return Object.freeze({ width, height, targetRouteTiles, traversalSeconds });
}

export function parseMapIntentJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('map_intent_model_json_missing');
  return JSON.parse(text.slice(start, end + 1));
}

function resolveTarget(intent, catalogue, currentMap) {
  if (intent.action !== 'create_new') {
    const map = catalogue.maps.find(candidate => candidate.id === intent.targetCatalogueMapId);
    return Object.freeze({
      status: 'resolved_existing', exists: true, catalogueMapId: map.id, title: map.title,
      mapId: map.runtimeMapId, scenarioId: map.scenarioId, authoringPath: map.authoringPath,
      runtimePath: map.runtimePath, width: map.width, height: map.height,
      changedFromActive: map.id !== currentMap.catalogueMapId
    });
  }
  const catalogueMapId = uniqueSlug(intent.newMapTitle, catalogue.maps.map(map => map.id));
  const runtimeMapId = `axiom_${catalogueMapId}`;
  return Object.freeze({
    status: 'planned_new', exists: false, catalogueMapId, title: intent.newMapTitle,
    mapId: runtimeMapId, scenarioId: currentMap.scenarioId,
    authoringPath: `data/bsb-v2/maps/${catalogueMapId}.authoring.json`,
    runtimePath: `/data/maps/${runtimeMapId.replace(/_/g, '-')}.runtime-map.json`,
    width: 0, height: 0, changedFromActive: true
  });
}

function normalizeCatalogue(source = {}) {
  if (!source || typeof source !== 'object' || !Array.isArray(source.maps) || !source.maps.length) throw new Error('map_intent_catalogue_missing');
  return {
    defaultMapId: String(source.defaultMapId || ''),
    maps: source.maps.map((map, index) => ({
      id: safeIdentifier(map.id, `catalogue_${index}_id`),
      title: boundedText(map.title, 200).trim(),
      runtimeMapId: safeIdentifier(map.runtimeMapId, `catalogue_${index}_runtime_id`),
      scenarioId: safeIdentifier(map.scenarioId, `catalogue_${index}_scenario_id`),
      authoringPath: boundedText(map.authoringPath, 1000).trim(),
      runtimePath: boundedText(map.runtimePath, 1000).trim(),
      width: map.width == null ? 4 : integer(map.width, `catalogue_${index}_width`, 4, 256),
      height: map.height == null ? 4 : integer(map.height, `catalogue_${index}_height`, 4, 256)
    }))
  };
}

function normalizeCurrentMap(source = {}, catalogue) {
  const catalogueMapId = safeIdentifier(source.catalogueMapId, 'current_catalogue_map_id');
  const catalogueMap = catalogue.maps.find(map => map.id === catalogueMapId);
  if (!catalogueMap) throw new Error(`map_intent_current_catalogue_missing:${catalogueMapId}`);
  const mapId = safeIdentifier(source.mapId, 'current_map_id');
  if (mapId !== catalogueMap.runtimeMapId) throw new Error(`map_intent_current_runtime_mismatch:${mapId}:${catalogueMap.runtimeMapId}`);
  return {
    catalogueMapId, mapId, title: boundedText(source.title || catalogueMap.title, 200).trim(),
    scenarioId: safeIdentifier(source.scenarioId || catalogueMap.scenarioId, 'current_scenario_id'),
    authoringPath: boundedText(source.authoringPath || catalogueMap.authoringPath, 1000).trim(),
    revision: integer(source.revision, 'current_revision', 0, Number.MAX_SAFE_INTEGER),
    width: integer(source.width, 'current_width', 4, 256), height: integer(source.height, 'current_height', 4, 256)
  };
}

function normalizePacingBeats(values, playableMinutes) {
  if (!Array.isArray(values)) throw new Error('map_intent_pacing_beats_array_required');
  if (playableMinutes != null && (values.length < 2 || values.length > 8)) throw new Error('map_intent_pacing_beats_required');
  if (values.length > 8) throw new Error('map_intent_pacing_beats_too_many');
  let previous = -1;
  return Object.freeze(values.map((beat, index) => {
    const kind = String(beat?.kind || '').trim();
    if (!BEAT_KINDS.includes(kind)) throw new Error(`map_intent_pacing_beat_kind_invalid:${index}:${kind || 'missing'}`);
    const label = boundedText(beat?.label, 160).trim();
    const atFraction = number(beat?.atFraction, `pacing_beat_fraction_${index}`, 0, 1);
    if (!label) throw new Error(`map_intent_pacing_beat_label_missing:${index}`);
    if (atFraction <= previous) throw new Error(`map_intent_pacing_beat_order_invalid:${index}`);
    previous = atFraction;
    const designRequired = playableMinutes != null;
    const lateralOffset = designRequired
      ? number(beat?.lateralOffset, `pacing_beat_lateral_${index}`, -.72, .72)
      : number(beat?.lateralOffset ?? 0, `pacing_beat_lateral_${index}`, -.72, .72);
    const openness = designRequired
      ? number(beat?.openness, `pacing_beat_openness_${index}`, 0, 1)
      : number(beat?.openness ?? .5, `pacing_beat_openness_${index}`, 0, 1);
    const boundaryPressure = designRequired
      ? number(beat?.boundaryPressure, `pacing_beat_boundary_pressure_${index}`, 0, 1)
      : number(beat?.boundaryPressure ?? .5, `pacing_beat_boundary_pressure_${index}`, 0, 1);
    const landmarkIntent = boundedText(beat?.landmarkIntent, 160).trim();
    if (designRequired && !landmarkIntent) throw new Error(`map_intent_pacing_beat_landmark_missing:${index}`);
    return Object.freeze({ kind, label, atFraction, lateralOffset, openness, boundaryPressure, landmarkIntent: landmarkIntent || label });
  }));
}

function normalizeChoice(value, allowed, label, required, fallback) {
  const result = String(value ?? '').trim();
  if (!result && !required) return fallback;
  if (!allowed.includes(result)) throw new Error(`map_intent_${label}_invalid:${result || 'missing'}`);
  return result;
}

function normalizeRequestedDimensions(value) {
  if (value == null) return Object.freeze({ width: null, height: null });
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('map_intent_dimensions_object_required');
  const bothNull = value.width == null && value.height == null;
  if (bothNull) return Object.freeze({ width: null, height: null });
  if (value.width == null || value.height == null) throw new Error('map_intent_dimensions_pair_required');
  return Object.freeze({ width: integer(value.width, 'requested_width', 16, 256), height: integer(value.height, 'requested_height', 16, 256) });
}

function normalizeInvocation(value = {}) {
  const model = boundedText(value.model, 300).trim();
  if (!model) throw new Error('map_intent_model_identity_required');
  return Object.freeze({
    id: safeIdentifier(value.id || `model_preflight_${Date.now()}`, 'preflight_model_invocation_id'),
    model,
    requestedFamily: null,
    ok: true,
    repair: value.repair === true,
    responseSummary: boundedText(value.responseSummary, 500).trim() || 'Map intent preflight resolved.',
    plan: null,
    invokedAt: String(value.invokedAt || new Date().toISOString()),
    purpose: 'map_intent_preflight'
  });
}

function routeCapacity(width, height, rowSpacing) {
  const usableWidth = Math.max(1, width - 8);
  const runs = Math.max(1, Math.floor((height - 8) / rowSpacing) + 1);
  return usableWidth * runs + rowSpacing * Math.max(0, runs - 1);
}

function uniqueSlug(title, existingIds) {
  const base = String(title || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'new_map';
  let value = base;
  let suffix = 2;
  const used = new Set(existingIds);
  while (used.has(value)) value = `${base}_${suffix++}`;
  return safeIdentifier(value, 'new_catalogue_map_id');
}

function safeIdentifier(value, label) {
  const result = boundedText(value, 240).trim();
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(result)) throw new Error(`map_intent_identifier_invalid:${label}`);
  return result;
}

function integer(value, label, min, max) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`map_intent_integer_invalid:${label}`);
  return result;
}

function number(value, label, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`map_intent_number_invalid:${label}`);
  return result;
}

function boundedText(value, limit) {
  const result = String(value ?? '');
  return result.length > limit ? result.slice(0, limit) : result;
}

function roundUpEven(value) { const number = Math.ceil(value); return number % 2 ? number + 1 : number; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}
