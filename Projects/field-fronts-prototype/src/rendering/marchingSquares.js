const DEFAULT_THRESHOLD = 0.5;
const WATER_TERRAIN_IDS = new Set(['sea', 'river']);

const EDGE_NAMES = Object.freeze({
  TOP: 'top',
  RIGHT: 'right',
  BOTTOM: 'bottom',
  LEFT: 'left'
});

const CASE_EDGE_PAIRS = Object.freeze({
  0: [],
  1: [[EDGE_NAMES.LEFT, EDGE_NAMES.TOP]],
  2: [[EDGE_NAMES.TOP, EDGE_NAMES.RIGHT]],
  3: [[EDGE_NAMES.LEFT, EDGE_NAMES.RIGHT]],
  4: [[EDGE_NAMES.RIGHT, EDGE_NAMES.BOTTOM]],
  5: 'saddle-5',
  6: [[EDGE_NAMES.TOP, EDGE_NAMES.BOTTOM]],
  7: [[EDGE_NAMES.LEFT, EDGE_NAMES.BOTTOM]],
  8: [[EDGE_NAMES.BOTTOM, EDGE_NAMES.LEFT]],
  9: [[EDGE_NAMES.TOP, EDGE_NAMES.BOTTOM]],
  10: 'saddle-10',
  11: [[EDGE_NAMES.RIGHT, EDGE_NAMES.BOTTOM]],
  12: [[EDGE_NAMES.LEFT, EDGE_NAMES.RIGHT]],
  13: [[EDGE_NAMES.TOP, EDGE_NAMES.RIGHT]],
  14: [[EDGE_NAMES.LEFT, EDGE_NAMES.TOP]],
  15: []
});

export function buildLandWaterContourProjection(map, options = {}) {
  const field = buildLandWaterScalarField(map, options);
  const segments = marchingSquaresSegments(field, options.threshold ?? DEFAULT_THRESHOLD, options);
  const paths = buildContourPaths(segments);
  const smoothIterations = Number.isInteger(options.smoothIterations) ? Math.max(0, options.smoothIterations) : 1;
  const smoothedPaths = smoothIterations > 0
    ? paths.map((path) => smoothContourPath(path, smoothIterations))
    : paths;

  return {
    source: 'marching_squares_land_water_projection',
    classification: 'derived_visual_projection',
    threshold: options.threshold ?? DEFAULT_THRESHOLD,
    field,
    segments,
    paths,
    smoothedPaths,
    segmentCount: segments.length,
    pathCount: paths.length
  };
}

export function buildLandWaterScalarField(map, options = {}) {
  const waterTerrainIds = new Set(options.waterTerrainIds ?? WATER_TERRAIN_IDS);
  const width = Math.max(0, Number(map?.width) || 0);
  const height = Math.max(0, Number(map?.height) || 0);
  const values = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const terrainId = map?.tiles?.[y]?.[x];
      return waterTerrainIds.has(terrainId) ? 0 : 1;
    })
  );
  return {
    source: 'tile_mask_land_water',
    width,
    height,
    threshold: options.threshold ?? DEFAULT_THRESHOLD,
    values
  };
}

export function marchingSquaresSegments(field, threshold = DEFAULT_THRESHOLD, options = {}) {
  if (!field?.values || field.width < 2 || field.height < 2) {
    return [];
  }
  const segments = [];
  for (let y = 0; y < field.height - 1; y += 1) {
    for (let x = 0; x < field.width - 1; x += 1) {
      const corners = createCellCorners(field, x, y);
      const caseIndex = getCaseIndex(corners, threshold);
      const pairs = getCaseEdgePairs(caseIndex, corners, threshold, options);
      if (pairs.length === 0) {
        continue;
      }
      const edgePoints = createEdgePoints(corners, threshold);
      pairs.forEach(([startEdge, endEdge]) => {
        const start = edgePoints[startEdge];
        const end = edgePoints[endEdge];
        if (!start || !end || pointDistance(start, end) <= 0.0001) {
          return;
        }
        segments.push({
          start,
          end,
          caseIndex,
          threshold,
          cell: { x, y }
        });
      });
    }
  }
  return segments;
}

export function buildContourPaths(segments = []) {
  const remaining = segments.map((segment, index) => ({ ...segment, index }));
  const paths = [];

  while (remaining.length > 0) {
    const seed = remaining.shift();
    const path = [clonePoint(seed.start), clonePoint(seed.end)];
    let changed = true;

    while (changed) {
      changed = false;
      const tail = path[path.length - 1];
      const head = path[0];
      const tailMatch = findConnectingSegment(remaining, tail);
      if (tailMatch) {
        remaining.splice(tailMatch.index, 1);
        path.push(clonePoint(tailMatch.reverse ? tailMatch.segment.start : tailMatch.segment.end));
        changed = true;
        continue;
      }
      const headMatch = findConnectingSegment(remaining, head);
      if (headMatch) {
        remaining.splice(headMatch.index, 1);
        path.unshift(clonePoint(headMatch.reverse ? headMatch.segment.end : headMatch.segment.start));
        changed = true;
      }
    }

    paths.push(closePathIfNeeded(dedupeConsecutivePoints(path)));
  }

  return paths.sort((a, b) => b.length - a.length || comparePoints(a[0], b[0]));
}

export function smoothContourPath(path, iterations = 1) {
  if (!Array.isArray(path) || path.length < 3 || iterations <= 0) {
    return path;
  }
  let result = path.map(clonePoint);
  for (let pass = 0; pass < iterations; pass += 1) {
    const closed = isClosedPath(result);
    const source = closed ? result.slice(0, -1) : result;
    if (source.length < 3) {
      return result;
    }
    const next = closed ? [] : [clonePoint(source[0])];
    const limit = closed ? source.length : source.length - 1;
    for (let index = 0; index < limit; index += 1) {
      const start = source[index];
      const end = source[(index + 1) % source.length];
      next.push({
        x: start.x * 0.75 + end.x * 0.25,
        y: start.y * 0.75 + end.y * 0.25
      });
      next.push({
        x: start.x * 0.25 + end.x * 0.75,
        y: start.y * 0.25 + end.y * 0.75
      });
    }
    if (closed) {
      next.push(clonePoint(next[0]));
    } else {
      next.push(clonePoint(source[source.length - 1]));
    }
    result = dedupeConsecutivePoints(next);
  }
  return result;
}

function createCellCorners(field, x, y) {
  return [
    { x, y, value: field.values[y][x] },
    { x: x + 1, y, value: field.values[y][x + 1] },
    { x: x + 1, y: y + 1, value: field.values[y + 1][x + 1] },
    { x, y: y + 1, value: field.values[y + 1][x] }
  ];
}

function getCaseIndex(corners, threshold) {
  return (corners[0].value >= threshold ? 1 : 0)
    | (corners[1].value >= threshold ? 2 : 0)
    | (corners[2].value >= threshold ? 4 : 0)
    | (corners[3].value >= threshold ? 8 : 0);
}

function getCaseEdgePairs(caseIndex, corners, threshold, options) {
  const pair = CASE_EDGE_PAIRS[caseIndex];
  if (Array.isArray(pair)) {
    return pair;
  }
  const centreValue = Number.isFinite(options?.centreValue)
    ? options.centreValue
    : average(corners.map((corner) => corner.value));
  if (caseIndex === 5) {
    return centreValue >= threshold
      ? [[EDGE_NAMES.LEFT, EDGE_NAMES.BOTTOM], [EDGE_NAMES.TOP, EDGE_NAMES.RIGHT]]
      : [[EDGE_NAMES.LEFT, EDGE_NAMES.TOP], [EDGE_NAMES.RIGHT, EDGE_NAMES.BOTTOM]];
  }
  if (caseIndex === 10) {
    return centreValue >= threshold
      ? [[EDGE_NAMES.TOP, EDGE_NAMES.LEFT], [EDGE_NAMES.RIGHT, EDGE_NAMES.BOTTOM]]
      : [[EDGE_NAMES.TOP, EDGE_NAMES.RIGHT], [EDGE_NAMES.BOTTOM, EDGE_NAMES.LEFT]];
  }
  return [];
}

function createEdgePoints(corners, threshold) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;
  return {
    [EDGE_NAMES.TOP]: interpolateIsoPoint(topLeft, topRight, threshold),
    [EDGE_NAMES.RIGHT]: interpolateIsoPoint(topRight, bottomRight, threshold),
    [EDGE_NAMES.BOTTOM]: interpolateIsoPoint(bottomLeft, bottomRight, threshold),
    [EDGE_NAMES.LEFT]: interpolateIsoPoint(topLeft, bottomLeft, threshold)
  };
}

function interpolateIsoPoint(start, end, threshold) {
  if (start.value === end.value) {
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    };
  }
  const t = Math.max(0, Math.min(1, (threshold - start.value) / (end.value - start.value)));
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t
  };
}

function findConnectingSegment(segments, point) {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (samePoint(segment.start, point)) {
      return { index, segment, reverse: false };
    }
    if (samePoint(segment.end, point)) {
      return { index, segment, reverse: true };
    }
  }
  return null;
}

function closePathIfNeeded(path) {
  if (path.length > 2 && samePoint(path[0], path[path.length - 1])) {
    return [...path.slice(0, -1), clonePoint(path[0])];
  }
  return path;
}

function dedupeConsecutivePoints(points) {
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

function isClosedPath(path) {
  return path.length > 2 && samePoint(path[0], path[path.length - 1]);
}

function samePoint(a, b) {
  return Math.abs((a?.x ?? 0) - (b?.x ?? 0)) <= 0.001
    && Math.abs((a?.y ?? 0) - (b?.y ?? 0)) <= 0.001;
}

function comparePoints(a, b) {
  const y = (a?.y ?? 0) - (b?.y ?? 0);
  if (Math.abs(y) > 0.001) return y;
  return (a?.x ?? 0) - (b?.x ?? 0);
}

function clonePoint(point) {
  return { x: point.x, y: point.y };
}

function pointDistance(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function average(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
