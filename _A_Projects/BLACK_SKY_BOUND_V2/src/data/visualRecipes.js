export const VisualRecipeId = Object.freeze({
  BITE_HIT: 'bite_hit',
  BODY_LUNGE: 'body_lunge',
  SMOKE_BURST: 'smoke_burst',
  SMOKE_PURSUIT_BREAK: 'smoke_pursuit_break'
});

export const VisualMaterialId = Object.freeze({
  BLOOD_SPATTER_STAIN: 'residual_blood_spatter_stain_v0'
});

export const VISUAL_RECIPES = Object.freeze({
  [VisualRecipeId.BITE_HIT]: Object.freeze({
    id: VisualRecipeId.BITE_HIT,
    classification: 'bounded_live_effect_plus_cached_decal',
    liveEffects: Object.freeze([
      Object.freeze({
        kind: 'slash',
        radiusScale: 1,
        lifetime: 0.16,
        stroke: 'rgba(255,220,160,0.75)',
        lineWidth: 2
      }),
      Object.freeze({
        kind: 'blood_mist',
        radiusScale: 0.74,
        lifetime: 0.36,
        stroke: 'rgba(86,7,18,0.42)',
        fill: 'rgba(150,18,31,0.56)',
        core: 'rgba(226,54,48,0.24)',
        opacity: 0.78,
        softness: 0.86,
        visualRole: 'blood_mist',
        particleCount: 9,
        spreadRadians: 2.3
      }),
      Object.freeze({
        kind: 'blood_spatter_arc',
        radiusScale: 0.9,
        lifetime: 0.42,
        stroke: 'rgba(112,9,21,0.58)',
        fill: 'rgba(170,21,32,0.64)',
        core: 'rgba(74,5,13,0.46)',
        opacity: 0.82,
        softness: 0.72,
        visualRole: 'blood_spatter_arc',
        particleCount: 7,
        spreadRadians: 1.55
      })
    ]),
    decals: Object.freeze([
      Object.freeze({
        kind: 'impact_scuff',
        minHits: 1,
        radiusScale: 0.38,
        colour: 'rgba(70,28,18,0.34)',
        opacity: 1
      }),
      Object.freeze({
        kind: 'blood_spatter_stain',
        minHits: 1,
        radiusScale: 0.42,
        colour: 'rgba(78,4,14,0.48)',
        rimColour: 'rgba(26,2,8,0.3)',
        opacity: 0.9,
        softness: 0.78,
        visualMaterial: VisualMaterialId.BLOOD_SPATTER_STAIN,
        poolShape: 'irregular_spatter_pool'
      })
    ])
  }),
  [VisualRecipeId.BODY_LUNGE]: Object.freeze({
    id: VisualRecipeId.BODY_LUNGE,
    classification: 'bounded_live_effect_plus_cached_decal',
    liveEffects: Object.freeze([
      Object.freeze({
        kind: 'lunge',
        radiusScale: 1,
        lifetime: 0.22,
        stroke: 'rgba(255,226,170,0.62)',
        lineWidth: 2.5
      }),
      Object.freeze({
        kind: 'blood_mist',
        radiusScale: 0.92,
        lifetime: 0.4,
        stroke: 'rgba(78,6,16,0.42)',
        fill: 'rgba(139,17,29,0.56)',
        core: 'rgba(212,46,44,0.22)',
        opacity: 0.84,
        softness: 0.88,
        visualRole: 'blood_mist',
        particleCount: 12,
        spreadRadians: 2.6
      }),
      Object.freeze({
        kind: 'blood_spatter_arc',
        radiusScale: 1.05,
        lifetime: 0.48,
        stroke: 'rgba(101,7,20,0.58)',
        fill: 'rgba(162,19,31,0.64)',
        core: 'rgba(60,4,12,0.48)',
        opacity: 0.84,
        softness: 0.68,
        visualRole: 'blood_spatter_arc',
        particleCount: 10,
        spreadRadians: 1.9
      })
    ]),
    decals: Object.freeze([
      Object.freeze({
        kind: 'ground_scuff',
        radiusScale: 0.48,
        colour: 'rgba(37,28,22,0.24)',
        opacity: 1
      }),
      Object.freeze({
        kind: 'blood_spatter_stain',
        minHits: 1,
        radiusScale: 0.55,
        colour: 'rgba(70,4,14,0.5)',
        rimColour: 'rgba(24,2,7,0.32)',
        opacity: 0.92,
        softness: 0.8,
        visualMaterial: VisualMaterialId.BLOOD_SPATTER_STAIN,
        poolShape: 'irregular_spatter_pool'
      })
    ])
  }),
  [VisualRecipeId.SMOKE_BURST]: Object.freeze({
    id: VisualRecipeId.SMOKE_BURST,
    classification: 'gameplay_smoke_field_plus_bounded_live_effect',
    liveEffects: Object.freeze([
      Object.freeze({
        kind: 'smoke_pop',
        radiusScale: 1,
        lifetime: 0.4,
        stroke: 'rgba(205,205,190,0.55)',
        lineWidth: 2
      })
    ]),
    decals: Object.freeze([])
  }),
  [VisualRecipeId.SMOKE_PURSUIT_BREAK]: Object.freeze({
    id: VisualRecipeId.SMOKE_PURSUIT_BREAK,
    classification: 'bounded_smoke_pursuit_break_feedback_v1',
    liveEffects: Object.freeze([
      Object.freeze({
        kind: 'smoke_pursuit_break',
        radiusScale: 1,
        lifetime: 0.62,
        stroke: 'rgba(188,214,204,0.88)',
        fill: 'rgba(94,125,121,0.48)',
        core: 'rgba(226,226,205,0.92)',
        opacity: 0.9,
        softness: 0.82,
        lineWidth: 1.8,
        visualRole: 'smoke_pursuit_break'
      })
    ]),
    decals: Object.freeze([])
  })
});

export function getVisualRecipe(recipeId) {
  const recipe = VISUAL_RECIPES[recipeId];
  if (!recipe) throw new Error(`Unknown visual recipe: ${recipeId}`);
  return recipe;
}
