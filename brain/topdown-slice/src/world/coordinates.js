export const GROUND_Z = 0;

export function createTileAddress(input = 0, y = 0) {
  const source = getCoordinateSource(input);

  return {
    x: normalizeGridCoordinate(source?.x ?? input),
    y: normalizeGridCoordinate(source?.y ?? y)
  };
}

export function createCellAddress(input = 0, y = 0, z = GROUND_Z) {
  const source = getCoordinateSource(input);

  return {
    x: normalizeGridCoordinate(source?.x ?? input),
    y: normalizeGridCoordinate(source?.y ?? y),
    z: normalizeGridCoordinate(source?.z ?? z)
  };
}

export function createWorldPosition(input = 0, y = 0, z = GROUND_Z) {
  return createCellAddress(input, y, z);
}

export function projectToGroundTile(input) {
  return createTileAddress(input);
}

export function getTileKey(input) {
  const tile = createTileAddress(input);
  return `${tile.x},${tile.y}`;
}

export function getCellKey(input) {
  const cell = createCellAddress(input);
  return `${cell.x},${cell.y},${cell.z}`;
}

export function sameTileAddress(left, right) {
  if (!left || !right) {
    return false;
  }

  return getTileKey(left) === getTileKey(right);
}

export function sameCellAddress(left, right) {
  if (!left || !right) {
    return false;
  }

  return getCellKey(left) === getCellKey(right);
}

export function withWorldPosition(entity, positionLike = {}) {
  let worldPosition = createWorldPosition(positionLike);

  Object.defineProperties(entity, {
    position: {
      enumerable: true,
      configurable: true,
      get() {
        return worldPosition;
      },
      set(value) {
        worldPosition = createWorldPosition(value);
      }
    },
    x: {
      enumerable: true,
      configurable: true,
      get() {
        return worldPosition.x;
      },
      set(value) {
        worldPosition = createWorldPosition({ ...worldPosition, x: value });
      }
    },
    y: {
      enumerable: true,
      configurable: true,
      get() {
        return worldPosition.y;
      },
      set(value) {
        worldPosition = createWorldPosition({ ...worldPosition, y: value });
      }
    },
    z: {
      enumerable: true,
      configurable: true,
      get() {
        return worldPosition.z;
      },
      set(value) {
        worldPosition = createWorldPosition({ ...worldPosition, z: value });
      }
    }
  });

  return entity;
}

export function aliasWorldPosition(entity, alias = 'center', source = 'position') {
  Object.defineProperty(entity, alias, {
    enumerable: true,
    configurable: true,
    get() {
      return entity[source];
    },
    set(value) {
      entity[source] = value;
    }
  });

  return entity;
}

function getCoordinateSource(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.position && typeof value.position === 'object') {
    return value.position;
  }

  return value;
}

function normalizeGridCoordinate(value) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}
