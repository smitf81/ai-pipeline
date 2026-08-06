export const RENDER_BUDGETS = Object.freeze({
  renderer: Object.freeze({
    preferredBackend: 'webgl3d',
    candidateBackend: 'webgl3d',
    fallbackBackend: null,
    activationPolicy: 'webgl3d_default_no_renderer_fallback',
    migrationPolicy: 'three3d_default_legacy_webgl_alias_retired_v1',
    sceneLayerPolicy: 'three_scene_graph_consumes_renderer_neutral_projection',
    unsupportedRendererPolicy: 'explicit_error_no_fallback',
    canvas2dRuntimeAvailable: false,
    migrationCoverageStatus: 'three3d_default_legacy_scene_root_unregistered',
    terrainCachePolicy: 'three_static_projection_one_layered_floor_batch_plus_instanced_detail_v1'
  }),
  liveEffects: Object.freeze({
    maxActive: 48,
    overflowPolicy: 'drop_oldest'
  }),
  ambientParticles: Object.freeze({
    maxActive: 96,
    sourcePolicy: 'renderer_neutral_deterministic_projection',
    overflowPolicy: 'render_highest_priority'
  }),
  smokeClouds: Object.freeze({
    maxActive: 8,
    overflowPolicy: 'drop_oldest'
  }),
  decalStamps: Object.freeze({
    maxActive: 256,
    overflowPolicy: 'drop_oldest'
  }),
  lightEmitters: Object.freeze({
    maxActive: 32,
    threeShaderSlotCapacity: 24,
    overflowPolicy: 'critical_then_dynamic_then_static_nearest',
    shaderCapacityPolicy: 'fixed_content_complete_slots_fail_visible_on_overflow_v1',
    cullingPolicy: 'expanded_camera_influence_bounds_before_projection_v1',
    statePolicy: 'dormant_nearby_static_active_dynamic_critical_v1',
    cullPaddingTiles: 0
  }),
  actorShadowLod: Object.freeze({
    policy: 'unlit_non_player_black_shadow_lod_v0',
    detailEnter: 0.12,
    shadowAlpha: 0.58,
    featheredShadowAlpha: 0.68,
    contactAlpha: 0.24,
    maxPrimitiveCountPerActor: 18
  }),
  actorLightReadability: Object.freeze({
    maxActors: 24,
    maxRimPartsPerActor: 4,
    maxCatchlightsPerActor: 3,
    geometryPolicy: 'batched_with_actor_depth_item_no_extra_draw_call',
    lightPolicy: 'nearest_local_non_scene_emitter'
  }),
  napalmDroplets: Object.freeze({
    maxActive: 24,
    overflowPolicy: 'drop_oldest'
  }),
  napalmPools: Object.freeze({
    maxActive: 48,
    overflowPolicy: 'drop_oldest'
  }),
  smokeField: Object.freeze({
    maxSources: 32,
    maxContributingLights: 16,
    updatePolicy: 'single_density_texture',
    sourcePolicy: 'unified_source_projection'
  }),
  atmosphericScatter: Object.freeze({
    maxContributingLights: 16,
    passPolicy: 'density_texture_light_scatter_composite',
    bloomPolicy: 'delegated_to_post_process_pipeline',
    smoothingPolicy: 'delegated_to_post_process_pipeline'
  }),
  atmosphericCameraOverlay: Object.freeze({
    enabled: true,
    maxRainStreaks: 300,
    maxSparkPool: 30,
    maxEmitterInfluences: 16,
    policy: 'screen_space_camera_overlay_visual_only_v0',
    sourcePolicy: 'renderer_neutral_tuning_plus_query_toggle',
    emitterProjectionPolicy: 'capped_visible_warm_light_projection_screen_space_v0',
    layerPolicy: 'after_post_process_before_hud'
  }),
  postProcess: Object.freeze({
    enabled: true,
    policy: 'centralized_post_process_pipeline_v1',
    qualityProfile: 'balanced',
    sourcePolicy: 'world_scene_before_camera_atmosphere_before_gameplay_overlay_hud',
    bloomPolicy: 'single_pass_warm_luma_glow_proxy_no_blur_chain',
    bloomScale: 1,
    bloomBlurPx: 0,
    bloomOpacity: 0,
    smoothingPolicy: 'disabled_no_full_screen_blur_chain',
    smoothingBlurPx: 0,
    smoothingOpacity: 0,
    exposurePolicy: 'reserved_for_pipeline_no_layer_local_exposure',
    ditherPolicy: 'single_shader_temporally_controlled_grain',
    ditherOpacity: 0.014,
    ditherTileSize: 64
  }),
  lightSpaceCulling: Object.freeze({
    enabled: true,
    policy: 'feathered_expanded_light_bounds_render_gate',
    outsideDetailPolicy: 'cheap_base_fill_with_feathered_detail_transition',
    actorPolicy: 'black_shadow_lod_for_unlit_non_player_actors',
    paddingTiles: 1.7,
    featherPx: 56,
    softness: 0.9,
    mergePaddingPx: 24
  }),
  sceneObjectVisibility: Object.freeze({
    policy: 'sceneobject_black_shadow_lod_hysteresis_hold_fade_v2',
    presencePolicy: 'authored_black_shadow_lod_floor_lit_detail_upgrade',
    detailPolicy: 'lit_detail_requires_stronger_light_space_influence',
    presenceEnter: 0.026,
    presenceExit: 0.002,
    litDetailEnter: 0.105,
    litDetailExit: 0.035,
    holdMs: 260,
    fadeMs: 340,
    shadowSilhouetteColour: 'rgba(0,0,0,1)',
    darkPresenceAlpha: 0.18,
    presenceMinAlpha: 0.18,
    presenceMaxAlpha: 0.34,
    litDetailMinAlpha: 0.48,
    litDetailMaxAlpha: 0.96,
    influenceDecayPer100Ms: 0.58
  }),
  occlusionShadows: Object.freeze({
    enabled: true,
    maxPhysicalBlockers: 96,
    maxBlockersPerLight: 8,
    maxShadowCastingLights: 4,
    maxShadowLightsPerBlocker: 2,
    blockerPolicy: 'explicit_scene_and_visual_actor_occluder_projection',
    missingBlockerPolicy: 'painted_terrain_has_no_height_no_shadows',
    shadowPolicy: 'nearby_scene_and_dynamic_actor_sdf_ready_shadow_field_v1',
    shadowFieldContract: 'black-sky-bound.render-shadow-field.sdf-ready.v1',
    lightSpaceClippingPolicy: 'clip_shadow_work_to_light_space_regions'
  }),
  layerRebuilds: Object.freeze({
    maxDirtyDecalRebuildsPerFrame: 1
  })
});
