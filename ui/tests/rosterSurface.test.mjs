import assert from 'node:assert/strict';
import path from 'node:path';

import { loadModuleCopy } from './helpers/browser-module-loader.mjs';

const rosterSurfacePath = path.resolve(process.cwd(), 'public', 'spatial', 'rosterSurface.js');

export default async function runRosterSurfaceTests() {
  const { buildRosterSurfaceModel } = await loadModuleCopy(rosterSurfacePath, { label: 'rosterSurface' });

  const model = buildRosterSurfaceModel({
    department: {
      name: 'Talent Acquisition',
      summary: '1 open role across 2 staffing rules.',
      urgency: 'high',
    },
    coverageSummary: {
      total: 2,
      healthyCount: 1,
      openEntityCount: 1,
      openRoleCount: 1,
      blockerCount: 1,
      missingLeadCount: 0,
      understaffedCount: 1,
      optionalHireCount: 0,
      urgency: 'high',
    },
    organization: {
      desks: {
        executor: {
          id: 'executor',
          ownerDepartmentId: 'delivery',
        },
      },
    },
    gapModel: {
      canonicalSeats: [
        {
          kind: 'understaffed',
          entityType: 'desk',
          entityId: 'planner',
          entityLabel: 'Planner',
          departmentId: 'delivery',
          departmentLabel: 'Delivery',
          roleId: 'memory-archivist',
          roleLabel: 'Memory Archivist',
          shortfall: 1,
          urgency: 'high',
          blocker: true,
        },
      ],
      blockers: [
        {
          kind: 'understaffed',
          entityType: 'desk',
          entityId: 'planner',
          entityLabel: 'Planner',
          departmentId: 'delivery',
          departmentLabel: 'Delivery',
          roleId: 'memory-archivist',
          roleLabel: 'Memory Archivist',
          shortfall: 1,
          urgency: 'high',
          blocker: true,
        },
      ],
    },
    coverage: [
      {
        entityType: 'department',
        entityId: 'delivery',
        label: 'Delivery',
        health: 'degraded',
        statusLabel: 'understaffed',
        assignedStaffCount: 1,
        assignedRoles: ['executor'],
        roleCounts: { executor: 1 },
        requiredRoles: ['executor', 'memory-archivist'],
        optionalRoles: ['planner'],
        leadRequirement: { roleId: 'executor', minimumCount: 1 },
        openRoles: [
          {
            kind: 'understaffed',
            entityType: 'department',
            entityId: 'delivery',
            entityLabel: 'Delivery',
            roleId: 'memory-archivist',
            roleLabel: 'Memory Archivist',
            shortfall: 1,
            urgency: 'high',
            blocker: true,
          },
        ],
        blockers: [
          {
            kind: 'understaffed',
            entityType: 'department',
            entityId: 'delivery',
            entityLabel: 'Delivery',
            roleId: 'memory-archivist',
            roleLabel: 'Memory Archivist',
            shortfall: 1,
            urgency: 'high',
            blocker: true,
          },
        ],
        urgency: 'high',
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
        assignedModel: 'mistral:latest',
        summary: 'Lead executor for delivery.',
      },
    ],
  });

  assert.equal(model.summary.totalCoverage, 2);
  assert.equal(model.summary.openRoleCount, 1);
  assert.equal(model.summary.blockerCount, 1);
  assert.equal(model.summary.rosterCount, 1);
  assert.equal(model.canonicalSeats.length, 1);
  assert.equal(model.departments.length, 1);
  assert.equal(model.departments[0].leadLabel, 'Alex | Executor');
  assert.equal(model.departments[0].openSeatCount, 1);
  assert.equal(model.departments[0].assignedRoster[0].name, 'Alex');
  assert.equal(model.departments[0].roleCoverage.find((entry) => entry.roleId === 'memory-archivist').covered, false);
  assert.equal(model.desks.length, 1);
  assert.equal(model.desks[0].leadLabel, 'Alex | Executor');
  assert.equal(model.roster[0].deskId, 'executor');
  assert.equal(model.departments[0].assignedRoster.length, 1);
}
