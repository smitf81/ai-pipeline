#pragma once
// =============================================================================
// render_frame.h - Read-only skin/debug packet for native EFE creatures
//
// PURPOSE:
//   Converts native simulation state into a stable renderer-facing snapshot.
//   This is not a second simulation. It only packages MorphologyGraph,
//   MotorState, MuscleGraph, and ExpressionFrame values for preview/skin code.
// =============================================================================

#if __has_include("../entity/embodied_entity.h")
#include "../entity/embodied_entity.h"
#else
#include "embodied_entity.h"
#endif
#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

namespace EFE {
namespace Render {

struct RenderNode {
    NodeID id = kInvalidNode;
    std::string label;
    Vec3 worldPos;
    Vec3 velocity;
    float mass = 0.f;
    float structuralHP = 0.f;
    uint8_t damageState = 0;
};

struct RenderConstraint {
    EdgeID id = 0;
    NodeID nodeA = kInvalidNode;
    NodeID nodeB = kInvalidNode;
    float structuralHP = 0.f;
    bool isMembrane = false;
    bool isSpinal = false;
};

struct RenderMuscle {
    uint32_t id = 0;
    std::string label;
    NodeID originNode = kInvalidNode;
    NodeID insertionNode = kInvalidNode;
    float activation = 0.f;
    float force = 0.f;
    float tendonForce = 0.f;
    float fatigue = 0.f;
    float health = 0.f;
};

struct RenderWingPanel {
    uint32_t index = 0;
    bool left = false;
    NodeID rootNode = kInvalidNode;
    NodeID tipNode = kInvalidNode;
    Vec3 inner;
    Vec3 outer;
    Vec3 leading;
    Vec3 trailing;
    Vec3 centre;
    float liftShare = 0.f;
    float stall = 0.f;
};

struct CreatureRenderFrame {
    EntityID entityId = kInvalidEntity;
    std::string debugName;

    std::vector<RenderNode> nodes;
    std::vector<RenderConstraint> constraints;
    std::vector<RenderMuscle> muscles;
    std::vector<RenderWingPanel> wingPanels;

    Vec3 centreOfMass = Vec3::zero();
    Vec3 centreVelocity = Vec3::zero();
    Vec3 aeroCentreOfLift = Vec3::zero();
    Vec3 aeroLiftVector = Vec3::zero();
    Vec3 aeroDragVector = Vec3::zero();

    float speed = 0.f;
    float inAir = 0.f;
    float takeOffReadiness = 0.f;
    float launchLiftReserve = 0.f;
    float aeroLiftTotal = 0.f;
    float aeroDragTotal = 0.f;
    float aeroLiftReserve = 0.f;
    float aeroStallL = 0.f;
    float aeroStallR = 0.f;
    float muscleForceTotal = 0.f;
    float muscleTensionL = 0.f;
    float muscleTensionR = 0.f;
    float fatigue = 0.f;
    uint8_t takeOffPhase = 0;
    uint8_t takeOffFailureReason = 0;
};

class RenderFrameBuilder {
public:
    CreatureRenderFrame build(const Entity::EmbodiedEntity& entity) const {
        CreatureRenderFrame frame;
        frame.entityId = entity.id();
        frame.debugName = entity.debugName();

        const Entity::MorphologyGraph& body = entity.body();
        const Solver::MotorState& motor = entity.motorState();
        const Animation::ExpressionFrame& expr = entity.lastExpression();

        frame.centreOfMass = body.centreOfMass();
        frame.centreVelocity = body.centreVelocity();
        frame.aeroCentreOfLift = motor.aeroCentreOfLift;
        frame.aeroLiftVector = motor.aeroLiftVector;
        frame.aeroDragVector = motor.aeroDragVector;
        frame.speed = expr.speed;
        frame.inAir = expr.inAir;
        frame.takeOffReadiness = motor.takeOffReadiness;
        frame.launchLiftReserve = motor.launchLiftReserve;
        frame.aeroLiftTotal = motor.aeroLiftTotal;
        frame.aeroDragTotal = motor.aeroDragTotal;
        frame.aeroLiftReserve = motor.aeroLiftReserve;
        frame.aeroStallL = motor.aeroStallL;
        frame.aeroStallR = motor.aeroStallR;
        frame.muscleForceTotal = motor.muscleForceTotal;
        frame.muscleTensionL = motor.muscleTensionL;
        frame.muscleTensionR = motor.muscleTensionR;
        frame.fatigue = motor.fatigue;
        frame.takeOffPhase = static_cast<uint8_t>(motor.takeOffPhase);
        frame.takeOffFailureReason = static_cast<uint8_t>(motor.takeOffFailureReason);

        for (const auto& node : body.nodes()) {
            RenderNode out;
            out.id = node.id;
            out.label = node.label;
            out.worldPos = node.worldPos;
            out.velocity = node.velocity;
            out.mass = node.mass;
            out.structuralHP = node.structuralHP;
            out.damageState = static_cast<uint8_t>(node.damageState);
            frame.nodes.push_back(std::move(out));
        }

        for (const auto& constraint : body.constraints()) {
            RenderConstraint out;
            out.id = constraint.id;
            out.nodeA = constraint.nodeA;
            out.nodeB = constraint.nodeB;
            out.structuralHP = constraint.structuralHP;
            out.isMembrane = constraint.isMembrane;
            out.isSpinal = constraint.isSpinal;
            frame.constraints.push_back(out);
        }

        for (const auto& muscle : entity.muscles().muscles()) {
            RenderMuscle out;
            out.id = muscle.id;
            out.label = muscle.label;
            out.originNode = muscle.originNode;
            out.insertionNode = muscle.insertionNode;
            out.activation = muscle.activation;
            out.force = muscle.force;
            out.tendonForce = muscle.tendonForce;
            out.fatigue = muscle.fatigue;
            out.health = muscle.health;
            frame.muscles.push_back(std::move(out));
        }

        appendWingPanels(entity, frame, true);
        appendWingPanels(entity, frame, false);
        return frame;
    }

private:
    void appendWingPanels(
        const Entity::EmbodiedEntity& entity,
        CreatureRenderFrame& frame,
        bool left) const
    {
        const auto& body = entity.body();
        const auto& cfg = entity.solver().config();
        const Solver::MotorState& motor = entity.motorState();
        NodeID tipId = left ? cfg.wingLTipNode : cfg.wingRTipNode;
        const Entity::MorphNode* root = body.node(cfg.rootNode);
        const Entity::MorphNode* tip = body.node(tipId);
        if (!root || !tip) return;

        uint32_t panelCount = std::clamp(cfg.wingPanelsPerSide, 1u, 12u);
        float sideLift = left ? motor.wingLoadL : motor.wingLoadR;
        float sideStall = left ? motor.aeroStallL : motor.aeroStallR;
        Vec3 span = tip->worldPos - root->worldPos;
        Vec3 chord = Vec3(0.f, 0.f, 0.55f);

        for (uint32_t i = 0; i < panelCount; ++i) {
            float t0 = static_cast<float>(i) / static_cast<float>(panelCount);
            float t1 = static_cast<float>(i + 1u) / static_cast<float>(panelCount);
            Vec3 inner = root->worldPos + span * t0;
            Vec3 outer = root->worldPos + span * t1;
            Vec3 centre = (inner + outer) * 0.5f;

            RenderWingPanel panel;
            panel.index = i;
            panel.left = left;
            panel.rootNode = cfg.rootNode;
            panel.tipNode = tipId;
            panel.inner = inner;
            panel.outer = outer;
            panel.leading = centre + chord;
            panel.trailing = centre - chord;
            panel.centre = centre;
            panel.liftShare = sideLift / static_cast<float>(panelCount);
            panel.stall = sideStall;
            frame.wingPanels.push_back(panel);
        }
    }
};

} // namespace Render
} // namespace EFE
