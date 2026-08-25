export class ThreeDiagnosticsOverlay {
  constructor({ enabled = false, onChange = null } = {}) {
    this.enabled = enabled;
    this.overflowWarningActive = false;
    this.onChange = onChange;
    this.element = null;
    this.onKeyDown = (event) => {
      if (event.code !== 'F3') return;
      event.preventDefault();
      this.setEnabled(!this.enabled);
    };
    if (typeof document !== 'undefined') {
      this.element = document.createElement('pre');
      this.element.id = 'bsb-three-diagnostics';
      Object.assign(this.element.style, {
        position: 'fixed', left: '12px', top: '12px', zIndex: '20', margin: '0',
        maxWidth: '420px', padding: '9px 11px', border: '1px solid rgba(170,190,205,.2)',
        borderRadius: '6px', background: 'rgba(5,9,12,.84)', color: '#bed0d8',
        font: '11px/1.42 ui-monospace, SFMono-Regular, Consolas, monospace',
        pointerEvents: 'none', whiteSpace: 'pre-wrap', display: enabled ? 'block' : 'none'
      });
      document.body.appendChild(this.element);
      globalThis.addEventListener?.('keydown', this.onKeyDown);
    }
    this.onChange?.(this.enabled);
  }

  setEnabled(value) {
    this.enabled = !!value;
    this.updateVisibility();
    this.onChange?.(this.enabled);
  }

  update(stats) {
    stats = stats ?? {};
    const tree = stats.tree ?? {};
    const camera = stats.camera ?? {};
    const live = stats.liveWorld ?? {};
    const visibleTree = live.tree ?? tree;
    const liveLights = live.lights ?? {};
    this.overflowWarningActive = liveLights.overflowActive === true;
    this.updateVisibility();
    if (!this.element || (!this.enabled && !this.overflowWarningActive)) return;
    if (!this.enabled) {
      this.element.textContent = [
        'BLACK SKY BOUND / LIGHT BUDGET',
        `WARNING     ${liveLights.droppedLocalCount ?? 0} local light(s) dropped`,
        `capacity    ${liveLights.localLightCount ?? 0}/${liveLights.physicalLocalCapacity ?? '?'}  ${liveLights.qualityState ?? 'degraded'}`,
        'details     F3 diagnostics'
      ].join('\n');
      return;
    }
    const liveActors = live.actors ?? {};
    const projection = stats.projection ?? {};
    const timing = stats.frameTiming ?? {};
    const p95 = timing.p95 ?? {};
    const effects = live.effects ?? {};
    const contacts = liveActors.contactDebug ?? {};
    const terrain = live.terrain ?? {};
    const grassDetail = live.grassDetail ?? {};
    const humanoids = liveActors.inkHumanoids ?? {};
    const greybox = liveActors.raiderMotionGreybox ?? {};
    const turn = liveActors.wyvernTurnState ?? {};
    const envelope = live.renderEnvelope ?? {};
    this.element.textContent = [
      'BLACK SKY BOUND / WEBGL3D',
      `scene       ${stats.reference ?? stats.mapId ?? 'runtime'}`,
      `camera      ortho ${camera.yawDegrees ?? 45}deg / ${camera.elevationDegrees ?? 50}deg`,
      `world       tiles ${live.terrainTiles ?? 0}  cliffs ${live.cliffTiles ?? 0}  scenery ${live.sceneryCount ?? tree.count ?? 0}`,
      `render env  total ${envelope.totalRenderables ?? 0}  visible ${envelope.visible ?? 0}  margin ${envelope.margin ?? 0}  culled ${envelope.culled ?? 0}`,
      `env policy  ${envelope.enabled === false ? 'OFF' : `${Number(envelope.safetyMarginMeters ?? 0).toFixed(1)}m safety`}  chunks ${envelope.chunkSizeTiles ?? 0} tiles  drop ${Math.round((envelope.culledRatio ?? 0) * 100)}%`,
      `terrain     ${terrain.status ?? 'unknown'}  view ${terrain.debugMode ?? 'lit'}  batches ${(terrain.layeredDrawBatches ?? 0) + (terrain.legacyDrawBatches ?? 0)}`,
      `ground F7   ${grassDetail.enabled ? 'ON' : 'off'}  ${grassDetail.visibleCount ?? 0}/${grassDetail.candidateCount ?? 0} clumps  ${grassDetail.visibleTriangles ?? 0} tri`,
      `ground box  ${formatBounds(grassDetail.cullBounds)}  distance ${Number(grassDetail.cullDistanceMeters ?? 0).toFixed(1)}m`,
      `actors      ${liveActors.actorCount ?? 0}  segments ${liveActors.segmentCount ?? 0}`,
      `wyvern      ${liveActors.wyvernEmbodimentVersion ?? 'none'}  ${liveActors.wyvernVertexCount ?? 0} verts / ${liveActors.wyvernTriangleCount ?? 0} tri / ${liveActors.wyvernDrawCallCount ?? 0} draws`,
      `wyvern topo ${liveActors.wyvernTopologyBuildCount ?? 0} builds  ${liveActors.wyvernPoseUpdateCount ?? 0} poses  ${liveActors.wyvernMembranePanelCount ?? 0} panels  bad ${liveActors.wyvernMalformedFrameCount ?? 0}/${liveActors.wyvernNonFiniteVertexCount ?? 0}`,
      `turn        err ${degrees(turn.error)}deg  vel ${degrees(turn.velocity)}deg/s  effort ${Number(turn.effort ?? 0).toFixed(2)}  ${turn.turningInPlace ? 'PIVOT' : 'blend'} ${Number(turn.phase ?? 0).toFixed(2)}`,
      `turn lag    chest ${degrees(turn.chestLag)}deg  hips ${degrees(turn.hipLag)}deg  tail ${degrees(turn.tailLag)}deg  plant ${Number(turn.plantSide ?? 1) < 0 ? 'L' : 'R'}  bad ${turn.malformedFrames ?? 0}`,
      `stick units ${humanoids.readyActorCount ?? 0}/${humanoids.actorCount ?? 0} ready  ${(humanoids.bodySegmentCount ?? 0) + (humanoids.propSegmentCount ?? 0)} lines  ${humanoids.drawFamilyCount ?? 0} draws`,
      `profiles    ${(humanoids.profileIds ?? []).join(', ') || 'none'}  kinds ${(humanoids.actorKinds ?? []).join(', ') || 'none'}`,
      `embodiment  ${humanoids.embodimentId ?? 'none'}  ${humanoids.equipmentPolicy ?? 'equipment unknown'}`,
      `stick ink   ${humanoids.bodyLineWidthPx ?? 0}px pure black / ${humanoids.propLineWidthPx ?? 0}px props  ${humanoids.headRingSegmentCount ?? 0} head lines  ${humanoids.colourPolicy ?? 'unknown'}`,
      `stick pool  alloc ${humanoids.allocations ?? 0}  topo ${humanoids.topologyBuilds ?? 0}/${humanoids.topologyRebuilds ?? 0}  points ${(humanoids.missingPointErrors ?? []).length === 0 && (humanoids.nonFiniteSegmentCount ?? 0) === 0 ? 'ok' : `ERR ${(humanoids.missingPointErrors ?? []).length + (humanoids.nonFiniteSegmentCount ?? 0)}`}`,
      `motion v1   ${greybox.enabled ? `${greybox.actorCount ?? 0} greybox / ${greybox.segmentCount ?? 0} segments / support ${greybox.supportFoot ?? 'none'}` : 'production ink (greybox available via raiderMotionGreybox=1)'}`,
      `motion jab  ${greybox.attackPhase ?? 'idle'}  impact ${greybox.impactFrozen ? 'FROZEN' : 'tracking'}  prediction ${greybox.predictionClamped ? 'clamped' : 'bounded'}`,
      `contacts    ${contacts.enabled ? `${contacts.activeVolumes ?? 0} visible` : 'hidden'}  pooled ${contacts.pooledVolumes ?? 0}`,
      `trees       ${visibleTree.count ?? stats.cache?.createdGroups ?? 0}  branches ${visibleTree.branches ?? 0}  foliage ${visibleTree.foliage ?? 0}`,
      `lights      ${liveLights.localLightCount ?? stats.lightCount ?? 0}/${liveLights.physicalLocalCapacity ?? '?'} local  unused ${liveLights.unusedPhysicalLocalSlots ?? '?'}  dropped ${liveLights.droppedLocalCount ?? 0}`,
      `light state ${liveLights.qualityState ?? 'unknown'}  shadow ${(liveLights.shadowOwners ?? [stats.shadowOwner ?? 'none']).join(', ')}`,
      `draw calls  ${stats.calls ?? 0}  triangles ${stats.triangles ?? 0}`,
      `frame       ${Number(stats.frameMs ?? 0).toFixed(2)}ms  full p95 ${Number(p95.renderPathMs ?? 0).toFixed(2)}ms  gpu p95 ${Number(p95.gpuMs ?? stats.gpuP95Ms ?? 0).toFixed(2)}ms`,
      `projection  ${Number(projection.projectionMs ?? 0).toFixed(2)}ms  static ${projection.staticChanged ? 'rebuild' : 'cached'} ${projection.staticCacheHits ?? 0}/${projection.staticCacheRebuilds ?? 0}`,
      `effects     pools ${effects.poolCount ?? 0}  alloc ${effects.allocations ?? 0}  reuse ${effects.reuses ?? 0}  lightning ${effects.lightningBolts ?? 0}`,
      `legacy 2D   ${projection.legacy2DProjectionActive ? 'ACTIVE' : 'retired'}`,
      `cache       geo ${stats.cache?.geometryCacheEntries ?? 0} / mat ${stats.cache?.materialCacheEntries ?? 0}`,
      'debug       F3 bounds/count  F6 terrain view  F7 ground detail'
    ].join('\n');
  }

  updateVisibility() {
    if (this.element) this.element.style.display = this.enabled || this.overflowWarningActive ? 'block' : 'none';
  }

  dispose() {
    globalThis.removeEventListener?.('keydown', this.onKeyDown);
    this.element?.remove();
    this.element = null;
    this.onChange = null;
  }
}

function formatBounds(bounds) {
  if (!bounds) return 'unavailable';
  return `[${Number(bounds.minX).toFixed(1)},${Number(bounds.minZ).toFixed(1)}]-[${Number(bounds.maxX).toFixed(1)},${Number(bounds.maxZ).toFixed(1)}]`;
}

function degrees(radians) { return (Number(radians ?? 0) * 180 / Math.PI).toFixed(1); }
