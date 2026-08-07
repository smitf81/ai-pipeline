import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { RenderBackendId } from '../src/render/backends/renderBackend.js';
import {
  WORLD_TRANSFORM_3D,
  WORLD_TRANSFORM_3D_CONTRACT,
  rotateScreenRelativeInput,
  tilePointToWorld3D
} from '../src/render/three/worldTransform3D.js';

equal(RenderBackendId.WEBGL3D, 'webgl3d', 'candidate renderer should have a stable explicit backend id');
equal(WORLD_TRANSFORM_3D.contract, WORLD_TRANSFORM_3D_CONTRACT, '3D world transform should publish its contract');
equal(WORLD_TRANSFORM_3D.camera.yawDegrees, 45, 'gameplay bearing should be fixed at 45 degrees');
equal(WORLD_TRANSFORM_3D.camera.elevationDegrees, 50, 'gameplay elevation should be fixed at 50 degrees');
const point = tilePointToWorld3D(4, 6, 1.25);
equal(point.x, 2, 'four half-metre tiles should map to two render metres');
equal(point.z, 3, 'gameplay Y should map to render Z');
equal(point.y, 1.25, 'height should map to render Y');
const up = rotateScreenRelativeInput(0, -1);
assert(up.x < 0 && up.y < 0, 'screen-up input should rotate through the fixed diagonal bearing');

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const backendSource = readFileSync(new URL('../src/render/backends/renderBackend.js', import.meta.url), 'utf8');
const rendererSource = readFileSync(new URL('../src/render/backends/three/ThreeGameRenderer.js', import.meta.url), 'utf8');
assert(indexSource.includes('type="importmap"') && indexSource.includes('three.module.js'), 'local launcher should resolve the Three.js module without a CDN');
assert(backendSource.includes('ThreeGameRenderer') && backendSource.includes('webgl3d'), 'backend factory should wire the explicit 3D candidate');
assert(rendererSource.includes('ACESFilmicToneMapping'), '3D renderer should own filmic camera response');
assert(rendererSource.includes('shadowMap.enabled = true'), '3D renderer should enable real shadow maps');
assert(rendererSource.includes('ThreeLiveWorld'), 'candidate should render live renderer-neutral world projections outside the permanent reference scene');
