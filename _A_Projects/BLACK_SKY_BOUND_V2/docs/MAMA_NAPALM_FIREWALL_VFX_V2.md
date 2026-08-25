# Mama Flyover Liquid Napalm / Firewall VFX v2

## Outcome

The production Three.js Mama crossing now reads as a fuel-fed aerial inferno rather than a stretched lit box or a row of sharp flame triangles.

The accepted presentation has four visible phases:

- a head-rooted pressurised delivery stream with ground-impact lashes;
- irregular pooled fuel and directional ignition;
- eight overlapping curved rolling fire masses with boiling edges and varied internal heat;
- smoke-led sustain and decay, followed by embers, scorch and persistent burnt foliage.

The supplied flame image was used as behaviour and mood reference only. No source pixels or composition were copied.

## Rejected intermediate foundation

The first layered Three.js revision removed the rectangular box but built the wall from crossed tapered polygon ribbons. It was technically integrated and bounded, but the gameplay frame still read as repeated triangular spears. That revision failed useful completion and is preserved only as comparison evidence:

- `artifacts/mama-napalm-vfx-upgrade/triangle-foundation/04c-firewall-sustain-detail-rejected.png`

Further geometry tuning was ruled out. The visible flame and smoke silhouettes were replaced at their foundation.

## Canonical ownership

- `src/systems/worldEventSystem.js` and `src/data/mamaWyvernWorldEvents.js` remain the sole owners of event timing, wall creation, lifetime, damage, slow, avoidance, foliage ignition and light packets.
- `src/projection/worldEventProjection.js` remains the renderer-neutral packet owner.
- `src/render/backends/three/ThreeMamaFlyoverMesh.js` owns Mama placement.
- `src/render/backends/three/ThreeDragonfireStream.js` owns the production delivery presentation.
- `src/render/backends/three/ThreeMamaNapalmFirewall.js` owns the production ground-fire composition.
- `src/render/backends/three/ThreeMamaNapalmSmokeMaterial.js` owns the smoke-only shader presentation.
- `src/render/backends/three/ThreeEffectsLayer.js` integrates those owners once.

The older WebGL renderer retains its own valid SDF projection. Its role-aware dominant/secondary/bridge composition was reused as presentation language, not as a second simulation or event truth.

## Presentation design

### Projection and impact

Nine pooled crossed delivery segments carry a separate pressure core from Mama's canonical head socket to the projected ground target. Five impact lashes break outward at contact and eighteen bounded embers peel from the stream. Delivery remains three instanced draw calls.

### Fuel and ignition

Thirteen deterministic irregular contacts overlap along the authored wall segment. Separate dark scorch underlay keeps the effect grounded. Seeded start offsets make ignition travel down the deposited line instead of raising a uniform barrier at once.

### Rolling firewall

Eight camera-facing instanced cards replace thirteen repeated tapered flame clusters. Their cards are only raster carriers; animated signed-distance unions and low-frequency FBM define the visible alpha silhouette.

The layout groups into:

- three dominant balling masses;
- three secondary masses;
- two lower bridge banks.

Every mass combines multiple rounded lobes, crown and tongue forms, noisy ground contact, low-frequency rolling displacement and higher-frequency edge breakup. The hot core, orange body and dark fuel edge are evaluated inside one shader, so no fitted triangle or separate sharp core silhouette remains.

Seeded and spatial noise varies crimson, vermilion, orange, amber, yellow and yellow-white regions both between masses and inside each body. Soot folds interrupt the hot colour rather than leaving one flat orange ramp.

### Smoke-led sustain and decay

The initial ignition remains comparatively bright. Smoke maturity rises after the first 0.7-3.4 seconds, then seven broad plume cards grow taller and wider than their ignition state.

Their visible shapes are separate rounded SDF unions with curl and crown lobes, animated turbulent and torn edges, warm-brown translucent fringe and dense charcoal/black interiors. Smoke renders over the flame batch during sustain so dark pockets visibly thread through the bright bodies instead of sitting behind them as an unrelated layer. Decay increases smoke dominance while flame height, heat and ember density fall.

## Darkness and light

The existing eight distributed event light nodes remain canonical. Their reveal and physical envelopes were tightened together so the fire carves local contrast without turning the full scene into orange fill. The visual shader increases hue and soot variation rather than solving readability by adding more scene light.

## Runtime budget

The ground firewall uses five preallocated global instanced families for up to four simultaneous walls:

- scorch residue;
- liquid fuel pools;
- rolling SDF/metaball flames;
- entwined SDF smoke plumes;
- embers.

Peak capacity is 276 instances and five firewall draw calls, down from the rejected intermediate's 348 instances and six calls. All custom instanced attributes exist before screen warmup, and activation creates no new shader programs or materials.

Measured real Chromium activation evidence for the accepted revision:

- flyover entry p95: 28.7 ms;
- delivery breath p95: 41.2 ms, max 77.5 ms;
- inferno deployment p95: 57.9 ms, max 58.5 ms;
- steady firewall p95: 39.1 ms;
- programs: 45 baseline -> 45 final;
- materials: 536 baseline -> 536 final;
- geometries: 145 baseline -> 145 final;
- dynamic scenery materials: 0 -> 0.

These are synchronous proof-lane timings on this machine, not a universal frame-rate claim. The more complex inferno transition costs more than the rejected polygon revision; steady-state cost remains essentially unchanged and the repository gate passes.

## Evidence

Baseline and accepted evidence are under `artifacts/mama-napalm-vfx-upgrade/`.

- `baseline/03-ablaze.png` shows the original lit rectangular wall.
- `triangle-foundation/04c-firewall-sustain-detail-rejected.png` shows the integrated but rejected triangle-ribbon revision.
- `final/02-during.png` shows directional delivery and impact.
- `final/03b-firewall-detail.png` shows the brighter uneven ignition phase.
- `final/04c-firewall-sustain-detail.png` shows curved rolling masses, palette variation and mature black smoke threading through the wall.
- `final/05-firewall-decay.png` shows smoke-led late-life decay.
- `final/05b-burnt-undergrowth-detail.png` shows persistent char aftermath.
- `final/report.json`, `runtime-states.json` and `browser-issues.json` retain the browser proof.
- `artifacts/mama-wyvern-activation-performance/current/evidence.json` retains the activation/resource proof.

## Validation

- `npm test` — passed.
- `npm run test:loc` — passed.
- `npm run smoke:mama-flyover` — passed in the live-source launcher; inspected ignition, sustain and decay frames; zero console, page, request or warning issues; gameplay continued.
- `node tests/playtest/mamaWyvernActivationPerformance.playtest.mjs` — passed with stable programs, materials, geometries and textures.
- `npm run build:playtest` — passed with 62 exported files, zero raw source files and zero source maps.
- `node tests/playtest/webgl3dBuiltPackage.playtest.mjs` — passed with movement, raw-source HTTP 404 and zero browser/HTTP issues.

No dependency or browser installation was required.

## Tuning points

- Macro placement and role: `FLAME_LAYOUT` in `ThreeMamaNapalmFirewall.js`.
- World-space flame width/height: `roleWidth`, `roleHeight`, `halfSpan` and `height` in `writeWall`.
- Flame lobe topology, edge noise, palette and soot folds: `flameMaterial()` in `ThreeMamaNapalmFirewall.js`.
- Smoke onset and world scale: `smokeMaturity`, `smokeHalfSpan` and `smokeHeight` in `writeWall`.
- Smoke curl, density, opacity and colour: `ThreeMamaNapalmSmokeMaterial.js`.
- Local darkness/reveal balance: `buildMamaWorldEventLightViews()` in `mamaWyvernWorldEvents.js`.

## Deliberate boundaries

- Canonical damage, slowing, avoidance pressure, event cadence and 18-second lifetime were not changed.
- Foliage-fire simulation and char ownership were not duplicated.
- No volumetric raymarcher, fluid simulation, texture asset, per-pixel scene-light spam or per-frame allocation path was added.
- The retained WebGL renderer was not deleted or made production truth for Three.js.
