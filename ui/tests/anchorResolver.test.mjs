import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function writeFile(rootPath, relativePath, content) {
  const target = path.join(rootPath, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

export default async function runAnchorResolverTests() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-anchor-'));
  const resolverPath = path.resolve(process.cwd(), 'anchorResolver.js');
  const {
    ANCHOR_BY_ID,
    buildAnchorBundle,
    CANONICAL_AUTHORITY,
    DERIVED_AUTHORITY,
    readAnchorFile,
    resolveAnchorIntentWeight,
    resolveTargetsConfig,
  } = require(resolverPath);

  writeFile(rootPath, 'brain/emergence/project_brain.md', '# Brain\n\n## Current Focus\n- Canonical markdown focus\n');
  writeFile(rootPath, 'brain/emergence/state.json', JSON.stringify({
    current_focus: 'Telemetry wants a different focus',
    active_milestone: 'State says something else',
    next_actions: ['This should not become canonical focus'],
    blockers: ['Need review gate before deploy'],
  }, null, 2));
  writeFile(rootPath, 'brain/emergence/tasks.md', '# Tasks\n- Move canonical reads\n- Add anchor refs\n');
  writeFile(rootPath, 'brain/emergence/decisions.md', '# Decisions\n- Split paths\n');
  writeFile(rootPath, 'brain/emergence/changelog.md', '# Changelog\n- Resolver added\n');
  writeFile(rootPath, 'projects/emergence/roadmap.md', '# Roadmap\n\n## Now\n- Brain migration milestone\n');
  writeFile(rootPath, 'projects/emergence/plan.md', '# Active Plan\n\n## Goal\n- Canonical anchor rollout\n\n## Next\n- Keep plan anchor\n');
  writeFile(rootPath, 'projects.json', JSON.stringify({ bridge: 'C:/bridge-legacy' }, null, 2));
  writeFile(rootPath, 'targets.json', JSON.stringify({ bridge: 'C:/bridge-canonical' }, null, 2));

  const bundle = buildAnchorBundle({ rootPath });
  assert.equal(bundle.brainRoot, 'brain/emergence');
  assert.equal(bundle.anchors.project_brain.source, 'canonical');
  assert.equal(bundle.anchors.roadmap.source, 'legacy');
  assert.equal(bundle.anchors.plan.source, 'legacy');
  assert.equal(bundle.anchors.project_brain.authority, CANONICAL_AUTHORITY);
  assert.equal(bundle.anchors.state.authority, DERIVED_AUTHORITY);
  assert.ok(bundle.anchorRefs.includes('brain/emergence/project_brain.md'));
  assert.ok(bundle.truthSources.some((source) => source.relativePath === 'brain/emergence/roadmap.md' && source.source === 'legacy'));
  assert.ok(bundle.truthSources.some((source) => source.relativePath === 'brain/emergence/state.json' && source.authority === DERIVED_AUTHORITY));
  assert.equal(bundle.managerSummary.current_focus, 'Canonical anchor rollout');
  assert.equal(bundle.managerSummary.active_milestone, 'Brain migration milestone');
  assert.ok(bundle.managerSummary.next_actions.includes('Move canonical reads'));
  assert.ok(bundle.managerSummary.blockers.includes('Need review gate before deploy'));
  assert.ok(bundle.drift.some((flag) => flag.id === 'legacy-roadmap'));
  assert.ok(bundle.drift.some((flag) => flag.id === 'legacy-plan'));
  assert.ok(bundle.drift.some((flag) => flag.id === 'state-focus-divergence'));
  assert.ok(bundle.drift.some((flag) => flag.id === 'state-milestone-divergence'));
  assert.equal(ANCHOR_BY_ID.project_brain.intentWeight, 4);
  assert.equal(ANCHOR_BY_ID.roadmap.intentWeight, 4);
  assert.equal(ANCHOR_BY_ID.plan.intentWeight, 4);
  assert.equal(ANCHOR_BY_ID.tasks.intentWeight, 4);
  assert.equal(ANCHOR_BY_ID.decisions.intentWeight, 3);
  assert.equal(ANCHOR_BY_ID.changelog.intentWeight, 3);
  assert.equal(resolveAnchorIntentWeight(bundle.anchors.roadmap), 4);
  assert.equal(resolveAnchorIntentWeight({ weight: 0 }), 1);

  const legacyRoadmapRead = readAnchorFile(rootPath, 'projects/emergence/roadmap.md');
  assert.equal(legacyRoadmapRead.path, 'brain/emergence/roadmap.md');
  assert.equal(legacyRoadmapRead.sourcePath, 'projects/emergence/roadmap.md');

  const targets = resolveTargetsConfig(rootPath);
  assert.equal(targets.source, 'canonical');
  assert.equal(targets.targets.bridge, 'C:/bridge-canonical');

  fs.rmSync(path.join(rootPath, 'brain', 'emergence', 'plan.md'), { force: true });
  fs.rmSync(path.join(rootPath, 'projects', 'emergence', 'plan.md'), { force: true });
  const missingPlanBundle = buildAnchorBundle({ rootPath });
  assert.ok(missingPlanBundle.drift.some((flag) => flag.id === 'missing-plan'));
}
