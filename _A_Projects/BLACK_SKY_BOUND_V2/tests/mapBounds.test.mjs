import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { clampCameraToMap, createCamera, updateCameraForAction } from '../src/render/camera.js';

const map = { width: 80, height: 60 };
const camera = createCamera({ clientWidth: 1280, clientHeight: 720 }, map);
camera.zoom = 2.75;
const halfWidth = camera.viewportW / (2 * camera.zoom);
const halfHeight = camera.viewportH / (2 * camera.zoom);

camera.x = -1000;
camera.y = -1000;
clampCameraToMap(camera, map);
equal(camera.x, halfWidth, 'camera should clamp to the loaded map left edge');
equal(camera.y, halfHeight, 'camera should clamp to the loaded map top edge');

camera.x = 100000;
camera.y = 100000;
clampCameraToMap(camera, map);
equal(camera.x, map.width * CONFIG.tileSize - halfWidth, 'camera should clamp to the loaded 80-tile right edge');
equal(camera.y, map.height * CONFIG.tileSize - halfHeight, 'camera should clamp to the loaded 60-tile bottom edge');

const input = { consumeWheel: () => 0 };
updateCameraForAction(camera, input, { x: -500, y: -500 }, 1, CONFIG.camera, map);
equal(camera.x, camera.viewportW / (2 * camera.zoom), 'camera follow should retain the map-derived left clamp');
equal(camera.y, camera.viewportH / (2 * camera.zoom), 'camera follow should retain the map-derived top clamp');

const smallMapCamera = createCamera({ clientWidth: 1280, clientHeight: 720 }, { width: 4, height: 4 });
smallMapCamera.zoom = 2.75;
smallMapCamera.x = 0;
smallMapCamera.y = 0;
clampCameraToMap(smallMapCamera, { width: 4, height: 4 });
equal(smallMapCamera.x, 2 * CONFIG.tileSize, 'camera should centre maps narrower than the viewport');
equal(smallMapCamera.y, 2 * CONFIG.tileSize, 'camera should centre maps shorter than the viewport');
assert(camera.x <= map.width * CONFIG.tileSize, 'camera bounds should be derived from the loaded map');
