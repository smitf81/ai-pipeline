import { createField, getFieldValue, sampleFieldAverage, setFieldValue } from '../world/fields.js';
import { aliasWorldPosition, createWorldPosition, withWorldPosition } from '../world/coordinates.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function createIntent({ id, type, x, y, z = 0, position = null, radius, weight = 1, label = '' }) {
  const intent = withWorldPosition({
    id,
    type,
    radius,
    weight,
    label: String(label ?? '').trim() || null
  }, position ?? { x, y, z });

  aliasWorldPosition(intent, 'center');
  return intent;
}

export function createDefensibilityIntent({ id, x, y, z = 0, position = null, radius, weight = 1, label = '' }) {
  return createIntent({ id, type: 'defensibility', x, y, z, position, radius, weight, label });
}

export function createFlowIntent({ id, x, y, z = 0, position = null, radius, weight = 1, label = '' }) {
  return createIntent({ id, type: 'flow', x, y, z, position, radius, weight, label });
}

export function createThreatIntent({ id, x, y, z = 0, position = null, radius, weight = 1, label = '' }) {
  return createIntent({ id, type: 'threat', x, y, z, position, radius, weight, label });
}

export function getIntentPosition(intent) {
  return createWorldPosition(intent.position ?? intent.center);
}

export function evaluateIntentPressure(intent, fields) {
  switch (intent.type) {
    case 'defensibility':
      return evaluateDefensibilityPressure(intent, fields);
    case 'flow':
      return evaluateFlowPressure(intent, fields);
    case 'threat':
      return evaluateThreatPressure(intent, fields);
    default:
      return createField(fields.cover.width, fields.cover.height, 0);
  }
}

function evaluateDefensibilityPressure(intent, fields) {
  const pressure = createField(fields.cover.width, fields.cover.height, 0);
  const position = getIntentPosition(intent);

  for (let y = 0; y < pressure.height; y += 1) {
    for (let x = 0; x < pressure.width; x += 1) {
      const dx = x - position.x;
      const dy = y - position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > intent.radius) {
        continue;
      }

      const radiusRatio = intent.radius === 0 ? 0 : distance / intent.radius;
      const reachBias = clamp01(1 - radiusRatio * 0.4);
      const standoffBias = clamp01(0.3 + (1 - Math.abs(radiusRatio - 0.65) / 0.65) * 0.7);

      const cover = getFieldValue(fields.cover, x, y) ?? 0;
      const visibility = getFieldValue(fields.visibility, x, y) ?? 0;
      const traversal = getFieldValue(fields.traversal, x, y) ?? 1;

      // Prototype seam: later slices can blend multiple intents here without touching
      // the task queue or worker execution contract.
      const value = intent.weight
        * reachBias
        * standoffBias
        * ((1 - cover) * 0.5 + visibility * 0.35 + (1 - traversal) * 0.15);

      setFieldValue(pressure, x, y, clamp01(value));
    }
  }

  return pressure;
}

function evaluateFlowPressure(intent, fields) {
  const pressure = createField(fields.cover.width, fields.cover.height, 0);
  const position = getIntentPosition(intent);

  for (let y = 0; y < pressure.height; y += 1) {
    for (let x = 0; x < pressure.width; x += 1) {
      const dx = x - position.x;
      const dy = y - position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > intent.radius) {
        continue;
      }

      const radiusRatio = intent.radius === 0 ? 0 : distance / intent.radius;
      const falloff = clamp01(1 - radiusRatio * 0.55);
      const traversal = getFieldValue(fields.traversal, x, y) ?? 1;
      const passability = clamp01(1 - traversal);
      const blockingDensity = sampleFieldAverage(fields.cover, [
        { x, y },
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 }
      ]);
      const visibility = getFieldValue(fields.visibility, x, y) ?? 0;

      // Flow stays local and heuristic-driven: it rewards cheap movement lanes and
      // only lightly discounts visibility so openness can still win when routes matter.
      const value = intent.weight
        * falloff
        * (passability * 0.65 + (1 - blockingDensity) * 0.25 + (1 - visibility) * 0.1);

      setFieldValue(pressure, x, y, clamp01(value));
    }
  }

  return pressure;
}

function evaluateThreatPressure(intent, fields) {
  const pressure = createField(fields.cover.width, fields.cover.height, 0);
  const position = getIntentPosition(intent);

  for (let y = 0; y < pressure.height; y += 1) {
    for (let x = 0; x < pressure.width; x += 1) {
      const dx = x - position.x;
      const dy = y - position.y;
      const distance = Math.hypot(dx, dy);

      if (distance > intent.radius) {
        continue;
      }

      const falloff = intent.radius === 0
        ? distance === 0 ? 1 : 0
        : clamp01(1 - distance / intent.radius);
      setFieldValue(pressure, x, y, clamp01(intent.weight * falloff));
    }
  }

  return pressure;
}
