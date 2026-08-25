import * as THREE from 'three';
import { WORLD_TRANSFORM_3D, renderWorldPointToWorld3D } from '../../three/worldTransform3D.js';

export class ThreeOrthographicCamera {
  constructor(canvas, { reference = false } = {}) {
    this.canvas = canvas;
    this.reference = reference;
    this.viewportW = canvas.clientWidth || 1280;
    this.viewportH = canvas.clientHeight || 720;
    this.dpr = 1;
    this.frustumHeight = reference ? 16 : 10;
    this.target = new THREE.Vector3(0, 0, 0);
    this.stormImpulse = { active: false, worldX: 0, worldY: 0, sourceKey: null };
    this.camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 160);
    this.syncPose();
  }

  resize(renderer) {
    this.dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
    this.viewportW = Math.max(1, this.canvas.clientWidth || 1280);
    this.viewportH = Math.max(1, this.canvas.clientHeight || 720);
    renderer.setPixelRatio(this.dpr);
    renderer.setSize(this.viewportW, this.viewportH, false);
    this.updateFrustum();
    return {
      dpr: this.dpr,
      w: Math.round(this.viewportW * this.dpr),
      h: Math.round(this.viewportH * this.dpr),
      viewportW: this.viewportW,
      viewportH: this.viewportH
    };
  }

  syncFromGameplay(cameraState, tileSize) {
    if (this.reference) return;
    const target = renderWorldPointToWorld3D(cameraState.x, cameraState.y, tileSize, 0);
    this.target.set(target.x, 0, target.z);
    this.stormImpulse = { active: false, worldX: 0, worldY: 0, sourceKey: null };
    this.frustumHeight = Math.max(4, this.viewportH / Math.max(0.1, cameraState.zoom) / tileSize * 0.5);
    this.updateFrustum();
    this.syncPose();
  }

  applyWorldImpulse(packet, tileSize) {
    if (this.reference || packet?.active !== true) return false;
    const worldX = Number(packet.impulseWorldX) || 0;
    const worldY = Number(packet.impulseWorldY) || 0;
    const metersPerWorldPixel = WORLD_TRANSFORM_3D.tileMeters / Math.max(1, Number(tileSize) || 1);
    this.target.x += worldX * metersPerWorldPixel;
    this.target.z += worldY * metersPerWorldPixel;
    this.stormImpulse = { active: true, worldX: round(worldX), worldY: round(worldY), sourceKey: packet.sourceKey ?? null };
    this.syncPose();
    return true;
  }

  setReferenceTarget(x, y, z, frustumHeight = 16) {
    this.target.set(x, y, z);
    this.frustumHeight = frustumHeight;
    this.updateFrustum();
    this.syncPose();
  }

  updateFrustum() {
    const aspect = this.viewportW / Math.max(1, this.viewportH);
    const halfH = this.frustumHeight * 0.5;
    const halfW = halfH * aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  syncPose() {
    const yaw = WORLD_TRANSFORM_3D.camera.yawDegrees * Math.PI / 180;
    const elevation = WORLD_TRANSFORM_3D.camera.elevationDegrees * Math.PI / 180;
    const distance = 28;
    const horizontal = Math.cos(elevation) * distance;
    this.camera.position.set(
      this.target.x + Math.sin(yaw) * horizontal,
      this.target.y + Math.sin(elevation) * distance,
      this.target.z + Math.cos(yaw) * horizontal
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  diagnostics() {
    return {
      projection: 'orthographic',
      yawDegrees: WORLD_TRANSFORM_3D.camera.yawDegrees,
      elevationDegrees: WORLD_TRANSFORM_3D.camera.elevationDegrees,
      frustumHeight: Number(this.frustumHeight.toFixed(3)),
      target: { x: round(this.target.x), y: round(this.target.y), z: round(this.target.z) },
      stormImpulse: { ...this.stormImpulse }
    };
  }
}

function round(value) { return Number(value.toFixed(3)); }
