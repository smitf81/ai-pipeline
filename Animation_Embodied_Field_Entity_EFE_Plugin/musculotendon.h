#pragma once
// =============================================================================
// entity/musculotendon.h - Native pull-only muscle/tendon actuator graph
//
// PURPOSE:
//   Bridges MotorSolver intent output into morphology forces through named
//   anatomical muscle roles. Muscles are simulation actuators, not animation
//   decorations: they apply forces into MorphologyGraph before constraint solve.
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
#include <algorithm>
#include <array>
#include <cmath>
#include <string>
#include <utility>
#include <vector>

namespace EFE {
namespace Entity {

enum class MuscleRole : uint8_t {
    Generic = 0,
    WingDownstrokeL,
    WingDownstrokeR,
    WingUpstrokeL,
    WingUpstrokeR,
    LegDriveL,
    LegDriveR,
    TailStabiliser,
    NeckFlexor,
    NeckExtensor,
    Breathing,
    Count,
};

inline constexpr size_t kMuscleRoleCount = static_cast<size_t>(MuscleRole::Count);

struct MuscleActivationFrame {
    std::array<float, kMuscleRoleCount> roleActivation{};

    void clear() {
        for (float& a : roleActivation) a = 0.f;
    }

    void setRole(MuscleRole role, float activation) {
        size_t idx = static_cast<size_t>(role);
        if (idx >= roleActivation.size()) return;
        roleActivation[idx] = std::max(roleActivation[idx], std::clamp(activation, 0.f, 1.f));
    }

    float getRole(MuscleRole role) const {
        size_t idx = static_cast<size_t>(role);
        return idx < roleActivation.size() ? roleActivation[idx] : 0.f;
    }

    float maxActivation() const {
        float maxValue = 0.f;
        for (float a : roleActivation) maxValue = std::max(maxValue, a);
        return maxValue;
    }
};

struct MuscleUnit {
    uint32_t    id = 0;
    std::string label;
    MuscleRole role = MuscleRole::Generic;
    NodeID     originNode = kInvalidNode;
    NodeID     insertionNode = kInvalidNode;

    float optimalLength = 1.f;
    float maxForce = 1.f;
    float tendonSlack = 0.05f;
    float tendonStiffness = 8.f;
    float widthFactor = 0.45f;

    float activation = 0.f;
    float targetActivation = 0.f;
    float length = 1.f;
    float previousLength = 1.f;
    float force = 0.f;
    float tendonForce = 0.f;
    float fatigue = 0.f;
    float health = 1.f;
};

struct MuscleSolveStats {
    uint32_t activeCount = 0;
    float totalForce = 0.f;
    float maxActivation = 0.f;
    float averageFatigue = 0.f;
    float leftTension = 0.f;
    float rightTension = 0.f;
};

class MuscleGraph {
public:
    uint32_t addMuscle(MuscleUnit muscle) {
        muscle.id = static_cast<uint32_t>(muscles_.size());
        muscles_.push_back(std::move(muscle));
        return muscles_.back().id;
    }

    std::vector<MuscleUnit>&       muscles()       { return muscles_; }
    const std::vector<MuscleUnit>& muscles() const { return muscles_; }
    size_t count() const { return muscles_.size(); }

    const MuscleSolveStats& lastStats() const { return lastStats_; }
    void setLastStats(const MuscleSolveStats& stats) { lastStats_ = stats; }

private:
    std::vector<MuscleUnit> muscles_;
    MuscleSolveStats lastStats_;
};

class MuscleSolver {
public:
    MuscleSolveStats solve(
        MorphologyGraph& body,
        MuscleGraph& muscles,
        const MuscleActivationFrame& activations,
        float dt)
    {
        MuscleSolveStats stats;
        float fatigueSum = 0.f;

        for (auto& muscle : muscles.muscles()) {
            solveMuscle(body, muscle, activations, stats, fatigueSum, dt);
        }

        if (!muscles.muscles().empty()) {
            stats.averageFatigue = fatigueSum / static_cast<float>(muscles.muscles().size());
        }
        muscles.setLastStats(stats);
        return stats;
    }

private:
    void solveMuscle(
        MorphologyGraph& body,
        MuscleUnit& muscle,
        const MuscleActivationFrame& activations,
        MuscleSolveStats& stats,
        float& fatigueSum,
        float dt)
    {
        MorphNode* origin = body.node(muscle.originNode);
        MorphNode* insertion = body.node(muscle.insertionNode);
        if (!origin || !insertion ||
            origin->damageState == DamageState::Severed ||
            insertion->damageState == DamageState::Severed) {
            muscle.force = 0.f;
            muscle.tendonForce = 0.f;
            muscle.targetActivation = 0.f;
            muscle.activation = approach(muscle.activation, 0.f, dt * 10.f);
            fatigueSum += muscle.fatigue;
            return;
        }

        muscle.targetActivation = activations.getRole(muscle.role);
        muscle.activation = approach(muscle.activation, muscle.targetActivation, dt * 12.f);

        Vec3 line = insertion->worldPos - origin->worldPos;
        float length = line.length();
        if (length < 1e-5f) {
            muscle.force = 0.f;
            muscle.tendonForce = 0.f;
            fatigueSum += muscle.fatigue;
            return;
        }

        float previousLength = muscle.length;
        float dLdt = (length - previousLength) / std::max(dt, 0.001f);
        muscle.previousLength = previousLength;
        muscle.length = length;

        float nodeHealth = std::min(origin->structuralHP, insertion->structuralHP);
        float health = std::clamp(muscle.health * nodeHealth, 0.f, 1.f);
        float fatigueScale = 1.f - std::clamp(muscle.fatigue, 0.f, 1.f);
        float activeForce = muscle.activation *
            forceLengthFactor(muscle) *
            forceVelocityFactor(dLdt, muscle.optimalLength) *
            muscle.maxForce *
            health *
            fatigueScale;

        muscle.tendonForce = passiveTendonForce(muscle);
        muscle.force = std::max(0.f, activeForce + muscle.tendonForce * health);

        if (muscle.force > 0.001f) {
            Vec3 dir = line / length;
            ForceApplication pullOrigin;
            pullOrigin.targetNode = muscle.originNode;
            pullOrigin.impulse = dir * muscle.force;
            pullOrigin.isImpulse = false;
            body.applyForce(pullOrigin);

            ForceApplication pullInsertion;
            pullInsertion.targetNode = muscle.insertionNode;
            pullInsertion.impulse = dir * (-muscle.force);
            pullInsertion.isImpulse = false;
            body.applyForce(pullInsertion);
        }

        muscle.fatigue = std::clamp(
            muscle.fatigue + muscle.activation * dt * 0.05f - (1.f - muscle.activation) * dt * 0.02f,
            0.f,
            1.f);

        if (muscle.activation > 0.01f) ++stats.activeCount;
        stats.totalForce += muscle.force;
        stats.maxActivation = std::max(stats.maxActivation, muscle.activation);
        accumulateSideTension(muscle, stats);
        fatigueSum += muscle.fatigue;
    }

    float approach(float current, float target, float amount) const {
        float t = std::clamp(amount, 0.f, 1.f);
        return current + (target - current) * t;
    }

    float forceLengthFactor(const MuscleUnit& muscle) const {
        float denom = std::max(muscle.widthFactor * muscle.optimalLength, 0.001f);
        float ratio = (muscle.length - muscle.optimalLength) / denom;
        return std::exp(-(ratio * ratio));
    }

    float forceVelocityFactor(float dLdt, float optimalLength) const {
        float vNorm = dLdt / std::max(optimalLength * 4.f, 0.001f);
        if (vNorm <= 0.f) {
            return std::clamp((1.f + vNorm) / (1.f - vNorm / 0.25f), 0.f, 1.f);
        }
        return std::min(1.5f, 1.f + 0.5f * vNorm);
    }

    float passiveTendonForce(const MuscleUnit& muscle) const {
        float slackEnd = muscle.optimalLength + muscle.tendonSlack;
        float stretch = muscle.length - slackEnd;
        if (stretch <= 0.f) return 0.f;
        float toe = std::max(muscle.tendonSlack * 0.25f, 0.001f);
        if (stretch < toe) {
            return muscle.tendonStiffness * (stretch * stretch) / (2.f * toe);
        }
        return muscle.tendonStiffness * (stretch - toe * 0.5f);
    }

    void accumulateSideTension(const MuscleUnit& muscle, MuscleSolveStats& stats) const {
        float normalised = std::clamp(muscle.force / std::max(muscle.maxForce, 0.001f), 0.f, 1.f);
        switch (muscle.role) {
            case MuscleRole::WingDownstrokeL:
            case MuscleRole::WingUpstrokeL:
            case MuscleRole::LegDriveL:
                stats.leftTension = std::max(stats.leftTension, normalised);
                break;
            case MuscleRole::WingDownstrokeR:
            case MuscleRole::WingUpstrokeR:
            case MuscleRole::LegDriveR:
                stats.rightTension = std::max(stats.rightTension, normalised);
                break;
            default:
                break;
        }
    }
};

} // namespace Entity
} // namespace EFE
