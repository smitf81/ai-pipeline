import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';
import { parseWebGLColor, withAlpha } from './WebGLColor.js';

export const WEBGL_SCENE_OBJECT_VISIBILITY_MODE = 'webgl_sceneobject_presence_hysteresis_v0';

export function resolveSceneObjectVisibility(context, object, rawInfluence) {
  const influence = clamp01(rawInfluence);
  if (!context?.lightSpaceCulling?.enabled) {
    return {
      mode: 'lit_detail',
      rawInfluence: 1,
      presenceVisible: true,
      litDetailVisible: true,
      alpha: 1,
      held: false,
      fading: false
    };
  }

  const state = readVisibilityState(context, object);
  const budget = RENDER_BUDGETS.sceneObjectVisibility;
  const nowMs = readVisibilityClockMs(context);
  const stableInfluence = resolveStableInfluence(state, influence, nowMs, budget);
  const wasPresenceVisible = !!state.presenceVisible;
  const wasLitDetailVisible = !!state.litDetailVisible;
  const presenceByThreshold = stableInfluence >= budget.presenceEnter
    || (wasPresenceVisible && stableInfluence > budget.presenceExit);
  const litDetailVisible = stableInfluence >= budget.litDetailEnter
    || (wasLitDetailVisible && stableInfluence > budget.litDetailExit);

  if (presenceByThreshold) {
    state.lastPresenceMs = nowMs;
    state.presenceVisible = true;
  } else {
    state.presenceVisible = false;
  }
  state.litDetailVisible = litDetailVisible && presenceByThreshold;
  state.lastRawInfluence = influence;
  state.lastStableInfluence = stableInfluence;

  const sincePresenceMs = Math.max(0, nowMs - (state.lastPresenceMs ?? nowMs));
  const held = !presenceByThreshold && sincePresenceMs <= budget.holdMs;
  const fading = !presenceByThreshold
    && sincePresenceMs > budget.holdMs
    && sincePresenceMs <= budget.holdMs + budget.fadeMs;
  const fade01 = fading
    ? 1 - (sincePresenceMs - budget.holdMs) / Math.max(1, budget.fadeMs)
    : 1;
  const darkPresenceAlpha = Math.max(0, Math.min(0.5, budget.darkPresenceAlpha ?? 0));
  const darkPresenceVisible = darkPresenceAlpha > 0;
  const presenceVisible = presenceByThreshold || held || fading || darkPresenceVisible;
  const presenceAlpha = resolvePresenceAlpha(influence, fade01);
  const alpha = state.litDetailVisible
    ? resolveLitDetailAlpha(stableInfluence)
    : Math.max(darkPresenceAlpha, presenceAlpha);

  return {
    mode: state.litDetailVisible ? 'lit_detail' : (presenceByThreshold || held || fading ? 'presence_silhouette' : 'dark_presence_silhouette'),
    rawInfluence: influence,
    stableInfluence,
    presenceVisible,
    litDetailVisible: state.litDetailVisible,
    alpha,
    held,
    fading
  };
}

export function appendSceneObjectPresenceGeometry(object, alpha, rects, triangles) {
  const x = object.worldTileX;
  const y = object.worldTileY;
  const w = object.worldWidth;
  const h = object.worldHeight;
  const renderKind = object.render?.kind ?? object.type;
  const silhouette = parseWebGLColor(RENDER_BUDGETS.sceneObjectVisibility.shadowSilhouetteColour, [0, 0, 0, 1]);
  const ground = silhouette;
  const body = silhouette;
  const shadowAlpha = Math.min(0.28, alpha * 0.86);

  rects.push({
    x: x + w * 0.14,
    y: y + h * 0.76,
    w: w * 0.72,
    h: Math.max(1.4, h * 0.1),
    color: withAlpha(ground, shadowAlpha)
  });

  if (renderKind === 'ground_decal') {
    rects.push({
      x: x + w * 0.12,
      y: y + h * 0.38,
      w: w * 0.76,
      h: h * 0.28,
      color: withAlpha(body, alpha * 0.42)
    });
    return;
  }

  if (renderKind === 'procedural_geology') {
    addTriangle(triangles, x + w * 0.5, y + h * 0.16, x + w * 0.14, y + h * 0.72, x + w * 0.88, y + h * 0.7, body, alpha * 0.72);
    return;
  }

  if (renderKind === 'procedural_undergrowth') {
    addTriangle(triangles, x + w * 0.5, y + h * 0.16, x + w * 0.04, y + h * 0.84, x + w * 0.5, y + h * 0.7, body, alpha * 0.56);
    addTriangle(triangles, x + w * 0.5, y + h * 0.18, x + w * 0.5, y + h * 0.7, x + w * 0.96, y + h * 0.84, body, alpha * 0.52);
    return;
  }

  if (renderKind === 'fire_arrow' || renderKind === 'fire_arrow_cluster') {
    rects.push({
      x: x + w * 0.22,
      y: y + h * 0.44,
      w: w * 0.56,
      h: Math.max(1.2, h * 0.12),
      color: withAlpha(body, alpha * 0.5)
    });
    return;
  }

  addTriangle(triangles, x + w * 0.5, y + h * 0.06, x + w * 0.08, y + h * 0.78, x + w * 0.92, y + h * 0.78, body, alpha * 0.68);
  rects.push({
    x: x + w * 0.44,
    y: y + h * 0.46,
    w: Math.max(2, w * 0.12),
    h: h * 0.36,
    color: withAlpha(body, alpha * 0.5)
  });
}

function readVisibilityState(context, object) {
  if (!context.sceneObjectVisibilityStates) return {};
  const id = object.id ?? `${object.type}:${object.worldX}:${object.worldY}`;
  let state = context.sceneObjectVisibilityStates.get(id);
  if (!state) {
    state = { presenceVisible: false, litDetailVisible: false, lastPresenceMs: -Infinity, lastRawInfluence: 0, lastStableInfluence: 0, lastUpdateMs: 0 };
    context.sceneObjectVisibilityStates.set(id, state);
  }
  return state;
}

function readVisibilityClockMs(context) {
  if (Number.isFinite(context.renderTimeMs)) return context.renderTimeMs;
  return (context.renderFrame ?? 0) * 1000 / 60;
}

function resolvePresenceAlpha(influence, fade01) {
  const budget = RENDER_BUDGETS.sceneObjectVisibility;
  const t = clamp01(influence / Math.max(0.001, budget.presenceEnter));
  const eased = t * t * (3 - 2 * t);
  return (budget.presenceMinAlpha + (budget.presenceMaxAlpha - budget.presenceMinAlpha) * eased) * clamp01(fade01);
}

function resolveStableInfluence(state, influence, nowMs, budget) {
  const previous = clamp01(state.lastStableInfluence ?? state.lastRawInfluence ?? 0);
  const elapsedMs = Math.max(0, nowMs - (state.lastUpdateMs ?? nowMs));
  const decayPer100Ms = Math.max(0.1, Math.min(0.98, budget.influenceDecayPer100Ms ?? 0.68));
  const decayed = previous * Math.pow(decayPer100Ms, elapsedMs / 100);
  state.lastUpdateMs = nowMs;
  return Math.max(influence, decayed);
}

function resolveLitDetailAlpha(influence) {
  const budget = RENDER_BUDGETS.sceneObjectVisibility;
  const t = clamp01((influence - budget.litDetailExit) / Math.max(0.001, 1 - budget.litDetailExit));
  const eased = Math.sqrt(t);
  return budget.litDetailMinAlpha + (budget.litDetailMaxAlpha - budget.litDetailMinAlpha) * eased;
}

function addTriangle(triangles, ax, ay, bx, by, cx, cy, color, alpha) {
  triangles.push({ ax, ay, bx, by, cx, cy, color: withAlpha(color, alpha) });
}

export function stableSeed(value) {
  const text = String(value ?? 'flame');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295 * Math.PI * 2;
}

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
