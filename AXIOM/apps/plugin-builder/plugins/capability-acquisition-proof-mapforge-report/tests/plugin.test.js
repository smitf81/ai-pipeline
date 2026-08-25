import assert from 'node:assert/strict';
import { installMapforgeStatusReport, tools } from '../src/index.js';
assert.equal(tools.length, 1);
assert.equal(tools[0].name, "mapforge_status_report");
assert.equal(tools[0].inputSchema.type, 'object');
assert.equal(installMapforgeStatusReport(null).reason, 'missing_runtime_api');
console.log("mapforge_status_report plugin contract passed");
