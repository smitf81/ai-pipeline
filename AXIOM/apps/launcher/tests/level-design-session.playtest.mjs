import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const outDir = join(launcherRoot, 'output', 'playwright', 'level-design-session');
const firstAuthoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json');
const ashAuthoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json');

await mkdir(outDir, { recursive: true });
const sourceHashesBefore = {
  firstFlightlessNight: sha256(await readFile(firstAuthoringPath)),
  ashRoadThreshold: sha256(await readFile(ashAuthoringPath))
};
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.map-intent-playable-space-live-proof.v1',
  url: axiomUrl,
  sourceHashesBefore,
  launcher: null,
  localModel: null,
  goalReview: null,
  witnessedPreview: null,
  pauseResume: null,
  completion: null,
  undo: null,
  sourceHashesAfter: null,
  screenshots: [],
  browserIssues: issues,
  browserIssueClassification: null
};

try {
  const health = await (await fetch('http://127.0.0.1:3007/health')).json();
  proof.launcher = {
    runtimeContract: health.runtimeContract,
    levelDesignSessionContract: health.levelDesignSessionContract,
    mapIntentPreflightContract: health.mapIntentPreflightContract,
    launcherRoot: health.launcherRoot,
    processId: health.processId,
    startedAt: health.startedAt
  };
  if (health.runtimeContract !== 'axiom.launcher-runtime.v3-map-intent-preflight-r1') throw new Error(`launcher_runtime_stale:${health.runtimeContract}`);
  if (health.mapIntentPreflightContract !== 'axiom.map-intent-preflight.v1') throw new Error(`map_intent_preflight_runtime_missing:${health.mapIntentPreflightContract}`);

  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.ProjectDiaryRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring && window.LevelDesignSessionRuntime, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'level_design_session_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    const map = window.BsbV2MapAuthoring?.status?.();
    return context?.project?.id === 'black-sky-bound-v2-demo' && map?.active && Number.isInteger(map.document?.revision) && window.SSEBridge?.isConnected?.();
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  await page.evaluate(async () => {
    const map = window.BsbV2MapAuthoring.status();
    if (map.dirty) throw new Error('proof_requires_clean_initial_map');
    if (map.activeCatalogueMapId !== 'first_flightless_night') await window.BsbV2MapAuthoring.selectRegion('first_flightless_night');
  });
  await page.waitForFunction(() => {
    const map = window.BsbV2MapAuthoring.status();
    return map.activeCatalogueMapId === 'first_flightless_night'
      && map.document?.mapId === 'axiom_first_escape'
      && map.authoringPath === 'data/bsb-v2/maps/first_escape.authoring.json';
  }, null, { timeout: 15000 });

  const existing = await page.evaluate(() => window.LevelDesignSessionRuntime.status().session);
  if (existing?.authority?.approved && !['completed', 'stopped', 'blocked'].includes(existing.state)) {
    await page.evaluate(() => window.LevelDesignSessionRuntime.stop());
    await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'stopped', null, { timeout: 10000 });
  }
  await page.evaluate(() => window.AgentActivityRuntime.clear());
  const initial = await page.evaluate(() => {
    const map = window.BsbV2MapAuthoring.status();
    return {
      revision: map.document.revision,
      catalogueMapId: map.activeCatalogueMapId,
      mapId: map.document.mapId,
      authoringPath: map.authoringPath,
      dirty: map.dirty,
      sceneObjectCount: map.document.sceneObjects.length,
      model: window.EDITOR.model.getCurrent()
    };
  });
  proof.localModel = {
    endpoint: initial.model?.endpoint?.name || initial.model?.endpoint?.url || null,
    model: initial.model?.model || null
  };

  if (initial.catalogueMapId !== 'first_flightless_night') throw new Error(`proof_wrong_start_map:${initial.catalogueMapId}`);
  const prompt = 'On the Ash Road Threshold map, set up a 10 minute playable forest route from the southern arrival to the northern gate with arrival, pressure, recovery and climax pacing beats, then dress it like a level designer and environmental artist while keeping the route readable.';
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => {
    const session = window.LevelDesignSessionRuntime?.status?.()?.session;
    return session?.state === 'awaiting_user' && session?.authority?.approved === false;
  }, null, { timeout: 60000 });
  proof.goalReview = await page.evaluate(initialRevision => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    const surface = document.getElementById('level-design-session-surface');
    return {
      session,
      mapRevision: map.document.revision,
      activeCatalogueMapId: map.activeCatalogueMapId,
      mapId: map.document.mapId,
      authoringPath: map.authoringPath,
      targetSceneObjectCount: map.document.sceneObjects.length,
      targetDimensions: { width: map.document.width, height: map.document.height },
      initialRevision,
      surfaceHidden: surface.hidden,
      surfaceText: surface.innerText,
      startVisible: !surface.querySelector('[data-level-action="start"]').hidden,
      activity: window.AgentActivityRuntime.status().latest
    };
  }, initial.revision);
  if (proof.goalReview.activeCatalogueMapId !== 'ash_road_threshold'
    || proof.goalReview.mapId !== 'axiom_second_approach'
    || proof.goalReview.authoringPath !== 'data/bsb-v2/maps/second_approach.authoring.json') {
    throw new Error(`goal_review_target_binding_wrong:${proof.goalReview.activeCatalogueMapId}:${proof.goalReview.mapId}:${proof.goalReview.authoringPath}`);
  }
  if (proof.goalReview.session.preflight.previousMap.catalogueMapId !== 'first_flightless_night'
    || proof.goalReview.session.preflight.target.catalogueMapId !== 'ash_road_threshold'
    || proof.goalReview.session.preflight.target.mapId !== 'axiom_second_approach') {
    throw new Error('goal_review_preflight_lineage_wrong');
  }
  if (proof.goalReview.session.preflight.playableSpace.requestedMinutes !== 10
    || proof.goalReview.session.preflight.playableSpace.classification !== 'planning_estimate') {
    throw new Error('goal_review_playable_space_estimate_missing');
  }
  if (!/First Flightless Night|Ash Road Threshold|10 min|planning estimate/i.test(proof.goalReview.surfaceText)) throw new Error('goal_review_preflight_not_salient');
  if (proof.goalReview.surfaceHidden || !proof.goalReview.startVisible) throw new Error('goal_approval_not_visibly_salient');
  if (!/Pause|Stop|Follow AXIOM|Add direction|Undo session/i.test(proof.goalReview.surfaceText)) throw new Error('session_controls_not_present');
  const reviewScreenshot = join(outDir, '01-goal-review.png');
  await page.screenshot({ path: reviewScreenshot, fullPage: true });
  proof.screenshots.push(reviewScreenshot);

  await page.locator('[data-level-action="start"]').click();
  await page.waitForFunction(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const projection = window.BsbV2MapAuthoring.agent.status().projection;
    return session?.state === 'previewing' && projection?.classification === 'projection' && projection.candidateCount > 0;
  }, null, { timeout: 120000 });
  proof.witnessedPreview = await page.evaluate(() => ({
    session: window.LevelDesignSessionRuntime.status().session,
    mapAgent: window.BsbV2MapAuthoring.agent.status(),
    map: window.BsbV2MapAuthoring.workspaceState(),
    prepared: (() => {
      const status = window.BsbV2MapAuthoring.status();
      return {
        catalogueMapId: status.activeCatalogueMapId,
        mapId: status.document.mapId,
        authoringPath: status.authoringPath,
        revision: status.document.revision,
        dimensions: { width: status.document.width, height: status.document.height },
        playableSpace: status.document.playableSpace
      };
    })(),
    activity: window.AgentActivityRuntime.status().latest,
    streamContainsSessionEvents: document.getElementById('stream-feed')?.innerText?.includes('level_design_session') || false
  }));
  const preparedRevision = proof.witnessedPreview.session.preflight.receipt?.afterRevision;
  if (!proof.witnessedPreview.session.preflight.receipt?.applied) throw new Error('playable_space_preparation_receipt_missing');
  if (proof.witnessedPreview.session.preflight.receipt.catalogueMapId !== 'ash_road_threshold'
    || proof.witnessedPreview.session.preflight.receipt.mapId !== 'axiom_second_approach') throw new Error('playable_space_preparation_target_wrong');
  if (proof.witnessedPreview.session.preflight.receipt.route?.authoredLengthTiles !== proof.witnessedPreview.session.preflight.playableSpace.route.targetLengthTiles) {
    throw new Error('playable_space_route_readback_mismatch');
  }
  if (proof.witnessedPreview.prepared.catalogueMapId !== 'ash_road_threshold'
    || proof.witnessedPreview.prepared.mapId !== 'axiom_second_approach'
    || proof.witnessedPreview.prepared.authoringPath !== 'data/bsb-v2/maps/second_approach.authoring.json'
    || proof.witnessedPreview.prepared.playableSpace?.requestedMinutes !== 10) throw new Error('prepared_map_readback_missing');
  if (proof.witnessedPreview.mapAgent.projection?.classification !== 'projection') throw new Error('visible_brush_not_projection_classified');
  if (!proof.witnessedPreview.map.sceneBrush.previewCount && !proof.witnessedPreview.map.undergrowthBrush.previewCount) throw new Error('real_mapforge_preview_missing');
  const previewScreenshot = join(outDir, '02-live-brush-preview.png');
  await page.screenshot({ path: previewScreenshot, fullPage: true });
  proof.screenshots.push(previewScreenshot);

  await page.locator('#bsb-v2-map-canvas').click({ position: { x: 180, y: 180 } });
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'paused' && !window.BsbV2MapAuthoring.agent.status().projection, null, { timeout: 15000 });
  const takeoverPaused = await page.evaluate(() => ({
    session: window.LevelDesignSessionRuntime.status().session,
    mapRevision: window.BsbV2MapAuthoring.status().document.revision,
    resumeVisible: !document.querySelector('[data-level-action="resume"]').hidden,
    activity: window.AgentActivityRuntime.status().latest
  }));
  if (takeoverPaused.mapRevision !== preparedRevision) throw new Error('human_takeover_did_not_cancel_uncommitted_preview');
  if (takeoverPaused.session.controls.pausedReason !== 'human_authoring_takeover') throw new Error(`human_takeover_pause_reason_missing:${takeoverPaused.session.controls.pausedReason}`);
  if (!takeoverPaused.resumeVisible) throw new Error('resume_control_not_visible');

  await page.locator('[data-level-action="direction"]').click();
  await page.locator('#level-design-session-direction-input').fill('Keep the west side sparse and preserve longer sightlines through the trees.');
  await page.locator('#level-design-session-direction button[type="submit"]').click();
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.interventions?.some(item => item.status === 'queued'), null, { timeout: 15000 });
  const pausedScreenshot = join(outDir, '03-paused-safe-boundary.png');
  await page.screenshot({ path: pausedScreenshot, fullPage: true });
  proof.screenshots.push(pausedScreenshot);

  await page.locator('[data-level-action="resume"]').click();
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'previewing' && window.BsbV2MapAuthoring.agent.status().projection?.candidateCount > 0, null, { timeout: 120000 });
  await page.locator('[data-level-action="pause"]').click();
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'paused' && !window.BsbV2MapAuthoring.agent.status().projection, null, { timeout: 15000 });
  const controlPaused = await page.evaluate(() => ({
    revision: window.BsbV2MapAuthoring.status().document.revision,
    reason: window.LevelDesignSessionRuntime.status().session.controls.pausedReason
  }));
  if (controlPaused.revision !== preparedRevision || controlPaused.reason !== 'user_requested') throw new Error(`pause_control_boundary_failed:${JSON.stringify(controlPaused)}`);
  await page.locator('[data-level-action="resume"]').click();
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'completed', null, { timeout: 240000 });
  await page.waitForFunction(() => window.AgentActivityRuntime.status().latest?.status === 'completed', null, { timeout: 20000 });
  proof.completion = await page.evaluate(preparedRevision => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    const activeBatches = session.batches.filter(batch => !batch.undoneAt);
    const createdIds = activeBatches.flatMap(batch => batch.receipt.createdIds);
    const journalEntries = window.ProjectDiaryRuntime.entries?.() || [];
    return {
      session,
      mapRevision: map.document.revision,
      expectedRevision: preparedRevision + activeBatches.length,
      dirty: map.dirty,
      runtimeStatus: map.runtimeStatus,
      families: [...new Set(activeBatches.map(batch => batch.family))],
      createdCount: createdIds.length,
      readbackCount: createdIds.filter(id => map.document.sceneObjects.some(record => record.id === id)).length,
      activity: window.AgentActivityRuntime.status().latest,
      journalMilestones: journalEntries.filter(entry => /AXIOM level-design goal/i.test(entry.source?.text || '')).map(entry => ({ id: entry.id, text: entry.source.text })),
      streamContainsSessionEvents: document.getElementById('stream-feed')?.innerText?.includes('level_design_session') || false
    };
  }, preparedRevision);
  if (proof.completion.mapRevision !== proof.completion.expectedRevision) throw new Error(`session_revision_lineage_mismatch:${proof.completion.mapRevision}:${proof.completion.expectedRevision}`);
  if (proof.completion.families.sort().join(',') !== 'geology,tree,undergrowth') throw new Error(`session_family_coverage_missing:${proof.completion.families}`);
  if (proof.completion.readbackCount !== proof.completion.createdCount) throw new Error('session_canonical_readback_missing');
  if (proof.completion.session.modelInvocations.filter(item => item.ok).length < 4) throw new Error('preflight_and_repeated_model_invocations_missing');
  if (new Set(proof.completion.session.modelInvocations.filter(item => item.ok).map(item => item.id)).size < 4) throw new Error('model_invocation_lineage_reused');
  if (!proof.completion.session.modelInvocations.some(item => /^model_preflight_/.test(item.id))) throw new Error('real_model_preflight_invocation_missing');
  if (proof.completion.session.latestEvaluation?.criteriaMet !== true) throw new Error('session_completed_without_evaluation');
  if (!proof.completion.session.interventions.some(item => item.status === 'consumed' && /west side sparse/i.test(item.text))) throw new Error('human_direction_not_consumed_by_next_plan');
  if (!proof.completion.dirty || proof.completion.runtimeStatus !== 'stale') throw new Error('session_did_not_leave_unsaved_unbaked_authoring_state');
  if (!proof.completion.streamContainsSessionEvents) throw new Error('session_sse_evidence_missing');
  const completedScreenshot = join(outDir, '04-completed-with-evidence.png');
  await page.screenshot({ path: completedScreenshot, fullPage: true });
  proof.screenshots.push(completedScreenshot);

  await page.locator('[data-level-action="undo"]').click();
  await page.waitForFunction(() => !!window.LevelDesignSessionRuntime.status().session?.undo, null, { timeout: 20000 });
  proof.undo = await page.evaluate(({ preparedRevision, targetCount, targetDimensions }) => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    return {
      receipt: session.undo,
      mapRevision: map.document.revision,
      expectedRevision: preparedRevision + session.batches.length + 1,
      sceneObjectCount: map.document.sceneObjects.length,
      targetCount,
      dimensions: { width: map.document.width, height: map.document.height },
      targetDimensions,
      playableSpace: map.document.playableSpace || null,
      mapId: map.document.mapId,
      catalogueMapId: map.activeCatalogueMapId,
      activity: window.AgentActivityRuntime.status().latest
    };
  }, { preparedRevision, targetCount: proof.goalReview.targetSceneObjectCount, targetDimensions: proof.goalReview.targetDimensions });
  if (proof.undo.mapRevision !== proof.undo.expectedRevision) throw new Error('session_undo_revision_lineage_mismatch');
  if (proof.undo.sceneObjectCount !== proof.undo.targetCount) throw new Error('session_undo_did_not_restore_scene_object_count');
  if (JSON.stringify(proof.undo.dimensions) !== JSON.stringify(proof.undo.targetDimensions) || proof.undo.playableSpace) throw new Error('session_undo_did_not_restore_preflight_dimensions');
  if (proof.undo.mapId !== 'axiom_second_approach' || proof.undo.catalogueMapId !== 'ash_road_threshold') throw new Error('session_undo_changed_target_map');
  if (proof.undo.receipt.removedCount !== proof.completion.createdCount) throw new Error('session_undo_removed_count_mismatch');
  const undoScreenshot = join(outDir, '05-session-undo-verified.png');
  await page.screenshot({ path: undoScreenshot, fullPage: true });
  proof.screenshots.push(undoScreenshot);

  proof.pauseResume = {
    humanTakeoverPausedAtRevision: takeoverPaused.mapRevision,
    pauseControlPausedAtRevision: controlPaused.revision,
    directionConsumed: proof.completion.session.interventions.some(item => item.status === 'consumed'),
    resumedAndCompleted: proof.completion.session.state === 'completed',
    noBrushMutationBeforeResume: takeoverPaused.mapRevision === preparedRevision && controlPaused.revision === preparedRevision
  };
  proof.browserIssueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

proof.sourceHashesAfter = {
  firstFlightlessNight: sha256(await readFile(firstAuthoringPath)),
  ashRoadThreshold: sha256(await readFile(ashAuthoringPath))
};
if (JSON.stringify(proof.sourceHashesAfter) !== JSON.stringify(sourceHashesBefore)) throw new Error('level_design_session_persisted_map_without_save');
const proofPath = join(outDir, 'level-design-session-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  launcher: proof.launcher,
  model: proof.localModel,
  sessionId: proof.completion?.session?.id,
  iterations: proof.completion?.session?.iteration,
  modelInvocations: proof.completion?.session?.modelInvocations?.length,
  batches: proof.completion?.session?.batches?.length,
  createdCount: proof.completion?.createdCount,
  pauseResume: proof.pauseResume,
  undoRemoved: proof.undo?.receipt?.removedCount,
  sourcePreserved: JSON.stringify(proof.sourceHashesAfter) === JSON.stringify(sourceHashesBefore)
}, null, 2));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function observePage(targetPage) {
  const result = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  targetPage.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') result.console.push({ type: message.type(), text: message.text() });
  });
  targetPage.on('pageerror', error => result.pageErrors.push(error.stack || error.message));
  targetPage.on('response', response => {
    if (response.status() < 400) return;
    let postData = null;
    try { postData = response.request().postDataJSON(); } catch { }
    result.httpFailures.push({ url: response.url(), status: response.status(), postData });
  });
  targetPage.on('requestfailed', request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));
  return result;
}

function assertNoUnexpectedIssues(result) {
  const consoleIssues = result.console.filter(issue => {
    if (issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')) return false;
    if (issue.type === 'warning' && issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return false;
    if (issue.type === 'error' && issue.text.startsWith('Failed to load resource:')) return false;
    return issue.type === 'error';
  });
  const httpFailures = result.httpFailures.filter(failure => !expectedBackgroundFailure(failure));
  const requestFailures = result.requestFailures.filter(failure => !expectedBackgroundFailure(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`level_design_session_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return { unexpected: 0, expectedBackgroundHttpFailures: result.httpFailures.filter(expectedBackgroundFailure).length };
}

function expectedBackgroundFailure(failure) {
  const url = String(failure.url || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(url)) return true;
  return /\/mcp\/call$/.test(url)
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
