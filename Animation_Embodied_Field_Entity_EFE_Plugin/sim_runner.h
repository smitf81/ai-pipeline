#pragma once
// =============================================================================
// sim_runner.h - Minimal fixed-step harness for local EFE preview/testing
//
// PURPOSE:
//   Provides a tiny deterministic stepping wrapper around EmbodiedEntity::tick().
//   It owns timestep policy and stability checks only; biology/physics truth stays
//   in the entity, motor, muscle, morphology, and field systems.
// =============================================================================

#if __has_include("../entity/embodied_entity.h")
#include "../entity/embodied_entity.h"
#else
#include "embodied_entity.h"
#endif
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace EFE {
namespace Runtime {

struct SimRunnerConfig {
    float fixedDt = 1.f / 60.f;
    uint32_t maxSubsteps = 4;
    float maxNodeSpeed = 80.f;
};

struct SimRunnerStats {
    uint32_t stepsRun = 0;
    uint32_t droppedSteps = 0;
    uint32_t clampedNodes = 0;
    uint32_t nonFiniteNodes = 0;
    bool failSafeTriggered = false;
    float accumulator = 0.f;
};

class FixedStepSimRunner {
public:
    explicit FixedStepSimRunner(SimRunnerConfig config = {})
        : cfg_(config) {}

    const SimRunnerStats& lastStats() const { return lastStats_; }

    void advance(Entity::EmbodiedEntity& entity, Fields::FieldRegistry& fields, float frameDt)
    {
        lastStats_ = SimRunnerStats{};
        accumulator_ += std::max(0.f, frameDt);

        uint32_t steps = 0;
        while (accumulator_ + 1e-6f >= cfg_.fixedDt && steps < cfg_.maxSubsteps) {
            entity.tick(fields, cfg_.fixedDt);
            fields.tick(cfg_.fixedDt);
            sanitizeBody(entity.body());
            accumulator_ -= cfg_.fixedDt;
            ++steps;
        }

        if (accumulator_ >= cfg_.fixedDt) {
            lastStats_.droppedSteps = static_cast<uint32_t>(accumulator_ / cfg_.fixedDt);
            accumulator_ = std::fmod(accumulator_, cfg_.fixedDt);
            lastStats_.failSafeTriggered = true;
        }

        lastStats_.stepsRun = steps;
        lastStats_.accumulator = accumulator_;
    }

private:
    static bool finiteVec(const Vec3& v)
    {
        return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z);
    }

    void sanitizeBody(Entity::MorphologyGraph& body)
    {
        for (auto& node : body.nodes()) {
            if (!finiteVec(node.worldPos) || !finiteVec(node.velocity)) {
                node.velocity = Vec3::zero();
                if (!finiteVec(node.worldPos)) node.worldPos = node.localRestPos;
                ++lastStats_.nonFiniteNodes;
                lastStats_.failSafeTriggered = true;
                continue;
            }

            float speed = node.velocity.length();
            if (speed > cfg_.maxNodeSpeed) {
                node.velocity = node.velocity.normalized() * cfg_.maxNodeSpeed;
                ++lastStats_.clampedNodes;
                lastStats_.failSafeTriggered = true;
            }
        }
    }

    SimRunnerConfig cfg_;
    SimRunnerStats lastStats_;
    float accumulator_ = 0.f;
};

} // namespace Runtime
} // namespace EFE
