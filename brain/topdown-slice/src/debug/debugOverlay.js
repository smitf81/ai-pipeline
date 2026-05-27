import { getFieldValue } from '../world/fields.js';
import { TILE_SIZE } from '../world/tilemap.js';

export const FIELD_VISUALS = {
  cover: {
    label: 'Cover',
    color: [92, 225, 255],
    edge: [210, 246, 255],
    threshold: 0.26,
    haloAlpha: 0.18,
    bodyAlpha: 0.26,
    coreAlpha: 0.34,
    contourAlpha: 0.2
  },
  visibility: {
    label: 'Visibility',
    color: [255, 214, 69],
    edge: [255, 241, 178],
    threshold: 0.48,
    haloAlpha: 0.2,
    bodyAlpha: 0.28,
    coreAlpha: 0.36,
    contourAlpha: 0.22
  },
  traversal: {
    label: 'Traversal',
    color: [255, 116, 91],
    edge: [255, 205, 181],
    threshold: 0.32,
    haloAlpha: 0.2,
    bodyAlpha: 0.28,
    coreAlpha: 0.34,
    contourAlpha: 0.2
  },
  defensibility: {
    label: 'Defensibility',
    color: [151, 128, 255],
    edge: [229, 220, 255],
    threshold: 0.32,
    haloAlpha: 0.2,
    bodyAlpha: 0.3,
    coreAlpha: 0.42,
    contourAlpha: 0.24
  },
  reinforcement: {
    label: 'Reinforcement',
    color: [255, 171, 66],
    edge: [255, 226, 171],
    threshold: 0.06,
    haloAlpha: 0.18,
    bodyAlpha: 0.24,
    coreAlpha: 0.32,
    contourAlpha: 0.18
  },
  heat: {
    label: 'Heat',
    color: [255, 117, 64],
    edge: [255, 212, 176],
    threshold: 0.08,
    haloAlpha: 0.22,
    bodyAlpha: 0.3,
    coreAlpha: 0.4,
    contourAlpha: 0.24
  },
  moisture: {
    label: 'Moisture',
    color: [74, 201, 255],
    edge: [204, 244, 255],
    threshold: 0.08,
    haloAlpha: 0.18,
    bodyAlpha: 0.26,
    coreAlpha: 0.34,
    contourAlpha: 0.2
  },
  condensation: {
    label: 'Condensation',
    color: [214, 224, 232],
    edge: [247, 250, 255],
    threshold: 0.04,
    haloAlpha: 0.2,
    bodyAlpha: 0.28,
    coreAlpha: 0.38,
    contourAlpha: 0.24
  },
  clouds: {
    label: 'Clouds',
    color: [196, 208, 230],
    edge: [247, 250, 255],
    threshold: 0.05,
    haloAlpha: 0.24,
    bodyAlpha: 0.32,
    coreAlpha: 0.42,
    contourAlpha: 0.24
  },
  defensibilityPressure: {
    label: 'Def Pressure',
    color: [210, 108, 255],
    edge: [247, 218, 255],
    threshold: 0.2,
    haloAlpha: 0.22,
    bodyAlpha: 0.3,
    coreAlpha: 0.42,
    contourAlpha: 0.24
  },
  flowPressure: {
    label: 'Flow Pressure',
    color: [73, 232, 179],
    edge: [190, 255, 227],
    threshold: 0.18,
    haloAlpha: 0.2,
    bodyAlpha: 0.28,
    coreAlpha: 0.36,
    contourAlpha: 0.22
  },
  threat: {
    label: 'Threat',
    color: [255, 92, 74],
    edge: [255, 203, 186],
    threshold: 0.14,
    haloAlpha: 0.24,
    bodyAlpha: 0.32,
    coreAlpha: 0.42,
    contourAlpha: 0.24
  }
};
export const FIELD_LAYER_ORDER = [
  'cover',
  'defensibility',
  'visibility',
  'traversal',
  'reinforcement',
  'heat',
  'moisture',
  'condensation',
  'clouds',
  'defensibilityPressure',
  'flowPressure',
  'threat'
];
const OVERLAP_ACCENT = [247, 250, 255];

export function drawDebugOverlay(ctx, state) {
  if (!state.debugOverlay?.enabled) {
    return;
  }

  const overlayState = state.debugOverlay ?? {};
  const focusedField = overlayState.isolatedField ?? overlayState.selectedField ?? 'defensibility';
  const layers = getOverlayLayers(state, overlayState);

  if (layers.length === 0) {
    return;
  }

  ctx.save();
  layers
    .slice()
    .sort((left, right) => left.role === right.role ? 0 : left.role === 'secondary' ? -1 : 1)
    .forEach((layer) => {
      drawBlobLayer(ctx, layer, state.emergence?.frame ?? 0);
    });

  if (layers.length > 1) {
    drawOverlapAccents(ctx, layers);
  }
  ctx.restore();

  ctx.save();
  state.emergence?.intents?.forEach((intent) => {
    const [intentR, intentG, intentB] = FIELD_VISUALS[intent.type === 'flow'
      ? 'flowPressure'
      : intent.type === 'threat'
        ? 'threat'
        : 'defensibilityPressure'
    ].color;
    const isSelected = intent.id === state.debug?.selectedIntentId;

    const centerX = intent.position.x * TILE_SIZE + TILE_SIZE / 2;
    const centerY = intent.position.y * TILE_SIZE + TILE_SIZE / 2;

    ctx.fillStyle = `rgba(${intentR}, ${intentG}, ${intentB}, ${isSelected ? 0.95 : 0.8})`;
    ctx.fillRect(centerX - 4, centerY - 4, 8, 8);
    ctx.strokeStyle = isSelected ? '#f7fbff' : `rgba(${intentR}, ${intentG}, ${intentB}, 0.95)`;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(centerX - 5, centerY - 5, 10, 10);

    const label = formatIntentMarkerLabel(intent);
    const labelWidth = Math.max(32, label.length * 6 + 8);
    const labelX = centerX + 9;
    const labelY = centerY - 10;

    ctx.fillStyle = isSelected ? 'rgba(16, 21, 28, 0.9)' : 'rgba(16, 21, 28, 0.72)';
    ctx.fillRect(labelX, labelY, labelWidth, 13);
    ctx.strokeStyle = isSelected ? '#f7fbff' : `rgba(${intentR}, ${intentG}, ${intentB}, 0.8)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(labelX + 0.5, labelY + 0.5, labelWidth - 1, 12);
    ctx.fillStyle = isSelected ? '#f7fbff' : `rgba(${intentR}, ${intentG}, ${intentB}, 0.95)`;
    ctx.font = '10px monospace';
    ctx.fillText(label, labelX + 4, labelY + 9);
  });

  const legendLayers = layers.map((layer) => layer.name);
  const legendHeight = 58 + legendLayers.length * 14 + (state.emergence?.intents?.length ?? 0) * 14;
  ctx.fillStyle = '#000000bb';
  ctx.fillRect(8, 8, 258, legendHeight);
  ctx.strokeStyle = '#ffffff33';
  ctx.strokeRect(8, 8, 258, legendHeight);
  ctx.fillStyle = '#f7fbff';
  ctx.font = '12px monospace';
  ctx.fillText(`Focus: ${focusedField}`, 16, 24);
  ctx.fillStyle = '#c6d4e3';
  ctx.fillText(
    overlayState.mode === 'combined' ? 'Combined field view' : 'Isolated field view',
    16,
    38
  );
  ctx.fillText('Bright core = strongest | thin rim = edge', 16, 52);
  legendLayers.forEach((fieldName, index) => {
    const visual = FIELD_VISUALS[fieldName] ?? FIELD_VISUALS.cover;
    const top = 62 + index * 14;
    ctx.fillStyle = `rgba(${visual.color[0]}, ${visual.color[1]}, ${visual.color[2]}, ${fieldName === selectedFieldName ? 0.8 : 0.42})`;
    ctx.fillRect(16, top - 8, 10, 10);
    ctx.strokeStyle = `rgba(${visual.edge[0]}, ${visual.edge[1]}, ${visual.edge[2]}, 0.9)`;
    ctx.strokeRect(15.5, top - 8.5, 11, 11);
    ctx.fillStyle = fieldName === focusedField ? '#f7fbff' : '#c6d4e3';
    ctx.fillText(
      `${fieldName === focusedField ? '> ' : '  '}${visual.label}`,
      32,
      top
    );
  });

  ctx.fillStyle = '#f7fbff';
  state.emergence?.intents?.forEach((intent, index) => {
    const prefix = intent.id === state.debug?.selectedIntentId ? '> ' : '';
    ctx.fillText(`${prefix}${intent.type}: ${intent.id}`, 32, 76 + legendLayers.length * 14 + index * 14);
  });

  ctx.restore();
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getOverlayLayers(state, overlayState) {
  const focusedField = overlayState?.isolatedField ?? overlayState?.selectedField ?? 'defensibility';
  const mode = overlayState?.mode ?? 'isolated';
  const layerSettings = overlayState?.layers ?? {};

  const activeFields = mode === 'combined'
    ? FIELD_LAYER_ORDER.filter((fieldName) => layerSettings[fieldName]?.enabled !== false)
    : [focusedField].filter((fieldName) => layerSettings[fieldName]?.enabled !== false);

  return activeFields
    .map((fieldName) => ({
      name: fieldName,
      field: getSelectedField(state, fieldName),
      visual: FIELD_VISUALS[fieldName] ?? FIELD_VISUALS.cover,
      emphasis: clamp01(layerSettings[fieldName]?.opacity ?? 1),
      role: fieldName === focusedField || activeFields.length === 1 ? 'primary' : 'secondary'
    }))
    .filter((layer) => layer.field)
    .map((layer) => ({ ...layer, smoothed: blurField(layer.field) }))
    .sort((left, right) => left.role === right.role ? 0 : left.role === 'secondary' ? -1 : 1);
}

function drawBlobLayer(ctx, layer, frame) {
  const visual = layer.visual ?? FIELD_VISUALS[layer.name] ?? FIELD_VISUALS.cover;
  const smoothedValues = layer.smoothed ?? blurField(layer.field);
  const pulse = layer.role === 'primary' ? 0.96 + Math.sin(frame * 0.08) * 0.04 : 1;
  const [r, g, b] = visual.color;
  const [edgeR, edgeG, edgeB] = visual.edge;

  for (let y = 0; y < layer.field.height; y += 1) {
    for (let x = 0; x < layer.field.width; x += 1) {
      const smoothedValue = smoothedValues[y][x];
      if (smoothedValue <= visual.threshold) {
        continue;
      }

      const rawValue = clamp01(getFieldValue(layer.field, x, y) ?? 0);
      const intensity = clamp01((smoothedValue - visual.threshold) / (1 - visual.threshold));
      const boundaryStrength = getBoundaryStrength(smoothedValues, x, y, visual.threshold);
      const tileX = x * TILE_SIZE;
      const tileY = y * TILE_SIZE;
      const centerX = tileX + TILE_SIZE / 2;
      const centerY = tileY + TILE_SIZE / 2;
      const haloAlpha = layer.role === 'primary'
        ? (0.05 + intensity * visual.haloAlpha) * layer.emphasis
        : (0.025 + intensity * visual.haloAlpha * 0.55) * layer.emphasis;
      const bodyAlpha = layer.role === 'primary'
        ? (0.08 + intensity * visual.bodyAlpha) * layer.emphasis
        : (0.03 + intensity * visual.bodyAlpha * 0.42) * layer.emphasis;
      const coreAlpha = rawValue > visual.threshold + 0.12
        ? (0.06 + intensity * visual.coreAlpha) * layer.emphasis * pulse
        : 0;
      const gradient = ctx.createRadialGradient(
        centerX,
        centerY,
        TILE_SIZE * 0.14,
        centerX,
        centerY,
        TILE_SIZE * 0.94
      );

      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${bodyAlpha + coreAlpha * 0.45})`);
      gradient.addColorStop(0.58, `rgba(${r}, ${g}, ${b}, ${bodyAlpha})`);
      gradient.addColorStop(0.86, `rgba(${r}, ${g}, ${b}, ${haloAlpha})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(tileX - 3, tileY - 3, TILE_SIZE + 6, TILE_SIZE + 6);

      if (layer.role === 'primary') {
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bodyAlpha * 0.68})`;
        ctx.fillRect(tileX + 3, tileY + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }

      if (coreAlpha > 0) {
        ctx.fillStyle = `rgba(${edgeR}, ${edgeG}, ${edgeB}, ${coreAlpha})`;
        ctx.fillRect(tileX + 7, tileY + 7, TILE_SIZE - 14, TILE_SIZE - 14);
      }

      if (boundaryStrength > 0) {
        ctx.strokeStyle = `rgba(${edgeR}, ${edgeG}, ${edgeB}, ${(0.08 + boundaryStrength * visual.contourAlpha) * layer.emphasis})`;
        ctx.lineWidth = layer.role === 'primary' ? 1.4 : 1;
        ctx.strokeRect(tileX + 2.5, tileY + 2.5, TILE_SIZE - 5, TILE_SIZE - 5);
      }
    }
  }
}

function drawOverlapAccents(ctx, layers) {
  for (let y = 0; y < layers[0].field.height; y += 1) {
    for (let x = 0; x < layers[0].field.width; x += 1) {
      const overlappingLayers = layers.filter((layer) => {
        const visual = layer.visual ?? FIELD_VISUALS[layer.name] ?? FIELD_VISUALS.cover;
        const smoothedValue = layer.smoothed?.[y]?.[x] ?? 0;
        return smoothedValue > visual.threshold + 0.05;
      });

      if (overlappingLayers.length < 2) {
        continue;
      }

      const maxIntensity = Math.max(...overlappingLayers.map((layer) => {
        const visual = layer.visual ?? FIELD_VISUALS[layer.name] ?? FIELD_VISUALS.cover;
        const smoothedValue = layer.smoothed?.[y]?.[x] ?? 0;
        return clamp01((smoothedValue - visual.threshold) / (1 - visual.threshold));
      }));
      const tileX = x * TILE_SIZE;
      const tileY = y * TILE_SIZE;
      const alpha = 0.08 + maxIntensity * 0.14 + (overlappingLayers.length - 2) * 0.04;

      ctx.fillStyle = `rgba(${OVERLAP_ACCENT[0]}, ${OVERLAP_ACCENT[1]}, ${OVERLAP_ACCENT[2]}, ${alpha})`;
      ctx.fillRect(tileX + 11, tileY + 11, TILE_SIZE - 22, TILE_SIZE - 22);
    }
  }
}

function blurField(field) {
  const values = Array.from({ length: field.height }, () => Array.from({ length: field.width }, () => 0));

  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      let weightedSum = 0;
      let totalWeight = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sample = getFieldValue(field, x + dx, y + dy);
          if (sample == null) {
            continue;
          }

          const weight = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
          weightedSum += sample * weight;
          totalWeight += weight;
        }
      }

      values[y][x] = totalWeight === 0 ? 0 : weightedSum / totalWeight;
    }
  }

  return values;
}

function getBoundaryStrength(values, x, y, threshold) {
  const current = values?.[y]?.[x] ?? 0;
  if (current <= threshold) {
    return 0;
  }

  const neighbours = [
    values?.[y]?.[x - 1] ?? 0,
    values?.[y]?.[x + 1] ?? 0,
    values?.[y - 1]?.[x] ?? 0,
    values?.[y + 1]?.[x] ?? 0
  ];
  const outsideCount = neighbours.filter((value) => value <= threshold).length;
  return outsideCount / neighbours.length;
}

function formatIntentMarkerLabel(intent) {
  const label = String(intent.label ?? '').trim();
  return label ? label.slice(0, 14) : `${intent.type}@${intent.position.x},${intent.position.y}`;
}

function getSelectedField(state, selectedFieldName) {
  switch (selectedFieldName) {
    case 'defensibilityPressure':
      return state.emergence?.pressures?.defensibility;
    case 'flowPressure':
      return state.emergence?.pressures?.flow;
    case 'threat':
      return state.emergence?.pressures?.threat;
    default:
      return state.emergence?.fields?.[selectedFieldName];
  }
}
