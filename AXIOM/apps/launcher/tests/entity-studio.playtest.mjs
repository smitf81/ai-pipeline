import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const bsbRoot = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const requireFromBsb = createRequire(join(bsbRoot, 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const outDir = join(launcherRoot, 'output', 'playwright', 'entity-studio');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const ownedBsbRuntime = process.env.BSB_PROOF_URL ? null : await startBsbRuntime();
const bsbUrl = process.env.BSB_PROOF_URL || ownedBsbRuntime.url;
const protectedPaths = [
  join(bsbRoot, 'tuning', 'creature-overrides.json'),
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  join(bsbRoot, 'data', 'maps', 'axiom-first-escape.runtime-map.json'),
  join(bsbRoot, 'tuning', 'audio-overrides.json')
];
const protectedSnapshots = await Promise.all(protectedPaths.map(async (filePath) => ({ filePath, content: await readFile(filePath) })));
const beforeHashes = hashSnapshots(protectedSnapshots);

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 960 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = { beforeHashes, screenshots: {}, states: {} };

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring && window.EntityStudioRuntime);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'entity_studio_playwright_proof' });
    window.switchTab?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const authoring = window.BsbV2MapAuthoring.workspaceState();
    const preview = window.ProjectPreviewRuntime.status();
    return authoring.active && authoring.revision != null && preview.project?.id === 'black-sky-bound-v2-demo';
  }, null, { timeout: 30000 });
  if (!bsbUrl.startsWith('http://127.0.0.1:5177/')) {
    await page.waitForFunction(() => document.getElementById('project-preview-frame')?.src.startsWith('http://127.0.0.1:5177/'));
    const declaredRuntimeFrame = page.frames().find((frame) => frame.url().startsWith('http://127.0.0.1:5177/'))
      ?? await page.waitForEvent('framenavigated', { predicate: (frame) => frame.url().startsWith('http://127.0.0.1:5177/'), timeout: 30000 });
    await declaredRuntimeFrame.waitForFunction(() => Boolean(
      window.BSB_V2_DEMO?.state?.game
      && window.BSB_V2_DEMO?.audio?.getDebugState?.().assets?.requiredReady === true
    ), null, { polling: 100, timeout: 30000 });
  }
  await page.evaluate((url) => {
    const frame = document.getElementById('project-preview-frame');
    frame.src = `${url}?skipHatch=1&mamaAuto=0&renderer=webgl3d`;
  }, bsbUrl);
  await page.waitForFunction((url) => document.getElementById('project-preview-frame')?.src.startsWith(url), bsbUrl);
  const bootedRuntimeFrame = page.frames().find((frame) => frame.url().startsWith(bsbUrl))
    ?? await page.waitForEvent('framenavigated', { predicate: (frame) => frame.url().startsWith(bsbUrl), timeout: 30000 });
  try {
    await bootedRuntimeFrame.waitForFunction(() => Boolean(window.BSB_ENTITY_AUTHORING && window.BSB_V2_DEMO?.state?.game), null, { polling: 100, timeout: 30000 });
  } catch (error) {
    proof.states.runtimeBootFailure = await bootedRuntimeFrame.evaluate(() => ({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 240) ?? '',
      hasDemo: Boolean(window.BSB_V2_DEMO),
      hasEntityAuthoring: Boolean(window.BSB_ENTITY_AUTHORING),
      scripts: [...document.scripts].map((script) => script.src || script.type)
    })).catch((runtimeError) => ({ evaluateError: String(runtimeError) }));
    throw error;
  }

  await page.getByTestId('entity-studio-launch').click();
  await page.waitForFunction(() => {
    const studio = window.EntityStudioRuntime.status();
    const targets = window.EntityStudioRuntime.targets();
    return studio.open && studio.connection === 'ready'
      && targets.some((target) => target.runtimeIdentity?.kind === 'raider')
      && targets.some((target) => target.runtimeIdentity?.kind === 'werewolf')
      && targets.some((target) => target.targetId === 'audio:opening-perspective')
      && targets.some((target) => target.targetClass === 'stationary_entity');
  }, null, { timeout: 60000 });

  const discovery = await page.evaluate(() => {
    const targets = window.EntityStudioRuntime.targets();
    return {
      status: window.EntityStudioRuntime.status(),
      raider: targets
        .filter((target) => target.runtimeIdentity?.kind === 'raider')
        .sort((left, right) => Number(left.runtimeProjection?.occlusionDensity ?? 1) - Number(right.runtimeProjection?.occlusionDensity ?? 1))[0],
      werewolf: targets.find((target) => target.runtimeIdentity?.kind === 'werewolf'),
      audio: targets.find((target) => target.targetId === 'audio:opening-perspective'),
      geology: targets.find((target) => target.targetClass === 'stationary_entity')
    };
  });
  if (discovery.raider?.writeStatus !== 'ready' || !discovery.raider.recipeId) throw new Error('recipe_backed_raider_target_missing');
  if (discovery.werewolf?.writeStatus !== 'manifest_missing') throw new Error('werewolf_manifest_gap_not_exposed');
  if (discovery.audio?.writeStatus !== 'ready' || discovery.audio.targetClass !== 'runtime_profile') throw new Error('opening_audio_provider_missing');
  if (!discovery.audio.capabilities.some((entry) => entry.id === 'listener_relative_3d' && entry.status === 'not_connected')) throw new Error('opening_audio_spatial_boundary_missing');
  if (discovery.geology?.writeStatus !== 'ready') throw new Error('stationary_geology_provider_missing');
  proof.states.discovery = summarizeDiscovery(discovery);

  await selectTarget(page, discovery.raider.targetId);
  const runtimeFrame = page.frames().find((frame) => frame.url().startsWith(bsbUrl));
  if (!runtimeFrame) throw new Error('bsb_runtime_frame_missing');
  await runtimeFrame.waitForFunction((targetId) => {
    const snapshot = window.BSB_ENTITY_AUTHORING?.snapshot?.();
    return snapshot?.session?.active && snapshot.session.focusedTargetId === targetId
      && window.BSB_V2_DEMO?.state?.paused === true
      && window.BSB_V2_DEMO?.state?.game?.cameraVisibilityFocus?.targetEntityId === targetId.replace(/^actor:/, '');
  }, discovery.raider.targetId);
  await runtimeFrame.waitForFunction((targetId) => {
    const focus = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.cameraVisibilityFocus;
    return focus?.active === true && focus.targetEntityId === targetId.replace(/^actor:/, '');
  }, discovery.raider.targetId);
  proof.states.viewportFocus = await runtimeFrame.evaluate(() => ({
    session: window.BSB_ENTITY_AUTHORING.snapshot().session,
    camera: structuredClone(window.BSB_V2_DEMO.state.camera),
    paused: window.BSB_V2_DEMO.state.paused,
    cameraVisibilityFocus: structuredClone(window.BSB_V2_DEMO.state.game.cameraVisibilityFocus),
    rendererFocus: structuredClone(window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.cameraVisibilityFocus)
  }));
  await page.waitForFunction(() => /Camera focus · live on selection/.test(document.querySelector('[data-testid="entity-studio-camera-focus"]')?.textContent || ''));
  const cameraFocusGroup = page.getByTestId('entity-studio-details').locator('details').filter({ hasText: 'Camera focus' });
  if ((await cameraFocusGroup.getAttribute('open')) == null) await cameraFocusGroup.locator('summary').click();
  await page.waitForFunction(() => document.querySelector('[data-path="visibilityFocus.radiusMeters"]'));
  const tuningProposal = await page.evaluate((targetId) => {
    const target = window.EntityStudioRuntime.getTarget(targetId);
    const field = target.fields.find((entry) => entry.path === 'visibilityFocus.radiusMeters');
    const value = Math.min(field.max, Number((field.value + field.step * 3).toFixed(3)));
    return window.EntityStudioRuntime.propose({ targetId, path: field.path, value }).then((result) => ({ result, value, before: field.value }));
  }, discovery.raider.targetId);
  if (tuningProposal.result.applied !== false || tuningProposal.result.classification !== 'candidate') throw new Error('human_edit_bypassed_candidate');
  if ((await currentHash(protectedPaths[0])) !== beforeHashes[protectedPaths[0]]) throw new Error('candidate_mutated_tuning_file_before_apply');
  proof.states.humanCandidate = tuningProposal;

  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.waitForFunction(() => window.EntityStudioRuntime.status().candidate?.status === 'previewing');
  await runtimeFrame.waitForFunction((expected) => {
    const focus = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.cameraVisibilityFocus;
    return focus?.targetEntityId === expected.targetId.replace(/^actor:/, '') && focus.radiusMeters === expected.value;
  }, { targetId: discovery.raider.targetId, value: tuningProposal.value });
  proof.states.cameraFocusPreview = await runtimeFrame.evaluate(() => structuredClone(
    window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.cameraVisibilityFocus
  ));
  proof.states.panelComposition = await assertPanelComposition(page);
  proof.screenshots.cameraFocusPreview = join(outDir, 'entity-studio-camera-focus-preview.png');
  await page.screenshot({ path: proof.screenshots.cameraFocusPreview, fullPage: true });

  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => {
    const status = window.EntityStudioRuntime.status();
    return !status.candidate && status.lastReceipt?.readBack?.status === 'verified';
  }, null, { timeout: 12000 });
  const tuningHashAfterApply = await currentHash(protectedPaths[0]);
  if (tuningHashAfterApply === beforeHashes[protectedPaths[0]]) throw new Error('apply_did_not_persist_tuning_change');
  proof.states.humanApply = await page.evaluate(() => window.EntityStudioRuntime.status().lastReceipt);
  if (proof.states.humanApply.runtimeRefresh !== 'complete') throw new Error('runtime_projection_not_refreshed');

  const responseCountBeforeReload = await page.evaluate(() => window.EntityStudioRuntime.status().diagnostics.responseCount);
  await page.evaluate((url) => {
    const frame = document.getElementById('project-preview-frame');
    frame.src = `${url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&entityStudioReload=${Date.now()}`;
  }, bsbUrl);
  await page.waitForFunction((expected) => {
    const status = window.EntityStudioRuntime.status();
    const target = window.EntityStudioRuntime.getTarget(expected.targetId);
    const field = target?.fields?.find((entry) => entry.path === 'visibilityFocus.radiusMeters');
    return status.connection === 'ready'
      && status.diagnostics.responseCount > expected.responseCount
      && field?.value === expected.value;
  }, { targetId: discovery.raider.targetId, value: tuningProposal.value, responseCount: responseCountBeforeReload }, { timeout: 30000 });
  const reloadedRuntimeFrame = page.frames().find((frame) => frame.url().startsWith(bsbUrl));
  if (!reloadedRuntimeFrame) throw new Error('reloaded_bsb_runtime_frame_missing');
  await reloadedRuntimeFrame.waitForFunction((targetId) => window.BSB_ENTITY_AUTHORING?.snapshot?.().session?.focusedTargetId === targetId, discovery.raider.targetId);
  proof.states.reloadReadback = await page.evaluate((targetId) => {
    const target = window.EntityStudioRuntime.getTarget(targetId);
    return target.fields.find((entry) => entry.path === 'visibilityFocus.radiusMeters').value;
  }, discovery.raider.targetId);

  const agentResult = await page.evaluate(async (targetId) => {
    const target = window.EntityStudioRuntime.getTarget(targetId);
    const field = target.fields.find((entry) => entry.path === 'body.shoulderWidth');
    return window.EDITOR.mcp.call('axiom_entity_tuning_propose', {
      targetId,
      path: 'body.shoulderWidth',
      value: Number(Math.min(field.max, field.value + field.step).toFixed(3)),
      reason: 'Playwright proof that agent proposals remain reviewable candidates',
      source: { kind: 'agent', id: 'entity_studio_playwright' }
    });
  }, discovery.raider.targetId);
  const agentCandidateState = await page.evaluate(() => window.EntityStudioRuntime.status());
  if (agentResult?.result?.applied !== false || agentCandidateState.candidate?.source?.kind !== 'agent') throw new Error('agent_proposal_was_not_noncommitted_candidate');
  if ((await currentHash(protectedPaths[0])) !== tuningHashAfterApply) throw new Error('agent_proposal_mutated_canonical_tuning');
  proof.states.agentCandidate = { response: agentResult.result, studio: agentCandidateState };
  proof.screenshots.agentCandidate = join(outDir, 'entity-studio-agent-candidate.png');
  await page.screenshot({ path: proof.screenshots.agentCandidate, fullPage: true });
  await page.evaluate(() => window.EntityStudioRuntime.revertCandidate());
  await page.waitForFunction(() => !window.EntityStudioRuntime.status().candidate);

  await selectTarget(page, discovery.audio.targetId);
  await page.waitForFunction(() => /3D falloff not active/.test(document.querySelector('[data-testid="entity-studio-audio-perspective"]')?.textContent || ''));
  await reloadedRuntimeFrame.waitForFunction(() => {
    const snapshot = window.BSB_ENTITY_AUTHORING?.snapshot?.();
    return snapshot?.session?.focusedTargetId === 'audio:opening-perspective'
      && window.BSB_V2_DEMO?.state?.paused === false
      && window.BSB_V2_DEMO?.state?.opening?.source === 'axiom_opening_audio_preview';
  });
  const audioHashBeforeCandidate = await currentHash(protectedPaths[3]);
  const audioProposal = await page.evaluate((targetId) => {
    const target = window.EntityStudioRuntime.getTarget(targetId);
    const field = target.fields.find((entry) => entry.path === 'openingPerspective.sealedCutoffHz');
    const value = Math.max(field.min, Number((field.value - field.step * 2).toFixed(3)));
    return window.EntityStudioRuntime.propose({ targetId, path: field.path, value }).then((result) => ({ result, value, before: field.value }));
  }, discovery.audio.targetId);
  if (audioProposal.result.applied !== false || audioProposal.result.classification !== 'candidate') throw new Error('audio_edit_bypassed_candidate');
  if ((await currentHash(protectedPaths[3])) !== audioHashBeforeCandidate) throw new Error('audio_candidate_mutated_file_before_apply');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.waitForFunction(() => window.EntityStudioRuntime.status().candidate?.status === 'previewing');
  await reloadedRuntimeFrame.waitForFunction((expected) => {
    const perspective = window.BSB_V2_DEMO?.audio?.getDebugState?.().audioPerspective;
    return perspective?.tuning?.sealedCutoffHz === expected
      && perspective.listenerRelativeAttenuation === false
      && perspective.spatialEmitterCount === 0;
  }, audioProposal.value);
  await reloadedRuntimeFrame.locator('#game').click({ position: { x: 360, y: 320 } });
  await reloadedRuntimeFrame.waitForFunction(() => window.BSB_V2_DEMO?.audio?.getDebugState?.().assets?.requiredReady === true, null, { timeout: 30000 });
  await reloadedRuntimeFrame.evaluate(() => window.advanceTime(1500));
  for (const key of ['KeyW', 'KeyD', 'KeyS', 'KeyA']) {
    await page.keyboard.down(key);
    await reloadedRuntimeFrame.evaluate(() => window.advanceTime(50));
    await page.keyboard.up(key);
    await reloadedRuntimeFrame.evaluate(() => window.advanceTime(500));
  }
  await reloadedRuntimeFrame.waitForFunction(() => {
    const audio = window.BSB_V2_DEMO?.audio?.getDebugState?.();
    return audio?.recentCues?.some((cue) => cue.soundscapeId === 'storm_answer_after_first_light')
      && audio?.recentCues?.some((cue) => cue.soundscapeId === 'husk_beyond_shell')
      && window.BSB_V2_DEMO?.state?.opening?.acceptedInputCount >= 4;
  });
  proof.states.audioPreview = await reloadedRuntimeFrame.evaluate(() => ({
    opening: structuredClone(window.BSB_V2_DEMO.state.opening),
    perspective: structuredClone(window.BSB_V2_DEMO.audio.getDebugState().audioPerspective),
    pressure: structuredClone(window.BSB_V2_DEMO.audio.getDebugState().pressure),
    shellCues: structuredClone(window.BSB_V2_DEMO.audio.getDebugState().recentCues.filter((cue) => cue.soundscapeId))
  }));
  const firstShellCue = proof.states.audioPreview.shellCues.find((cue) => cue.soundscapeId === 'storm_answer_after_first_light');
  if (Math.abs(firstShellCue.gainScale - proof.states.audioPreview.perspective.effective.exteriorGain) > 0.01) throw new Error('audio_preview_exterior_gain_not_consumed');
  if (firstShellCue.muffleAtPlay < 0.85 || proof.states.audioPreview.pressure.muffleCutoffHz !== audioProposal.value) throw new Error('audio_preview_shell_transmission_not_consumed');
  proof.screenshots.audioPreview = join(outDir, 'entity-studio-opening-audio-preview.png');
  await page.screenshot({ path: proof.screenshots.audioPreview, fullPage: true });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.waitForFunction(() => {
    const status = window.EntityStudioRuntime.status();
    return !status.candidate
      && status.lastReceipt?.persistedDestination === 'tuning/audio-overrides.json'
      && status.lastReceipt?.readBack?.status === 'verified';
  });
  if ((await currentHash(protectedPaths[3])) === audioHashBeforeCandidate) throw new Error('audio_apply_did_not_persist');
  proof.states.audioApply = await page.evaluate(() => window.EntityStudioRuntime.status().lastReceipt);

  const audioResponseCountBeforeReload = await page.evaluate(() => window.EntityStudioRuntime.status().diagnostics.responseCount);
  await page.evaluate((url) => {
    const frame = document.getElementById('project-preview-frame');
    frame.src = `${url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&audioStudioReload=${Date.now()}`;
  }, bsbUrl);
  await page.waitForFunction((expected) => {
    const status = window.EntityStudioRuntime.status();
    const target = window.EntityStudioRuntime.getTarget('audio:opening-perspective');
    const field = target?.fields?.find((entry) => entry.path === 'openingPerspective.sealedCutoffHz');
    return status.connection === 'ready'
      && status.diagnostics.responseCount > expected.responseCount
      && field?.value === expected.value;
  }, { value: audioProposal.value, responseCount: audioResponseCountBeforeReload }, { timeout: 30000 });
  proof.states.audioReloadReadback = await page.evaluate(() => {
    const target = window.EntityStudioRuntime.getTarget('audio:opening-perspective');
    return {
      value: target.fields.find((entry) => entry.path === 'openingPerspective.sealedCutoffHz').value,
      source: target.canonicalSource,
      projection: target.runtimeProjection.audioPerspective
    };
  });

  await selectTarget(page, discovery.werewolf.targetId);
  await page.waitForFunction(() => /No editable manifest exists/.test(document.querySelector('[data-testid="entity-studio-details"]')?.innerText || ''));
  proof.states.manifestGapText = await page.getByTestId('entity-studio-details').innerText();

  await selectTarget(page, discovery.geology.targetId);
  const geologyBeforeHash = await currentHash(protectedPaths[1]);
  const geologyCandidate = await page.evaluate((targetId) => {
    const target = window.EntityStudioRuntime.getTarget(targetId);
    const field = target.fields.find((entry) => entry.path === 'geology.erosion');
    const value = Math.min(field.max, Number((field.value + .07).toFixed(3)));
    return window.EntityStudioRuntime.propose({ targetId, path: field.path, value }).then((result) => ({ result, value }));
  }, discovery.geology.targetId);
  await page.evaluate(() => window.EntityStudioRuntime.previewCandidate());
  if (geologyCandidate.result.candidate.previewScope !== 'details_projection') throw new Error('stationary_candidate_scope_not_explicit');
  if ((await currentHash(protectedPaths[1])) !== geologyBeforeHash) throw new Error('stationary_candidate_mutated_map_before_apply');
  proof.states.stationaryCandidate = await page.evaluate(() => window.EntityStudioRuntime.status().candidate);
  proof.screenshots.stationaryCandidate = join(outDir, 'entity-studio-stationary-candidate.png');
  await page.screenshot({ path: proof.screenshots.stationaryCandidate, fullPage: true });
  await page.evaluate(() => window.EntityStudioRuntime.revertCandidate());

  proof.unexpectedIssues = assertNoUnexpectedIssues(issues);
} catch (error) {
  proof.failure = String(error?.stack || error);
  proof.failureState = await page.evaluate(() => ({
    studio: window.EntityStudioRuntime?.status?.() || null,
    targets: (window.EntityStudioRuntime?.targets?.().slice(0, 6) || []).map((target) => ({ targetId: target.targetId, kind: target.runtimeIdentity?.kind, writeStatus: target.writeStatus })),
    preview: window.ProjectPreviewRuntime?.status?.() || null,
    iframe: document.getElementById('project-preview-frame')?.src || null,
    frames: null
  })).catch(() => null);
  if (proof.failureState) proof.failureState.frames = page.frames().map((frame) => frame.url());
  const runtimeFrame = page.frames().find((frame) => frame.url().startsWith(bsbUrl));
  proof.failureRuntime = runtimeFrame ? await runtimeFrame.evaluate(() => ({
    bridge: window.BSB_ENTITY_AUTHORING_BRIDGE || null,
    runtime: window.BSB_ENTITY_AUTHORING?.snapshot?.() || null
  })).catch(() => null) : null;
  proof.screenshots.failure = join(outDir, 'entity-studio-failure.png');
  await page.screenshot({ path: proof.screenshots.failure, fullPage: true }).catch(() => {});
  console.error(JSON.stringify({ failure: proof.failure, state: proof.failureState, runtime: proof.failureRuntime, issues }, null, 2));
  throw error;
} finally {
  await browser.close();
  ownedBsbRuntime?.stop();
  await Promise.all(protectedSnapshots.map((snapshot) => writeFile(snapshot.filePath, snapshot.content)));
}

proof.afterRestoreHashes = Object.fromEntries(await Promise.all(protectedPaths.map(async (filePath) => [filePath, await currentHash(filePath)])));
if (JSON.stringify(beforeHashes) !== JSON.stringify(proof.afterRestoreHashes)) throw new Error('protected_files_not_restored_after_entity_studio_proof');
proof.issues = issues;
const evidencePath = join(outDir, 'entity-studio-proof.json');
await writeFile(evidencePath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, evidencePath, screenshots: proof.screenshots, protectedFilesRestored: true }, null, 2));

async function selectTarget(page, targetId) {
  await page.locator(`[data-target-id="${targetId}"]`).click();
  await page.waitForFunction((id) => window.EntityStudioRuntime.status().selectedId === id, targetId);
}

async function assertPanelComposition(page) {
  const composition = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom, right: rect.right } : null;
    };
    return {
      panel: box('[data-testid="entity-studio"]'),
      targets: box('[data-testid="entity-studio-targets"]'),
      details: box('[data-testid="entity-studio-details"]'),
      candidate: box('[data-testid="entity-studio-candidate"]'),
      viewport: box('#project-preview-frame')
    };
  });
  if (!composition.panel || !composition.targets || !composition.details || !composition.candidate || !composition.viewport) {
    throw new Error(`entity_studio_panel_region_missing:${JSON.stringify(composition)}`);
  }
  if (composition.targets.height > 205) throw new Error(`entity_studio_outliner_overwhelms_details:${composition.targets.height}`);
  if (composition.details.y >= composition.panel.bottom - 220) throw new Error(`entity_studio_details_not_salient:${composition.details.y}`);
  if (composition.candidate.bottom > composition.panel.bottom || composition.candidate.y < composition.panel.y) {
    throw new Error(`entity_studio_candidate_not_visible:${JSON.stringify(composition.candidate)}`);
  }
  if (composition.viewport.width <= composition.panel.width) throw new Error('entity_studio_viewport_not_dominant');
  return composition;
}

function summarizeDiscovery(discovery) {
  return {
    status: discovery.status,
    raider: { targetId: discovery.raider.targetId, providerId: discovery.raider.providerId, recipeId: discovery.raider.recipeId, capabilities: discovery.raider.capabilities },
    werewolf: { targetId: discovery.werewolf.targetId, providerId: discovery.werewolf.providerId, writeStatus: discovery.werewolf.writeStatus },
    audio: { targetId: discovery.audio.targetId, providerId: discovery.audio.providerId, capabilities: discovery.audio.capabilities },
    geology: { targetId: discovery.geology.targetId, providerId: discovery.geology.providerId, capabilities: discovery.geology.capabilities }
  };
}

function observePage(page) {
  const issues = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') issues.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => issues.pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      let postData = null;
      try { postData = response.request().postDataJSON(); } catch {}
      issues.httpFailures.push({ url: response.url(), status: response.status(), postData });
    }
  });
  page.on('requestfailed', (request) => issues.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));
  return issues;
}

function assertNoUnexpectedIssues(issues) {
  const consoleIssues = issues.console.filter((issue) => {
    if (issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')) return false;
    if (issue.type === 'warning' && issue.text.includes('GL Driver Message')) return false;
    if (issue.type === 'error' && issue.text.startsWith('Failed to load resource:')) return false;
    return issue.type === 'error';
  });
  const httpFailures = issues.httpFailures.filter((failure) => {
    if (failure.url.startsWith('http://127.0.0.1:11434/') || failure.url.startsWith('http://localhost:1234/')) return false;
    if (failure.url === 'http://localhost:3007/mcp/call' && failure.status === 500
      && failure.postData?.tool === 'fs_ls' && /docs\/skills/i.test(String(failure.postData?.params?.path || ''))) return false;
    return true;
  });
  const requestFailures = issues.requestFailures.filter((failure) => {
    if (failure.url.startsWith('http://127.0.0.1:11434/') || failure.url.startsWith('http://localhost:1234/')) return false;
    if (failure.url === 'http://127.0.0.1:4242/call') return false;
    if (failure.url.startsWith('http://127.0.0.1:5177/')
      && !bsbUrl.startsWith('http://127.0.0.1:5177/') && failure.error === 'net::ERR_ABORTED') return false;
    return true;
  });
  if (issues.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`entity_studio_browser_issues:${JSON.stringify({ pageErrors: issues.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return { console: consoleIssues, pageErrors: [...issues.pageErrors], httpFailures, requestFailures };
}

function hashSnapshots(snapshots) {
  return Object.fromEntries(snapshots.map(({ filePath, content }) => [filePath, hash(content)]));
}

async function currentHash(filePath) { return hash(await readFile(filePath)); }
function hash(content) { return createHash('sha256').update(content).digest('hex'); }

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}

async function startBsbRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: bsbRoot,
    env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`bsb_server_exited:${child.exitCode}:${output}`);
    try {
      const response = await fetch(`${url}__bsb_runtime_identity`);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`bsb_server_timeout:${output}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
