import { resolveConnectedRule } from '../terrain/connectedRules.js';

export function describeConnectedTile(mask) {
  return resolveConnectedRule(mask);
}
