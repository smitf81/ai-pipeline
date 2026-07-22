import { HUMANOID_TUNING_FIELDS } from '../humanoids/humanoidTuningFields.js';

export const CREATURE_TUNING_SCHEMA_VERSION = 'bsb.creatureTuning.v0';

export const WYVERN_TUNING_FIELDS = Object.freeze([
  field('visual.scale', 'Visual scale', 'Scale', 1, 2.2, 0.01),
  field('head.length', 'Head', 'Length', 0.46, 1.08, 0.01),
  field('head.width', 'Head', 'Width', 0.28, 0.72, 0.01),
  field('jaw.length', 'Jaw', 'Length', 0.24, 0.66, 0.01),
  field('jaw.width', 'Jaw', 'Width', 0.12, 0.4, 0.01),
  field('jaw.maxOpen', 'Jaw', 'Max open', 0.18, 0.82, 0.01),
  field('neck.chainLength', 'Neck', 'Length', 0.36, 1.12, 0.01),
  field('neck.width', 'Neck', 'Width', 0.18, 0.48, 0.01),
  field('neck.stiffness', 'Neck', 'Stiffness', 0.2, 0.95, 0.01),
  field('shoulders.width', 'Shoulders', 'Width', 0.82, 1.58, 0.01),
  field('shoulders.chestWidth', 'Shoulders', 'Chest width', 0.42, 1.36, 0.01),
  field('shoulders.chestLength', 'Shoulders', 'Chest length', 0.46, 1.02, 0.01),
  field('torso.length', 'Torso', 'Length', 0.64, 1.3, 0.01),
  field('torso.width', 'Torso', 'Width', 0.36, 1.04, 0.01),
  field('hips.width', 'Hips', 'Width', 0.42, 1.22, 0.01),
  field('hips.length', 'Hips', 'Length', 0.38, 0.86, 0.01),
  field('hips.haunchWidth', 'Hips', 'Haunch width', 0.18, 0.74, 0.01),
  field('hips.haunchLength', 'Hips', 'Haunch length', 0.26, 0.72, 0.01),
  field('hips.supportOffset', 'Hips', 'Support offset', 0.08, 0.46, 0.01),
  field('forelimb.shoulderAnchorWidth', 'Wing forelimb', 'Shoulder anchor', 0.42, 0.88, 0.01),
  field('forelimb.wristReach', 'Wing forelimb', 'Wrist reach', 1.02, 1.84, 0.01),
  field('hindLeg.hipWidth', 'Hind support', 'Hip width', 0.34, 0.74, 0.01),
  field('hindLeg.kneeOut', 'Hind support', 'Knee out', 0.2, 0.68, 0.01),
  field('hindLeg.ankleOut', 'Hind support', 'Ankle out', 0.46, 1.04, 0.01),
  field('hindLeg.footBack', 'Hind support', 'Foot back', 0.46, 1.08, 0.01),
  field('hindLeg.footRadius', 'Hind support', 'Foot radius', 0.12, 0.34, 0.01),
  field('hindLeg.footLength', 'Hind support', 'Foot length', 0.24, 0.68, 0.01),
  field('hindLeg.thighGirth', 'Hind support', 'Thigh girth', 0.16, 0.42, 0.01),
  field('hindLeg.shinGirth', 'Hind support', 'Shin girth', 0.1, 0.32, 0.01),
  field('tail.baseWidth', 'Tail', 'Base width', 0.36, 1.04, 0.01),
  field('tail.rootMass', 'Tail', 'Root mass', 0.28, 0.92, 0.01),
  field('tail.baseAnchorBack', 'Tail', 'Root anchor back', 0.12, 0.58, 0.01),
  field('tail.length', 'Tail', 'Length', 1.8, 4.4, 0.01),
  field('tail.renderWidthScale', 'Tail', 'Width scale', 0.7, 1.46, 0.01),
  field('tail.counterReach', 'Tail', 'Counter reach', 0.18, 0.76, 0.01),
  field('tail.gaitFollowThrough', 'Tail', 'Gait follow-through', 0.04, 0.46, 0.01),
  field('gait.hindStride', 'Gait', 'Hind stride', 0.08, 0.34, 0.01),
  field('gait.tailWave', 'Gait', 'Tail wave', 0.06, 0.38, 0.01),
  field('constraints.maxTailForward', 'Constraints', 'Tail reach limit', 0.22, 0.82, 0.01),
  field('constraints.maxTailBend', 'Constraints', 'Tail bend limit', 0.16, 0.64, 0.01),
  field('constraints.maxHindAnkleForward', 'Constraints', 'Hind ankle forward', 0.12, 0.48, 0.01)
]);

const FIELD_BY_PATH = new Map(WYVERN_TUNING_FIELDS.map((item) => [item.path, item]));
for (const item of HUMANOID_TUNING_FIELDS) {
  if (!FIELD_BY_PATH.has(item.path)) FIELD_BY_PATH.set(item.path, item);
}

export function createEmptyCreatureTuning() {
  return { schemaVersion: CREATURE_TUNING_SCHEMA_VERSION, profiles: {} };
}

export function normalizeCreatureTuning(payload, options = {}) {
  const issues = [];
  const source = payload && typeof payload === 'object' ? payload : {};
  const result = createEmptyCreatureTuning();
  const profiles = source.profiles && typeof source.profiles === 'object' ? source.profiles : {};
  for (const [profileId, values] of Object.entries(profiles)) {
    const cleanProfile = {};
    for (const [path, value] of collectNumericLeaves(values)) {
      const fieldDef = FIELD_BY_PATH.get(path);
      if (!fieldDef) {
        issues.push({ code: 'unknown_tuning_path', profileId, path });
        continue;
      }
      setAtPath(cleanProfile, path, clamp(value, fieldDef.min, fieldDef.max));
    }
    if (Object.keys(cleanProfile).length) result.profiles[profileId] = cleanProfile;
  }
  return {
    ok: !options.rejectUnknown || issues.length === 0,
    tuning: result,
    issues
  };
}

export function resolveCreatureProfile(baseProfile, tuning) {
  const resolved = cloneData(baseProfile);
  const normalized = normalizeCreatureTuning(tuning).tuning;
  const overrides = normalized.profiles?.[baseProfile.id] ?? {};
  for (const [path, value] of collectNumericLeaves(overrides)) setAtPath(resolved, path, value);
  return freezeDeep(resolved);
}

export function setCreatureTuningValue(tuning, profileId, path, value) {
  const fieldDef = FIELD_BY_PATH.get(path);
  if (!fieldDef) return { ok: false, reason: 'unknown_tuning_path', path };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return { ok: false, reason: 'invalid_tuning_value', path };
  const next = cloneData(normalizeCreatureTuning(tuning).tuning);
  if (!next.profiles[profileId]) next.profiles[profileId] = {};
  const clamped = clamp(numeric, fieldDef.min, fieldDef.max);
  setAtPath(next.profiles[profileId], path, clamped);
  return { ok: true, tuning: normalizeCreatureTuning(next).tuning, path, value: clamped };
}

export function getCreatureTuningFields() {
  return WYVERN_TUNING_FIELDS.map((item) => ({ ...item }));
}

export function getProfileOverrideValue(tuning, profileId, path) {
  return getAtPath(normalizeCreatureTuning(tuning).tuning.profiles?.[profileId], path);
}

export function listProfileOverridePaths(tuning, profileId) {
  const normalized = normalizeCreatureTuning(tuning).tuning;
  return collectNumericLeaves(normalized.profiles?.[profileId] ?? {}).map(([path]) => path).sort();
}

export function countProfileOverrides(tuning, profileId) {
  return listProfileOverridePaths(tuning, profileId).length;
}

function field(path, group, label, min, max, step) {
  return Object.freeze({ path, group, label, min, max, step });
}

function collectNumericLeaves(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'number' && Number.isFinite(child)) result.push([path, child]);
    else result.push(...collectNumericLeaves(child, path));
  }
  return result;
}

function setAtPath(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function getAtPath(target, path) {
  let cursor = target;
  for (const part of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cloneData(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}
