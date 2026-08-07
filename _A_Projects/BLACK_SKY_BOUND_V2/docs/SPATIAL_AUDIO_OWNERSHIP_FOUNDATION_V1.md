# Spatial Audio Ownership Foundation v1

## Canonical ownership

World audio is transform-owned. The player owns one `AudioListener`; actors, SceneObjects and world events own `AudioEmitter` components. A spatial event identifies its source only through:

```js
{ ownerKind, ownerId, emitterId }
```

It cannot submit copied coordinates, authored distance or a hand-authored stereo position. `audioSpatialFrame.js` is the only projection from canonical transforms into audio-space metres (`0.5 m/tile`). An unresolved point owner is an error and the cue is suppressed instead of falling back to centred playback.

The listener is positioned at the hatchling transform plus `0.35 m` ear height. Its forward/right orientation follows the fixed camera's planar bearing so screen-left and screen-right remain stable.

## Emitter contract

An emitter contains identity and tuning, never an independent world position:

- emitter/profile ID, cue roles and anchor/socket offsets;
- point/area shape and source height;
- HRTF/inverse-distance settings, reference/max distance and rolloff;
- cone, priority, Doppler and acoustic-transmission policy.

Canonical BSB profiles own defaults. Runtime-map and AXIOM data store instance overrides only. Actors inherit defaults from recipes/spawners; SceneObjects use their stable object IDs; Mama and lightning expose emitters from canonical world-event state.

## Runtime truth flow

```text
owner Transform + AudioEmitter
  -> stable sourceRef
  -> central spatial frame
  -> resolved metres / orientation / velocity / tuning
  -> mono direct voice gain
  -> enclosure + world-occlusion low-pass
  -> HRTF PannerNode
  -> bus
```

Listener-local heartbeat, breath and UI cues bypass spatialization. Selected stereo reflections are separate non-positional environment returns. A stereo asset declared as a point-direct layer is rejected.

Inverse attenuation uses the declared profile. Doppler uses radial source/listener velocity, `(343 + listenerVelocity) / (343 + sourceVelocity)`, smoothed over `80 ms` and clamped to `0.85-1.18`. Teleports and frame gaps do not create velocity spikes. World blocker intersections contribute occlusion gain/cutoff; egg enclosure transmission is applied separately and only to exterior cues.

## Initial profiles

| Profile | Reference | Maximum | Rolloff |
| --- | ---: | ---: | ---: |
| Mama voice | 8 m | 160 m | 0.65 |
| Creature voice/impact | 2 m | 45 m | 1.15 |
| Smoulder/fire detail | 1.5 m | 28 m | 1.35 |

Smoulder/fire detail virtualizes to the six nearest audible SceneObject emitters with deterministic phase, distance hysteresis and `200 ms` fades.

## Migrated owners

- Mama warning, flyover and napalm: live trajectory and altitude, including an off-screen warning origin.
- Raider, husk and werewolf voices plus actor impacts: actor head/mouth/impact anchors with transform-height fallback.
- Smouldering fern/bramble and fire-arrow crackle: SceneObject-owned loops.
- Lightning thunder: the actual strike source used by propagation timing.
- Opening threats: authored actor IDs and explicit opening world-event owners.
- Egg: acoustic enclosure controlling closed/cracked/open exterior transmission while internal heartbeat and breath remain clear.

The broad inferno wall remains classified `area` and intentionally non-point until a segment/nearest-point area projection exists.

## AXIOM and diagnostics

Map Forge exposes selected owner emitter fields for anchor, height, profile, reference/max distance, rolloff, cone, Doppler, priority and instance overrides. Egg controls expose closed/cracked cutoff, transmission, leakage and transition time. Source edit, runtime bake and reload preserve these fields.

Live diagnostics expose listener/source position, distance, gain, pan, Doppler, occlusion, active Panner voices and virtualization. They are evidence from the runtime graph, not authoring claims.

## Acceptance evidence

Unit and contract coverage includes coordinate conversion, camera-relative pan sign, inverse falloff, radial Doppler, teleport rejection, enclosure routing, world occlusion, unresolved owners, stereo point rejection, owner removal and loop virtualization.

Real-browser evidence lives in `artifacts/spatial-audio-foundation/`. It records an unlocked AudioContext, 119 resolved emitters, an active Mama Panner voice whose position/pan/gain/Doppler changed during flight, successful production-asset loads and zero console/page/request/audio errors. AXIOM browser evidence records an emitter edit surviving apply, bake and reload.
