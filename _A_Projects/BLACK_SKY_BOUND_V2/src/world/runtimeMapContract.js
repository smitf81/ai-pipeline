export const RUNTIME_MAP_CONTRACT = 'black-sky-bound.runtime-map.v0';

// Passive interchange shape for maps baked outside BSB. Runtime loaders may
// validate this contract later; this module deliberately owns no authoring,
// storage, conversion, or UI behaviour.
export const RUNTIME_MAP_REQUIRED_FIELDS = Object.freeze([
  'contract',
  'id',
  'scenarioId',
  'width',
  'height',
  'tiles',
  'revision',
  'spawn',
  'escapeZone',
  'sceneObjects'
]);

export const RUNTIME_MAP_OPTIONAL_FIELDS = Object.freeze([
  'title',
  'enemySpawns',
  'unitPlacements',
  'unitSpawners',
  'transitions',
  'sceneSequences',
  'arena'
]);

export const RUNTIME_MAP_AUTHORING_FIELDS = Object.freeze([
  'editorState',
  'sceneDocument',
  'savedScenes',
  'selection',
  'brush',
  'lastResize'
]);
