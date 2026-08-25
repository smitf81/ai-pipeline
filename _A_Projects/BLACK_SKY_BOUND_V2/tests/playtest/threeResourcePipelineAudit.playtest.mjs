import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactRoot = path.join(projectRoot, 'artifacts', 'three-resource-pipeline-optimization-v1');
const reportFile = path.join(artifactRoot, 'report.json');
const screenshotFile = path.join(artifactRoot, 'active-play.png');
const overflowWarningScreenshotFile = path.join(artifactRoot, 'overflow-warning.png');
await mkdir(artifactRoot, { recursive: true });

const runtime = await startRuntime();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
const network = [];
let networkPhase = 'boot';

page.on('console', (message) => {
  if (message.type() === 'error') issues.consoleErrors.push(message.text());
});
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  issues.requestFailures.push(request.method() + ' ' + request.url() + ' ' + (request.failure()?.errorText ?? ''));
});
page.on('request', (request) => {
  if (!/\/assets\/(textures|models)\//.test(request.url())) return;
  network.push({
    phase: networkPhase,
    resourceType: request.resourceType(),
    url: request.url()
  });
});

await page.addInitScript(() => {
  window.__bsbAuditLongTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__bsbAuditLongTasks.push({
          startTime: Math.round(entry.startTime * 1000) / 1000,
          duration: Math.round(entry.duration * 1000) / 1000
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
});

const session = await context.newCDPSession(page);
await session.send('Profiler.enable');
await session.send('Profiler.setSamplingInterval', { interval: 100 });
await session.send('Profiler.start');

try {
  const url = runtime.url + '?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1&resourceAudit=1&renderEnvelope=1&renderEnvelopeMargin=1.5&renderEnvelopeChunkTiles=24';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => {
    const diagnostics = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics;
    return diagnostics?.liveWorld?.renderEnvelope?.totalRenderables > 0
      && diagnostics?.frameTiming?.warmedUp === true;
  }, null, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const diagnostics = window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics;
    const statuses = [
      diagnostics?.cache?.barkPbr?.status,
      diagnostics?.cache?.foliagePbr?.status,
      diagnostics?.liveWorld?.terrain?.grassMaterial?.status,
      diagnostics?.liveWorld?.terrain?.mudMaterial?.status,
      diagnostics?.liveWorld?.terrain?.rockMaterial?.status,
      diagnostics?.liveWorld?.effects?.mamaFlyoverAsset?.status
    ].filter(Boolean);
    return statuses.length >= 5 && statuses.every((status) => status === 'ready');
  }, null, { timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 20_000 });
  await page.evaluate(() => window.BSB_V2_DEMO.stop());

  const bootProfile = (await session.send('Profiler.stop')).profile;
  const boot = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      diagnostics: structuredClone(diagnostics),
      longTasks: structuredClone(window.__bsbAuditLongTasks ?? []),
      navigation: performance.getEntriesByType('navigation').map((entry) => ({
        domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd * 1000) / 1000,
        loadMs: Math.round(entry.loadEventEnd * 1000) / 1000,
        durationMs: Math.round(entry.duration * 1000) / 1000,
        transferSize: entry.transferSize
      })),
      heap: readHeap()
    };

    function readHeap() {
      const value = performance.memory;
      return value ? {
        usedBytes: value.usedJSHeapSize,
        totalBytes: value.totalJSHeapSize,
        limitBytes: value.jsHeapSizeLimit
      } : null;
    }
  });

  await installRuntimeAudit(page);
  const before = await page.evaluate(() => {
    window.__bsbResourceAudit.reset();
    window.BSB_V2_DEMO.renderer.backend.resourceAuditTarget().renderer.shadowMap.needsUpdate = true;
    for (let index = 0; index < 24; index += 1) window.advanceTime(1000 / 60);
    return {
      draw: window.__bsbResourceAudit.snapshot(),
      inventory: window.__bsbResourceAudit.inventory(),
      materialVersions: window.__bsbResourceAudit.materialVersions(),
      diagnostics: structuredClone(window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics),
      heap: window.__bsbResourceAudit.heap()
    };
  });

  networkPhase = 'active-play';
  await page.evaluate(() => {
    performance.clearResourceTimings();
    window.__bsbAuditLongTasks = [];
    const app = window.BSB_V2_DEMO;
    app.worldEvents.setAutoEnabled(false);
    app.worldEvents.inferno({ lightningSync: true });
    app.state.game.unitSpawners = [];
    app.state.game.unitSpawnerFixtures = [];
    app.state.game.renderLayers.atmosphericOverlay = {
      ...(app.state.game.renderLayers.atmosphericOverlay ?? {}),
      enabled: true,
      rainEnabled: true,
      rainDensity: 1,
      sparkEnabled: true,
      sparkRate: 8,
      overlayOpacity: 0.9,
      emitterReactiveOverlayEnabled: true
    };
    const player = app.state.game.actors.find((actor) => actor.team === 'player') ?? app.state.game.actors[0];
    window.__bsbAuditLightIds = Array.from({ length: 32 }, (_, index) => `resource-audit-light:${index}`);
    app.state.game.sceneLights.push(...window.__bsbAuditLightIds.map((id, index) => ({
      id,
      sourceKind: 'resource_audit_local_light',
      sourcePolicy: 'browser_test_only_deterministic_overflow',
      enabled: true,
      x: Number(player?.x ?? 20) + (index % 8 - 3.5) * 0.18,
      y: Number(player?.y ?? 27) + (Math.floor(index / 8) - 1.5) * 0.18,
      radius: 4,
      intensity: 0.62,
      softness: 0.8,
      colour: 'rgba(255,140,70,1)',
      innerColour: 'rgba(255,220,160,1)',
      castsShadows: false
    })));
    window.__bsbResourceAudit.reset();
    window.__bsbAuditRuntimeSamples = [];
    window.__bsbAuditRuntimeSampleTimer = setInterval(() => {
      const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
      window.__bsbAuditRuntimeSamples.push({
        frame: app.state.diagnostics.frame,
        localLights: diagnostics?.liveWorld?.lights?.localLightCount ?? 0,
        droppedLights: diagnostics?.liveWorld?.lights?.droppedLocalCount ?? 0,
        lightOverflow: diagnostics?.liveWorld?.lights?.overflowActive === true,
        contactDebugEnabled: diagnostics?.liveWorld?.actors?.contactDebug?.enabled === true,
        contactDebugPool: diagnostics?.liveWorld?.actors?.contactDebug?.pooledVolumes ?? 0,
        effectsAllocations: diagnostics?.liveWorld?.effects?.allocations ?? 0,
        shaderPrograms: app.renderer.backend.resourceAuditTarget().renderer.info.programs?.length ?? null
      });
    }, 50);
  });

  await page.evaluate(() => window.BSB_V2_DEMO.start());
  await page.waitForFunction(() => {
    const element = document.querySelector('#bsb-three-diagnostics');
    return element?.style.display !== 'none' && element?.textContent?.includes('LIGHT BUDGET');
  }, null, { timeout: 7_000 });
  const overflowWarning = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    const element = document.querySelector('#bsb-three-diagnostics');
    return {
      text: element?.textContent ?? '',
      contactDebugEnabled: diagnostics?.liveWorld?.actors?.contactDebug?.enabled === true,
      contactDebugPool: diagnostics?.liveWorld?.actors?.contactDebug?.pooledVolumes ?? 0
    };
  });
  await page.screenshot({ path: overflowWarningScreenshotFile });
  await page.evaluate(() => {
    const ids = new Set(window.__bsbAuditLightIds ?? []);
    window.BSB_V2_DEMO.state.game.sceneLights = window.BSB_V2_DEMO.state.game.sceneLights.filter((light) => !ids.has(light.id));
  });
  await page.waitForFunction(() => document.querySelector('#bsb-three-diagnostics')?.style.display === 'none', null, { timeout: 3_000 });
  await page.waitForTimeout(4_000);
  await page.evaluate(() => window.BSB_V2_DEMO.stop());
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    clearInterval(window.__bsbAuditRuntimeSampleTimer);
    return {
      draw: window.__bsbResourceAudit.snapshot(),
      inventory: window.__bsbResourceAudit.inventory(),
      materialVersions: window.__bsbResourceAudit.materialVersions(),
      diagnostics: structuredClone(app.state.game.renderLayers.renderer.webgl3dDiagnostics),
      activeResourceEntries: performance.getEntriesByType('resource')
        .filter((entry) => /\/assets\/(textures|models)\//.test(entry.name))
        .map((entry) => ({
          name: entry.name,
          initiatorType: entry.initiatorType,
          startTime: Math.round(entry.startTime * 1000) / 1000,
          durationMs: Math.round(entry.duration * 1000) / 1000,
          transferSize: entry.transferSize,
          decodedBodySize: entry.decodedBodySize
        })),
      longTasks: structuredClone(window.__bsbAuditLongTasks ?? []),
      runtimeSamples: structuredClone(window.__bsbAuditRuntimeSamples ?? []),
      heap: window.__bsbResourceAudit.heap()
    };
  });

  await page.screenshot({ path: screenshotFile });
  const report = {
    contract: 'black-sky-bound.three-resource-pipeline-optimization.v1',
    generatedAt: new Date().toISOString(),
    status: 'passed',
    command: 'node tests/playtest/threeResourcePipelineAudit.playtest.mjs',
    url,
    viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    fixedIsometricRenderEnvelope: {
      before: before.diagnostics.liveWorld.renderEnvelope,
      after: after.diagnostics.liveWorld.renderEnvelope
    },
    cpuProfiles: {
      bootTop: summarizeProfile(bootProfile).slice(0, 60),
      activeTop: []
    },
    boot,
    before,
    after,
    deltas: buildDeltas(before, after),
    network,
    issues,
    screenshot: screenshotFile,
    overflowWarning: { ...overflowWarning, screenshot: overflowWarningScreenshotFile }
  };

  assert.ok(report.fixedIsometricRenderEnvelope.after.culled > 0, 'fixed isometric render-envelope culling must remain active');
  assert.equal(
    report.fixedIsometricRenderEnvelope.after.visible
      + report.fixedIsometricRenderEnvelope.after.margin
      + report.fixedIsometricRenderEnvelope.after.culled,
    report.fixedIsometricRenderEnvelope.after.totalRenderables,
    'render-envelope accounting must remain complete'
  );
  assert.ok(report.overflowWarning.text.includes('local light(s) dropped'), 'overflow must remain visibly reported in the compact warning');
  assert.equal(report.overflowWarning.contactDebugEnabled, false, 'visible overflow warning must not enable contact-debug geometry');
  assert.equal(report.overflowWarning.contactDebugPool, 0, 'visible overflow warning must not allocate the contact-debug pool');
  assert.ok(after.runtimeSamples.every((sample) => !sample.contactDebugEnabled && sample.contactDebugPool === 0), 'light overflow must not enable or allocate contact-debug geometry');
  assert.equal(after.inventory.byClass.diagnostics_debug?.meshObjects ?? 0, 0, 'normal active play must retain no diagnostics mesh objects');
  assert.equal(
    report.deltas.materialVersionChanges.filter((entry) => entry.categories.includes('rain') || entry.categories.includes('vfx_atmosphere_sparks')).length,
    0,
    'stable rain and spark updates must not invalidate their materials'
  );
  assert.equal(after.inventory.byClass.vfx_baby_drool?.transparentDoubleSideMeshes ?? 0, 0, 'baby-drool transparent double-sided batches must use single-pass rendering');
  assert.equal(after.inventory.byClass.vfx_foliage_fire?.transparentDoubleSideMeshes ?? 0, 0, 'foliage-fire transparent double-sided batches must use single-pass rendering');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] }, 'browser audit should remain error-free');
  await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await writeFile(path.join(artifactRoot, 'boot-cpu-profile.json'), JSON.stringify(bootProfile) + '\n', 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportFile,
    screenshot: screenshotFile,
    overflowWarningScreenshot: overflowWarningScreenshotFile,
    callsPerFrame: after.draw.callsPerFrame,
    resources: after.inventory.summary,
    deltas: report.deltas,
    topBoot: report.cpuProfiles.bootTop.slice(0, 12),
    topActive: report.cpuProfiles.activeTop.slice(0, 12)
  }, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  runtime.stop();
}

async function installRuntimeAudit(targetPage) {
  await targetPage.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const backend = app.renderer.backend;
    const target = backend.resourceAuditTarget();
    if (!target) throw new Error('three_resource_audit_target_unavailable');
    const scene = target.scene;
    const renderer = target.renderer;
    const audit = {
      renderFrames: 0,
      rendererCalls: 0,
      rendererTriangles: 0,
      mainCalls: {},
      shadowCalls: {},
      wrapped: new Set()
    };

    const originalRender = renderer.render;
    renderer.render = function (...args) {
      scene.traverse((object) => wrapMesh(object));
      const result = originalRender.apply(this, args);
      audit.renderFrames += 1;
      audit.rendererCalls += Number(this.info.render.calls ?? 0);
      audit.rendererTriangles += Number(this.info.render.triangles ?? 0);
      return result;
    };

    scene.traverse((object) => wrapMesh(object));

    function wrapMesh(object) {
      if (!object.isMesh || audit.wrapped.has(object.uuid)) return;
      audit.wrapped.add(object.uuid);
      const category = classify(object);
      const beforeRender = object.onBeforeRender;
      const beforeShadow = object.onBeforeShadow;
      object.onBeforeRender = function (...args) {
        const material = args[4];
        const passes = material?.transparent === true && material?.side === 2 && material?.forceSinglePass === false ? 2 : 1;
        audit.mainCalls[category] = (audit.mainCalls[category] ?? 0) + passes;
        return beforeRender?.apply(this, args);
      };
      object.onBeforeShadow = function (...args) {
        audit.shadowCalls[category] = (audit.shadowCalls[category] ?? 0) + 1;
        return beforeShadow?.apply(this, args);
      };
    }

    function classify(object) {
      const names = [];
      let cursor = object;
      let renderKind = '';
      let hasTreeRecipe = false;
      while (cursor) {
        names.push(cursor.name ?? '');
        renderKind = renderKind || cursor.userData?.renderKind || '';
        hasTreeRecipe = hasTreeRecipe || !!cursor.userData?.recipe;
        cursor = cursor.parent;
      }
      const text = names.join('|').toLowerCase();
      if (/terrain:grass-detail/.test(text)) return 'terrain_grass_detail';
      if (/terrain:rock/.test(text)) return 'terrain_rock';
      if (/terrain:water/.test(text)) return 'terrain_water';
      if (/terrain:/.test(text)) return 'terrain_floor';
      if (/undergrowth/.test(text)) return 'foliage_undergrowth';
      if (hasTreeRecipe || /tree:/.test(text)) return 'trees';
      if (/procedural_geology/.test(renderKind) || /geology/.test(text)) return 'rocks_props';
      if (/foliage-fire/.test(text)) return 'vfx_foliage_fire';
      if (/baby-drool/.test(text)) return 'vfx_baby_drool';
      if (/rain/.test(text)) return 'rain';
      if (/atmosphere-spark/.test(text)) return 'vfx_atmosphere_sparks';
      if (/mama.*dragonfire|dragonfire/.test(text)) return 'vfx_dragonfire';
      if (/mama-flyover/.test(text)) return 'vfx_mama_flyover';
      if (/effects:/.test(text) || /three:effects/.test(text)) return 'vfx_recurring';
      if (/actor:|actors:|procedural-humanoid|wyvern-v2/.test(text)) return 'actors';
      if (/opening:/.test(text)) return 'opening';
      if (/scenery:/.test(text)) return 'scenery_props';
      if (/debug:|diagnostic/.test(text)) return 'diagnostics_debug';
      return 'other';
    }

    function effectiveVisible(object) {
      let cursor = object;
      while (cursor) {
        if (!cursor.visible) return false;
        cursor = cursor.parent;
      }
      return true;
    }

    function geometryFingerprint(geometry) {
      const attributes = Object.keys(geometry.attributes ?? {}).sort().map((key) => {
        const value = geometry.attributes[key];
        return key + ':' + value.itemSize + ':' + value.count + ':' + value.array?.constructor?.name;
      }).join(',');
      return [
        geometry.type,
        geometry.index?.count ?? 0,
        geometry.attributes?.position?.count ?? 0,
        attributes
      ].join('|');
    }

    function materialFingerprint(material) {
      let programKey = '';
      try { programKey = material.customProgramCacheKey?.() ?? ''; } catch {}
      return [
        material.type,
        material.color?.getHexString?.() ?? '',
        material.emissive?.getHexString?.() ?? '',
        Number(material.emissiveIntensity ?? 0).toFixed(3),
        Number(material.roughness ?? 0).toFixed(3),
        Number(material.metalness ?? 0).toFixed(3),
        Number(material.opacity ?? 1).toFixed(3),
        material.transparent ? 1 : 0,
        material.depthWrite ? 1 : 0,
        material.depthTest ? 1 : 0,
        material.side,
        material.blending,
        material.vertexColors ? 1 : 0,
        material.flatShading ? 1 : 0,
        programKey
      ].join('|');
    }

    function collectTextures(material) {
      const textures = new Set();
      const seen = new Set();
      function visit(value, depth) {
        if (value == null || depth > 4) return;
        if (value.isTexture) {
          textures.add(value);
          return;
        }
        if (typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) {
          for (const entry of value) visit(entry, depth + 1);
          return;
        }
        for (const [key, entry] of Object.entries(value)) {
          if (key === 'parent' || key === 'children') continue;
          visit(entry, depth + 1);
        }
      }
      for (const value of Object.values(material)) visit(value, 0);
      return [...textures];
    }

    function textureFingerprint(texture) {
      const image = texture.image;
      return [
        texture.name || image?.currentSrc || image?.src || texture.source?.uuid || 'unnamed',
        image?.width ?? image?.videoWidth ?? 0,
        image?.height ?? image?.videoHeight ?? 0,
        texture.format,
        texture.type,
        texture.colorSpace
      ].join('|');
    }

    function inventory() {
      scene.traverse((object) => wrapMesh(object));
      const rows = [];
      const geometryById = new Map();
      const materialById = new Map();
      const textureById = new Map();
      scene.traverse((object) => {
        if (!object.isMesh) return;
        const category = classify(object);
        const visible = effectiveVisible(object);
        const geometry = object.geometry;
        const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
        const logicalInstances = object.isInstancedMesh ? object.count : 1;
        const capacity = object.isInstancedMesh ? object.instanceMatrix?.count ?? object.count : 1;
        rows.push({
          uuid: object.uuid,
          name: object.name,
          category,
          visible,
          instanced: !!object.isInstancedMesh,
          logicalInstances,
          capacity,
          transparentDoubleSide: materials.some((material) => material.transparent === true && material.side === 2 && material.forceSinglePass === false),
          geometryUuid: geometry?.uuid ?? null,
          materialUuids: materials.map((material) => material.uuid)
        });
        if (geometry) {
          const entry = geometryById.get(geometry.uuid) ?? {
            uuid: geometry.uuid,
            name: geometry.name,
            type: geometry.type,
            fingerprint: geometryFingerprint(geometry),
            refs: 0,
            categories: new Set()
          };
          entry.refs += 1;
          entry.categories.add(category);
          geometryById.set(geometry.uuid, entry);
        }
        for (const material of materials) {
          const entry = materialById.get(material.uuid) ?? {
            uuid: material.uuid,
            name: material.name,
            type: material.type,
            fingerprint: materialFingerprint(material),
            refs: 0,
            version: material.version,
            categories: new Set(),
            textureUuids: new Set()
          };
          entry.refs += 1;
          entry.categories.add(category);
          for (const texture of collectTextures(material)) {
            entry.textureUuids.add(texture.uuid);
            const textureEntry = textureById.get(texture.uuid) ?? {
              uuid: texture.uuid,
              name: texture.name,
              fingerprint: textureFingerprint(texture),
              refs: 0,
              categories: new Set()
            };
            textureEntry.refs += 1;
            textureEntry.categories.add(category);
            textureById.set(texture.uuid, textureEntry);
          }
          materialById.set(material.uuid, entry);
        }
      });

      const byClass = {};
      for (const row of rows) {
        const target = byClass[row.category] ??= {
          meshObjects: 0,
          visibleMeshObjects: 0,
          instancedMeshes: 0,
          logicalInstances: 0,
          instanceCapacity: 0,
          transparentDoubleSideMeshes: 0,
          visibleTransparentDoubleSideMeshes: 0,
          geometryRefs: new Set(),
          materialRefs: new Set()
        };
        target.meshObjects += 1;
        target.visibleMeshObjects += row.visible ? 1 : 0;
        target.instancedMeshes += row.instanced ? 1 : 0;
        target.logicalInstances += row.logicalInstances;
        target.instanceCapacity += row.capacity;
        target.transparentDoubleSideMeshes += row.transparentDoubleSide ? 1 : 0;
        target.visibleTransparentDoubleSideMeshes += row.transparentDoubleSide && row.visible ? 1 : 0;
        if (row.geometryUuid) target.geometryRefs.add(row.geometryUuid);
        for (const uuid of row.materialUuids) target.materialRefs.add(uuid);
      }
      for (const value of Object.values(byClass)) {
        value.uniqueGeometries = value.geometryRefs.size;
        value.uniqueMaterials = value.materialRefs.size;
        delete value.geometryRefs;
        delete value.materialRefs;
      }

      const geometries = serializeResources(geometryById);
      const materials = serializeResources(materialById);
      const textures = serializeResources(textureById);
      return {
        summary: {
          meshObjects: rows.length,
          visibleMeshObjects: rows.filter((row) => row.visible).length,
          instancedMeshes: rows.filter((row) => row.instanced).length,
          logicalInstances: rows.reduce((sum, row) => sum + row.logicalInstances, 0),
          uniqueGeometries: geometries.length,
          uniqueMaterials: materials.length,
          uniqueTextures: textures.length,
          shaderPrograms: renderer.info.programs?.length ?? null,
          rendererMemory: { ...renderer.info.memory }
        },
        byClass,
        sharedGeometryInstances: geometries.filter((entry) => entry.refs > 1).sort((a, b) => b.refs - a.refs).slice(0, 30),
        sharedMaterialInstances: materials.filter((entry) => entry.refs > 1).sort((a, b) => b.refs - a.refs).slice(0, 30),
        duplicateGeometryFingerprints: duplicateFingerprints(geometries),
        duplicateMaterialFingerprints: duplicateFingerprints(materials),
        duplicateTextureFingerprints: duplicateFingerprints(textures),
        ids: {
          geometries: geometries.map((entry) => entry.uuid),
          materials: materials.map((entry) => entry.uuid),
          textures: textures.map((entry) => entry.uuid)
        }
      };
    }

    function serializeResources(source) {
      return [...source.values()].map((entry) => ({
        ...entry,
        categories: [...entry.categories],
        textureUuids: entry.textureUuids ? [...entry.textureUuids] : undefined
      }));
    }

    function duplicateFingerprints(resources) {
      const grouped = new Map();
      for (const resource of resources) {
        const entry = grouped.get(resource.fingerprint) ?? {
          fingerprint: resource.fingerprint,
          distinctInstances: 0,
          totalReferences: 0,
          names: new Set(),
          categories: new Set()
        };
        entry.distinctInstances += 1;
        entry.totalReferences += resource.refs;
        if (resource.name) entry.names.add(resource.name);
        for (const category of resource.categories) entry.categories.add(category);
        grouped.set(resource.fingerprint, entry);
      }
      return [...grouped.values()]
        .filter((entry) => entry.distinctInstances > 1)
        .sort((a, b) => b.distinctInstances - a.distinctInstances)
        .slice(0, 40)
        .map((entry) => ({
          ...entry,
          names: [...entry.names].slice(0, 12),
          categories: [...entry.categories]
        }));
    }

    function materialVersions() {
      const values = [];
      const seen = new Set();
      scene.traverse((object) => {
        if (!object.isMesh) return;
        const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
        for (const material of materials) {
          if (seen.has(material.uuid)) continue;
          seen.add(material.uuid);
          values.push({
            uuid: material.uuid,
            name: material.name,
            version: material.version,
            categories: [classify(object)]
          });
        }
      });
      return values;
    }

    function heap() {
      const value = performance.memory;
      return value ? {
        usedBytes: value.usedJSHeapSize,
        totalBytes: value.totalJSHeapSize,
        limitBytes: value.jsHeapSizeLimit
      } : null;
    }

    function reset() {
      audit.renderFrames = 0;
      audit.rendererCalls = 0;
      audit.rendererTriangles = 0;
      audit.mainCalls = {};
      audit.shadowCalls = {};
    }

    function snapshot() {
      const frames = Math.max(1, audit.renderFrames);
      return {
        frames: audit.renderFrames,
        rendererCalls: audit.rendererCalls,
        rendererTriangles: audit.rendererTriangles,
        callsPerFrame: round(audit.rendererCalls / frames),
        trianglesPerFrame: round(audit.rendererTriangles / frames),
        mainCalls: { ...audit.mainCalls },
        mainCallsPerFrame: divide(audit.mainCalls, frames),
        shadowCalls: { ...audit.shadowCalls },
        shadowCallsPerFrame: divide(audit.shadowCalls, frames)
      };
    }

    function divide(values, divisor) {
      return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, round(value / divisor)]));
    }

    function round(value) {
      return Math.round((Number(value) || 0) * 1000) / 1000;
    }

    window.__bsbResourceAudit = { reset, snapshot, inventory, materialVersions, heap };
  });
}

function buildDeltas(before, after) {
  const beforeIds = before.inventory.ids;
  const afterIds = after.inventory.ids;
  const versions = new Map(before.materialVersions.map((entry) => [entry.uuid, entry]));
  const materialVersionChanges = after.materialVersions.map((entry) => ({
    ...entry,
    beforeVersion: versions.get(entry.uuid)?.version ?? null,
    delta: versions.has(entry.uuid) ? entry.version - versions.get(entry.uuid).version : null
  })).filter((entry) => entry.delta == null || entry.delta !== 0)
    .sort((a, b) => (b.delta ?? Number.MAX_SAFE_INTEGER) - (a.delta ?? Number.MAX_SAFE_INTEGER));
  return {
    newGeometryIds: difference(afterIds.geometries, beforeIds.geometries),
    removedGeometryIds: difference(beforeIds.geometries, afterIds.geometries),
    newMaterialIds: difference(afterIds.materials, beforeIds.materials),
    removedMaterialIds: difference(beforeIds.materials, afterIds.materials),
    newTextureIds: difference(afterIds.textures, beforeIds.textures),
    removedTextureIds: difference(beforeIds.textures, afterIds.textures),
    materialVersionChanges,
    rendererMemory: numericDelta(before.inventory.summary.rendererMemory, after.inventory.summary.rendererMemory),
    resourceSummary: numericDelta(before.inventory.summary, after.inventory.summary),
    effectAllocations: {
      before: before.diagnostics.liveWorld.effects.allocations,
      after: after.diagnostics.liveWorld.effects.allocations,
      delta: after.diagnostics.liveWorld.effects.allocations - before.diagnostics.liveWorld.effects.allocations
    },
    sceneWarmup: {
      before: before.diagnostics.sceneWarmup,
      after: after.diagnostics.sceneWarmup
    },
    heapUsedBytes: {
      before: before.heap?.usedBytes ?? null,
      after: after.heap?.usedBytes ?? null,
      delta: before.heap && after.heap ? after.heap.usedBytes - before.heap.usedBytes : null
    }
  };
}

function difference(values, baseline) {
  const set = new Set(baseline);
  return values.filter((value) => !set.has(value));
}

function numericDelta(before, after) {
  const output = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (typeof before?.[key] !== 'number' || typeof after?.[key] !== 'number') continue;
    output[key] = { before: before[key], after: after[key], delta: after[key] - before[key] };
  }
  return output;
}

function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const totals = new Map();
  for (let index = 0; index < (profile.samples?.length ?? 0); index += 1) {
    const node = nodes.get(profile.samples[index]);
    if (!node) continue;
    const frame = node.callFrame;
    const key = (frame.functionName || '(anonymous)') + '|' + frame.url + '|' + (frame.lineNumber + 1);
    const item = totals.get(key) ?? {
      functionName: frame.functionName || '(anonymous)',
      url: frame.url,
      line: frame.lineNumber + 1,
      selfMs: 0,
      samples: 0
    };
    item.selfMs += Number(profile.timeDeltas?.[index] ?? 0) / 1000;
    item.samples += 1;
    totals.set(key, item);
  }
  return [...totals.values()]
    .map((entry) => ({ ...entry, selfMs: Math.round(entry.selfMs * 1000) / 1000 }))
    .sort((a, b) => b.selfMs - a.selfMs);
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = 'http://127.0.0.1:' + port + '/';
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('server_exited:' + child.exitCode + ':' + output);
    try {
      const response = await fetch(url);
      if (response.ok) return { url, stop: () => child.kill() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('server_start_timeout:' + output);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function launchBrowser() {
  const options = { headless: true, args: ['--enable-precise-memory-info'] };
  try {
    return await chromium.launch({ ...options, channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge' });
  } catch {
    return chromium.launch(options);
  }
}
