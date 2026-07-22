import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProjectDiaryService } from '../server/project-diary.js';

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'axiom-project-diary-'));
const projectRoot = path.join(fixtureRoot, 'BLACK_SKY_BOUND_V2');
const dataRoot = path.join(fixtureRoot, 'diary-data');

try {
  write('.axiom/project.json', JSON.stringify({
    schema: 'axiom.project.v1',
    projectId: 'black-sky-bound-v2-demo',
    name: 'Black Sky Bound v2 Demo',
    workspace: { contract: 'axiom.project-workspace.v0', surfaceId: 'bsb-v2-map-authoring' }
  }, null, 2));
  write('progress.md', [
    '# Progress',
    'The raider guard profile now owns readable spear anticipation and a braced blocking pose.',
    'Do not add artificial or full-body outlines; preserve the dark base silhouette.'
  ].join('\n'));
  write('src/render/backends/webgl/WebGLHumanoidSilhouette.js', 'export function renderRaiderGuardSilhouette(profile) { return profile.spearReach; }\n');
  write('src/systems/raiderGuardState.js', 'export function updateRaiderGuardState(actor) { return actor.blocking; }\n');
  write('tests/raiderGuardState.test.mjs', 'export const guardProof = true;\n');

  const project = {
    id: 'black-sky-bound-v2-demo',
    name: 'Black Sky Bound v2 Demo',
    root: projectRoot,
    selector: '_A_Projects/BLACK_SKY_BOUND_V2',
    kind: 'browser_game_project',
    trust: 'trusted_project'
  };
  const service = createProjectDiaryService({ dataRoot, debounceMs: 1200, maxEvidenceFiles: 80 });
  const sourceText = 'Raiders still look unclear when blocking. Their elbows need articulating, spear reach should read earlier, and I do not want outlines.';
  const entry = service.capture(project, {
    source: { text: sourceText },
    context: {
      project: { id: project.id, name: project.name, root: project.selector, identityStatus: 'verified' },
      scene: { kind: 'map', mapId: 'first_escape', catalogueMapId: 'first_flightless_night', selection: { kind: 'unit', id: 'raider:37:36:1856' } },
      authoring: {
        active: true,
        surfaceId: 'bsb-v2-map-authoring',
        owner: { owner: 'AXIOM', projectId: 'axiom', root: '.', pathSource: 'map_manifest.authoringPath' },
        sourcePath: 'data/bsb-v2/maps/first_escape.authoring.json',
        status: 'saved',
        dirty: false,
        revision: 2409
      },
      viewport: { owner: 'BsbV2MapAuthoring', mode: 'planar_authoring', zoom: 2 }
    },
    spatialAnchor: { catalogueMapId: 'first_flightless_night', mapId: 'first_escape', tile: { x: 37, y: 36 }, selection: { kind: 'unit', id: 'raider:37:36:1856' } }
  });

  assert.equal(entry.source.text, sourceText, 'original input is preserved exactly');
  assert.equal(entry.source.preserved, true);
  assert.equal(entry.context.project.id, project.id, 'entry uses the FileManager project identity');
  assert.deepEqual(entry.context.spatialAnchor.tile, { x: 37, y: 36 });
  assert.ok(entry.derived.evidence.ownerCandidates.some(item => item.path === 'src/render/backends/webgl/WebGLHumanoidSilhouette.js'));
  assert.ok(entry.derived.evidence.knowledgeLinks.some(item => item.path === 'progress.md' && item.classification === 'accepted_constraint'));
  assert.equal(entry.derived.evidence.scan.wholeProjectPrompted, false);
  assert.equal(entry.context.authoring.owner.owner, 'AXIOM', 'captured context should preserve the declared authoring owner');

  const mapService = createProjectDiaryService({ dataRoot: path.join(fixtureRoot, 'map-diary-data'), maxEvidenceFiles: 80 });
  const mapEntry = mapService.capture(project, {
    source: { text: 'Rework the opening level layout into a quiet basin, a readable choke, and an eastern bypass.' },
    context: {
      project: { id: project.id, name: project.name, root: project.selector, identityStatus: 'verified' },
      scene: { kind: 'map', mapId: 'first_escape', catalogueMapId: 'first_flightless_night' },
      authoring: {
        active: true,
        surfaceId: 'bsb-v2-map-authoring',
        owner: { owner: 'AXIOM', projectId: 'axiom', root: '.', pathSource: 'map_manifest.authoringPath' },
        sourcePath: 'data/bsb-v2/maps/first_escape.authoring.json',
        status: 'saved',
        dirty: false,
        revision: 2409
      }
    }
  });
  assert.equal(mapEntry.derived.evidence.ownerCandidates[0].classification, 'verified_workspace_authoring_owner', 'map intent should rank the active authoring source before runtime consumers');
  assert.equal(mapEntry.derived.evidence.ownerCandidates[0].path, 'data/bsb-v2/maps/first_escape.authoring.json');
  assert.equal(mapEntry.derived.interpretations[0].payload.recommendedAction, 'local_handling', 'actionable map intent should not manufacture a user clarification');
  assert.equal(mapEntry.derived.interpretations[0].payload.confidence, 'high');
  assert.equal(mapEntry.derived.evidence.knowledgeLinks.some(item => item.path === 'docs/LIGHT_SPACE_RENDER_CULLING.md'), false, 'map intent should not inherit unrelated rendering constraints');

  const interpreted = service.appendInterpretation(project, entry.id, {
    provider: 'Ollama',
    model: 'qwen3.5:9b',
    budget: { maxTokens: 520 },
    interpretation: {
      interpretedIntent: 'Improve raider blocking silhouette and anticipation without outlines.',
      affectedSystems: ['combat and defensive behavior', 'rendering and visual projection'],
      tasks: ['Inspect the guard profile and WebGL humanoid silhouette.'],
      uncertainties: ['Confirm whether the issue occurs during windup, held guard, or both.'],
      suggestedValidation: ['Stage a guarded raider in the browser and inspect spear reach timing.'],
      recommendedAction: 'codex_escalation',
      confidence: 'high'
    }
  });
  assert.equal(interpreted.source.text, sourceText, 'derived interpretation does not overwrite source');
  assert.equal(interpreted.derived.interpretations.length, 2, 'interpretations are append-only');
  assert.equal(interpreted.derived.interpretations.at(-1).budget.maxTokens, 520);

  const handover = service.createHandover(project, entry.id);
  assert.match(handover.prompt, /Original user material \(preserved\)/);
  assert.match(handover.prompt, /do not want outlines/i);
  assert.match(handover.prompt, /WebGLHumanoidSilhouette\.js/);
  assert.match(handover.prompt, /Accepted decisions and constraints/);
  assert.equal(handover.classification, 'derived_handover_preview');

  const completion = service.reconcileCompletion(project, entry.id, {
    report: [
      'Changed files:',
      '- src/render/backends/webgl/WebGLHumanoidSilhouette.js',
      '- src/systems/raiderGuardState.js',
      'Validation: npm test passed.'
    ].join('\n')
  });
  assert.equal(completion.status, 'claims_grounded');
  assert.equal(completion.fileChecks.length, 2);
  assert.ok(completion.fileChecks.every(item => item.exists));
  assert.ok(completion.documentationImplications.some(item => item.path === 'progress.md'));

  const firstEvent = service.handleEvent(project, {
    type: 'axiom_authoring_source_saved',
    paths: ['data/bsb-v2/maps/first_escape.authoring.json'],
    revision: 2409
  });
  const duplicateEvent = service.handleEvent(project, {
    type: 'axiom_authoring_source_saved',
    paths: ['data/bsb-v2/maps/first_escape.authoring.json'],
    revision: 2409
  });
  assert.equal(firstEvent.accepted, true);
  assert.equal(firstEvent.run.workBudget.modelCalls, 0);
  assert.equal(duplicateEvent.accepted, false);
  assert.equal(duplicateEvent.deduplicated, true);
  const status = service.status(project);
  assert.equal(status.steward.scheduler, 'event_only');
  assert.equal(status.steward.timers, 0);
  assert.equal(status.steward.idleModelCalls, 0);
  assert.equal(status.modelPolicy.eventStewardModelCalls, 0);

  const listed = service.list(project, { limit: 10 });
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].source.text, sourceText);
  assert.equal(listed.entries[0].derived.completionReports.length, 1);

  console.log('project-diary.test.mjs passed');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

function write(relativePath, content) {
  const target = path.join(projectRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
