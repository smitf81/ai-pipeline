#pragma once
// =============================================================================
// animation/surface_expression.h — Visualised constraint residue
//
// PURPOSE:
//   The final visual layer. Takes body state (forces, damage, velocity,
//   intent, field readings) and outputs blend parameters, bone overrides,
//   and secondary motion hints for your renderer/animation system.
//   This layer has NO effect on physics or gameplay.
//
// INTEGRATION NOTES:
//   - SurfaceExpression outputs ExpressionFrame each tick.
//   - Consume ExpressionFrame in your render/animation pipeline.
//   - For ACE: feed ExpressionFrame into your motion-matching blender or
//     blend tree as parameter inputs.
//   - HEURISTIC: All expression values are approximations driven by body state.
//     Authored animation clips / blend shapes still plug in at this layer.
//   - "Animation" as traditionally understood lives ONLY here — it is the
//     visible residue of the simulation above. Never feed ExpressionFrame
//     back into physics.
// =============================================================================

#if __has_include("../types.h")
#include "../types.h"
#else
#include "types.h"
#endif
#if __has_include("../entity/morphology.h")
#include "../entity/morphology.h"
#else
#include "morphology.h"
#endif
#if __has_include("../entity/intent.h")
#include "../entity/intent.h"
#else
#include "intent.h"
#endif
#if __has_include("../solver/motor_solver.h")
#include "../solver/motor_solver.h"
#else
#include "motor_solver.h"
#endif
#if __has_include("../fields/spatial_field.h")
#include "../fields/spatial_field.h"
#else
#include "spatial_field.h"
#endif
#include <algorithm>
#include <array>
#include <string>

namespace EFE {
namespace Animation {

using Entity::MorphologyGraph;
using Entity::IntentStack;
using Entity::IntentType;
using Solver::MotorState;
using Fields::FieldRegistry;
using Fields::FieldType;

// ── Secondary motion hint ─────────────────────────────────────────────────
// A bone-level override or hint passed to the renderer/animation blender.
struct BoneHint {
    std::string  boneName;   // maps to your rig's bone name
    Quat         rotation;   // world-space rotation override or additive delta
    float        weight;     // 0=no effect, 1=full override
    bool         additive;   // true = add to base pose; false = override
};

// ── Per-frame expression output ────────────────────────────────────────────
// Everything here is READ-ONLY by downstream systems.
struct ExpressionFrame {
    // ── Locomotion blend parameters ───────────────────────────────────────
    float speed           = 0.f;   // 0–1 normalised movement speed
    float direction       = 0.f;   // radians, relative to forward
    float gaitPhase       = 0.f;   // 0–1 cycle position (feet/wings)
    float inAir           = 0.f;   // 0=grounded, 1=fully airborne

    // Take-off debug overlay values, mirrored from MotorState.
    float takeOffReadiness       = 0.f;
    float takeOffLoad            = 0.f;
    float launchLiftReserve      = 0.f;
    float launchClearance        = 0.f;
    float launchVerticalVelocity = 0.f;
    uint8_t takeOffPhase         = 0;
    uint8_t launchFailureReason  = 0;

    // Native wing-panel aero debug values, mirrored from MotorState.
    float aeroLiftTotal          = 0.f;
    float aeroDragTotal          = 0.f;
    float aeroThrustTotal        = 0.f;
    float aeroLiftReserve        = 0.f;
    float aeroAoAL               = 0.f;
    float aeroAoAR               = 0.f;
    float aeroStallL             = 0.f;
    float aeroStallR             = 0.f;
    float aeroPanelCount         = 0.f;
    Vec3  aeroCentreOfLift       = Vec3::zero();
    Vec3  aeroLiftVector         = Vec3::zero();
    Vec3  aeroDragVector         = Vec3::zero();

    // ── Postural / emotional state ────────────────────────────────────────
    float alertness       = 0.f;   // 0=resting, 1=combat-ready
    float aggression      = 0.f;
    float exhaustion      = 0.f;   // maps to fatigue
    float fear            = 0.f;
    float pain            = 0.f;   // driven by average damage state

    // ── Damage expression ─────────────────────────────────────────────────
    float wingDamageL     = 0.f;   // 0–1 visual damage fold
    float wingDamageR     = 0.f;
    float spinalDamage    = 0.f;
    float tailDamage      = 0.f;
    float overallDamage   = 0.f;

    // ── Respiration ───────────────────────────────────────────────────────
    float breathPhase     = 0.f;   // 0–1 inhale/exhale cycle
    float breathAmplitude = 0.f;   // scales chest expansion

    // ── Muscle/skin surface effects ────────────────────────────────────────
    float muscleFlexL     = 0.f;   // left side muscle tension 0–1
    float muscleFlexR     = 0.f;
    float skinStretch     = 0.f;   // overall skin stretch (for shader)

    // ── Impact ripple (for hit effects) ───────────────────────────────────
    Vec3  lastImpactPoint;
    float impactRippleAge = 1.f;   // 0=fresh, 1=dissipated
    float impactMagnitude = 0.f;

    // ── Per-bone overrides ────────────────────────────────────────────────
    // Small fixed array to avoid allocation; extend if needed.
    static constexpr size_t kMaxBoneHints = 16;
    std::array<BoneHint, kMaxBoneHints> boneHints{};
    size_t boneHintCount = 0;

    void addBoneHint(const BoneHint& h) {
        if (boneHintCount < kMaxBoneHints)
            boneHints[boneHintCount++] = h;
    }
};

// ── Surface expression evaluator ──────────────────────────────────────────
class SurfaceExpression {
public:
    // Evaluate expression from current simulation state.
    // Call AFTER motor solver and morphology resolve() for this frame.
    ExpressionFrame evaluate(
        const MorphologyGraph& body,
        const IntentStack&     intents,
        const MotorState&      motorState,
        const FieldRegistry&   fields,
        float                  dt)
    {
        ExpressionFrame f;
        Vec3 com = body.centreOfMass();
        Vec3 vel = body.centreVelocity();

        // ── Locomotion parameters ─────────────────────────────────────────
        float speed = vel.length();
        f.speed     = std::min(speed / 10.f, 1.f); // HEURISTIC: normalise against ~10 m/s
        f.gaitPhase = motorState.gaitPhase;
        f.inAir     = motorState.inFlight ? 1.f : 0.f;
        f.takeOffReadiness       = motorState.takeOffReadiness;
        f.takeOffLoad            = motorState.takeOffLoad;
        f.launchLiftReserve      = motorState.launchLiftReserve;
        f.launchClearance        = motorState.launchClearance;
        f.launchVerticalVelocity = motorState.launchVerticalVelocity;
        f.takeOffPhase           = static_cast<uint8_t>(motorState.takeOffPhase);
        f.launchFailureReason    = static_cast<uint8_t>(motorState.takeOffFailureReason);
        f.aeroLiftTotal          = motorState.aeroLiftTotal;
        f.aeroDragTotal          = motorState.aeroDragTotal;
        f.aeroThrustTotal        = motorState.aeroThrustTotal;
        f.aeroLiftReserve        = motorState.aeroLiftReserve;
        f.aeroAoAL               = motorState.aeroAoAL;
        f.aeroAoAR               = motorState.aeroAoAR;
        f.aeroStallL             = motorState.aeroStallL;
        f.aeroStallR             = motorState.aeroStallR;
        f.aeroPanelCount         = motorState.aeroPanelCount;
        f.aeroCentreOfLift       = motorState.aeroCentreOfLift;
        f.aeroLiftVector         = motorState.aeroLiftVector;
        f.aeroDragVector         = motorState.aeroDragVector;

        // ── Emotional state from intents ──────────────────────────────────
        f.exhaustion  = motorState.fatigue;
        f.alertness   = intents.has(IntentType::Pursue)  ||
                        intents.has(IntentType::Evade)   ||
                        intents.has(IntentType::TakeOff) ||
                        intents.has(IntentType::Strike)  ? 1.f : 0.3f;
        f.aggression  = intents.has(IntentType::Strike)  ||
                        intents.has(IntentType::Intimidate) ? 0.8f : 0.f;

        // Fear driven by field
        auto fearCell = fields.sampleBest(FieldType::FearStress, com);
        f.fear        = fearCell.value;

        // ── Damage expression ─────────────────────────────────────────────
        f.overallDamage  = averageNodeDamage(body);
        f.pain           = f.overallDamage;
        f.wingDamageL    = nodeGroupDamage(body, "wing_l");
        f.wingDamageR    = nodeGroupDamage(body, "wing_r");
        f.spinalDamage   = nodeGroupDamage(body, "spine");
        f.tailDamage     = nodeGroupDamage(body, "tail");

        // ── Breathing ─────────────────────────────────────────────────────
        breathPhase_ += (0.3f + f.exhaustion * 0.5f) * dt;
        if (breathPhase_ > 1.f) breathPhase_ -= 1.f;
        f.breathPhase     = breathPhase_;
        f.breathAmplitude = 0.3f + f.exhaustion * 0.7f;

        // ── Muscle flex driven by velocity magnitude ───────────────────────
        // HEURISTIC: Left/right split by lateral velocity component
        if (motorState.activeMuscleCount > 0) {
            f.muscleFlexL = std::clamp(motorState.muscleTensionL, 0.f, 1.f);
            f.muscleFlexR = std::clamp(motorState.muscleTensionR, 0.f, 1.f);
            f.skinStretch = std::clamp(motorState.muscleForceTotal / 4000.f, 0.f, 1.f);
        } else {
            f.muscleFlexL = std::min(1.f, std::max(0.f, vel.x > 0 ? vel.x / 5.f : 0.f) + speed / 8.f);
            f.muscleFlexR = std::min(1.f, std::max(0.f, vel.x < 0 ?-vel.x / 5.f : 0.f) + speed / 8.f);
            f.skinStretch = std::min(1.f, speed / 12.f);
        }

        // ── Impact ripple ─────────────────────────────────────────────────
        f.impactRippleAge  = std::min(1.f, impactRippleAge_ + dt / 0.5f);
        f.lastImpactPoint  = lastImpactPoint_;
        f.impactMagnitude  = lastImpactMag_ * (1.f - f.impactRippleAge);
        impactRippleAge_   = f.impactRippleAge;

        // ── Bone hints ────────────────────────────────────────────────────
        addHeadAlertHint(f, body, intents);
        addWingFoldHint(f, body, motorState);
        addTailStabiliserHint(f, body, vel);

        return f;
    }

    // Call from physics/combat system when an impact registers
    void notifyImpact(const Vec3& worldPos, float magnitude) {
        lastImpactPoint_ = worldPos;
        lastImpactMag_   = magnitude;
        impactRippleAge_ = 0.f;
    }

private:
    // ── Damage helpers ────────────────────────────────────────────────────
    float averageNodeDamage(const MorphologyGraph& body) const {
        float sum = 0.f; int n = 0;
        for (const auto& node : body.nodes()) {
            sum += 1.f - node.structuralHP;
            ++n;
        }
        return (n > 0) ? sum / n : 0.f;
    }

    // Matches nodes whose label contains the prefix (e.g. "wing_l")
    float nodeGroupDamage(const MorphologyGraph& body, const std::string& prefix) const {
        float sum = 0.f; int n = 0;
        for (const auto& node : body.nodes()) {
            if (node.label.rfind(prefix, 0) == 0) {
                sum += 1.f - node.structuralHP;
                ++n;
            }
        }
        return (n > 0) ? sum / n : 0.f;
    }

    // ── Bone hint generators ──────────────────────────────────────────────
    void addHeadAlertHint(ExpressionFrame& f, const MorphologyGraph& body,
                           const IntentStack& intents)
    {
        // Raise/lower head based on alertness
        float pitch = intents.has(IntentType::Strike) ? -0.4f
                    : intents.has(IntentType::Rest)   ?  0.3f
                    : 0.f;
        if (std::abs(pitch) < 0.01f) return;
        BoneHint h;
        h.boneName = "head";
        h.rotation = Quat::fromAxisAngle(Vec3(1,0,0), pitch);
        h.weight   = 0.6f;
        h.additive = true;
        f.addBoneHint(h);
    }

    void addWingFoldHint(ExpressionFrame& f, const MorphologyGraph& body,
                          const MotorState& state)
    {
        // Fold wings based on damage and flight state
        if (f.wingDamageL > 0.3f) {
            BoneHint h;
            h.boneName = "wing_l_root";
            h.rotation = Quat::fromAxisAngle(Vec3(0,0,1), f.wingDamageL * 0.8f);
            h.weight   = f.wingDamageL;
            h.additive = false;
            f.addBoneHint(h);
        }
        if (f.wingDamageR > 0.3f) {
            BoneHint h;
            h.boneName = "wing_r_root";
            h.rotation = Quat::fromAxisAngle(Vec3(0,0,-1), f.wingDamageR * 0.8f);
            h.weight   = f.wingDamageR;
            h.additive = false;
            f.addBoneHint(h);
        }
    }

    void addTailStabiliserHint(ExpressionFrame& f, const MorphologyGraph& body,
                                const Vec3& velocity)
    {
        // Counter-rotate tail against angular change — HEURISTIC visual stabiliser
        float lateralSpeed = std::sqrt(velocity.x*velocity.x + velocity.z*velocity.z);
        if (lateralSpeed < 0.5f) return;
        float yaw = std::atan2(velocity.x, velocity.z);
        BoneHint h;
        h.boneName = "tail_root";
        h.rotation = Quat::fromAxisAngle(Vec3::up(), -yaw * 0.3f);
        h.weight   = std::min(lateralSpeed / 5.f, 0.8f);
        h.additive = true;
        f.addBoneHint(h);
    }

    float breathPhase_       = 0.f;
    Vec3  lastImpactPoint_   = Vec3::zero();
    float lastImpactMag_     = 0.f;
    float impactRippleAge_   = 1.f;
};

} // namespace Animation
} // namespace EFE
