export const SHADOW_SHAPE_PROFILE_CONTRACT = 'black-sky-bound.shadow-shape-profile.v1';

export const ShadowShapeProfileId = Object.freeze({
  BROAD_TREE: 'broad_tree',
  NARROW_TRUNK: 'narrow_trunk',
  ROCK: 'rock',
  CREATURE: 'creature',
  TENT: 'tent',
  WALL_SEGMENT: 'wall_segment',
  NO_SHADOW: 'no_shadow'
});

const SHARED = Object.freeze({
  anchor: Object.freeze({ x: 0, y: 0 }),
  contact: Object.freeze({ shape: 'ellipse', widthScale: 0.4, depthScale: 0.22, softnessScale: 1, densityScale: 1 }),
  projection: Object.freeze({ lengthScale: 0.5, baseWidthScale: 0.68, spreadScale: 0.12, rootInsetScale: 0.62 })
});

export const SHADOW_SHAPE_PROFILES = Object.freeze({
  [ShadowShapeProfileId.BROAD_TREE]: profile(ShadowShapeProfileId.BROAD_TREE, 'dense_pine', {
    contact: { shape: 'capsule', widthScale: 0.32, depthScale: 0.18, softnessScale: 1.18, densityScale: 0.92 },
    projection: { lengthScale: 0.58, baseWidthScale: 0.78, spreadScale: 0.15, rootInsetScale: 0.72 },
    variants: {
      dense_pine: {
        primitives: [
          primitive('trunk', 'trunk_core', 0, 0, 0.34, 0.82, 0.28, 1.2, 0.76),
          primitive('crown_nw', 'canopy_lobe', -0.55, -0.72, 0.62, 1.06, 0.58, 0.78, 1.12),
          primitive('crown_ne', 'canopy_lobe', 0.52, -0.66, 0.57, 0.98, 0.54, 0.72, 1.16),
          primitive('crown_s', 'canopy_lobe', -0.08, 0.48, 0.5, 0.9, 0.48, 0.7, 1.08)
        ]
      },
      airy_birch: {
        contact: { widthScale: 0.25, depthScale: 0.14, densityScale: 0.82 },
        projection: { lengthScale: 0.54, baseWidthScale: 0.65, spreadScale: 0.13, rootInsetScale: 0.74 },
        primitives: [
          primitive('trunk', 'trunk_core', 0, 0.08, 0.34, 0.84, 0.24, 1.08, 0.76),
          primitive('crown_l', 'canopy_lobe', -0.42, -0.54, 0.52, 0.92, 0.46, 0.66, 1.18),
          primitive('crown_r', 'canopy_lobe', 0.42, -0.46, 0.47, 0.86, 0.42, 0.62, 1.22)
        ]
      }
    }
  }),
  [ShadowShapeProfileId.NARROW_TRUNK]: profile(ShadowShapeProfileId.NARROW_TRUNK, 'dead_snag', {
    contact: { shape: 'capsule', widthScale: 0.3, depthScale: 0.15, softnessScale: 1.08, densityScale: 0.88 },
    projection: { lengthScale: 0.46, baseWidthScale: 0.52, spreadScale: 0.09, rootInsetScale: 0.76 },
    variants: {
      dead_snag: {
        primitives: [
          primitive('trunk', 'trunk_core', 0, 0.05, 0.42, 0.94, 0.22, 1.06, 0.72),
          primitive('branch_left', 'branch', -0.32, -0.34, 0.2, 0.64, 0.12, 0.54, 0.94),
          primitive('branch_right', 'branch', 0.38, -0.22, 0.18, 0.56, 0.1, 0.5, 0.96)
        ]
      }
    }
  }),
  [ShadowShapeProfileId.ROCK]: profile(ShadowShapeProfileId.ROCK, 'faceted', {
    contact: {
      shape: 'polygon', widthScale: 0.68, depthScale: 0.38, softnessScale: 0.9, densityScale: 1,
      points: [[-0.92, -0.08], [-0.62, -0.78], [0.08, -0.96], [0.86, -0.48], [0.94, 0.22], [0.42, 0.88], [-0.38, 0.76]]
    },
    projection: { lengthScale: 0.34, baseWidthScale: 0.86, spreadScale: 0.08, rootInsetScale: 0.52 },
    variants: {
      faceted: {
        primitives: [
          primitive('mass_core', 'stone_mass', 0, 0, 0.72, 0.88, 0.46, 1.05, 0.84),
          primitive('left_facet', 'stone_facet', -0.34, -0.12, 0.42, 0.76, 0.32, 0.78, 0.78),
          primitive('right_facet', 'stone_facet', 0.36, 0.18, 0.38, 0.68, 0.28, 0.7, 0.82)
        ]
      }
    }
  }),
  [ShadowShapeProfileId.CREATURE]: profile(ShadowShapeProfileId.CREATURE, 'generic', {
    contact: { shape: 'capsule', widthScale: 0.62, depthScale: 0.34, softnessScale: 1.14, densityScale: 0.86 },
    projection: { lengthScale: 0.36, baseWidthScale: 0.72, spreadScale: 0.1, rootInsetScale: 0.5 },
    variants: {
      grounded_wyvern: {},
      humanoid: {
        contact: { widthScale: 0.38, depthScale: 0.2, densityScale: 0.76 },
        projection: { lengthScale: 0.4, baseWidthScale: 0.48, spreadScale: 0.08, rootInsetScale: 0.58 }
      },
      generic: { primitives: [primitive('body_core', 'body_lobe', 0, 0, 0.78, 0.82, 0.62, 0.82, 1.1)] }
    }
  }),
  [ShadowShapeProfileId.TENT]: profile(ShadowShapeProfileId.TENT, 'ridge', {
    contact: { shape: 'capsule', widthScale: 0.86, depthScale: 0.56, softnessScale: 1.05, densityScale: 0.9 },
    projection: { lengthScale: 0.42, baseWidthScale: 0.92, spreadScale: 0.08, rootInsetScale: 0.48 },
    variants: { ridge: { primitives: [primitive('tent_mass', 'tent_mass', 0, 0, 0.88, 0.9, 0.5, 0.94, 1.04)] } }
  }),
  [ShadowShapeProfileId.WALL_SEGMENT]: profile(ShadowShapeProfileId.WALL_SEGMENT, 'straight', {
    contact: { shape: 'capsule', widthScale: 1, depthScale: 0.18, softnessScale: 0.92, densityScale: 0.96 },
    projection: { lengthScale: 0.5, baseWidthScale: 1, spreadScale: 0.03, rootInsetScale: 0.46 },
    variants: { straight: { primitives: [primitive('wall_mass', 'wall_segment', 0, 0, 1, 1, 0.72, 1, 0.9)] } }
  }),
  [ShadowShapeProfileId.NO_SHADOW]: Object.freeze({
    contract: SHADOW_SHAPE_PROFILE_CONTRACT,
    id: ShadowShapeProfileId.NO_SHADOW,
    castsShadow: false,
    defaultVariant: 'none',
    anchor: SHARED.anchor,
    contact: null,
    projection: null,
    variants: Object.freeze({ none: Object.freeze({ primitives: Object.freeze([]) }) })
  })
});

export function resolveShadowShapeProfile(value, overrides = {}) {
  const reference = typeof value === 'string' ? { profileId: value } : (value ?? {});
  const profile = SHADOW_SHAPE_PROFILES[reference.profileId];
  if (!profile) throw new Error(`Unknown shadow shape profile: ${reference.profileId}`);
  const variantId = reference.variantId ?? profile.defaultVariant;
  const variant = profile.variants[variantId];
  if (!variant) throw new Error(`Unknown shadow shape variant: ${profile.id}:${variantId}`);
  const primitives = overrides.primitives ?? reference.primitives ?? variant.primitives ?? profile.primitives ?? [];
  return {
    contract: SHADOW_SHAPE_PROFILE_CONTRACT,
    profileId: profile.id,
    variantId,
    castsShadow: profile.castsShadow !== false,
    anchor: { ...profile.anchor, ...variant.anchor, ...reference.anchor, ...overrides.anchor },
    rotation: finite(overrides.rotation ?? reference.rotation, 0),
    scale: positive(overrides.scale ?? reference.scale, 1),
    contact: profile.contact ? { ...profile.contact, ...variant.contact, ...reference.contact, ...overrides.contact } : null,
    projection: profile.projection ? { ...profile.projection, ...variant.projection, ...reference.projection, ...overrides.projection } : null,
    primitives: primitives.map((item) => ({ ...item }))
  };
}

function profile(id, defaultVariant, values) {
  return Object.freeze({
    contract: SHADOW_SHAPE_PROFILE_CONTRACT,
    id,
    castsShadow: true,
    defaultVariant,
    anchor: Object.freeze({ ...SHARED.anchor, ...(values.anchor ?? {}) }),
    contact: Object.freeze({ ...SHARED.contact, ...(values.contact ?? {}) }),
    projection: Object.freeze({ ...SHARED.projection, ...(values.projection ?? {}) }),
    primitives: Object.freeze(values.primitives ?? []),
    variants: Object.freeze(Object.fromEntries(Object.entries(values.variants ?? {}).map(([key, variant]) => [key, Object.freeze(variant)])))
  });
}

function primitive(id, kind, offsetX, offsetY, widthScale, lengthScale, tailWidthScale, dimnessScale, softnessScale) {
  return Object.freeze({ id, kind, offsetX, offsetY, widthScale, lengthScale, tailWidthScale, dimnessScale, softnessScale });
}

function finite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}
