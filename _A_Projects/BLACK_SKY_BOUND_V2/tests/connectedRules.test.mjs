import { assert, equal } from './assert.mjs';
import { buildConnectionMask, resolveConnectedRule, validateConnectedRules } from '../src/terrain/connectedRules.js';

const validation = validateConnectedRules();
assert(validation.ok, `missing connected masks: ${validation.missing.join(',')}`);
equal(resolveConnectedRule(10).variant, 'straight_ns', 'mask 1010 should be north/south straight');
equal(resolveConnectedRule(10).model, 'orthogonal_4way_16_mask', 'resolved rules should expose the 16-mask model');
equal(resolveConnectedRule(10).connectionCount, 2, 'resolved rules should expose connection counts');
equal(resolveConnectedRule(5).variant, 'straight_ew', 'mask 0101 should be east/west straight');
equal(resolveConnectedRule(15).role, 'cross', 'mask 1111 should be cross');

const occupied = new Set(['2,1', '2,2', '2,3', '3,2']);
equal(buildConnectionMask({ x: 2, y: 2 }, occupied), 14, 'N/E/S neighbours should produce tee_nes mask');
