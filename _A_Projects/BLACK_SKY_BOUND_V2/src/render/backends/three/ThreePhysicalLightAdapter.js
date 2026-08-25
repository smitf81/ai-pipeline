import * as THREE from 'three';
import { renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';
import { RENDER_BUDGETS } from '../../../data/renderBudgets.js';

export const THREE_PHYSICAL_LIGHT_ADAPTER_CONTRACT = 'black-sky-bound.three-physical-light-adapter.v1';
export const THREE_PHYSICAL_LIGHT_SHADER_BUDGET_CONTRACT = 'black-sky-bound.three-physical-light-shader-budget.v1';

export class ThreePhysicalLightAdapter {
  constructor(root, tileSize) {
    this.root = root;
    this.tileSize = tileSize;
    this.localCapacity = RENDER_BUDGETS.lightEmitters.threeShaderSlotCapacity ?? RENDER_BUDGETS.lightEmitters.maxActive;
    this.localSlots = Array.from({ length: this.localCapacity }, (_, index) => createLocalSlot(root, index));
    this.shadowSlots = Array.from({ length: 2 }, (_, index) => createShadowSlot(root, index));
    this.activeLocalCount = 0;
    this.droppedLocalCount = 0;
    this.physicalShadowLodCount = 0;
    this.activeSourceKinds = {};
    this.shadowOwners = new Set();
    this.lastOwnerChangeMs = -Infinity;
    this.shadowInvalidated = true;
    this.shadowSignature = '';
    this.moonDirection = { x: -0.6, y: -0.8 };
    this.moonFocusCell = '';
    this.sky = new THREE.HemisphereLight(0x26384d, 0x090806, 0.04);
    this.stormSky = new THREE.HemisphereLight(0xdce8ff, 0x4f5872, 0);
    this.moon = new THREE.DirectionalLight(0x9bbbe0, 0.72);
    this.moon.position.set(-16, 25, -12);
    this.moon.target.position.set(8, 0, 7);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    Object.assign(this.moon.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 80 });
    this.moon.shadow.normalBias = 0.03;
    root.add(this.sky, this.stormSky, this.moon, this.moon.target);
  }

  update(packets = [], renderTime = 0, opening = null, focus = null) {
    const openingMoonlight = opening?.active ? Math.max(0.02, Number(opening.moonlightStrength ?? 0)) : 1;
    const moonPacket = packets.find((packet) => /moon/i.test(packet.sourceKind ?? packet.id ?? ''));
    if (moonPacket) {
      this.moon.intensity = Math.max(0.018, Number(moonPacket.effectiveIntensity ?? 0.5) * 1.35 * openingMoonlight);
      this.moonDirection = moonPacket.direction ?? this.moonDirection;
    }
    this.syncMoonFocus(focus);
    this.sky.intensity = 0.04 * Math.max(0.08, openingMoonlight);
    this.stormSky.intensity = packets.reduce((strongest, packet) => {
      if (packet.enabled === false || !/lightning/i.test(packet.sourceKind ?? packet.id ?? '')) return strongest;
      const strength = Math.max(0, Number(packet.effectiveIntensity ?? packet.intensity ?? 0));
      const overhead = Math.max(0, Number(packet.overheadIlluminationIntensity ?? 1.5));
      return Math.max(strongest, strength * overhead);
    }, 0);
    const localPackets = packets.filter((packet) => packet.enabled !== false && !/moon/i.test(packet.sourceKind ?? packet.id ?? ''));
    const selectedPackets = localPackets.slice(0, this.localCapacity);
    this.assignLocalSlots(selectedPackets);
    this.activeLocalCount = selectedPackets.length;
    this.droppedLocalCount = Math.max(0, localPackets.length - selectedPackets.length);
    this.physicalShadowLodCount = selectedPackets.filter((packet) => packet.physicalShadowLod === 'non_shadowing_distributed_fire_light').length;
    countSourceKinds(selectedPackets, this.activeSourceKinds);
    this.updateShadowOwners(selectedPackets, renderTime * 1000);
    this.syncShadowSlots(selectedPackets);
    const signature = this.buildShadowSignature(selectedPackets);
    if (signature !== this.shadowSignature) {
      this.shadowSignature = signature;
      this.shadowInvalidated = true;
    }
  }

  syncMoonFocus(focus) {
    if (!Number.isFinite(Number(focus?.x)) || !Number.isFinite(Number(focus?.y))) return;
    const x = Number(focus.x) * 0.5;
    const z = Number(focus.y) * 0.5;
    const cell = `${Math.floor(x / 4)}:${Math.floor(z / 4)}:${this.moonDirection.x.toFixed(2)}:${this.moonDirection.y.toFixed(2)}`;
    if (cell === this.moonFocusCell) return;
    this.moonFocusCell = cell;
    this.moon.target.position.set(x, 0, z);
    this.moon.position.set(x - this.moonDirection.x * 20, 25, z - this.moonDirection.y * 20);
    this.requestShadowRefresh();
  }

  requestShadowRefresh() { this.shadowInvalidated = true; }

  assignLocalSlots(packets) {
    const activeIds = new Set(packets.map((packet) => packet.id));
    for (const slot of this.localSlots) {
      if (slot.sourceId && !activeIds.has(slot.sourceId)) slot.sourceId = null;
      slot.packet = null;
      slot.rawPower = 0;
      slot.light.power = 0;
    }
    for (const packet of packets) {
      const slot = this.localSlots.find((entry) => entry.sourceId === packet.id)
        ?? this.localSlots.find((entry) => entry.sourceId == null);
      if (!slot) continue;
      slot.sourceId = packet.id;
      slot.packet = packet;
      slot.rawPower = luminousPower(packet);
      const point = renderWorldPointToWorld3D(packet.worldX, packet.worldY, this.tileSize, 0);
      slot.light.position.set(point.x, sourceHeight(packet), point.z);
      slot.light.color.set(parseColour(packet.colour));
      slot.light.power = slot.rawPower;
      slot.light.userData.shadowPriority = Number(packet.shadowPriority ?? 0);
      slot.light.userData.sourceKind = packet.sourceKind;
    }
  }

  updateShadowOwners(packets, nowMs) {
    const ordered = packets.filter((packet) => packet.castsShadows !== false
      && packet.physicalShadowLod !== 'non_shadowing_distributed_fire_light')
      .sort((a, b) => criticality(b) - criticality(a) || Number(b.shadowPriority ?? 0) - Number(a.shadowPriority ?? 0));
    const dynamic = ordered.filter((packet) => packet.illuminationState !== 'nearby_static');
    const candidates = dynamic.length ? ordered.slice(0, 2) : ordered.slice(0, 1);
    const desired = new Set(candidates.map((packet) => packet.id));
    const urgent = candidates.some((packet) => /lightning|dragonfire|inferno/i.test(packet.sourceKind ?? packet.id ?? ''));
    const currentValid = [...this.shadowOwners].every((id) => this.localSlots.some((slot) => slot.sourceId === id));
    if (urgent || !currentValid || this.shadowOwners.size === 0 || nowMs - this.lastOwnerChangeMs >= 500) {
      if (!sameSet(desired, this.shadowOwners)) this.lastOwnerChangeMs = nowMs;
      this.shadowOwners = desired;
    }
  }

  syncShadowSlots(packets) {
    const owners = [...this.shadowOwners];
    for (const sourceSlot of this.localSlots) sourceSlot.light.power = this.shadowOwners.has(sourceSlot.sourceId) ? 0 : sourceSlot.rawPower;
    this.shadowSlots.forEach((light, index) => {
      const packet = packets.find((entry) => entry.id === owners[index]);
      const source = this.localSlots.find((entry) => entry.sourceId === owners[index]);
      if (!packet || !source) {
        light.power = 0;
        light.userData.sourceId = null;
        return;
      }
      light.position.copy(source.light.position);
      light.color.copy(source.light.color);
      light.power = source.rawPower;
      light.userData.sourceId = packet.id;
      light.userData.sourceKind = packet.sourceKind;
      const shadowNear = /torch/i.test(packet.sourceKind ?? packet.id ?? '') ? 1.08 : 0.08;
      if (light.shadow.camera.near !== shadowNear) {
        light.shadow.camera.near = shadowNear;
        light.shadow.camera.updateProjectionMatrix();
      }
    });
  }

  diagnostics() {
    return {
      contract: THREE_PHYSICAL_LIGHT_ADAPTER_CONTRACT,
      shaderBudgetContract: THREE_PHYSICAL_LIGHT_SHADER_BUDGET_CONTRACT,
      lightCount: this.activeLocalCount + 3,
      localLightCount: this.activeLocalCount,
      physicalLocalCapacity: this.localCapacity,
      unusedPhysicalLocalSlots: this.localCapacity - this.activeLocalCount,
      droppedLocalCount: this.droppedLocalCount,
      overflowActive: this.droppedLocalCount > 0,
      qualityState: this.droppedLocalCount > 0 ? 'degraded_visible' : 'native_full',
      activeSourceKinds: this.activeSourceKinds,
      shadowOwners: ['moon', ...this.shadowOwners],
      stormSkyIntensity: Number(this.stormSky.intensity.toFixed(3)),
      moonFocusCell: this.moonFocusCell,
      localShadowCap: 2,
      physicalShadowLodCount: this.physicalShadowLodCount,
      physicalShadowLodPolicy: 'distributed_fire_lights_keep_illumination_without_point_shadow_cubemaps_v1',
      ownershipHysteresisMs: 500
    };
  }

  buildShadowSignature(packets) {
    return [...this.shadowOwners].sort().map((id) => {
      const packet = packets.find((entry) => entry.id === id);
      if (!packet) return `${id}:missing`;
      if (packet.illuminationState === 'nearby_static') return `${id}:static`;
      return `${id}:${Math.round(packet.worldX / 16)}:${Math.round(packet.worldY / 16)}:${/lightning/i.test(packet.sourceKind ?? id) ? packet.flashStage ?? 'flash' : 'dynamic'}`;
    }).join('|');
  }

  consumeShadowInvalidation() {
    const value = this.shadowInvalidated;
    this.shadowInvalidated = false;
    return value;
  }

  dispose() {
    for (const slot of this.localSlots) slot.light.removeFromParent();
    for (const light of this.shadowSlots) {
      light.shadow.map?.dispose?.();
      light.removeFromParent();
    }
    this.localSlots.length = 0;
    this.shadowSlots.length = 0;
    this.sky.removeFromParent();
    this.stormSky.removeFromParent();
    this.moon.removeFromParent();
    this.moon.target.removeFromParent();
  }
}

function createLocalSlot(root, index) {
  const light = new THREE.PointLight(0xffffff, 0, 0, 2);
  light.name = `physical:local-slot:${index}`;
  light.visible = true;
  light.castShadow = false;
  light.power = 0;
  root.add(light);
  return { light, sourceId: null, packet: null, rawPower: 0 };
}

function createShadowSlot(root, index) {
  const light = new THREE.PointLight(0xffffff, 0, 0, 2);
  light.name = `physical:shadow-slot:${index}`;
  light.visible = true;
  light.castShadow = true;
  light.power = 0;
  light.shadow.mapSize.set(256, 256);
  light.shadow.camera.near = 0.08;
  light.shadow.camera.far = 18;
  light.shadow.normalBias = 0.025;
  root.add(light);
  return light;
}

function luminousPower(packet) {
  const strength = Math.max(0, Number(packet.effectiveIntensity ?? packet.intensity ?? 0));
  const authoredPower = Number(packet.luminousPowerLumens);
  if (Number.isFinite(authoredPower) && authoredPower > 0) return authoredPower * Math.max(0.08, strength);
  const kind = String(packet.sourceKind ?? packet.id ?? '');
  if (/lightning/i.test(kind)) return 18000 * Math.max(0.25, strength);
  if (/inferno|dragonfire|napalm/i.test(kind)) return 5200 * Math.max(0.25, strength);
  if (/torch/i.test(kind)) return 1200 * Math.max(0.2, strength);
  if (/raid_flame/i.test(kind)) return 240 * Math.max(0.2, strength);
  if (/smoulder|ember|spark/i.test(kind)) return 70 * Math.max(0.12, strength);
  return 240 * Math.max(0.12, strength);
}

function sourceHeight(packet) {
  const kind = String(packet.sourceKind ?? packet.id ?? '');
  if (/lightning/i.test(kind)) return 10;
  if (/inferno|dragonfire/i.test(kind)) return 2.8;
  return Math.max(0.2, Number(packet.shadow?.sourceHeight ?? 1.25));
}

function criticality(packet) {
  if (/lightning/i.test(packet.sourceKind ?? packet.id ?? '')) return 1000;
  if (/dragonfire|inferno/i.test(packet.sourceKind ?? packet.id ?? '')) return 800;
  return packet.illuminationState === 'critical' ? 500 : packet.illuminationState === 'active_dynamic' ? 200 : 100;
}

function parseColour(value) {
  const match = String(value ?? '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return match ? (Number(match[1]) << 16) | (Number(match[2]) << 8) | Number(match[3]) : value ?? 0xffffff;
}

function sameSet(a, b) { return a.size === b.size && [...a].every((value) => b.has(value)); }

function countSourceKinds(packets, counts) {
  for (const key of Object.keys(counts)) delete counts[key];
  for (const packet of packets) {
    const kind = String(packet.sourceKind ?? 'unknown');
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
}
