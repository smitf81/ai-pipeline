#pragma once
// =============================================================================
// entity/morphology.h — Adaptive biomechanical constraint graph
//
// PURPOSE:
//   Replaces "skeleton + animation rig" with a physics-first body description.
//   Nodes are mass points. Edges are constraints (tension, compression, torque).
//   Damage alters the graph — this IS gameplay, not visual-only.
//
// INTEGRATION NOTES:
//   - This is data only. No physics solver is embedded here.
//     Your physics engine (PhysX, Chaos, Jolt, custom) drives node positions.
//     Feed world-space node transforms back via setNodeTransform().
//   - HEURISTIC: ConstraintSolver::resolve() is a simplified spring/Verlet pass.
//     Replace with your engine's constraint solver by setting
//     MorphologyGraph::externalSolverCallback before calling resolve().
//   - Designed for ECS: MorphologyGraph is a component, not a base class.
//     Attach to your entity via handle or component array.
// =============================================================================

#if __has_include("../types.h")
#include "../types.h"
#else
#include "types.h"
#endif
#include <vector>
#include <array>
#include <string>
#include <functional>
#include <algorithm>
#include <cassert>

namespace EFE {
namespace Entity {

// ── Damage state ──────────────────────────────────────────────────────────
enum class DamageState : uint8_t {
    Intact    = 0,
    Stressed  = 1,  // Reduced load capacity; behaviour changes
    Damaged   = 2,  // Significant function loss
    Severed   = 3,  // Edge removed from solve; may become separate body
};

// ── Morphological node (mass point) ───────────────────────────────────────
struct MorphNode {
    NodeID      id;
    std::string label;          // e.g. "spine_3", "wing_l_tip"

    // Physics properties
    float       mass          = 1.0f;  // kg
    float       elasticity    = 0.5f;  // 0=rigid, 1=fully elastic
    Vec3        localRestPos;          // rest-pose position in body-local space
    Quat        localRestRot;          // rest-pose orientation

    // Runtime (written by physics/solver each frame)
    Vec3        worldPos;
    Quat        worldRot;
    Vec3        velocity;

    // Damage
    DamageState damageState   = DamageState::Intact;
    float       structuralHP  = 1.0f;  // 0–1; drives damageState transitions

    // Attachment metadata
    std::vector<NodeID> attachmentPoints; // child nodes that can be detached

    // Simulation LOD — inherited from owning entity, stored here for convenience
    SimLOD      lod = SimLOD::Full;
};

// ── Constraint edge ───────────────────────────────────────────────────────
struct MorphConstraint {
    EdgeID      id;
    NodeID      nodeA;
    NodeID      nodeB;

    // Mechanical properties
    float       restLength      = 1.0f;  // metres at rest
    float       tension         = 1.0f;  // resistance to stretch (stiffness)
    float       compression     = 1.0f;  // resistance to compression
    float       flexibility     = 0.5f;  // angular range multiplier (0=rigid)
    float       torqueLimit     = 10.0f; // N·m before stress damage accrues

    DamageState damageState     = DamageState::Intact;
    float       structuralHP    = 1.0f;

    // Category tags (for solver filtering)
    bool        isSpinal        = false;
    bool        isMembrane      = false; // wing, fin, web
    bool        isMuscle        = false;
};

// ── External solver callback ───────────────────────────────────────────────
// Signature: (graph, nodeA, nodeB, constraint, dt) → corrective impulse pair
// Return {Vec3::zero(), Vec3::zero()} to let built-in solver handle it.
struct ConstraintImpulsePair {
    Vec3 impulseA;
    Vec3 impulseB;
};
class MorphologyGraph;
using ExternalConstraintSolver =
    std::function<ConstraintImpulsePair(
        MorphologyGraph&,
        MorphNode&, MorphNode&,
        MorphConstraint&, float dt)>;

// ── Morphology graph ──────────────────────────────────────────────────────
class MorphologyGraph {
public:
    // Hook: set before calling resolve() to delegate to engine physics.
    ExternalConstraintSolver externalSolverCallback;

    // ── Construction ──────────────────────────────────────────────────────
    NodeID addNode(MorphNode node) {
        node.id = static_cast<NodeID>(nodes_.size());
        nodes_.push_back(std::move(node));
        return nodes_.back().id;
    }

    EdgeID addConstraint(MorphConstraint c) {
        c.id = static_cast<EdgeID>(constraints_.size());
        constraints_.push_back(c);
        return constraints_.back().id;
    }

    // ── Runtime access ────────────────────────────────────────────────────
    MorphNode*       node(NodeID id) {
        return (id < nodes_.size()) ? &nodes_[id] : nullptr;
    }
    const MorphNode* node(NodeID id) const {
        return (id < nodes_.size()) ? &nodes_[id] : nullptr;
    }

    MorphConstraint*       constraint(EdgeID id) {
        return (id < constraints_.size()) ? &constraints_[id] : nullptr;
    }

    std::vector<MorphNode>&       nodes()       { return nodes_; }
    const std::vector<MorphNode>& nodes() const { return nodes_; }
    std::vector<MorphConstraint>&       constraints()       { return constraints_; }
    const std::vector<MorphConstraint>& constraints() const { return constraints_; }

    // Find node nearest to a world point (used for force application targeting)
    NodeID nearestNodeTo(const Vec3& worldPos) const {
        NodeID best = kInvalidNode;
        float  bestD2 = FLT_MAX;
        for (const auto& n : nodes_) {
            if (n.damageState == DamageState::Severed) continue;
            Vec3  d = n.worldPos - worldPos;
            float d2 = d.lengthSq();
            if (d2 < bestD2) { bestD2 = d2; best = n.id; }
        }
        return best;
    }

    // ── Force application ─────────────────────────────────────────────────
    // Accumulates forces; drains on resolve().
    void applyForce(const ForceApplication& fa) {
        NodeID target = (fa.targetNode != kInvalidNode)
            ? fa.targetNode
            : nearestNodeTo(fa.worldPoint);
        if (target == kInvalidNode) return;

        pendingForces_.push_back({target, fa.impulse, fa.isImpulse});
    }

    // ── Constraint resolution (built-in approximate Verlet pass) ──────────
    // HEURISTIC: This is a simplified position-based dynamics pass, NOT a
    // full rigid-body solver. It will drift under high forces. Replace by
    // setting externalSolverCallback to delegate to PhysX/Chaos/Jolt.
    void resolve(float dt) {
        // 1. Apply pending forces as velocity changes
        for (auto& [nid, force, isImpulse] : pendingForces_) {
            MorphNode* n = node(nid);
            if (!n || n->damageState == DamageState::Severed) continue;
            float scale = isImpulse ? 1.0f : dt;
            n->velocity  = n->velocity + force * (scale / std::max(n->mass, 0.001f));
        }
        pendingForces_.clear();

        // 2. Integrate positions
        for (auto& n : nodes_) {
            if (n.damageState == DamageState::Severed) continue;
            if (n.lod == SimLOD::Culled) continue;
            n.worldPos = n.worldPos + n.velocity * dt;
        }

        // 3. Satisfy constraints (iterate for stability)
        constexpr int kIterations = 4;
        for (int iter = 0; iter < kIterations; ++iter) {
            for (auto& c : constraints_) {
                if (c.damageState == DamageState::Severed) continue;
                MorphNode* a = node(c.nodeA);
                MorphNode* b = node(c.nodeB);
                if (!a || !b) continue;

                if (externalSolverCallback) {
                    auto [ia, ib] = externalSolverCallback(*this, *a, *b, c, dt);
                    a->velocity = a->velocity + ia * (1.f / std::max(a->mass, 0.001f));
                    b->velocity = b->velocity + ib * (1.f / std::max(b->mass, 0.001f));
                } else {
                    resolveConstraintBuiltin(*a, *b, c, dt);
                }
            }
        }

        // 4. Check structural damage from over-stressed constraints
        updateDamage(dt);
    }

    // ── Damage application ────────────────────────────────────────────────
    // Apply a damage event at a world position with a given force magnitude.
    void applyDamage(const Vec3& worldPos, float magnitude, float radius) {
        for (auto& n : nodes_) {
            Vec3  d  = n.worldPos - worldPos;
            float d2 = d.lengthSq();
            float r2 = radius * radius;
            if (d2 > r2) continue;
            float falloff = 1.f - (d2 / r2);
            n.structuralHP = std::max(0.f, n.structuralHP - magnitude * falloff);
            refreshDamageState(n);
        }
        for (auto& c : constraints_) {
            MorphNode* a = node(c.nodeA);
            MorphNode* b = node(c.nodeB);
            if (!a || !b) continue;
            Vec3  mid   = (a->worldPos + b->worldPos) * 0.5f;
            Vec3  d     = mid - worldPos;
            float d2    = d.lengthSq();
            float r2    = radius * radius;
            if (d2 > r2) continue;
            float falloff = 1.f - (d2 / r2);
            c.structuralHP = std::max(0.f, c.structuralHP - magnitude * falloff);
            refreshDamageState(c);
        }
    }

    // Centre of mass (world space)
    Vec3 centreOfMass() const {
        Vec3  com;
        float totalMass = 0.f;
        for (const auto& n : nodes_) {
            if (n.damageState == DamageState::Severed) continue;
            com = com + n.worldPos * n.mass;
            totalMass += n.mass;
        }
        return (totalMass > 0.f) ? com / totalMass : Vec3::zero();
    }

    // Aggregate velocity (mass-weighted)
    Vec3 centreVelocity() const {
        Vec3  cv;
        float totalMass = 0.f;
        for (const auto& n : nodes_) {
            if (n.damageState == DamageState::Severed) continue;
            cv = cv + n.velocity * n.mass;
            totalMass += n.mass;
        }
        return (totalMass > 0.f) ? cv / totalMass : Vec3::zero();
    }

private:
    struct PendingForce { NodeID node; Vec3 force; bool isImpulse; };

    void resolveConstraintBuiltin(MorphNode& a, MorphNode& b,
                                   MorphConstraint& c, float dt)
    {
        Vec3  delta  = b.worldPos - a.worldPos;
        float dist   = delta.length();
        if (dist < 1e-6f) return;

        float error  = dist - c.restLength;
        // Directional stiffness
        float stiff  = (error > 0.f) ? c.tension : c.compression;
        stiff *= (1.f - 0.5f * c.flexibility); // flexibility reduces correction

        float correction = error * stiff * dt;
        Vec3  dir    = delta / dist;
        float totalM = a.mass + b.mass;
        float wa     = b.mass / totalM;
        float wb     = a.mass / totalM;

        a.worldPos = a.worldPos + dir * ( correction * wa);
        b.worldPos = b.worldPos + dir * (-correction * wb);
    }

    void refreshDamageState(MorphNode& n) {
        if      (n.structuralHP <= 0.f)   n.damageState = DamageState::Severed;
        else if (n.structuralHP <= 0.25f) n.damageState = DamageState::Damaged;
        else if (n.structuralHP <= 0.60f) n.damageState = DamageState::Stressed;
        else                              n.damageState = DamageState::Intact;
    }

    void refreshDamageState(MorphConstraint& c) {
        if      (c.structuralHP <= 0.f)   c.damageState = DamageState::Severed;
        else if (c.structuralHP <= 0.25f) c.damageState = DamageState::Damaged;
        else if (c.structuralHP <= 0.60f) c.damageState = DamageState::Stressed;
        else                              c.damageState = DamageState::Intact;
    }

    void updateDamage(float dt) {
        // Accumulate stress on over-stretched constraints
        for (auto& c : constraints_) {
            if (c.damageState == DamageState::Severed) continue;
            MorphNode* a = node(c.nodeA);
            MorphNode* b = node(c.nodeB);
            if (!a || !b) continue;
            float dist  = (b->worldPos - a->worldPos).length();
            float strain = std::abs(dist - c.restLength) / std::max(c.restLength, 0.001f);
            if (strain > 0.3f) { // 30% stretch starts causing damage
                float damage = (strain - 0.3f) * dt * 0.1f;
                c.structuralHP = std::max(0.f, c.structuralHP - damage);
                refreshDamageState(c);
            }
        }
    }

    std::vector<MorphNode>       nodes_;
    std::vector<MorphConstraint> constraints_;
    std::vector<PendingForce>    pendingForces_;
};

} // namespace Entity
} // namespace EFE
