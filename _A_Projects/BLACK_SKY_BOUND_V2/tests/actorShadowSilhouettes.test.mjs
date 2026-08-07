import { assert, equal } from './assert.mjs';
import { CONFIG } from '../src/config.js';
import { createInitialGameState } from '../src/game/createGame.js';
import { syncGameViews } from '../src/game/selectors.js';
import { buildRenderProjection } from '../src/projection/renderProjection.js';
import { createCamera } from '../src/render/camera.js';
import { humanoidProjectionSystem } from '../src/systems/humanoidProjectionSystem.js';
import { wyvernProjectionSystem } from '../src/systems/wyvernProjectionSystem.js';
import { createDemoMap } from '../src/world/map.js';

const map = createDemoMap();
const game = createInitialGameState(map);
wyvernProjectionSystem({ game, dt: 1 / 60 });
humanoidProjectionSystem({ game, dt: 1 / 60 });
syncGameViews(game);

const player = game.actors.find((actor) => actor.team === 'player');
game.lights = [{
  id: 'validation:player-side-light',
  x: player.x + 1.1,
  y: player.y - 0.2,
  radius: 5.5,
  intensity: 1,
  enabled: true,
  softness: 0.74
}];

const camera = createCamera({ clientWidth: 960, clientHeight: 540 }, map);
camera.x = player.x * CONFIG.tileSize;
camera.y = player.y * CONFIG.tileSize;
camera.zoom = 2.25;

const projection = buildRenderProjection({ game, map, camera, time: 0 }, CONFIG);
const actorBlockers = projection.shadowBlockers.filter((blocker) => blocker.source === 'renderer_neutral_actor_visual_projection');
const wyvernBlocker = actorBlockers.find((blocker) => blocker.kind === 'visual_actor_shadow_wyvern');
const wyvernPackets = projection.occlusionShadows.shadowFieldPackets.filter((packet) => packet.blockerKind === 'visual_actor_shadow_wyvern');

assert(!game.occlusionBlockers.some((blocker) => String(blocker.id).startsWith('actor_shadow:')), 'actor shadows must not be promoted into gameplay occlusion blockers');
assert(actorBlockers.length >= game.actors.length, 'render projection should derive visual actor shadow blockers for active actors');
assert(wyvernBlocker, 'player wyvern should expose a visual actor shadow blocker');
assert(wyvernBlocker.shadowSilhouettePrimitiveCount >= 8, 'wyvern shadow blocker should use a multi-lobe silhouette, not a single orb');
assert(wyvernPackets.length >= 8, 'nearby validation light should project wyvern silhouette SDF packets');
assert(wyvernPackets.every((packet) => packet.blockerSource === 'renderer_neutral_actor_visual_projection'), 'wyvern packets should preserve actor projection provenance');
assert(wyvernPackets.every((packet) => packet.staticBlocker === false), 'wyvern shadow packets should be marked dynamic');
assert(wyvernPackets.every((packet) => packet.silhouettePrimitive?.contract === 'black-sky-bound.shadow-shape-profile.v1'), 'wyvern packets should carry the shared shadow-shape profile contract');
equal(wyvernBlocker.shadowShapeProfileId, 'creature', 'wyvern blockers should use the creature shadow family');
equal(projection.occlusionShadows.actorShadowBlockers, actorBlockers.length, 'shadow projection should count actor-sourced blockers');
assert(projection.occlusionShadows.actorShadowFieldPacketCount >= wyvernPackets.length, 'shadow projection should count actor-sourced SDF packets');
