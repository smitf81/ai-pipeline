import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createEditorState } from '../src/editor/editorState.js';
import { collectMouseSnapshot, isMouseModeEnabled } from '../src/playtest/mousePlaytester.js';
import { createFirstNightMap } from '../src/world/mapGenerator.js';
import {
  MOUSE_WAITING_MESSAGE,
  buildMousePrompt,
  createMousePlaytesterService,
  normaliseMouseSnapshot,
  parseMouseDecisionResponse,
  validateMouseDecisionGrounding
} from '../tools/mouse-playtester-service.mjs';

export async function run() {
  assert.equal(isMouseModeEnabled('?mouse=1'), true);
  assert.equal(isMouseModeEnabled('?mouse=0'), false);

  const state = createEditorState(createFirstNightMap({ seed: 'mouse-snapshot-test' }));
  state.runtimeStats = { fps: 31.4, frameMs: 33.8 };
  state.scenarioRuntime.completedObjectiveIds = [];
  const snapshot = collectMouseSnapshot(state, { eventType: 'cadence' });
  assert.equal(snapshot.scenarioTitle, 'The First Night');
  assert.equal(snapshot.camera.mode, 'commander_follow_tactical_leash');
  assert.equal(snapshot.objective.total, 5);
  assert.equal(snapshot.fps, 31.4);
  assert.ok(snapshot.issues.some((entry) => entry.includes('Frame rate is low')));
  assert.ok(snapshot.availableCommands.some((command) => command.id === 'seek_shelter'));
  assert.ok(snapshot.targetCandidates.some((target) => target.id === 'shelter_first_trees'));
  assert.equal(snapshot.targetCandidates.find((target) => target.id === 'shelter_first_trees').objectiveState, 'active');
  assert.equal(snapshot.targetCandidates.find((target) => target.id === 'shelter_first_trees').directVisibility, 'not_asserted');
  assert.equal(snapshot.targetCandidates.some((target) => target.id === 'shelter_final_cave'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'map'), false, 'Mouse snapshot must not send the full authored map');
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'game'), false, 'Mouse snapshot must not send the full game state');
  assert.equal(normaliseMouseSnapshot(collectMouseSnapshot(state, { eventType: 'scenario_loaded' })).fps, null, 'Initial Mouse snapshot must not turn unknown FPS into a low-performance report');

  const compactPrompt = buildMousePrompt(snapshot, [{ thought: 'I cannot read the shelter edge yet.' }]);
  assert.match(compactPrompt, /You are Mouse/);
  assert.match(compactPrompt, /The First Night/);
  assert.match(compactPrompt, /I cannot read the shelter edge yet/);
  assert.match(compactPrompt, /seek_shelter/);
  assert.ok(compactPrompt.length < 3000, 'Mouse decision prompt should remain compact');
  const canopyTarget = {
    ...snapshot.targetCandidates.find((target) => target.id === 'shelter_first_trees'),
    id: 'shelter_canopy_01',
    label: 'dense canopy',
    objectiveState: 'active',
    objectiveLabel: 'Move through the canopy shelter chain'
  };
  const followOnPrompt = buildMousePrompt({
    ...snapshot,
    objective: { ...snapshot.objective, label: 'Move through the canopy shelter chain', shelterNodeId: canopyTarget.id },
    nearbyShelters: [{ id: canopyTarget.id, type: canopyTarget.label, objectiveState: 'active', knowledgeState: 'objective_revealed' }],
    targetCandidates: [canopyTarget]
  });
  assert.match(followOnPrompt, /"targetId":"shelter_canopy_01"/, 'the JSON example must track the offered active shelter');
  assert.doesNotMatch(followOnPrompt, /"targetId":"shelter_first_trees"/, 'the JSON example must not retain a completed target');
  const parsed = parseMouseDecisionResponse('{"thought":"I know the first cover route.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees","confidence":0.7,"reason":"It is close."}}');
  assert.equal(parsed.action.commandId, 'seek_shelter');
  assert.throws(
    () => validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I see shelter to my left.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees"}}'), snapshot),
    /unsupported relative direction/
  );
  assert.throws(
    () => validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I know light tree cover.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees","reason":"It is directly in front."}}'), snapshot),
    /unsupported relative direction/
  );
  assert.throws(
    () => validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I see light tree cover north-east.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees"}}'), snapshot),
    /unverified direct visibility/
  );
  assert.equal(validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I know light tree cover north-east.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees"}}'), snapshot), true);
  assert.throws(
    () => validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I know the old shelter route.","action":{"commandId":"seek_shelter","targetId":"shelter_not_offered"}}'), snapshot),
    /not offered/
  );
  assert.throws(
    () => validateMouseDecisionGrounding(parseMouseDecisionResponse('{"thought":"I know dense canopy north-east.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees"}}'), snapshot),
    /unseen shelter terrain/
  );
  assert.throws(() => parseMouseDecisionResponse('not json'), /invalid_model_response/);
  assert.throws(() => parseMouseDecisionResponse('{"thought":"I see a campsite.","action":{"commandId":"observe"}}'), /settled scenery/);

  const outputRoot = resolve('output', 'mouse-playtester-test');
  await rm(outputRoot, { recursive: true, force: true });
  const calls = [];
  const service = createMousePlaytesterService({
    outputRoot,
    cadenceMs: 0,
    modelClient: {
      probe: async () => ({ ok: true, availableModels: ['qwen2.5-coder:1.5b'] }),
      generate: async (request) => {
        calls.push(request);
        return {
          text: '{"thought":"I know the first cover route; I am sending the band beneath it.","action":{"commandId":"seek_shelter","targetId":"shelter_first_trees","targetPosition":null,"audienceId":"all_band","confidence":0.78,"reason":"Known shelter is within calling range."}}'
        };
      }
    }
  });
  await service.beginRun({ scenarioId: 'chapter_001', scenarioTitle: 'The First Night' });
  await service.acceptSnapshot({ ...snapshot, hiddenWorldDump: { shouldNotSurvive: true } });
  const completed = await service.waitForIdle();
  assert.equal(completed.modelAvailable, true);
  assert.equal(completed.model, 'qwen2.5-coder:1.5b');
  assert.match(completed.latestThought, /first cover/i);
  assert.equal(completed.pendingAction.commandId, 'seek_shelter');
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /FPS 31.4/i);
  assert.match(calls[0].prompt, /Shelter targets are commander-known command options/);
  const resolved = await service.recordActionOutcome({
    actionId: completed.pendingAction.actionId,
    validationStatus: 'accepted',
    executionStatus: 'executed',
    commandResponseStatus: 'degraded',
    outcomeSummary: 'The band accepted Shelter.',
    targetLabel: 'light tree cover',
    objectiveBefore: snapshot.objective.label,
    objectiveAfter: snapshot.objective.label,
    commanderState: 'ready',
    unitsResponded: 6,
    fps: 31.4
  });
  assert.equal(resolved.latestAction.executionStatus, 'executed');
  assert.equal(resolved.latestAction.commandResponseStatus, 'degraded');
  assert.equal(resolved.pendingAction, null);

  const latest = JSON.parse(await readFile(resolve(outputRoot, 'latest.json'), 'utf8'));
  const snapshotLines = (await readFile(resolve(outputRoot, 'runs', latest.runId, 'snapshots.jsonl'), 'utf8')).trim().split('\n');
  const thoughtLines = (await readFile(resolve(outputRoot, 'runs', latest.runId, 'thoughts.jsonl'), 'utf8')).trim().split('\n');
  const actionLines = (await readFile(resolve(outputRoot, 'runs', latest.runId, 'actions.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(snapshotLines.length, 1);
  assert.equal(JSON.parse(snapshotLines[0]).hiddenWorldDump, undefined);
  assert.equal(thoughtLines.length, 1);
  assert.equal(actionLines.length, 2, 'decision and game outcome should both be retained');
  assert.equal(JSON.parse(actionLines[1]).executionStatus, 'executed');
  assert.match(await readFile(resolve(outputRoot, 'latest.md'), 'utf8'), /seek_shelter/);

  const unavailableRoot = resolve('output', 'mouse-playtester-unavailable-test');
  await rm(unavailableRoot, { recursive: true, force: true });
  const unavailable = createMousePlaytesterService({
    outputRoot: unavailableRoot,
    cadenceMs: 0,
    modelClient: {
      probe: async () => ({ ok: false, reason: 'Connection refused', availableModels: [] }),
      generate: async () => {
        throw new Error('Unavailable model must not be called.');
      }
    }
  });
  await unavailable.beginRun({ scenarioId: 'chapter_001', scenarioTitle: 'The First Night' });
  await unavailable.acceptSnapshot(snapshot);
  const waiting = await unavailable.waitForIdle();
  assert.equal(waiting.modelAvailable, false);
  assert.equal(waiting.stateLabel, MOUSE_WAITING_MESSAGE);
  assert.ok(waiting.flags.includes('model_unavailable'));
  assert.match(await readFile(resolve(unavailableRoot, 'latest.md'), 'utf8'), /waiting for local model connection/i);
}
