import { assert, equal } from './assert.mjs';
import {
  AUDIO_LISTENER_EAR_HEIGHT_METERS,
  audioSourceRefKey,
  buildAudioSpatialFrame,
  cameraRelativePan,
  createAudioSourceRef,
  deriveAudioVelocity,
  inverseDistanceGain,
  radialDopplerRatio,
  resolveWorldOcclusion,
  worldTilesToAudioPosition
} from '../src/audio/audioSpatialFrame.js';
import { createAudioDirector } from '../src/audio/audioDirector.js';
import { resolveOpeningMix } from '../src/audio/audioStateMath.js';
import { AUDIO_TUNING } from '../src/data/audio/audioTuning.js';
import { getAudioSpatialProfile } from '../src/data/audio/spatialAudioProfiles.js';

const point = worldTilesToAudioPosition(10, 6, 1.4);
equal(point.x, 5, 'gameplay X should convert through the canonical 0.5 m/tile scale');
equal(point.z, 3, 'gameplay Y should become Web Audio Z in metres');
equal(point.y, 1.4, 'source height should remain metres');

const listener = { position: { x: 0, y: AUDIO_LISTENER_EAR_HEIGHT_METERS, z: 0 }, forward: { x: 0, y: 0, z: -1 }, velocity: { x: 0, y: 0, z: 0 } };
assert(cameraRelativePan(listener, { x: 4, y: 0, z: 0 }) > 0.99, 'world source to camera-right should pan right');
assert(cameraRelativePan(listener, { x: -4, y: 0, z: 0 }) < -0.99, 'world source to camera-left should pan left');

const creature = getAudioSpatialProfile('creature_voice_spatial_v1');
equal(inverseDistanceGain(1, creature), 1, 'inverse falloff should remain full inside reference distance');
assert(inverseDistanceGain(12, creature) < 0.2, 'inverse falloff should attenuate a distant creature');
equal(inverseDistanceGain(45, creature), 0, 'point cues should be inaudible at max distance');
const storm = getAudioSpatialProfile('storm_spatial_v1');
assert(storm.referenceDistanceMeters >= 18 && storm.rolloffFactor <= 0.2, 'thunder should retain much more carrying power than a creature voice');
assert(inverseDistanceGain(50, storm) > 0.7, 'thunder should remain forceful at a typical distant strike position');

const movingListener = { ...listener, velocity: { x: 18, y: 0, z: 0 } };
const stationarySource = { position: { x: 20, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, profile: creature };
assert(radialDopplerRatio(movingListener, stationarySource, 1, 0.2) > 1, 'listener motion toward a source should raise Doppler playback rate');
equal(deriveAudioVelocity({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1 / 60).x, 0, 'teleport spikes should be rejected');
equal(deriveAudioVelocity({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.5).x, 0, 'long frame gaps should not create audio velocity');
const occlusion = resolveWorldOcclusion({ occlusionBlockers: [{ x: 5, y: 0, radius: 1, height: 3 }] }, { x: 0, y: 0.35, z: 0 }, { x: 5, y: 1.4, z: 0 });
assert(occlusion.blocked && occlusion.gain < 1 && occlusion.cutoffHz < 18000, 'world blockers should project real occlusion gain and filtering');

const game = {
  dragonId: 'player',
  actors: [
    { id: 'player', authoredId: 'hatchling', team: 'player', x: 10, y: 10, audioListener: { earHeightMeters: 0.35 }, audioEmitter: { emitterId: 'voice', profileId: 'creature_voice_spatial_v1', anchorHeightMeters: 0.48 } },
    { id: 'enemy-runtime', authoredId: 'raider:authored', team: 'raiders', x: 4, y: 10, rotation: 0, audioEmitter: { emitterId: 'voice', profileId: 'creature_voice_spatial_v1', anchorHeightMeters: 1.42 } }
  ],
  sceneObjects: Array.from({ length: 9 }, (_, index) => ({
    id: `smoulder:${index}`, x: 8 + index * 0.35, y: 12,
    audioEmitter: { emitterId: 'fire', profileId: 'smoulder_fire_spatial_v1', anchorHeightMeters: 0.35 }
  })),
  worldEvents: { activeEvent: null }
};
let frame = buildAudioSpatialFrame({ game }, null, 1 / 60);
const authoredKey = audioSourceRefKey(createAudioSourceRef('actor', 'raider:authored', 'voice'));
assert(frame.emitters[authoredKey], 'authored actor IDs should resolve to the same transform-owned emitter as runtime IDs');
const firstPan = frame.emitters[authoredKey].pan;
game.actors[1].x = 16;
frame = buildAudioSpatialFrame({ game }, frame, 0.1);
assert(Math.sign(frame.emitters[authoredKey].pan) !== Math.sign(firstPan), 'an enemy crossing the listener should continuously change stereo side');
assert(frame.emitters[authoredKey].distanceMeters > 0, 'actor distance should derive from live transforms');

const closed = resolveOpeningMix({ released: false, strainProgress: 0, openingProgress: 0, emergenceProgress: 0 }, AUDIO_TUNING);
const cracked = resolveOpeningMix({ released: false, strainProgress: 1, openingProgress: 0.4, emergenceProgress: 0 }, AUDIO_TUNING);
assert(closed.cutoffHz < cracked.cutoffHz && closed.exteriorGain < cracked.exteriorGain, 'egg cracking should open only the exterior transmission path');
equal(closed.breath, cracked.breath, 'egg shell state must not muffle listener-internal breath');
equal(closed.heartbeat, cracked.heartbeat, 'egg shell state must not muffle listener-internal heartbeat');

const director = createAudioDirector({ context: null });
director.emit('world.mama_wyvern.roar', { intensity: 1, sourceRef: createAudioSourceRef('worldEvent', 'missing-mama', 'voice') });
const missing = director.update({ game, paused: false }, 1 / 60);
equal(missing.suppressed.missingSpatialOwner, 1, 'unresolved point owners should be suppressed instead of centred');
assert(missing.recentErrors.some((entry) => entry.reason.includes('unresolved_spatial_owner')), 'missing point owners should produce an explicit diagnostic error');
equal(missing.suppressed.virtualized, 3, 'only the six nearest smoulder emitters should survive profile virtualization');

equal(createAudioSourceRef('sceneObject', 'fern:1', 'fire').ownerKind, 'sceneObject', 'source references should preserve stable owner kind');
