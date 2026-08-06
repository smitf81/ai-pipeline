const EMPTY_GEOMETRY = Object.freeze({
  triangles: Object.freeze([]),
  penumbraTriangleCount: 0,
  coreTriangleCount: 0,
  contactTriangleCount: 0,
  contactFootprintCount: 0,
  coarseProjectedTriangleCount: 0,
  segmentCount: 0
});

export class WebGLShadowGeometryCache {
  constructor({ buildShadowGeometry, buildShadowShaderFields }) {
    this.buildShadowGeometry = buildShadowGeometry;
    this.buildShadowShaderFields = buildShadowShaderFields;
    this.staticKey = null;
    this.staticGeometry = EMPTY_GEOMETRY;
    this.staticFields = [];
    this.rebuildCount = 0;
  }

  empty() {
    return result(EMPTY_GEOMETRY, [], false, this.rebuildCount, 0, 0);
  }

  resolve(regions = [], packets = [], profile = {}, composite = {}) {
    const staticRegions = regions.filter((region) => region.cacheableGeometry === true);
    const dynamicRegions = regions.filter((region) => region.cacheableGeometry !== true);
    const staticPackets = packets.filter((packet) => packet.cacheableGeometry === true);
    const dynamicPackets = packets.filter((packet) => packet.cacheableGeometry !== true);
    const staticKey = buildStaticKey(staticRegions, staticPackets, profile, composite);
    const cacheHit = staticKey === this.staticKey;
    if (!cacheHit) {
      this.staticKey = staticKey;
      this.staticGeometry = this.buildShadowGeometry(staticRegions, profile, composite);
      this.staticFields = this.buildShadowShaderFields(staticPackets, profile, composite);
      this.rebuildCount += 1;
    }
    const dynamicGeometry = dynamicRegions.length
      ? this.buildShadowGeometry(dynamicRegions, profile, composite)
      : EMPTY_GEOMETRY;
    const dynamicFields = dynamicPackets.length
      ? this.buildShadowShaderFields(dynamicPackets, profile, composite)
      : [];
    const geometry = dynamicRegions.length
      ? mergeGeometry(this.staticGeometry, dynamicGeometry)
      : this.staticGeometry;
    const fields = dynamicFields.length ? [...this.staticFields, ...dynamicFields] : this.staticFields;
    return result(geometry, fields, cacheHit, this.rebuildCount, staticPackets.length, dynamicPackets.length);
  }
}

function buildStaticKey(regions, packets, profile, composite) {
  const regionKey = regions.map((region) => [
    region.lightId, region.blockerId, region.opacity, region.softness, region.shadowShapeProfileId,
    region.shadowShapeVariantId, region.contactFootprint,
    ...(region.points ?? []).flatMap((point) => [point.x, point.y])
  ]);
  const packetKey = packets.map((packet) => [
    packet.id, packet.kernel?.start?.x, packet.kernel?.start?.y, packet.kernel?.end?.x,
    packet.kernel?.end?.y, packet.kernel?.radiusStart, packet.kernel?.radiusEnd,
    ...(packet.samples ?? []).flatMap((sample) => [sample.dimness, sample.softness])
  ]);
  return JSON.stringify([
    regionKey,
    packetKey,
    profile.shadowColour,
    profile.shadowCoreFalloff,
    profile.shadowPenumbraScale,
    profile.shadowContactScale,
    composite
  ]);
}

function mergeGeometry(a, b) {
  return {
    triangles: [...a.triangles, ...b.triangles],
    penumbraTriangleCount: a.penumbraTriangleCount + b.penumbraTriangleCount,
    coreTriangleCount: a.coreTriangleCount + b.coreTriangleCount,
    contactTriangleCount: a.contactTriangleCount + b.contactTriangleCount,
    contactFootprintCount: a.contactFootprintCount + b.contactFootprintCount,
    coarseProjectedTriangleCount: a.coarseProjectedTriangleCount + b.coarseProjectedTriangleCount,
    segmentCount: a.segmentCount + b.segmentCount
  };
}

function result(geometry, fields, cacheHit, rebuildCount, staticPacketCount, dynamicPacketCount) {
  return { geometry, fields, cacheHit, rebuildCount, staticPacketCount, dynamicPacketCount };
}
