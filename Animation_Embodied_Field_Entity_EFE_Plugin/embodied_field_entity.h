#pragma once
// =============================================================================
// embodied_field_entity.h — Single include for EFE system
//
// Embodied Field Entity (EFE) — v0.1
// A systemic creature simulation layer for field-structured game engines.
//
// ARCHITECTURE SUMMARY
// ════════════════════
//
//  World Fields (FieldRegistry)
//    │   Each field: airflow, pressure, fear, territory, etc.
//    │   Entities READ and WRITE fields every frame.
//    │
//    ▼
//  EmbodiedEntity
//    │
//    ├─ MorphologyGraph      "The Body"
//    │    Nodes (mass points) + Constraints (springs/joints)
//    │    Damage alters the graph — gameplay, not just visuals.
//    │
//    ├─ IntentStack          "The Will"
//    │    High-level goals (pursue, evade, parry, glide…)
//    │    Written by your AI / behaviour tree.
//    │    NOT animation state. Biases force priorities.
//    │
//    ├─ MotorSolver          "The Intelligence"
//    │    Converts intent + fields + body state → forces.
//    │    Pluggable: swap built-in rules for RL/motion-matching policy.
//    │    Outputs ForceApplications into MorphologyGraph.
//    │
//    └─ SurfaceExpression    "The Visible Residue"
//         Reads body state, outputs ExpressionFrame per frame.
//         Feeds into your animation blender / renderer.
//         NO physics feedback. Pure visual consequence.
//
// DATA FLOW (per tick)
// ════════════════════
//
//   [AI writes intents]
//        │
//        ▼
//   MotorSolver.solve()
//        │  reads: intents, fields, body state
//        │  writes: forces into MorphologyGraph
//        ▼
//   MorphologyGraph.resolve()
//        │  integrates positions, satisfies constraints
//        │  applies structural damage from over-stress
//        ▼
//   SurfaceExpression.evaluate()
//        │  reads: body state, intents, fields, motor state
//        │  writes: ExpressionFrame (blend params, bone hints)
//        ▼
//   [Renderer/animator consumes ExpressionFrame]
//
//
// INTEGRATION CHECKLIST (ACE / Axiom)
// ════════════════════════════════════
//
//  1. MATH TYPES
//     Replace Vec3, Quat in types.h with your engine's types via the
//     four struct definitions. Or typedef and add conversion operators.
//
//  2. ENTITY IDs
//     EntityID / NodeID are uint32_t. Map to your ECS handle type.
//
//  3. PHYSICS DELEGATION
//     Set MorphologyGraph::externalSolverCallback to delegate constraint
//     resolution to your physics engine (PhysX / Chaos / Jolt / custom).
//     Without this, the built-in Verlet pass runs (acceptable for prototyping).
//
//  4. FIELD REGISTRY
//     Create one FieldRegistry per world zone. Register fields at world init.
//     Call FieldRegistry::tick(dt) once per simulation tick.
//     For GPU simulation: upload via SpatialFieldGrid::toGPUBuffer().
//
//  5. LOD
//     Set EmbodiedEntity::setLOD() from your culling/streaming system.
//       Full     → close to camera, full simulation
//       Reduced  → mid-range, no expression layer
//       Abstract → far, field-agent only
//       Culled   → not simulated
//
//  6. AI INTENT WRITING
//     Your behaviour tree / GOAP / utility AI calls:
//       entity.intents().push(Intent{IntentType::Pursue, ...})
//     Motor solver reads this automatically on next tick.
//
//  7. RENDERER CONSUMPTION
//     After tick(), read entity.lastExpression() and map fields to
//     your blend tree parameters, shader uniforms, or procedural IK.
//
//  8. COMBAT INTEGRATION
//     When a strike is about to land:
//       entity.onIncomingForce(strikeForceVector)
//     When an impact registers:
//       entity.onImpact(worldPos, magnitude)
//
//  9. FIELD EMISSION (currently documented, not fully wired)
//     MotorSolver::emitToFields() contains the intended emission logic
//     as comments. Activate by passing mutable FieldRegistry& into solve().
//     This is the mechanism for entity→world feedback (air disturbance,
//     territorial dominance, fear propagation).
//
// KNOWN HEURISTICS (be aware when integrating)
// ════════════════════════════════════════════
//   • Constraint solver (MorphologyGraph::resolve) — simplified Verlet.
//     Replace with engine physics via externalSolverCallback.
//   • Field propagation — first-order diffusion, not fluid simulation.
//     Hook: PropagationModel::FluidSim in FieldDescriptor.
//   • Lift/drag model — single coefficient, not per-panel aerodynamics.
//   • Balance PD controller — gains need per-species tuning.
//   • Gait generation — sinusoidal phase offset, not motion-matched.
//     Replace via MotorSolver::setLocomotionPolicy().
//   • Air density is sea-level constant. No altitude/temperature coupling.
//   • Emotion/fear values are linear approximations.
//
// =============================================================================

#include "types.h"
#if __has_include("fields/spatial_field.h")
#include "fields/spatial_field.h"
#else
#include "spatial_field.h"
#endif
#if __has_include("entity/morphology.h")
#include "entity/morphology.h"
#else
#include "morphology.h"
#endif
#if __has_include("entity/intent.h")
#include "entity/intent.h"
#else
#include "intent.h"
#endif
#if __has_include("entity/musculotendon.h")
#include "entity/musculotendon.h"
#else
#include "musculotendon.h"
#endif
#if __has_include("entity/embodied_entity.h")
#include "entity/embodied_entity.h"
#else
#include "embodied_entity.h"
#endif
#if __has_include("solver/motor_solver.h")
#include "solver/motor_solver.h"
#else
#include "motor_solver.h"
#endif
#if __has_include("animation/surface_expression.h")
#include "animation/surface_expression.h"
#else
#include "surface_expression.h"
#endif

// ── Minimal usage example ─────────────────────────────────────────────────
//
// // 1. Create world fields
// EFE::Fields::FieldRegistry fields;
// auto airDesc = EFE::Fields::FieldDescriptor{
//     EFE::Fields::FieldType::Airflow,
//     EFE::Fields::PropagationModel::Linear,
//     EFE::Fields::DecayModel::Exponential,
//     0.5f, 0.3f, 1.f, 0.f, true
// };
// fields.registerField(std::make_unique<EFE::Fields::SpatialFieldGrid>(
//     EFE::Vec3(-100,-10,-100), EFE::Vec3(2,2,2), 100,10,100, airDesc));
//
// // 2. Create entity
// EFE::Solver::MotorConfig cfg;
// cfg.rootNode = 0; cfg.wingArea = 18.f;
// auto dragon = std::make_unique<EFE::Entity::EmbodiedEntity>(1, "Dragon", cfg);
//
// // Build morphology (see debug/dragon_builder.h for full example)
// // dragon->body().addNode(...); dragon->body().addConstraint(...);
//
// // 3. Game loop
// while (running) {
//     float dt = getDeltaTime();
//
//     // AI writes intent
//     EFE::Entity::Intent pursue;
//     pursue.type = EFE::Entity::IntentType::Pursue;
//     pursue.mods.targetWorldPos = player.position();
//     pursue.priority = 0.9f; pursue.weight = 1.f;
//     dragon->intents().push(pursue);
//
//     // Simulate
//     fields.tick(dt);
//     dragon->tick(fields, dt);
//
//     // Renderer reads expression
//     const auto& expr = dragon->lastExpression();
//     myBlendTree.setFloat("Speed",    expr.speed);
//     myBlendTree.setFloat("Fatigue",  expr.exhaustion);
//     myBlendTree.setFloat("WingDmgL", expr.wingDamageL);
//     for (size_t i = 0; i < expr.boneHintCount; ++i)
//         myIKSolver.applyHint(expr.boneHints[i].boneName,
//                               expr.boneHints[i].rotation,
//                               expr.boneHints[i].weight);
// }
