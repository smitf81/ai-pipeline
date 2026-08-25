import * as THREE from 'three';
import { WORLD_SCALE } from '../../../data/worldScale.js';
import { HumanoidEmbodimentId } from '../../../data/humanoids/raiderHumanoid.js';
import { ThreeWyvernSurfaceV2 } from './ThreeWyvernSurfaceV2.js';
import { ThreeContactDebugLayer } from './ThreeContactDebugLayer.js';
import { ThreeInkHumanoidLayer } from './ThreeInkHumanoidLayer.js';
import { ThreeProceduralHumanoidLayer } from './ThreeProceduralHumanoidLayer.js';
import { ThreeRaiderMotionGreyboxLayer } from './ThreeRaiderMotionGreyboxLayer.js';

export const THREE_ACTOR_LAYER_CONTRACT = 'black-sky-bound.three-actor-layer.v1';

export class ThreeActorLayer {
  constructor(root, options = {}) {
    this.root = root;
    this.wyvernEmbodiment = 'surface-v2';
    this.entries = new Map();
    this.segmentGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
    this.jointGeometry = new THREE.IcosahedronGeometry(1, 1);
    this.materials = new Map();
    this.inkHumanoids = new ThreeInkHumanoidLayer(root);
    this.proceduralHumanoids = new ThreeProceduralHumanoidLayer(root);
    this.raiderMotionGreybox = new ThreeRaiderMotionGreyboxLayer(root, queryFlag(options.search, 'raiderMotionGreybox'));
    this.contactDebug = new ThreeContactDebugLayer(root);
    this.stats = emptyActorStats(this.wyvernEmbodiment);
  }

  update(actors = [], view = {}) {
    const active = new Set();
    const player = actors.find((actor) => actor.team === 'player' && actor.alive) ?? actors[0];
    let segmentCount = 0;
    let jointCount = 0;
    let wyvernMeshCount = 0;
    let membraneCount = 0;
    let wyvernPoseUpdateCount = 0;
    let wyvernContract = null;
    let wyvernTopologyBuildCount = 0;
    let wyvernVertexCount = 0;
    let wyvernTriangleCount = 0;
    let wyvernDrawCallCount = 0;
    let wyvernMaterialGroupCount = 0;
    let wyvernMembranePanelCount = 0;
    let wyvernMalformedFrameCount = 0;
    let wyvernNonFiniteVertexCount = 0;
    let wyvernTurnState = null;
    const recipeHumanoids = actors.filter((actor) => actor.creatureRecipe?.bodyPlan?.family === 'humanoid' && actor.humanoidProjection);
    const inkHumanoids = actors.filter((actor) => actor.humanoidProjection?.embodimentId === HumanoidEmbodimentId.INK_STICK);
    const facetedHumanoids = recipeHumanoids.filter((actor) => actor.humanoidProjection?.embodimentId !== HumanoidEmbodimentId.INK_STICK);
    const recipeHumanoidIds = new Set(recipeHumanoids.map((actor) => actor.id));
    const routedHumanoidIds = new Set([...inkHumanoids, ...facetedHumanoids].map((actor) => actor.id));
    this.inkHumanoids.update(this.raiderMotionGreybox.enabled ? [] : inkHumanoids, view);
    this.proceduralHumanoids.update(this.raiderMotionGreybox.enabled ? [] : facetedHumanoids, player);
    this.raiderMotionGreybox.update(recipeHumanoids);
    for (const actor of actors) {
      if (this.raiderMotionGreybox.enabled && !recipeHumanoidIds.has(actor.id)) {
        const stale = this.entries.get(actor.id);
        if (stale) this.removeEntry(stale);
        this.entries.delete(actor.id);
        continue;
      }
      active.add(actor.id);
      if (routedHumanoidIds.has(actor.id)) {
        const stale = this.entries.get(actor.id);
        if (stale) this.removeEntry(stale);
        this.entries.delete(actor.id);
        continue;
      }
      const graph = actor.wyvernProjection?.rigPose ? null : actorGraph(actor);
      const signature = graph?.signature ?? wyvernSignature(actor, this.wyvernEmbodiment);
      let entry = this.entries.get(actor.id);
      if (!entry || entry.signature !== signature) {
        if (entry) this.removeEntry(entry);
        entry = this.createEntry(actor, graph);
        this.entries.set(actor.id, entry);
      }
      this.updateEntry(entry, actor, graph, player);
      if (entry.kind === 'wyvern') {
        const diagnostics = entry.wyvern.diagnostics();
        wyvernMeshCount += diagnostics.meshCount;
        membraneCount += diagnostics.membraneCount;
        wyvernPoseUpdateCount += diagnostics.poseUpdates;
        wyvernContract = diagnostics.contract;
        wyvernTopologyBuildCount += diagnostics.topologyBuilds ?? 0;
        wyvernVertexCount += diagnostics.vertexCount ?? 0;
        wyvernTriangleCount += diagnostics.triangleCount ?? 0;
        wyvernDrawCallCount += diagnostics.drawCallCount ?? diagnostics.meshCount ?? 0;
        wyvernMaterialGroupCount += diagnostics.materialFamilyCount ?? 0;
        wyvernMembranePanelCount += diagnostics.membranePanelCount ?? 0;
        wyvernMalformedFrameCount += diagnostics.malformedFrameCount ?? 0;
        wyvernNonFiniteVertexCount += diagnostics.nonFiniteVertexCount ?? 0;
        if (actor.team === 'player') wyvernTurnState = turnDiagnostics(actor);
      } else {
        segmentCount += graph.segments.length;
        jointCount += graph.joints.length;
      }
    }
    for (const [id, entry] of this.entries) {
      if (active.has(id)) continue;
      this.removeEntry(entry);
      this.entries.delete(id);
    }
    this.contactDebug.update(this.raiderMotionGreybox.enabled ? [] : actors);
    const inkStats = this.inkHumanoids.diagnostics();
    const humanoidStats = this.proceduralHumanoids.diagnostics();
    this.stats = {
      actorCount: active.size,
      segmentCount,
      jointCount,
      wyvernMeshCount,
      membraneCount,
      wyvernEmbodiment: this.wyvernEmbodiment,
      wyvernEmbodimentVersion: 'surface-v2-production',
      wyvernContract,
      wyvernTopologyBuildCount,
      wyvernVertexCount,
      wyvernTriangleCount,
      wyvernDrawCallCount,
      wyvernMaterialGroupCount,
      wyvernMembranePanelCount,
      wyvernPoseUpdateCount,
      wyvernMalformedFrameCount,
      wyvernNonFiniteVertexCount,
      wyvernTurnState,
      inkHumanoidCount: inkStats.actorCount,
      inkHumanoidReadyCount: inkStats.readyActorCount,
      inkHumanoidSegmentCount: inkStats.bodySegmentCount + inkStats.propSegmentCount,
      inkHumanoidDrawFamilies: inkStats.drawFamilyCount,
      proceduralHumanoidCount: humanoidStats.actorCount,
      proceduralHumanoidPrimitiveCount: humanoidStats.primitiveCount,
      proceduralHumanoidDrawFamilies: humanoidStats.drawFamilyCount,
      raiderMotionGreybox: this.raiderMotionGreybox.diagnostics()
    };
  }

  setDebugVisible(enabled) { this.contactDebug.setEnabled(enabled); }

  createEntry(actor, graph) {
    if (actor.wyvernProjection?.rigPose) {
      const wyvern = new ThreeWyvernSurfaceV2(this.root, actor);
      return { kind: 'wyvern', group: wyvern.group, wyvern, signature: wyvernSignature(actor, this.wyvernEmbodiment) };
    }
    const group = new THREE.Group();
    group.name = `actor:${actor.id}`;
    const material = this.material(actor);
    const segments = graph.segments.map(() => {
      const mesh = new THREE.Mesh(this.segmentGeometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    const joints = graph.joints.map(() => {
      const mesh = new THREE.Mesh(this.jointGeometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
    this.root.add(group);
    return { kind: 'skeleton', group, segments, joints, signature: graph.signature };
  }

  updateEntry(entry, actor, graph, player) {
    if (entry.kind === 'wyvern') {
      entry.wyvern.update(actor);
      return;
    }
    entry.group.visible = actor.alive !== false;
    graph.segments.forEach((segment, index) => placeSegment(entry.segments[index], segment.a, segment.b, segment.radius));
    graph.joints.forEach((joint, index) => {
      const mesh = entry.joints[index];
      mesh.position.copy(joint.point);
      mesh.scale.setScalar(joint.radius);
    });
    const shadowEligible = actor.team === 'player' || !player || Math.hypot(actor.x - player.x, actor.y - player.y) <= 9;
    entry.segments.forEach((mesh, index) => { mesh.castShadow = shadowEligible && index < 5; });
    entry.joints.forEach((mesh, index) => { mesh.castShadow = shadowEligible && index < 2; });
    entry.group.userData.bodyContactRig = actor.bodyContactRig;
  }

  material(actor) {
    const colour = actor.material?.uniforms?.baseColour ?? actor.colour ?? '#777777';
    const roughness = Number(actor.material?.uniforms?.roughness ?? 0.82);
    const key = `${colour}:${roughness}`;
    if (!this.materials.has(key)) this.materials.set(key, new THREE.MeshStandardMaterial({ color: colour, roughness, metalness: 0, flatShading: true }));
    return this.materials.get(key);
  }

  removeEntry(entry) {
    if (entry.kind === 'wyvern') entry.wyvern.dispose();
    else entry.group.removeFromParent();
  }

  diagnostics() {
    return {
      contract: THREE_ACTOR_LAYER_CONTRACT,
      ...this.stats,
      materialCacheEntries: this.materials.size,
      inkHumanoids: this.inkHumanoids.diagnostics(),
      proceduralHumanoids: this.proceduralHumanoids.diagnostics(),
      raiderMotionGreybox: this.raiderMotionGreybox.diagnostics(),
      contactDebug: this.contactDebug.diagnostics()
    };
  }

  dispose() {
    for (const entry of this.entries.values()) this.removeEntry(entry);
    this.entries.clear();
    this.segmentGeometry.dispose();
    this.jointGeometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.inkHumanoids.dispose();
    this.proceduralHumanoids.dispose();
    this.raiderMotionGreybox.dispose();
    this.contactDebug.dispose();
  }
}

function queryFlag(search, key) {
  const value = new URLSearchParams(search ?? '').get(key);
  return ['1', 'true', 'on'].includes(String(value ?? '').toLowerCase());
}

function emptyActorStats(wyvernEmbodiment) {
  return {
    actorCount: 0,
    segmentCount: 0,
    jointCount: 0,
    wyvernMeshCount: 0,
    membraneCount: 0,
    wyvernEmbodiment,
    wyvernEmbodimentVersion: 'surface-v2-production',
    wyvernContract: null,
    wyvernTopologyBuildCount: 0,
    wyvernVertexCount: 0,
    wyvernTriangleCount: 0,
    wyvernDrawCallCount: 0,
    wyvernMaterialGroupCount: 0,
    wyvernMembranePanelCount: 0,
    wyvernPoseUpdateCount: 0,
    wyvernMalformedFrameCount: 0,
    wyvernNonFiniteVertexCount: 0,
    wyvernTurnState: null
  };
}

function turnDiagnostics(actor) {
  const motion = actor.wyvernProjection?.motionState ?? {};
  const axial = actor.wyvernProjection?.axialTurn ?? {};
  return {
    error: motion.turnError ?? 0,
    velocity: motion.turnVelocity ?? 0,
    effort: motion.turnEffort ?? 0,
    phase: motion.turnPhase ?? 0,
    plantSide: motion.turnPlantSide ?? 1,
    turningInPlace: motion.turningInPlace === true,
    headLag: axial.headLag ?? 0,
    chestLag: axial.chestLag ?? 0,
    hipLag: axial.hipLag ?? 0,
    tailLag: axial.tailLag ?? 0,
    malformedFrames: axial.malformedFrameCount ?? actor.wyvernProjection?.malformedTurnFrameCount ?? 0
  };
}

function actorGraph(actor) {
  if (actor.humanoidProjection?.points) return humanoidGraph(actor);
  if (actor.predatorProjection?.points) return predatorGraph(actor);
  if (actor.wyvernProjection?.rigPose) return wyvernGraph(actor);
  const center = point(actor.x, actor.y, 0.45);
  return {
    signature: 'fallback:1:2',
    segments: [{ a: point(actor.x, actor.y, 0.05), b: point(actor.x, actor.y, 0.82), radius: actor.radius * 0.25 }],
    joints: [{ point: center, radius: actor.radius * WORLD_SCALE.tileMeters }]
  };
}

function wyvernSignature(actor, embodiment = 'surface-v2') {
  const rig = actor.wyvernProjection?.rigPose;
  const wings = Object.values(rig?.wingForelimbs ?? {});
  const digits = wings.reduce((sum, wing) => sum + (wing.digits?.length ?? 0), 0);
  const knuckles = wings.reduce((sum, wing) => sum + (wing.digits ?? []).reduce((inner, digit) => inner + (digit.knuckles?.length ?? 0), 0), 0);
  return `wyvern:${embodiment}:${actor.wyvernProjection?.recipeId ?? 'unknown'}:${rig?.profileId ?? 'default'}:${rig?.tail?.length ?? 0}:${digits}:${knuckles}`;
}

function humanoidGraph(actor) {
  const p = actor.humanoidProjection.points;
  const get = (name) => pointFrom(p[name], heightFor(name));
  const pairs = [
    ['hips', 'chest'], ['chest', 'head'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftHand'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightHand'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftFoot'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightFoot']
  ];
  if (p.spearButt && p.spearTip) pairs.push(['spearButt', 'spearTip']);
  if (p.torchGrip && p.torchTip) pairs.push(['torchGrip', 'torchTip']);
  const segments = pairs.filter(([a, b]) => p[a] && p[b]).map(([a, b]) => ({ a: get(a), b: get(b), radius: /spear|torch/.test(a) ? 0.025 : 0.065 }));
  const joints = ['chest', 'hips', 'head', 'leftHand', 'rightHand'].filter((name) => p[name]).map((name) => ({ point: get(name), radius: name === 'head' ? 0.16 : name === 'chest' ? 0.2 : 0.09 }));
  return { signature: `humanoid:${segments.length}:${joints.length}`, segments, joints };
}

function predatorGraph(actor) {
  const p = actor.predatorProjection.points;
  const get = (name) => pointFrom(p[name], heightFor(name, true));
  const pairs = [
    ['hips', 'waist'], ['waist', 'chest'], ['chest', 'neck'], ['neck', 'head'], ['head', 'muzzle'],
    ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['leftWrist', 'leftClaw'],
    ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'], ['rightWrist', 'rightClaw'],
    ['leftHip', 'leftKnee'], ['leftKnee', 'leftHock'], ['leftHock', 'leftHindPaw'],
    ['rightHip', 'rightKnee'], ['rightKnee', 'rightHock'], ['rightHock', 'rightHindPaw'],
    ['hips', 'tailBase'], ['tailBase', 'tailMid'], ['tailMid', 'tailTip']
  ];
  const segments = pairs.filter(([a, b]) => p[a] && p[b]).map(([a, b]) => ({ a: get(a), b: get(b), radius: /hips|waist|chest|neck/.test(a) ? 0.11 : 0.055 }));
  const joints = ['chest', 'hips', 'head', 'muzzle'].filter((name) => p[name]).map((name) => ({ point: get(name), radius: Math.max(0.09, Number(p[name].radius ?? 0.16) * WORLD_SCALE.tileMeters) }));
  return { signature: `predator:${segments.length}:${joints.length}`, segments, joints };
}

function wyvernGraph(actor) {
  const rig = actor.wyvernProjection.rigPose;
  const segments = [];
  const joints = [];
  const axial = [rig.axial?.head, rig.axial?.neck, rig.axial?.chest, rig.axial?.hips].filter(Boolean);
  connectChain(segments, axial, 0.09, 0.5);
  if (rig.head?.center && rig.head?.muzzle) segments.push({ a: pointFrom(rig.head.center, 0.68), b: pointFrom(rig.head.muzzle, 0.64), radius: 0.065 });
  for (const side of Object.values(rig.wingForelimbs ?? {})) {
    connectChain(segments, [side.shoulder, side.elbow, side.wrist].filter(Boolean), 0.04, 0.26);
    for (const digit of side.digits ?? []) connectChain(segments, [side.wrist, ...(digit.knuckles ?? []), digit.tip].filter(Boolean), 0.016, 0.19);
  }
  for (const side of Object.values(rig.hindLegs ?? {})) {
    const chain = [side.hip, side.knee, side.ankle ?? side.hock, side.foot ?? side.paw].filter(Boolean);
    connectChain(segments, chain, 0.045, 0.2);
  }
  connectChain(segments, rig.tail ?? [], 0.055, 0.34, true);
  for (const node of axial) joints.push({ point: pointFrom(node, node.role === 'head' ? 0.68 : 0.48), radius: Math.max(0.08, Number(node.width ?? 0.15) * WORLD_SCALE.tileMeters) });
  if (rig.head?.center) joints.push({ point: pointFrom(rig.head.center, 0.68), radius: 0.12 });
  return { signature: `wyvern:${segments.length}:${joints.length}`, segments, joints };
}

function connectChain(output, values, radius, baseHeight, taper = false) {
  for (let index = 0; index < values.length - 1; index += 1) {
    const t = values.length <= 1 ? 0 : index / (values.length - 1);
    output.push({ a: pointFrom(values[index], baseHeight * (taper ? 1 - t * 0.6 : 1)), b: pointFrom(values[index + 1], baseHeight * (taper ? 1 - (t + 1 / values.length) * 0.6 : 1)), radius: radius * (taper ? 1 - t * 0.72 : 1) });
  }
}

function pointFrom(value, y) { return point(value.x, value.y, Number.isFinite(value?.height) ? value.height : y); }
function point(x, z, y) { return new THREE.Vector3(Number(x) * WORLD_SCALE.tileMeters, y, Number(z) * WORLD_SCALE.tileMeters); }

function heightFor(name, predator = false) {
  if (/Foot|Paw/.test(name)) return 0.06;
  if (/Knee|Hock/.test(name)) return predator ? 0.28 : 0.52;
  if (/Hip|hips/.test(name)) return predator ? 0.52 : 0.94;
  if (/chest|Shoulder/.test(name)) return predator ? 0.72 : 1.34;
  if (/head|muzzle|neck/.test(name)) return predator ? 0.82 : 1.7;
  if (/Elbow|Wrist|Hand|Grip/.test(name)) return predator ? 0.38 : 1.05;
  if (/spearTip/.test(name)) return 1.2;
  if (/spearButt/.test(name)) return 0.9;
  if (/torchTip/.test(name)) return 1.34;
  return predator ? 0.46 : 1;
}

function placeSegment(mesh, a, b, radius) {
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(0.0001, direction.length());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.scale.set(radius, length, radius);
}
