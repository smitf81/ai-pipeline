import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const relationshipHiringSignalsPath = path.resolve(process.cwd(), 'public', 'spatial', 'relationshipHiringSignals.js');
const rosterSurfacePath = path.resolve(process.cwd(), 'public', 'spatial', 'rosterSurface.js');

export default async function runRelationshipHiringSignalsTests() {
  const signalsModule = await loadModuleCopy(relationshipHiringSignalsPath, { label: 'relationshipHiringSignals' });
  const { buildRosterSurfaceModel } = await loadModuleCopy(rosterSurfacePath, { label: 'rosterSurface' });

  const payload = {
    department: {
      name: 'Talent Acquisition',
      summary: 'Signals should stay read-only.',
      urgency: 'high',
    },
    coverageSummary: {
      total: 2,
      healthyCount: 1,
      openEntityCount: 1,
      openRoleCount: 1,
      blockerCount: 1,
      missingLeadCount: 1,
      understaffedCount: 1,
      optionalHireCount: 0,
      urgency: 'high',
    },
    gapModel: {
      openRoles: [
        {
          kind: 'missing lead',
          entityType: 'department',
          entityId: 'delivery',
          entityLabel: 'Delivery',
          roleId: 'planner',
          roleLabel: 'Planner',
          shortfall: 1,
          urgency: 'critical',
          blocker: true,
        },
      ],
      blockers: [
        {
          kind: 'missing lead',
          entityType: 'department',
          entityId: 'delivery',
          entityLabel: 'Delivery',
          roleId: 'planner',
          roleLabel: 'Planner',
          shortfall: 1,
          urgency: 'critical',
          blocker: true,
        },
      ],
    },
    coverage: [
      {
        entityType: 'department',
        entityId: 'delivery',
        label: 'Delivery',
        health: 'blocked',
        statusLabel: 'missing lead',
        assignedStaffCount: 1,
        assignedRoles: ['executor'],
        roleCounts: { executor: 1 },
        requiredRoles: ['planner', 'executor'],
        optionalRoles: ['qa-lead'],
        leadRequirement: { roleId: 'planner', minimumCount: 1 },
        leadRoleId: 'planner',
        leadLabel: 'Planner',
        leadCandidate: null,
        openRoles: [
          {
            kind: 'missing lead',
            entityType: 'department',
            entityId: 'delivery',
            entityLabel: 'Delivery',
            roleId: 'planner',
            roleLabel: 'Planner',
            shortfall: 1,
            urgency: 'critical',
            blocker: true,
          },
        ],
        blockers: [
          {
            kind: 'missing lead',
            entityType: 'department',
            entityId: 'delivery',
            entityLabel: 'Delivery',
            roleId: 'planner',
            roleLabel: 'Planner',
            shortfall: 1,
            urgency: 'critical',
            blocker: true,
          },
        ],
        urgency: 'critical',
      },
      {
        entityType: 'desk',
        entityId: 'executor',
        label: 'Executor',
        health: 'healthy',
        statusLabel: 'covered',
        assignedStaffCount: 1,
        assignedRoles: ['executor'],
        roleCounts: { executor: 1 },
        requiredRoles: ['executor'],
        optionalRoles: ['planner'],
        leadRequirement: { roleId: 'executor', minimumCount: 1 },
        leadRoleId: 'executor',
        leadLabel: 'Executor',
        leadCandidate: {
          id: 'cand-1',
          name: 'Alex',
          role: 'Executor',
        },
        openRoles: [],
        blockers: [],
        urgency: 'low',
      },
    ],
    roster: [
      {
        id: 'cand-1',
        name: 'Alex',
        role: 'Executor',
        roleId: 'executor',
        deskId: 'executor',
        summary: 'Lead executor for delivery.',
      },
    ],
  };

  const directSignals = signalsModule.buildRelationshipHiringSignals({
    departments: payload.coverage.filter((entry) => entry.entityType === 'department'),
    desks: payload.coverage.filter((entry) => entry.entityType === 'desk'),
  });
  assert.ok(directSignals.some((signal) => signal.kind === 'relationship' && signal.label.includes('link weak')));
  assert.ok(directSignals.some((signal) => signal.subjectId === 'simulation' && signal.reasons.includes('unowned module')));
  assert.ok(directSignals.some((signal) => signal.subjectId === 'qa' && signal.reasons.includes('isolated component')));

  const model = buildRosterSurfaceModel(payload);
  assert.ok(Array.isArray(model.hiringSignals));
  assert.ok(model.hiringSignals.some((signal) => signal.kind === 'relationship' && signal.reasons.includes('low validation')));
  assert.ok(model.hiringSignals.some((signal) => signal.subjectId === 'simulation' && signal.suggestedHire.includes('Integration role')));
  assert.ok(model.hiringSignals.some((signal) => signal.subjectId === 'qa' && signal.reasons.includes('isolated component')));
}
