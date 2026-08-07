import { readFileSync } from 'node:fs';
import { assert, equal } from './assert.mjs';
import { getSoundCue, SOUND_CUES } from '../src/audio/soundManifest.js';

const proceduralCues = Object.values(SOUND_CUES).filter((cue) => cue.source !== 'file');
assert(proceduralCues.length > 0, 'manifest should expose non-file procedural sound cues');
assert(proceduralCues.every((cue) => cue.source === 'procedural_sfx'), 'every non-file cue should use the production procedural contract');
assert(proceduralCues.every((cue) => cue.files.length === 0), 'procedural cues should not retain dead placeholder file paths');
assert(proceduralCues.every((cue) => cue.procedural?.type), 'procedural cues should expose an authored synthesis profile');

equal(getSoundCue('opening.egg.rock').procedural.type, 'shellRock', 'egg movement should use a shell-mass-specific sound');
equal(getSoundCue('opening.egg.crack').procedural.type, 'shellCrack', 'egg cracking should use layered shell fractures');
equal(getSoundCue('opening.egg.break').procedural.type, 'shellBreak', 'egg release should use a shell collapse and debris sound');
const source = readFileSync(new URL('../src/audio/proceduralLoops.js', import.meta.url), 'utf8');
const oneShotSource = readFileSync(new URL('../src/audio/proceduralOneShots.js', import.meta.url), 'utf8');
assert(!source.includes("type = 'square'"), 'procedural loops must not contain square-wave monitor modulation');
assert(!source.includes('createPulseLoop'), 'legacy regular pulse-loop synthesis should be removed');
assert(!source.includes('organicHeartbeatLoop'), 'the retired procedural heartbeat branch should be deleted');
equal(getSoundCue('player.heartbeat').source, 'file', 'heartbeat should use its recorded production loop');
equal(getSoundCue('enemy.raider.warn').source, 'file', 'raider attack warnings should use their recorded production palette');
assert(!oneShotSource.includes('warningBark'), 'the displaced oscillator warning-bark branch should be deleted');
