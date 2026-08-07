export const CONNECTED_RULE_CONTRACT = 'black-sky-bound.connected-terrain-tile-rule.v0';
export const CONNECTED_RULE_MODEL = 'orthogonal_4way_16_mask';
export const DirectionBit = Object.freeze({ N: 8, E: 4, S: 2, W: 1 });

export const CONNECTED_RULES_4WAY = Object.freeze({
  0: { mask: 0, key: '0000', role: 'isolated', variant: 'isolated' },
  1: { mask: 1, key: '0001', role: 'cap', variant: 'cap_w' },
  2: { mask: 2, key: '0010', role: 'cap', variant: 'cap_s' },
  3: { mask: 3, key: '0011', role: 'corner', variant: 'corner_sw' },
  4: { mask: 4, key: '0100', role: 'cap', variant: 'cap_e' },
  5: { mask: 5, key: '0101', role: 'straight', variant: 'straight_ew' },
  6: { mask: 6, key: '0110', role: 'corner', variant: 'corner_es' },
  7: { mask: 7, key: '0111', role: 'tee', variant: 'tee_esw' },
  8: { mask: 8, key: '1000', role: 'cap', variant: 'cap_n' },
  9: { mask: 9, key: '1001', role: 'corner', variant: 'corner_wn' },
  10: { mask: 10, key: '1010', role: 'straight', variant: 'straight_ns' },
  11: { mask: 11, key: '1011', role: 'tee', variant: 'tee_nsw' },
  12: { mask: 12, key: '1100', role: 'corner', variant: 'corner_ne' },
  13: { mask: 13, key: '1101', role: 'tee', variant: 'tee_new' },
  14: { mask: 14, key: '1110', role: 'tee', variant: 'tee_nes' },
  15: { mask: 15, key: '1111', role: 'cross', variant: 'cross' }
});

const RULE_DIRECTIONS = Object.freeze({
  0: Object.freeze([]),
  1: Object.freeze(['w']),
  2: Object.freeze(['s']),
  3: Object.freeze(['s', 'w']),
  4: Object.freeze(['e']),
  5: Object.freeze(['e', 'w']),
  6: Object.freeze(['e', 's']),
  7: Object.freeze(['e', 's', 'w']),
  8: Object.freeze(['n']),
  9: Object.freeze(['w', 'n']),
  10: Object.freeze(['n', 's']),
  11: Object.freeze(['n', 's', 'w']),
  12: Object.freeze(['n', 'e']),
  13: Object.freeze(['n', 'e', 'w']),
  14: Object.freeze(['n', 'e', 's']),
  15: Object.freeze(['n', 'e', 's', 'w'])
});

const RULE_ROTATIONS = Object.freeze({
  0: 0,
  1: 180,
  2: 90,
  3: 135,
  4: 0,
  5: 0,
  6: 45,
  7: 90,
  8: 270,
  9: 225,
  10: 90,
  11: 180,
  12: 315,
  13: 270,
  14: 0,
  15: 0
});

const OPEN_DIRECTIONS = Object.freeze({ 1: 'w', 2: 's', 4: 'e', 8: 'n' });
const MISSING_DIRECTIONS = Object.freeze({ 7: 'n', 11: 'e', 13: 's', 14: 'w' });

export function resolveConnectedRule(mask) {
  const rule = CONNECTED_RULES_4WAY[mask];
  if (!rule) throw new Error(`Missing 4-way connected tile rule for mask ${mask}`);
  const directions = RULE_DIRECTIONS[mask] ?? [];
  return Object.freeze({
    contract: CONNECTED_RULE_CONTRACT,
    model: CONNECTED_RULE_MODEL,
    ...rule,
    directions: [...directions],
    connectionCount: directions.length,
    openDirection: OPEN_DIRECTIONS[mask] ?? null,
    missingDirection: MISSING_DIRECTIONS[mask] ?? null,
    rotationDeg: RULE_ROTATIONS[mask] ?? 0
  });
}

export function buildConnectionMask(point, occupied) {
  let mask = 0;
  if (occupied.has(`${point.x},${point.y - 1}`)) mask |= DirectionBit.N;
  if (occupied.has(`${point.x + 1},${point.y}`)) mask |= DirectionBit.E;
  if (occupied.has(`${point.x},${point.y + 1}`)) mask |= DirectionBit.S;
  if (occupied.has(`${point.x - 1},${point.y}`)) mask |= DirectionBit.W;
  return mask;
}

export function validateConnectedRules() {
  const missing = [];
  for (let mask = 0; mask < 16; mask += 1) {
    if (!CONNECTED_RULES_4WAY[mask]) missing.push(mask);
  }
  return { ok: missing.length === 0, missing };
}
