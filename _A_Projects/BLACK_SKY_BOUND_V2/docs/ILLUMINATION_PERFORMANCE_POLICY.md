# Illumination Performance Policy v1

## Measured bottleneck

The deterministic 1440x900 benchmark separates CPU projection, CPU backend work, and asynchronous per-layer GPU time. It exercises composite-only, eight visible lights, geometric shadow stress, 24 additional off-screen lights, and atmosphere stress with smoke plus 204 rain streaks.

The pre-change evidence showed that the RGB illumination composite was not the main regression. Composite-only GPU time was 0.640 ms. The expensive path was the light-by-blocker shadow product: 8 shadow lights produced 80 SDF fields and a 1.542 ms shadow pass. Off-screen lights were also projected and prepared before later layer culling. Fog, smoke, and rain were comparatively inexpensive and were not reduced.

GPU timing is opt-in through `?gpuTiming=1`. The renderer uses `EXT_disjoint_timer_query_webgl2`, polls results asynchronously, rejects disjoint samples, caps pending queries, and adds no timer-query work during ordinary play.

## Runtime policy

Illuminators are culled before renderer-neutral projection or GPU preparation. A source remains relevant while its maximum reveal/glow/radius influence intersects the camera bounds, including sources immediately outside the viewport whose light still reaches visible space.

Every projected source has one illumination state:

- `dormant`: disabled, irrelevant, or outside expanded camera influence bounds; not projected or renderer-registered.
- `nearby_static`: visible fixed source; its split reveal/glow/core influence data is signature-cached.
- `active_dynamic`: moving or flickering source; updated each frame.
- `critical`: player-linked or major world light such as moonlight, lightning, inferno, or burning-tree fire; selected ahead of lower-value sources.

The active-light budget remains 32 and resolves overflow in critical, dynamic, then nearby-static order, with priority and camera distance as tie-breakers.

## Shadow policy

Illumination and shadow casting are separate capabilities. Minor smoulder, ember, and spark sources illuminate without geometric shadows. Critical lights remain eligible, while ordinary sources must meet minimum reach and strength.

Per frame:

- at most 4 lights cast geometric shadows;
- each light considers at most 8 nearby blockers;
- each blocker accepts at most 2 shadow lights;
- off-screen shadow lights are rejected before blocker traversal;
- normalized static blocker silhouettes are cached by source identity and stable shape signature;
- stable nearby-static light/blocker WebGL geometry and SDF fields are cached;
- dynamic light/blocker geometry invalidates and rebuilds normally;
- the illumination-only layer does not duplicate shadow geometry preparation owned by the shadow layer.

These are selection and preparation limits, not changes to illumination quality. All active light contributions, RGB compositing, fog, smoke, rain, moonlight, lightning, and post-processing remain intact.

## Result

Same-scenario median results over 120 measured frames after 45 warm-up frames:

| Scenario | CPU before | CPU after | Change | GPU before | GPU after | Change |
|---|---:|---:|---:|---:|---:|---:|
| Composite only | 6.80 ms | 6.60 ms | -2.9% | 0.640 ms | 0.751 ms | +0.111 ms run variance |
| 8 visible lights | 11.30 ms | 10.35 ms | -8.4% | 1.093 ms | 1.158 ms | +0.065 ms run variance |
| Shadow stress | 12.70 ms | 10.80 ms | -15.0% | 2.494 ms | 1.833 ms | -26.5% |
| 8 visible + 24 off-screen | 12.30 ms | 10.55 ms | -14.2% | 2.460 ms | 1.831 ms | -25.6% |
| Shadow + smoke + rain | 12.40 ms | 10.70 ms | -13.7% | 2.607 ms | 2.019 ms | -22.6% |

GPU totals above sum only layers with samples in at least half of measured frames, excluding sparse no-draw query noise. The targeted shadow pass itself fell from 1.542 ms to 0.828 ms (-46.3%). The off-screen scenario now projects 8 of 32 input lights. Shadow fields are bounded at 32 instead of 80. The final shadow-stress frame reports 96 static blocker-cache hits, a stable geometry-cache hit, four static light-cache hits, and zero global-darkness overlays.

A second complete optimized run confirmed the shadow-heavy result: 1.791 ms shadow-stress, 1.787 ms off-screen stress, and 1.957 ms atmosphere-stress steady GPU totals, with the same 32-field bound. Composite-only returned to 0.646 ms versus the 0.640 ms baseline. The visible-light-only total varied upward to 1.320 ms even though it adds no GPU work; that case is treated as inconclusive run variance rather than claimed as an improvement. The consistent win is the bounded shadow path the baseline identified.

Fresh torch, moonlight, rain/smoke, and lightning captures retain the exact pre-performance mean luma and chroma measurements in every scenario (24.11/15.00, 8.17/5.79, 27.53/14.57, and 46.57/29.10 respectively). This confirms that the selection/cache work did not trade away the validated illumination-first image.

## Validation ownership

- `tests/renderPerformanceDiagnostics.test.mjs` protects asynchronous GPU timing and query disposal.
- `tests/illuminationPerformancePolicy.test.mjs` protects early culling, state priority, decorative-light eligibility, shadow caps, blocker limits, static caches, and removal of duplicate shadow preparation.
- `tests/playtest/renderPerformance.playtest.mjs` owns the deterministic browser benchmark and structured per-pass evidence.
- `tests/playtest/illuminationPrimary.playtest.mjs` protects the torch, moonlight, rain/smoke, and lightning visual contract after performance changes.

Raw before/after evidence is stored outside the repository under `outputs/illumination-performance-v1/` for this Codex task.

## Shadow-family follow-up

The shadow-shape family pass removed the duplicate full-region penumbra/core wedge and now draws one bounded authored contact footprint per caster plus the existing SDF projected fields. A fresh identical benchmark retained the 32-field cap and measured 1.622 ms shadow-stress, 1.363 ms off-screen-stress, and 1.587 ms atmosphere-stress steady GPU totals. This is consistent with reduced shadow overdraw; it does not reduce any illumination or atmosphere workload.
