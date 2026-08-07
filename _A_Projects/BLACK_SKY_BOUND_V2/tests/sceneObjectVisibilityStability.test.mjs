import { assert, equal } from './assert.mjs';
import { RENDER_BUDGETS } from '../src/data/renderBudgets.js';
import {
  appendSceneObjectPresenceGeometry,
  resolveSceneObjectVisibility,
  WEBGL_SCENE_OBJECT_VISIBILITY_MODE
} from '../src/render/backends/webgl/WebGLSceneObjectVisibility.js';
import { buildWebGLSceneryDepthItems } from '../src/render/backends/webgl/layers/WebGLSceneryLayer.js';

equal(RENDER_BUDGETS.sceneObjectVisibility.policy, 'sceneobject_black_shadow_lod_hysteresis_hold_fade_v2', 'sceneobject visibility should declare a black shadow LoD stability policy');
equal(RENDER_BUDGETS.sceneObjectVisibility.presencePolicy, 'authored_black_shadow_lod_floor_lit_detail_upgrade', 'weak visibility should stay cheap and black while preserving authored silhouettes');
assert(RENDER_BUDGETS.sceneObjectVisibility.darkPresenceAlpha >= 0.16, 'authored sceneobjects should keep a visible black shadow LoD floor');
assert(RENDER_BUDGETS.sceneObjectVisibility.presenceEnter > RENDER_BUDGETS.sceneObjectVisibility.presenceExit, 'presence should use enter/exit hysteresis');
assert(RENDER_BUDGETS.sceneObjectVisibility.litDetailEnter > RENDER_BUDGETS.sceneObjectVisibility.litDetailExit, 'lit detail should use a stronger hysteresis band');

const context = visibilityContext();
const object = fakeTree();

let visibility = resolveSceneObjectVisibility(context, object, 0.04);
equal(visibility.mode, 'presence_silhouette', 'barely-lit sceneobjects should enter cheap presence before lit detail');
equal(visibility.presenceVisible, true, 'presence should become visible above the presence enter threshold');
equal(visibility.litDetailVisible, false, 'lit detail should stay off below the stronger detail threshold');
assert(visibility.stableInfluence >= visibility.rawInfluence, 'visibility should expose stabilized influence for LoD decisions');

visibility = resolveSceneObjectVisibility({ ...context, renderTimeMs: 16 }, object, 0.01);
equal(visibility.presenceVisible, true, 'presence should remain visible while influence is between enter and exit thresholds');

visibility = resolveSceneObjectVisibility({ ...context, renderTimeMs: 80 }, object, 0);
equal(visibility.presenceVisible, true, 'presence should hold briefly after influence falls out');
equal(visibility.held, false, 'stabilized influence should avoid entering hold on a single brief dip');
assert(visibility.stableInfluence > visibility.rawInfluence, 'visibility should use decayed influence to prevent single-frame sceneobject flicker');

visibility = resolveSceneObjectVisibility({ ...context, renderTimeMs: 260 }, object, 0);
equal(visibility.presenceVisible, true, 'presence should remain stable during the decayed visibility window');

visibility = resolveSceneObjectVisibility({ ...context, renderTimeMs: 980 }, object, 0);
equal(visibility.presenceVisible, true, 'authored presence should remain as a dark silhouette after hold and fade expire');
equal(visibility.mode, 'dark_presence_silhouette', 'expired weak influence should fall back to a cheap dark authored silhouette');
assert(visibility.alpha >= RENDER_BUDGETS.sceneObjectVisibility.darkPresenceAlpha, 'dark authored silhouettes should keep a bounded alpha floor');

const detailContext = visibilityContext();
visibility = resolveSceneObjectVisibility(detailContext, object, 0.2);
equal(visibility.litDetailVisible, true, 'stronger light influence should enable lit detail');
assert(visibility.alpha >= RENDER_BUDGETS.sceneObjectVisibility.litDetailMinAlpha, 'lit detail should render with a readable opacity floor');
visibility = resolveSceneObjectVisibility({ ...detailContext, renderTimeMs: 16 }, object, 0.1);
equal(visibility.litDetailVisible, true, 'lit detail should not toggle off immediately inside the detail hysteresis band');
visibility = resolveSceneObjectVisibility({ ...detailContext, renderTimeMs: 32 }, object, 0.05);
equal(visibility.litDetailVisible, true, 'lit detail should not flicker off on a brief low-influence dip');
visibility = resolveSceneObjectVisibility({ ...detailContext, renderTimeMs: 560 }, object, 0.01);
equal(visibility.litDetailVisible, false, 'lit detail should fall back to presence after the stabilized influence decays');
equal(visibility.presenceVisible, true, 'presence should remain active after lit detail falls back');

const rects = [];
const triangles = [];
appendSceneObjectPresenceGeometry(object, 0.12, rects, triangles);
assert(rects.length + triangles.length > 0, 'presence visibility should emit cheap silhouette primitives');
assert(rects.length + triangles.length < 6, 'presence visibility should stay lower-detail than full sceneobject geometry');
assert([...rects, ...triangles].every((primitive) => primitive.color[0] === 0 && primitive.color[1] === 0 && primitive.color[2] === 0), 'presence visibility should use black shadow LoD colours');

const weakBuilderContext = sceneryContextWithWeakLight();
const built = buildWebGLSceneryDepthItems({ scenery: [object] }, weakBuilderContext);
equal(built.items.length, 1, 'barely-lit sceneobjects should still produce a depth item');
equal(built.litDetailVisibleCount, 0, 'weak sceneobjects should not use lit detail geometry');
equal(built.presenceVisibleCount, 1, 'weak sceneobjects should count as presence-visible');
assert(built.items[0].rects.length + built.items[0].triangles.length < 6, 'weak sceneobjects should use cheap presence geometry');
equal(WEBGL_SCENE_OBJECT_VISIBILITY_MODE, 'webgl_sceneobject_presence_hysteresis_v0', 'WebGL sceneobject visibility mode should be named');

function visibilityContext() {
  return {
    lightSpaceCulling: { enabled: true },
    sceneObjectVisibilityStates: new Map(),
    renderTimeMs: 0
  };
}

function sceneryContextWithWeakLight() {
  return {
    camera: {
      x: 0,
      y: 0,
      zoom: 1,
      viewportW: 100,
      viewportH: 100,
      visibleWorldBounds() {
        return { left: -100, top: -100, right: 100, bottom: 100 };
      }
    },
    renderTimeMs: 0,
    sceneObjectVisibilityStates: new Map(),
    lightSpaceCulling: {
      enabled: true,
      softness: 1,
      regions: [{
        innerBounds: { x: 40, y: 40, w: 10, h: 10 },
        outerBounds: { x: 40, y: 40, w: 40, h: 40 },
        featherPx: 30
      }]
    }
  };
}

function fakeTree() {
  return {
    id: 'sceneobject:visibility-tree',
    type: 'tree',
    worldX: 26,
    worldY: 26,
    worldTileX: 23,
    worldTileY: 19,
    worldWidth: 8,
    worldHeight: 12,
    worldRadius: 1,
    anchorWorldY: 30,
    render: {
      baseShadow: 'rgba(0,0,0,0.28)',
      trunkColour: '#4a2d1b',
      crownShade: '#162719',
      kind: 'tree'
    }
  };
}
