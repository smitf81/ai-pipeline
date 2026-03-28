import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const quickAccessPath = path.resolve(process.cwd(), 'public', 'spatial', 'studioQuickAccess.js');

export default async function runStudioQuickAccessTests() {
  const { buildStudioQuickAccessStrip } = await loadModuleCopy(quickAccessPath, { label: 'studioQuickAccess' });

  const strip = buildStudioQuickAccessStrip({
    selectedAgentId: 'qa-lead',
    deskPanelDeskId: 'qa-lead',
    ctoEditTargetDeskId: 'cto-architect',
    utilityDockOpen: true,
    rosterUtilityOpen: true,
    teamBoardWallBoardExpanded: false,
  });

  assert.deepEqual(strip.map((entry) => entry.id), [
    'department',
    'desk',
    'people-plan',
    'whiteboard',
    'utilities',
  ]);
  assert.deepEqual(strip.map((entry) => entry.label), [
    'Visible + Department',
    'Visible + Desk',
    'People Plan',
    'Whiteboard',
    'Utilities',
  ]);
  assert.equal(strip.find((entry) => entry.id === 'department').active, false);
  assert.equal(strip.find((entry) => entry.id === 'desk').active, true);
  assert.equal(strip.find((entry) => entry.id === 'people-plan').active, true);
  assert.equal(strip.find((entry) => entry.id === 'whiteboard').active, false);
  assert.equal(strip.find((entry) => entry.id === 'utilities').active, true);

  const fallbackStrip = buildStudioQuickAccessStrip({
    ctoEditTargetDeskId: 'cto-architect',
  });
  assert.equal(fallbackStrip.find((entry) => entry.id === 'desk').targetDeskId, 'cto-architect');
  assert.ok(fallbackStrip.every((entry) => ['department', 'desk', 'people-plan', 'whiteboard', 'utilities'].includes(entry.id)));
}

