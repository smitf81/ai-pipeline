#pragma once
// =============================================================================
// entity/embodied_entity.h — Top-level entity component
//
// PURPOSE:
//   Owns and wires together all subsystems:
//     MorphologyGraph → IntentStack → MotorSolver → SurfaceExpression
//   One EmbodiedEntity corresponds to one ACE/Axiom entity.
//
// INTEGRATION NOTES:
//   - EmbodiedEntity is designed as a component (composition, not inheritance).
//     Attach to your ECS entity via handle or component array.
//   - tick() is the single update entry point. Call from your entity manager.
//   - LOD is set externally (e.g., by your culling system) via setLOD().
//   - FieldRegistry is shared across all entities and the world; pass by ptr.
//   - lastExpression() returns the previous frame's ExpressionFrame read-only.
//     Consume this in your rendering / animation system each frame AFTER tick().
//   - THREAD SAFETY: Not thread-safe. Batch entity ticks or guard externally.
// =============================================================================

#if __has_include("../types.h")
#include "../types.h"
#else
#include "types.h"
#endif
#if __has_include("../fields/spatial_field.h")
#include "../fields/spatial_field.h"
#else
#include "spatial_field.h"
#endif
#include "morphology.h"
#include "intent.h"
#if __has_include("../entity/musculotendon.h")
#include "../entity/musculotendon.h"
#else
#include "musculotendon.h"
#endif
#if __has_include("../solver/motor_solver.h")
#include "../solver/motor_solver.h"
#else
#include "motor_solver.h"
#endif
#if __has_include("../animation/surface_expression.h")
#include "../animation/surface_expression.h"
#else
#include "surface_expression.h"
#endif
#include <algorithm>
#include <memory>
#include <string>

namespace EFE {
namespace Entity {

using Fields::FieldRegistry;
using Solver::MotorSolver;
using Solver::MotorConfig;
using Solver::MotorState;
using MuscleGraph = Entity::MuscleGraph;
using MuscleSolver = Entity::MuscleSolver;
using MuscleSolveStats = Entity::MuscleSolveStats;
using Animation::SurfaceExpression;
using Animation::ExpressionFrame;

class EmbodiedEntity {
public:
    // ── Construction ──────────────────────────────────────────────────────
    EmbodiedEntity(EntityID id, std::string debugName, MotorConfig motorCfg)
        : id_(id)
        , debugName_(std::move(debugName))
        , solver_(motorCfg)
    {}

    // ── LOD control ───────────────────────────────────────────────────────
    void setLOD(SimLOD lod) {
        lod_ = lod;
        for (auto& n : body_.nodes()) n.lod = lod;
    }

    // ── Main tick ─────────────────────────────────────────────────────────
    // Call once per simulation step.
    void tick(FieldRegistry& fields, float dt) {
        switch (lod_) {
            case SimLOD::Culled:   return;
            case SimLOD::Abstract: tickAbstract(fields, dt); return;
            case SimLOD::Reduced:  tickReduced(fields, dt);  return;
            case SimLOD::Full:     tickFull(fields, dt);     return;
        }
    }

    // ── Read-only access for renderer / AI ────────────────────────────────
    const ExpressionFrame& lastExpression() const { return lastExpression_; }
    const MotorState&      motorState()     const { return motorState_; }
    const IntentStack&     intents()        const { return intents_; }
    MorphologyGraph&       body()                 { return body_; }
    const MorphologyGraph& body()           const { return body_; }
    MuscleGraph&           muscles()              { return muscles_; }
    const MuscleGraph&     muscles()        const { return muscles_; }
    IntentStack&           intents()              { return intents_; }
    MotorSolver&           solver()               { return solver_; }
    const MotorSolver&     solver()         const { return solver_; }
    EntityID               id()             const { return id_; }
    const std::string&     debugName()      const { return debugName_; }
    SimLOD                 lod()            const { return lod_; }

    // ── Combat notification ───────────────────────────────────────────────
    void onIncomingForce(const Vec3& force) {
        solver_.notifyIncomingForce(force, motorState_);
    }

    void onImpact(const Vec3& worldPos, float magnitude) {
        body_.applyDamage(worldPos, magnitude * 0.1f, 1.5f);
        expression_.notifyImpact(worldPos, magnitude);
    }

private:
    void tickFull(FieldRegistry& fields, float dt) {
        // 1. Motor solver: intent + fields + body → forces
        solver_.solve(body_, intents_, fields, motorState_, dt);

        // 2. Muscle actuation: motor activations -> pull-only body forces
        solveMuscles(dt);

        // 3. Constraint resolution: integrate + satisfy
        body_.resolve(dt);

        // 4. Surface expression: visible residue
        lastExpression_ = expression_.evaluate(body_, intents_, motorState_, fields, dt);
    }

    void tickReduced(FieldRegistry& fields, float dt) {
        // Skip expression layer for distant entities
        solver_.solve(body_, intents_, fields, motorState_, dt);
        solveMuscles(dt);
        body_.resolve(dt);
        // lastExpression_ retains previous frame values (acceptable at distance)
    }

    void tickAbstract(FieldRegistry& fields, float dt) {
        // Field agent only: sample and emit fields, update position grossly.
        // No constraint graph, no expression.
        Vec3  com = body_.centreOfMass();

        // Abstract movement toward dominant intent target
        const Intent& dom = intents_.dominant();
        if (dom.type != IntentType::Idle) {
            Vec3 toTarget = dom.mods.targetWorldPos - com;
            float dist    = toTarget.length();
            if (dist > 0.1f) {
                // Move root node directly — no physics, just position update
                MorphNode* root = body_.node(0);
                if (root) {
                    Vec3 delta = toTarget.normalized() * std::min(dist, 5.f * dt);
                    for (auto& n : body_.nodes())
                        n.worldPos = n.worldPos + delta;
                }
            }
        }

        // Still emit fields so ecosystem simulation remains coherent
        // (see MotorSolver::emitToFields documentation for full implementation)
    }

    void solveMuscles(float dt) {
        MuscleSolveStats stats = muscleSolver_.solve(
            body_, muscles_, motorState_.muscleActivations, dt);
        motorState_.activeMuscleCount = stats.activeCount;
        motorState_.muscleForceTotal = stats.totalForce;
        motorState_.muscleActivationMax = std::max(
            motorState_.muscleActivationMax, stats.maxActivation);
        motorState_.muscleFatigueAverage = stats.averageFatigue;
        motorState_.muscleTensionL = stats.leftTension;
        motorState_.muscleTensionR = stats.rightTension;
    }

    EntityID         id_;
    std::string      debugName_;
    SimLOD           lod_        = SimLOD::Full;

    MorphologyGraph  body_;
    MuscleGraph      muscles_;
    MuscleSolver     muscleSolver_;
    IntentStack      intents_;
    MotorSolver      solver_;
    MotorState       motorState_;
    SurfaceExpression expression_;
    ExpressionFrame  lastExpression_;
};

} // namespace Entity
} // namespace EFE
