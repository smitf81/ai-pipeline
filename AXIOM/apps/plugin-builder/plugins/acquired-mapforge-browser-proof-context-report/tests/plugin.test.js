import assert from 'node:assert/strict';
import { installMapforgeActiveContextReport, tools } from '../src/index.js';
assert.equal(tools.length, 1);
assert.equal(tools[0].name, "mapforge_active_context_report");
assert.equal(tools[0].inputSchema.type, 'object');
assert.equal(installMapforgeActiveContextReport(null).reason, 'missing_runtime_api');
console.log("mapforge_active_context_report plugin contract passed");
