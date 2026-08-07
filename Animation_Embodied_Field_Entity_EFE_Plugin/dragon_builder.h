#pragma once
// =============================================================================
// debug/dragon_builder.h — Example entity builder: Dragon
//
// PURPOSE:
//   Demonstrates how to construct an EmbodiedEntity for a large flying creature.
//   This is a REFERENCE IMPLEMENTATION — not a finished product.
//   Copy and modify for your own creature archetypes.
//
// HEURISTICS in this file:
//   - Node positions are illustrative metres; match to your actual art rig.
//   - Mass values (kg) are rough approximations for a large reptile (~500kg).
//   - Constraint rest lengths derived from node positions.
//   - Motor config values need per-project tuning.
// =============================================================================

#if __has_include("../entity/embodied_entity.h")
#include "../entity/embodied_entity.h"
#else
#include "embodied_entity.h"
#endif
#include <algorithm>
#include <array>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace EFE {
namespace Debug {

using namespace Entity;
using Solver::MotorConfig;

struct DragonBuildValidation {
    size_t nodeCount = 0;
    size_t constraintCount = 0;
    size_t muscleCount = 0;
    size_t validGroundNodeCount = 0;
    bool rootNodeValid = false;
    bool headNodeValid = false;
    bool tailTipNodeValid = false;
    bool wingLTipNodeValid = false;
    bool wingRTipNodeValid = false;
    bool groundNodesValid = false;

    bool readyToTick() const {
        return nodeCount > 0 &&
               constraintCount > 0 &&
               rootNodeValid &&
               headNodeValid &&
               tailTipNodeValid &&
               wingLTipNodeValid &&
               wingRTipNodeValid &&
               groundNodesValid;
    }
};

inline DragonBuildValidation validateDragonBuild(const EmbodiedEntity& dragon)
{
    DragonBuildValidation v;
    const MorphologyGraph& body = dragon.body();
    const MotorConfig& cfg = dragon.solver().config();

    v.nodeCount = body.nodes().size();
    v.constraintCount = body.constraints().size();
    v.muscleCount = dragon.muscles().count();
    v.rootNodeValid = body.node(cfg.rootNode) != nullptr;
    v.headNodeValid = body.node(cfg.headNode) != nullptr;
    v.tailTipNodeValid = body.node(cfg.tailTipNode) != nullptr;
    v.wingLTipNodeValid = body.node(cfg.wingLTipNode) != nullptr;
    v.wingRTipNodeValid = body.node(cfg.wingRTipNode) != nullptr;

    bool allListedGroundNodesValid = true;
    for (NodeID nid : cfg.groundNodes) {
        if (nid == kInvalidNode) continue;
        if (body.node(nid)) {
            ++v.validGroundNodeCount;
        } else {
            allListedGroundNodesValid = false;
        }
    }
    v.groundNodesValid = allListedGroundNodesValid && v.validGroundNodeCount > 0;

    return v;
}

// Returns a fully-constructed dragon EmbodiedEntity ready to tick.
// Place origin at world spawn point; all node positions are relative offsets.
inline std::unique_ptr<EmbodiedEntity> buildDragon(EntityID id, Vec3 spawnPos)
{
    MotorConfig cfg;
    cfg.balanceKP        = 10.f;
    cfg.balanceKD        = 3.f;
    cfg.maxGroundForce   = 50.f;   // N — dragon is heavy
    cfg.maxAirForce      = 30.f;
    cfg.maxTailTorque    = 20.f;
    cfg.liftCoefficient  = 1.4f;
    cfg.dragCoefficient  = 0.12f;
    cfg.wingArea         = 18.f;   // m² — large wings
    cfg.strikeImpulse    = 40.f;
    cfg.fatigueDecay     = 0.01f;  // dragons tire slowly

    MorphologyGraph body;

    // ── Spine chain (6 nodes, 0–5) ────────────────────────────────────────
    // HEURISTIC: positions in local body space (metres), Y=up
    struct NodeDef { std::string label; Vec3 pos; float mass; };
    std::vector<NodeDef> spineNodes = {
        {"spine_0",   spawnPos + Vec3(0.0f, 1.2f, -1.5f), 120.f}, // pelvis
        {"spine_1",   spawnPos + Vec3(0.0f, 1.5f, -0.5f),  80.f},
        {"spine_2",   spawnPos + Vec3(0.0f, 1.8f,  0.5f),  70.f}, // mid-torso
        {"spine_3",   spawnPos + Vec3(0.0f, 1.8f,  1.5f),  60.f},
        {"spine_4",   spawnPos + Vec3(0.0f, 1.6f,  2.2f),  40.f}, // neck
        {"spine_5",   spawnPos + Vec3(0.0f, 2.0f,  3.0f),  25.f}, // head
    };

    std::vector<NodeID> spineIDs;
    for (auto& nd : spineNodes) {
        MorphNode n;
        n.label        = nd.label;
        n.worldPos     = nd.pos;
        n.localRestPos = nd.pos - spawnPos;
        n.mass         = nd.mass;
        n.elasticity   = 0.3f;
        n.structuralHP = 1.f;
        spineIDs.push_back(body.addNode(n));
    }

    // Assign anatomical role IDs before constructing the final solver.
    cfg.rootNode    = spineIDs[2];
    cfg.headNode    = spineIDs[5];

    // ── Spine constraints ─────────────────────────────────────────────────
    for (size_t i = 0; i + 1 < spineIDs.size(); ++i) {
        MorphConstraint c;
        c.nodeA       = spineIDs[i];
        c.nodeB       = spineIDs[i+1];
        Vec3 delta    = body.node(c.nodeB)->worldPos - body.node(c.nodeA)->worldPos;
        c.restLength  = delta.length();
        c.tension     = 2.0f;
        c.compression = 3.0f;
        c.flexibility = 0.4f;
        c.torqueLimit = 15.f;
        c.isSpinal    = true;
        c.structuralHP = 1.f;
        body.addConstraint(c);
    }

    // ── Tail chain (5 nodes appended behind pelvis) ────────────────────────
    std::vector<NodeID> tailIDs;
    tailIDs.push_back(spineIDs[0]); // connect to pelvis
    std::vector<NodeDef> tailNodes = {
        {"tail_0",  spawnPos + Vec3(0.f, 1.0f, -2.5f), 15.f},
        {"tail_1",  spawnPos + Vec3(0.f, 0.8f, -3.5f), 10.f},
        {"tail_2",  spawnPos + Vec3(0.f, 0.6f, -4.5f),  7.f},
        {"tail_3",  spawnPos + Vec3(0.f, 0.5f, -5.5f),  5.f},
        {"tail_tip",spawnPos + Vec3(0.f, 0.4f, -6.5f),  3.f},
    };
    for (auto& nd : tailNodes) {
        MorphNode n;
        n.label = nd.label; n.worldPos = nd.pos;
        n.localRestPos = nd.pos - spawnPos;
        n.mass = nd.mass; n.elasticity = 0.6f; n.structuralHP = 1.f;
        NodeID nid = body.addNode(n);
        tailIDs.push_back(nid);

        MorphConstraint c;
        c.nodeA = tailIDs[tailIDs.size()-2];
        c.nodeB = nid;
        Vec3 delta = body.node(c.nodeB)->worldPos - body.node(c.nodeA)->worldPos;
        c.restLength = delta.length();
        c.tension = 1.5f; c.compression = 1.5f; c.flexibility = 0.7f;
        c.torqueLimit = 8.f; c.structuralHP = 1.f;
        body.addConstraint(c);
    }
    cfg.tailTipNode = tailIDs.back();

    // ── Left wing (root → mid → tip) ──────────────────────────────────────
    auto buildWing = [&](const std::string& side, float xSign,
                         NodeID& outTipID,
                         std::array<NodeID, 4>& outNodes) {
        NodeID rootNode = spineIDs[3]; // attach to mid-torso

        struct WingDef { std::string label; Vec3 offset; float mass; };
        std::vector<WingDef> wdefs = {
            {side+"_shoulder", Vec3(xSign*1.0f, 0.3f, 0.5f),  8.f},
            {side+"_elbow",    Vec3(xSign*3.0f, 0.5f, 0.0f),  5.f},
            {side+"_wrist",    Vec3(xSign*5.5f, 0.3f,-0.3f),  3.f},
            {side+"_tip",      Vec3(xSign*8.0f, 0.0f,-0.5f),  1.f},
        };

        NodeID prevID = rootNode;
        size_t outIndex = 0;
        for (auto& wd : wdefs) {
            MorphNode n;
            n.label = "wing_" + wd.label;
            n.worldPos = spawnPos + wd.offset + Vec3(0, 1.8f, 0.5f);
            n.localRestPos = n.worldPos - spawnPos;
            n.mass = wd.mass; n.elasticity = 0.5f; n.structuralHP = 1.f;
            NodeID nid = body.addNode(n);

            MorphConstraint c;
            c.nodeA = prevID; c.nodeB = nid;
            Vec3 delta = body.node(c.nodeB)->worldPos - body.node(c.nodeA)->worldPos;
            c.restLength = delta.length();
            c.tension = 3.f; c.compression = 2.f;
            c.flexibility = 0.5f; c.torqueLimit = 12.f;
            c.isMembrane = true; c.structuralHP = 1.f;
            body.addConstraint(c);

            outTipID = nid;
            if (outIndex < outNodes.size()) outNodes[outIndex++] = nid;
            prevID = nid;
        }
    };

    std::array<NodeID, 4> wingLNodes{};
    std::array<NodeID, 4> wingRNodes{};
    buildWing("wing_l", -1.f, cfg.wingLTipNode, wingLNodes);
    buildWing("wing_r",  1.f, cfg.wingRTipNode, wingRNodes);

    // ── Ground contact nodes (hind legs, simplified) ───────────────────────
    auto addLeg = [&](const std::string& label, Vec3 hipOffset, size_t slot,
                      NodeID& outHipID, NodeID& outFootID) {
        Vec3 hipPos = spawnPos + hipOffset;
        MorphNode hip;
        hip.label = label + "_hip"; hip.worldPos = hipPos;
        hip.localRestPos = hipOffset; hip.mass = 12.f; hip.structuralHP = 1.f;
        NodeID hipID = body.addNode(hip);
        outHipID = hipID;

        MorphConstraint hc;
        hc.nodeA = spineIDs[0]; hc.nodeB = hipID;
        hc.restLength = (hipPos - body.node(spineIDs[0])->worldPos).length();
        hc.tension = 4.f; hc.compression = 4.f; hc.flexibility = 0.4f;
        hc.torqueLimit = 20.f; hc.structuralHP = 1.f;
        body.addConstraint(hc);

        MorphNode foot;
        foot.label = label + "_foot";
        foot.worldPos = hipPos + Vec3(0, -1.2f, 0);
        foot.localRestPos = foot.worldPos - spawnPos;
        foot.mass = 4.f; foot.structuralHP = 1.f;
        NodeID footID = body.addNode(foot);
        outFootID = footID;

        MorphConstraint fc;
        fc.nodeA = hipID; fc.nodeB = footID;
        fc.restLength = 1.2f;
        fc.tension = 3.f; fc.compression = 5.f; fc.flexibility = 0.6f;
        fc.torqueLimit = 10.f; fc.structuralHP = 1.f;
        body.addConstraint(fc);

        if (slot < MotorConfig::kMaxGroundNodes)
            cfg.groundNodes[slot] = footID;
    };

    NodeID legLHip = kInvalidNode, legLFoot = kInvalidNode;
    NodeID legRHip = kInvalidNode, legRFoot = kInvalidNode;
    addLeg("leg_l_hind", Vec3(-0.8f, 0.0f, -1.0f), 0, legLHip, legLFoot);
    addLeg("leg_r_hind", Vec3( 0.8f, 0.0f, -1.0f), 1, legRHip, legRFoot);

    // ── Rebuild solver with final config ─────────────────────────────────
    // Build the final entity only after cfg contains every anatomical role ID.
    auto dragon = std::make_unique<EmbodiedEntity>(id, "Dragon", cfg);
    // (Re-create with final cfg — simplest approach for builder pattern)
    dragon->body() = std::move(body);

    auto addMuscle = [&](const std::string& label, MuscleRole role,
                         NodeID origin, NodeID insertion, float maxForce) {
        const MorphNode* a = dragon->body().node(origin);
        const MorphNode* b = dragon->body().node(insertion);
        if (!a || !b) return;

        MuscleUnit m;
        m.label = label;
        m.role = role;
        m.originNode = origin;
        m.insertionNode = insertion;
        m.optimalLength = std::max(0.05f, (b->worldPos - a->worldPos).length());
        m.length = m.optimalLength;
        m.previousLength = m.optimalLength;
        m.maxForce = maxForce;
        m.tendonSlack = m.optimalLength * 0.06f;
        m.tendonStiffness = maxForce * 7.f;
        m.widthFactor = 0.45f;
        dragon->muscles().addMuscle(m);
    };

    addMuscle("pectoralis_l", MuscleRole::WingDownstrokeL, spineIDs[2], wingLNodes[2], 1200.f);
    addMuscle("pectoralis_r", MuscleRole::WingDownstrokeR, spineIDs[2], wingRNodes[2], 1200.f);
    addMuscle("supracoracoideus_l", MuscleRole::WingUpstrokeL, spineIDs[4], wingLNodes[1], 560.f);
    addMuscle("supracoracoideus_r", MuscleRole::WingUpstrokeR, spineIDs[4], wingRNodes[1], 560.f);
    addMuscle("hind_leg_drive_l", MuscleRole::LegDriveL, spineIDs[0], legLFoot, 90.f);
    addMuscle("hind_leg_drive_r", MuscleRole::LegDriveR, spineIDs[0], legRFoot, 90.f);
    addMuscle("tail_stabiliser", MuscleRole::TailStabiliser, spineIDs[0], cfg.tailTipNode, 380.f);
    addMuscle("neck_flexor", MuscleRole::NeckFlexor, spineIDs[3], cfg.headNode, 180.f);
    addMuscle("neck_extensor", MuscleRole::NeckExtensor, spineIDs[4], cfg.headNode, 180.f);
    addMuscle("intercostal_breath", MuscleRole::Breathing, spineIDs[1], spineIDs[3], 90.f);

    // ── Initial intent ────────────────────────────────────────────────────
    Intent breathe;
    breathe.type = IntentType::Breathe;
    breathe.priority = 0.1f;
    breathe.weight   = 0.3f;
    dragon->intents().push(breathe);

    return dragon;
}

} // namespace Debug
} // namespace EFE
