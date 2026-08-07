#pragma once
// =============================================================================
// solver/motor_solver.h — Core movement intelligence layer
//
// PURPOSE:
//   Converts intent + field readings + morphology state into force distributions.
//   This is WHERE animation emerges. It does NOT select animation clips.
//
// INTEGRATION NOTES:
//   - MotorSolver is stateless between frames EXCEPT for the locomotion state
//     carried in MotorState (pass same MotorState each tick).
//   - HEURISTIC: solve() contains hand-authored force rules for common intents.
//     For learned locomotion, replace per-intent solver methods with calls to
//     your RL/motion-matching policy. Hook points are clearly marked.
//   - HEURISTIC: Balance recovery uses a PD controller. Gains (kP, kD) are
//     tunable per-entity. Set in MotorConfig.
//   - HEURISTIC: Wing/flight modelling uses a small native panel aero model.
//     Replace panel normals/coefficients with project-specific flight tuning.
//   - For ACE integration: MotorSolver reads from FieldRegistry (const),
//     writes ForceApplication objects into MorphologyGraph, and writes
//     MotorState for the next frame. No other side effects.
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
#if __has_include("../entity/musculotendon.h")
#include "../entity/musculotendon.h"
#else
#include "musculotendon.h"
#endif
#include <functional>
#include <cmath>
#include <algorithm>
#include <array>

namespace EFE {
namespace Solver {

using Fields::FieldRegistry;
using Fields::FieldType;
using Entity::MorphologyGraph;
using Entity::MorphNode;
using Entity::IntentStack;
using Entity::IntentType;
using Entity::Intent;
using Entity::MuscleActivationFrame;
using Entity::MuscleRole;

// ── Per-entity motor configuration ───────────────────────────────────────
struct MotorConfig {
    // Balance PD controller gains
    float balanceKP         = 8.0f;   // proportional — HEURISTIC, tune per entity
    float balanceKD         = 2.0f;   // derivative

    // Locomotion
    float maxGroundForce    = 20.0f;  // N per limb contact
    float maxAirForce       = 5.0f;   // N per wing surface unit
    float maxTailTorque     = 8.0f;   // N·m

    // Flight (approximate aerodynamics — HEURISTIC)
    float liftCoefficient       = 1.2f;   // max CL approx for wing shape
    float dragCoefficient       = 0.08f;  // base CD approx
    float wingArea              = 4.0f;   // m2
    uint32_t wingPanelsPerSide  = 4;      // native panel samples per wing
    float airDensity            = 1.225f; // kg/m3 sea-level constant
    float wingBaseAngleRad      = 0.16f;  // neutral glide incidence
    float zeroLiftAngleRad      = -0.08f;
    float liftSlope             = 2.8f;   // simplified CL/rad
    float stallAngleRad         = 0.85f;
    float panelMinAirspeed      = 4.0f;   // powered-wing effective flow floor
    float poweredAoABoostRad    = 0.26f;
    float flapThrustCoefficient = 0.10f;

    // Take-off v0 (force-rule launch, before native muscles / panel aero)
    float takeOffCrouchDuration       = 0.18f;
    float takeOffLegDriveDuration     = 0.16f;
    float takeOffWingAssistDuration   = 0.22f;
    float takeOffTimeout              = 0.85f;
    float takeOffLegDriveMultiplier   = 24.0f; // scales maxGroundForce during shove
    float takeOffWingAssistMultiplier = 1.25f;
    float minTakeOffLiftReserve       = 1.0f;
    float minTakeOffClearance         = 0.8f;
    float minTakeOffVerticalVelocity  = 0.45f;

    // Combat
    float parryResponseTime = 0.12f;  // seconds — window to intercept
    float strikeImpulse     = 15.0f;  // N·s base

    // Fatigue (drains 0–1, reduces all force outputs linearly)
    float fatigueDecay      = 0.02f;  // per second recovery

    // Node roles — NodeIDs that map to anatomical roles.
    // kInvalidNode = this creature doesn't have this structure.
    NodeID rootNode         = 0;      // typically pelvis/torso
    NodeID headNode         = kInvalidNode;
    NodeID tailTipNode      = kInvalidNode;
    NodeID wingLTipNode     = kInvalidNode;
    NodeID wingRTipNode     = kInvalidNode;
    // Ground contact nodes (feet/paws/talons)
    static constexpr size_t kMaxGroundNodes = 6;
    std::array<NodeID, kMaxGroundNodes> groundNodes{
        kInvalidNode,kInvalidNode,kInvalidNode,
        kInvalidNode,kInvalidNode,kInvalidNode
    };
};

// ── Persistent motor state (carry between frames) ─────────────────────────
enum class TakeOffPhase : uint8_t {
    Grounded = 0,
    CrouchLoad,
    LegDrive,
    FirstDownstroke,
    Airborne,
    Failed,
};

enum class TakeOffFailureReason : uint8_t {
    None = 0,
    MissingGroundContact,
    InsufficientClearance,
    InsufficientLiftReserve,
    InsufficientVerticalVelocity,
};

inline const char* takeOffFailureReasonName(TakeOffFailureReason reason)
{
    switch (reason) {
        case TakeOffFailureReason::None:                         return "none";
        case TakeOffFailureReason::MissingGroundContact:         return "missing_ground_contact";
        case TakeOffFailureReason::InsufficientClearance:        return "insufficient_clearance";
        case TakeOffFailureReason::InsufficientLiftReserve:      return "insufficient_lift_reserve";
        case TakeOffFailureReason::InsufficientVerticalVelocity: return "insufficient_vertical_velocity";
        default:                                                 return "unknown";
    }
}

struct MotorState {
    // Balance
    Vec3  desiredUp        = Vec3::up();
    Vec3  currentUp        = Vec3::up();
    Vec3  balanceError;          // current tilt vector
    Vec3  balanceErrorDeriv;     // derivative for D term

    // Locomotion phase
    float gaitPhase        = 0.f; // 0–1 normalised gait cycle
    float gaitCadence      = 1.f; // cycles per second

    // Fatigue
    float fatigue          = 0.f; // 0=fresh, 1=exhausted

    // Muscle bridge output. MotorSolver writes activations; MuscleSolver
    // writes force/tension stats after applying the graph.
    MuscleActivationFrame muscleActivations;
    float muscleActivationMax = 0.f;
    float muscleForceTotal = 0.f;
    float muscleTensionL = 0.f;
    float muscleTensionR = 0.f;
    float muscleFatigueAverage = 0.f;
    uint32_t activeMuscleCount = 0;

    // Flight
    bool  inFlight         = false;
    float wingLoadL        = 0.f;
    float wingLoadR        = 0.f;
    float altitudeTarget   = 0.f;
    float aeroLiftTotal    = 0.f;
    float aeroDragTotal    = 0.f;
    float aeroThrustTotal  = 0.f;
    float aeroLiftReserve  = 0.f;
    float aeroAoAL         = 0.f;
    float aeroAoAR         = 0.f;
    float aeroStallL       = 0.f;
    float aeroStallR       = 0.f;
    float aeroPanelCount   = 0.f;
    Vec3  aeroCentreOfLift = Vec3::zero();
    Vec3  aeroLiftVector   = Vec3::zero();
    Vec3  aeroDragVector   = Vec3::zero();

    // Take-off debug/readiness state. Renderer/debug layers may read this;
    // only MotorSolver writes it.
    TakeOffPhase         takeOffPhase = TakeOffPhase::Grounded;
    TakeOffFailureReason takeOffFailureReason = TakeOffFailureReason::None;
    float takeOffTimer             = 0.f;
    float takeOffLoad              = 0.f;
    float takeOffReadiness         = 0.f;
    float launchLiftReserve        = 0.f;
    float launchClearance          = 0.f;
    float launchVerticalVelocity   = 0.f;

    // Combat
    float parryWindowTimer = 0.f;
    Vec3  lastIncomingForce;
};

// ── Force decision (output of solver) ────────────────────────────────────
// Collected per-frame and flushed into MorphologyGraph.
struct MotorDecision {
    NodeID  node;
    Vec3    force;
    bool    isImpulse = false;
};

// ── External locomotion policy hook ───────────────────────────────────────
// HEURISTIC: Replace with RL / motion-matching policy.
// Input:  intent, fields at entity position, motor state, dt
// Output: list of MotorDecision (can be empty to fall through to built-in)
using LocomotionPolicy =
    std::function<std::vector<MotorDecision>(
        const Intent&,
        const FieldRegistry&,
        const Vec3& entityPos,
        const MotorState&,
        float dt)>;

// ── Motor solver ──────────────────────────────────────────────────────────
class MotorSolver {
public:
    explicit MotorSolver(MotorConfig config)
        : cfg_(config) {}

    const MotorConfig& config() const { return cfg_; }

    // Set optional external locomotion policy (replaces built-in per-intent rules)
    void setLocomotionPolicy(LocomotionPolicy p) { locomotionPolicy_ = std::move(p); }

    // ── Main solve entry point ────────────────────────────────────────────
    // Call once per simulation tick, per entity (at appropriate LOD).
    void solve(MorphologyGraph& body, const IntentStack& intents,
               const FieldRegistry& fields, MotorState& state, float dt)
    {
        Vec3 entityPos = body.centreOfMass();

        // Read relevant fields at entity position
        auto airflow  = fields.sampleBest(FieldType::Airflow,   entityPos);
        auto pressure = fields.sampleBest(FieldType::Pressure,  entityPos);
        auto fear     = fields.sampleBest(FieldType::FearStress, entityPos);

        // Update fatigue
        state.fatigue = std::max(0.f, state.fatigue - cfg_.fatigueDecay * dt);
        float vigour  = 1.f - state.fatigue; // scale all forces
        state.muscleActivations.clear();
        state.muscleActivationMax = 0.f;
        resetAeroState(state);

        if (!intents.has(IntentType::TakeOff) &&
            state.takeOffPhase != TakeOffPhase::Airborne) {
            resetTakeOffState(state);
        }

        // Collect decisions
        std::vector<MotorDecision> decisions;

        // ── Process intents in priority order ─────────────────────────────
        for (const auto& intent : intents) {
            std::vector<MotorDecision> d;

            // Try external policy first
            if (locomotionPolicy_) {
                d = locomotionPolicy_(intent, fields, entityPos, state, dt);
            }

            // Fall through to built-in rules if policy returns nothing
            if (d.empty()) {
                d = solveIntent(intent, body, fields, state, entityPos, dt);
            }

            for (auto& dec : d) {
                dec.force = dec.force * (intent.weight * vigour);
                decisions.push_back(dec);
            }
        }

        // ── Balance correction (always active unless culled) ──────────────
        auto balanceDecisions = solveBalance(body, state, dt);
        for (auto& bd : balanceDecisions)
            decisions.push_back(bd);

        // ── Environmental reactions (field disturbances) ──────────────────
        if (airflow.value > 0.1f) {
            auto windDecisions = solveWindReaction(body, airflow, state, dt);
            for (auto& wd : windDecisions)
                decisions.push_back(wd);
        }

        // ── Emit forces into the body graph ──────────────────────────────
        for (const auto& d : decisions) {
            ForceApplication fa;
            fa.targetNode = d.node;
            fa.impulse    = d.force;
            fa.isImpulse  = d.isImpulse;
            fa.worldPoint = Vec3::zero(); // resolved by node ID
            body.applyForce(fa);
        }

        // ── Entity emits back into fields ─────────────────────────────────
        state.muscleActivationMax = state.muscleActivations.maxActivation();
        emitToFields(body, state, fields, dt);
    }

    // ── Notify solver of an incoming combat force ──────────────────────────
    // Call from combat system when a strike is about to land.
    void notifyIncomingForce(const Vec3& force, MotorState& state) {
        state.lastIncomingForce = force;
        state.parryWindowTimer  = cfg_.parryResponseTime;
    }

private:
    void activateMuscle(MotorState& state, MuscleRole role, float activation) const
    {
        state.muscleActivations.setRole(role, activation);
    }

    void resetTakeOffState(MotorState& state) const
    {
        state.takeOffPhase = TakeOffPhase::Grounded;
        state.takeOffFailureReason = TakeOffFailureReason::None;
        state.takeOffTimer = 0.f;
        state.takeOffLoad = 0.f;
        state.takeOffReadiness = 0.f;
        state.launchLiftReserve = 0.f;
        state.launchClearance = 0.f;
        state.launchVerticalVelocity = 0.f;
    }

    std::vector<MotorDecision> failTakeOff(
        MotorState& state,
        TakeOffFailureReason reason) const
    {
        state.inFlight = false;
        state.takeOffPhase = TakeOffPhase::Failed;
        state.takeOffFailureReason = reason;
        state.takeOffReadiness = 0.f;
        state.takeOffLoad = 0.f;
        return {};
    }

    int collectGroundNodes(
        const MorphologyGraph& body,
        std::array<NodeID, MotorConfig::kMaxGroundNodes>& out) const
    {
        int count = 0;
        for (NodeID nid : cfg_.groundNodes) {
            if (nid == kInvalidNode) continue;
            if (!body.node(nid)) continue;
            out[count++] = nid;
            if (count == static_cast<int>(out.size())) break;
        }
        return count;
    }

    float totalBodyMass(const MorphologyGraph& body) const
    {
        float total = 0.f;
        for (const auto& n : body.nodes()) {
            if (n.damageState == Entity::DamageState::Severed) continue;
            total += std::max(n.mass, 0.f);
        }
        return std::max(total, 1.f);
    }

    static Vec3 safeNormal(const Vec3& v, const Vec3& fallback)
    {
        return v.lengthSq() > 1e-6f ? v.normalized() : fallback;
    }

    float nodeHealth(const MorphologyGraph& body, NodeID nid) const
    {
        const MorphNode* n = body.node(nid);
        if (!n || n->damageState == Entity::DamageState::Severed) return 0.f;
        return std::clamp(n->structuralHP, 0.f, 1.f);
    }

    struct AeroResult {
        std::vector<MotorDecision> decisions;
        float liftTotal = 0.f;
        float dragTotal = 0.f;
        float thrustTotal = 0.f;
        float liftReserve = 0.f;
        float liftL = 0.f;
        float liftR = 0.f;
        float aoaL = 0.f;
        float aoaR = 0.f;
        float stallL = 0.f;
        float stallR = 0.f;
        float panelCount = 0.f;
        Vec3 centreOfLift = Vec3::zero();
        Vec3 liftVector = Vec3::zero();
        Vec3 dragVector = Vec3::zero();
        Vec3 thrustVector = Vec3::zero();
        float centreWeight = 0.f;
        float aoaCountL = 0.f;
        float aoaCountR = 0.f;
    };

    void resetAeroState(MotorState& state) const
    {
        state.wingLoadL = 0.f;
        state.wingLoadR = 0.f;
        state.aeroLiftTotal = 0.f;
        state.aeroDragTotal = 0.f;
        state.aeroThrustTotal = 0.f;
        state.aeroLiftReserve = 0.f;
        state.aeroAoAL = 0.f;
        state.aeroAoAR = 0.f;
        state.aeroStallL = 0.f;
        state.aeroStallR = 0.f;
        state.aeroPanelCount = 0.f;
        state.aeroCentreOfLift = Vec3::zero();
        state.aeroLiftVector = Vec3::zero();
        state.aeroDragVector = Vec3::zero();
    }

    void writeAeroState(MotorState& state, const AeroResult& aero) const
    {
        state.wingLoadL = aero.liftL;
        state.wingLoadR = aero.liftR;
        state.aeroLiftTotal = aero.liftTotal;
        state.aeroDragTotal = aero.dragTotal;
        state.aeroThrustTotal = aero.thrustTotal;
        state.aeroLiftReserve = aero.liftReserve;
        state.aeroAoAL = aero.aoaL;
        state.aeroAoAR = aero.aoaR;
        state.aeroStallL = aero.stallL;
        state.aeroStallR = aero.stallR;
        state.aeroPanelCount = aero.panelCount;
        state.aeroCentreOfLift = aero.centreOfLift;
        state.aeroLiftVector = aero.liftVector;
        state.aeroDragVector = aero.dragVector;
    }

    void accumulateWingAeroSide(
        const MorphologyGraph& body,
        const FieldRegistry& fields,
        const Vec3& forward,
        const MotorState& state,
        NodeID tipId,
        bool leftSide,
        float powerScale,
        bool emitForces,
        AeroResult& out) const
    {
        const MorphNode* root = body.node(cfg_.rootNode);
        const MorphNode* tip = body.node(tipId);
        if (!root || !tip) return;

        uint32_t panelCount = std::clamp(cfg_.wingPanelsPerSide, 1u, 12u);
        float areaPerPanel = cfg_.wingArea / std::max(1.f, static_cast<float>(panelCount * 2u));
        float sideHealth = std::min(nodeHealth(body, cfg_.rootNode), nodeHealth(body, tipId));
        if (sideHealth <= 0.f) {
            out.panelCount += static_cast<float>(panelCount);
            return;
        }

        MuscleRole downRole = leftSide ? MuscleRole::WingDownstrokeL : MuscleRole::WingDownstrokeR;
        MuscleRole upRole = leftSide ? MuscleRole::WingUpstrokeL : MuscleRole::WingUpstrokeR;
        float wingBeat = std::max(
            state.muscleActivations.getRole(downRole),
            state.muscleActivations.getRole(upRole) * 0.35f);
        float effectivePower = std::clamp(powerScale + wingBeat * 0.45f, 0.f, 1.75f);
        Vec3 bodyVelocity = body.centreVelocity();

        for (uint32_t i = 0; i < panelCount; ++i) {
            float t = (static_cast<float>(i) + 0.5f) / static_cast<float>(panelCount);
            Vec3 centre = Vec3::lerp(root->worldPos, tip->worldPos, t);
            auto airflow = fields.sampleBest(FieldType::Airflow, centre);
            Vec3 wind = safeNormal(airflow.direction, Vec3::zero()) * airflow.value;
            Vec3 relativeVelocity = bodyVelocity - wind;
            float rawSpeed = relativeVelocity.length();
            float poweredSpeed = cfg_.panelMinAirspeed * (1.f + effectivePower * 0.6f);
            float speed = std::max(rawSpeed, poweredSpeed);
            if (speed < 0.01f) continue;

            Vec3 incoming = rawSpeed > 0.01f
                ? relativeVelocity.normalized() * -1.f
                : forward;
            float poweredFlowBlend = std::clamp(effectivePower * 0.82f, 0.f, 0.90f);
            incoming = safeNormal(
                incoming * (1.f - poweredFlowBlend) + forward * poweredFlowBlend,
                forward);
            float incidence = std::asin(std::clamp(Vec3::up().dot(incoming), -1.f, 1.f));
            float aoa = cfg_.wingBaseAngleRad +
                        cfg_.poweredAoABoostRad * effectivePower +
                        incidence;
            float absAoA = std::abs(aoa);
            float stall = 0.f;
            if (absAoA > cfg_.stallAngleRad) {
                float denom = std::max(0.1f, 1.5708f - cfg_.stallAngleRad);
                stall = std::clamp((absAoA - cfg_.stallAngleRad) / denom, 0.f, 1.f);
            }
            float stallFactor = 1.f - stall * 0.75f;
            float clLimit = std::max(0.1f, cfg_.liftCoefficient * 1.35f);
            float cl = std::clamp(
                (aoa - cfg_.zeroLiftAngleRad) * cfg_.liftSlope,
                -0.6f,
                clLimit) * stallFactor;
            float q = 0.5f * cfg_.airDensity * speed * speed;
            float lift = q * areaPerPanel * cl * sideHealth;
            float cd = cfg_.dragCoefficient + std::abs(cl) * 0.08f + stall * 0.28f;
            float drag = q * areaPerPanel * cd * sideHealth;
            float thrust = q * areaPerPanel * cfg_.flapThrustCoefficient * effectivePower * sideHealth;

            Vec3 liftForce = Vec3::up() * lift;
            Vec3 dragDir = rawSpeed > 0.01f
                ? relativeVelocity.normalized() * -1.f
                : forward * -1.f;
            Vec3 dragForce = dragDir * drag;
            Vec3 thrustForce = forward * thrust;
            Vec3 force = liftForce + dragForce + thrustForce;

            if (emitForces) {
                NodeID target = (i + 1u < panelCount / 2u) ? cfg_.rootNode : tipId;
                out.decisions.push_back({target, force, false});
            }

            float positiveLift = std::max(0.f, lift);
            out.liftTotal += lift;
            out.dragTotal += drag;
            out.thrustTotal += thrust;
            out.liftVector = out.liftVector + liftForce;
            out.dragVector = out.dragVector + dragForce;
            out.thrustVector = out.thrustVector + thrustForce;
            out.centreOfLift = out.centreOfLift + centre * positiveLift;
            out.centreWeight += positiveLift;
            out.panelCount += 1.f;
            if (leftSide) {
                out.liftL += lift;
                out.aoaL += aoa;
                out.aoaCountL += 1.f;
                out.stallL = std::max(out.stallL, stall);
            } else {
                out.liftR += lift;
                out.aoaR += aoa;
                out.aoaCountR += 1.f;
                out.stallR = std::max(out.stallR, stall);
            }
        }
    }

    AeroResult computeWingPanelAero(
        const MorphologyGraph& body,
        const FieldRegistry& fields,
        const Vec3& forward,
        const MotorState& state,
        float powerScale,
        float requiredLift,
        bool emitForces) const
    {
        AeroResult aero;
        Vec3 forwardDir = safeNormal(forward, Vec3(0, 0, 1));
        accumulateWingAeroSide(body, fields, forwardDir, state, cfg_.wingLTipNode,
            true, powerScale, emitForces, aero);
        accumulateWingAeroSide(body, fields, forwardDir, state, cfg_.wingRTipNode,
            false, powerScale, emitForces, aero);

        if (aero.aoaCountL > 0.f) aero.aoaL /= aero.aoaCountL;
        if (aero.aoaCountR > 0.f) aero.aoaR /= aero.aoaCountR;
        aero.liftReserve = std::max(0.f, aero.liftTotal) / std::max(requiredLift, 0.001f);
        aero.centreOfLift = aero.centreWeight > 0.f
            ? aero.centreOfLift / aero.centreWeight
            : body.centreOfMass();
        return aero;
    }

    void appendTakeOffClimbForces(
        std::vector<MotorDecision>& out,
        const MorphologyGraph& body,
        const FieldRegistry& fields,
        float requiredLift,
        const Vec3& forward,
        MotorState& state) const
    {
        activateMuscle(state, MuscleRole::WingDownstrokeL, 0.55f);
        activateMuscle(state, MuscleRole::WingDownstrokeR, 0.55f);
        activateMuscle(state, MuscleRole::TailStabiliser, 0.35f);
        AeroResult aero = computeWingPanelAero(body, fields, forward, state, 0.55f, requiredLift, true);
        writeAeroState(state, aero);
        out.insert(out.end(), aero.decisions.begin(), aero.decisions.end());

        float climbForce = std::max(0.f, aero.liftTotal) * 0.18f;
        out.push_back({cfg_.rootNode, Vec3(0, climbForce, 0) + forward * (climbForce * 0.18f), false});
        if (cfg_.tailTipNode != kInvalidNode)
            out.push_back({cfg_.tailTipNode, Vec3(0, -cfg_.maxTailTorque * 0.35f, 0), false});

        state.inFlight = true;
    }

    // ── Per-intent dispatch ───────────────────────────────────────────────
    std::vector<MotorDecision> solveIntent(const Intent& intent,
        MorphologyGraph& body, const FieldRegistry& fields,
        MotorState& state, const Vec3& entityPos, float dt)
    {
        switch (intent.type) {
            case IntentType::Pursue:         return solvePursue(intent, body, state, dt);
            case IntentType::Evade:          return solveEvade(intent, body, state, dt);
            case IntentType::Stabilize:      return {}; // handled by balance pass
            case IntentType::TakeOff:        return solveTakeOff(intent, body, fields, state, dt);
            case IntentType::Glide:          return solveGlide(intent, body, fields, state, dt);
            case IntentType::Dive:           return solveDive(intent, body, state, dt);
            case IntentType::Land:           return solveLand(intent, body, state, dt);
            case IntentType::Strike:         return solveStrike(intent, body, state, dt);
            case IntentType::Parry:          return solveParry(intent, body, state, dt);
            case IntentType::RecoverBalance: return {}; // handled by balance pass
            case IntentType::FlockAlign:     return solveFlockAlign(intent, body, state, dt);
            case IntentType::FlockSeparate:  return solveFlockSeparate(intent, body, state, dt);
            case IntentType::Intimidate:     return solveIntimidate(intent, body, fields, dt);
            case IntentType::ProtectLimb:    return solveProtectLimb(intent, body, state, dt);
            case IntentType::Breathe:        return solveBreathe(body, state, dt);
            default: return {};
        }
    }

    // ── Locomotion ────────────────────────────────────────────────────────
    std::vector<MotorDecision> solvePursue(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        // HEURISTIC: Simple directional force toward target.
        // Replace with procedural footfall / motion-matching for full fidelity.
        Vec3 com    = body.centreOfMass();
        Vec3 toTgt  = intent.mods.targetWorldPos - com;
        float dist  = toTgt.length();
        if (dist < 0.5f) return {};

        Vec3  dir   = toTgt / dist;
        float force = cfg_.maxGroundForce * intent.mods.urgency;

        // Advance gait phase (drives footfall timing)
        state.gaitPhase += state.gaitCadence * dt;
        if (state.gaitPhase > 1.f) state.gaitPhase -= 1.f;

        std::vector<MotorDecision> out;

        // Distribute across ground contact nodes with gait phase offset
        int activeNodes = 0;
        for (NodeID nid : cfg_.groundNodes) {
            if (nid == kInvalidNode) break;
            ++activeNodes;
        }
        if (activeNodes == 0) {
            // No explicit ground nodes — push root
            out.push_back({cfg_.rootNode, dir * force, false});
            return out;
        }

        for (int i = 0; i < activeNodes; ++i) {
            NodeID nid = cfg_.groundNodes[i];
            // Simple biphasic gait: alternate pairs
            float phaseOffset = static_cast<float>(i) / activeNodes;
            float localPhase  = std::fmod(state.gaitPhase + phaseOffset, 1.f);
            float swing       = (localPhase < 0.5f)
                ? std::sin(localPhase * 3.14159f) // swing arc
                : 0.f;                             // stance

            Vec3 contactForce = dir * force * (1.f - swing);
            contactForce      = contactForce + Vec3(0, swing * force * 0.3f, 0); // lift during swing
            out.push_back({nid, contactForce, false});
        }
        return out;
    }

    std::vector<MotorDecision> solveEvade(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        Vec3 com       = body.centreOfMass();
        Vec3 awayFromThreat = com - intent.mods.targetWorldPos;
        float dist = awayFromThreat.length();
        Vec3  dir  = (dist > 0.01f) ? awayFromThreat / dist : Vec3(1,0,0);

        // Boost urgency proportional to proximity
        float urgencyBoost = std::max(1.f, 5.f / std::max(dist, 0.5f));
        float force = cfg_.maxGroundForce * std::min(intent.mods.urgency * urgencyBoost, 1.f);

        // Increase fatigue for sustained evasion
        state.fatigue = std::min(1.f, state.fatigue + 0.05f * dt);

        return {{cfg_.rootNode, dir * force, false}};
    }

    // ── Flight ────────────────────────────────────────────────────────────
    // HEURISTIC: Simplified lift = 0.5 * rho * v² * CL * S
    //            Real aerodynamics needs per-panel normal + AoA.
    std::vector<MotorDecision> solveTakeOff(const Intent& intent,
        MorphologyGraph& body, const FieldRegistry& fields,
        MotorState& state, float dt)
    {
        MorphNode* root = body.node(cfg_.rootNode);
        if (!root) {
            return failTakeOff(state, TakeOffFailureReason::MissingGroundContact);
        }

        std::array<NodeID, MotorConfig::kMaxGroundNodes> ground{};
        int groundCount = collectGroundNodes(body, ground);
        if (groundCount == 0) {
            return failTakeOff(state, TakeOffFailureReason::MissingGroundContact);
        }

        Vec3 com = body.centreOfMass();
        Vec3 vel = body.centreVelocity();
        Vec3 forward = intent.mods.targetWorldPos - com;
        forward.y = 0.f;
        if (forward.lengthSq() < 0.0001f) forward = Vec3(0, 0, 1);
        forward = forward.normalized();

        float lowestGroundY = root->worldPos.y;
        for (int i = 0; i < groundCount; ++i) {
            const MorphNode* foot = body.node(ground[i]);
            if (foot) lowestGroundY = std::min(lowestGroundY, foot->worldPos.y);
        }

        float totalMass = totalBodyMass(body);
        float requiredLift = std::max(1.f, totalMass * 0.55f);
        AeroResult readinessAero = computeWingPanelAero(
            body, fields, forward, state, 1.f, requiredLift, false);
        writeAeroState(state, readinessAero);

        state.launchLiftReserve = readinessAero.liftReserve;
        state.launchClearance = root->worldPos.y - lowestGroundY;
        state.launchVerticalVelocity = vel.y;
        state.takeOffReadiness = std::min({
            state.launchLiftReserve / std::max(cfg_.minTakeOffLiftReserve, 0.001f),
            state.launchClearance / std::max(cfg_.minTakeOffClearance, 0.001f),
            1.f
        });

        if (state.takeOffPhase == TakeOffPhase::Failed) {
            return {};
        }

        if (state.launchClearance < cfg_.minTakeOffClearance) {
            return failTakeOff(state, TakeOffFailureReason::InsufficientClearance);
        }
        if (state.launchLiftReserve < cfg_.minTakeOffLiftReserve) {
            return failTakeOff(state, TakeOffFailureReason::InsufficientLiftReserve);
        }

        if (state.takeOffPhase == TakeOffPhase::Grounded) {
            state.takeOffPhase = TakeOffPhase::CrouchLoad;
            state.takeOffFailureReason = TakeOffFailureReason::None;
            state.takeOffTimer = 0.f;
            state.takeOffLoad = 0.f;
            state.inFlight = false;
        }

        state.takeOffTimer += dt;
        state.gaitPhase += 2.2f * dt;
        if (state.gaitPhase > 1.f) state.gaitPhase -= 1.f;

        const float crouchEnd = cfg_.takeOffCrouchDuration;
        const float legEnd = crouchEnd + cfg_.takeOffLegDriveDuration;
        const float wingEnd = legEnd + cfg_.takeOffWingAssistDuration;

        std::vector<MotorDecision> out;

        if (state.takeOffPhase == TakeOffPhase::Airborne) {
            appendTakeOffClimbForces(out, body, fields, requiredLift, forward, state);
            return out;
        }

        if (state.takeOffTimer <= crouchEnd) {
            state.takeOffPhase = TakeOffPhase::CrouchLoad;
            state.takeOffLoad = std::min(1.f, state.takeOffTimer / std::max(crouchEnd, 0.001f));
            activateMuscle(state, MuscleRole::LegDriveL, 0.35f * state.takeOffLoad);
            activateMuscle(state, MuscleRole::LegDriveR, 0.35f * state.takeOffLoad);
            activateMuscle(state, MuscleRole::TailStabiliser, 0.2f);
            out.push_back({cfg_.rootNode, Vec3(0, -cfg_.maxGroundForce * 0.8f * state.takeOffLoad, 0), false});
            for (int i = 0; i < groundCount; ++i) {
                out.push_back({ground[i], Vec3(0, -cfg_.maxGroundForce * 0.25f * state.takeOffLoad, 0), false});
            }
            return out;
        }

        if (state.takeOffTimer <= legEnd) {
            state.takeOffPhase = TakeOffPhase::LegDrive;
            state.takeOffLoad = 1.f;
            activateMuscle(state, MuscleRole::LegDriveL, 1.f);
            activateMuscle(state, MuscleRole::LegDriveR, 1.f);
            activateMuscle(state, MuscleRole::WingDownstrokeL, 0.25f);
            activateMuscle(state, MuscleRole::WingDownstrokeR, 0.25f);
            activateMuscle(state, MuscleRole::TailStabiliser, 0.35f);
            float legForce = cfg_.maxGroundForce * cfg_.takeOffLegDriveMultiplier * intent.mods.urgency;
            out.push_back({cfg_.rootNode, Vec3(0, legForce * 0.85f, 0) + forward * (legForce * 0.12f), false});
            for (int i = 0; i < groundCount; ++i) {
                out.push_back({ground[i], Vec3(0, legForce / groundCount, 0) + forward * (legForce * 0.05f), false});
            }
            state.fatigue = std::min(1.f, state.fatigue + 0.015f * dt);
            return out;
        }

        if (state.takeOffTimer <= wingEnd || state.launchVerticalVelocity < cfg_.minTakeOffVerticalVelocity) {
            state.takeOffPhase = TakeOffPhase::FirstDownstroke;
            float phaseT = std::min(1.f, (state.takeOffTimer - legEnd) /
                std::max(cfg_.takeOffWingAssistDuration, 0.001f));
            activateMuscle(state, MuscleRole::WingDownstrokeL, 1.f);
            activateMuscle(state, MuscleRole::WingDownstrokeR, 1.f);
            activateMuscle(state, MuscleRole::LegDriveL, 0.35f * (1.f - phaseT));
            activateMuscle(state, MuscleRole::LegDriveR, 0.35f * (1.f - phaseT));
            activateMuscle(state, MuscleRole::TailStabiliser, 0.65f);
            float wingPower = cfg_.takeOffWingAssistMultiplier * (0.75f + 0.25f * phaseT);
            AeroResult downstrokeAero = computeWingPanelAero(
                body, fields, forward, state, wingPower, requiredLift, true);
            writeAeroState(state, downstrokeAero);
            out.insert(out.end(), downstrokeAero.decisions.begin(), downstrokeAero.decisions.end());

            float rootAssist = std::max(0.f, downstrokeAero.liftTotal) * 0.22f;
            out.push_back({cfg_.rootNode, Vec3(0, rootAssist, 0) + forward * (rootAssist * 0.12f), false});

            if (cfg_.tailTipNode != kInvalidNode) {
                out.push_back({cfg_.tailTipNode, Vec3(0, -cfg_.maxTailTorque * 0.6f, 0), false});
            }

            state.fatigue = std::min(1.f, state.fatigue + 0.02f * dt);

            if (state.launchVerticalVelocity >= cfg_.minTakeOffVerticalVelocity &&
                state.launchLiftReserve >= cfg_.minTakeOffLiftReserve &&
                state.launchClearance >= cfg_.minTakeOffClearance) {
                state.inFlight = true;
                state.takeOffPhase = TakeOffPhase::Airborne;
                state.takeOffFailureReason = TakeOffFailureReason::None;
                state.takeOffReadiness = 1.f;
            } else if (state.takeOffTimer > cfg_.takeOffTimeout) {
                return failTakeOff(state, TakeOffFailureReason::InsufficientVerticalVelocity);
            }
            return out;
        }

        return failTakeOff(state, TakeOffFailureReason::InsufficientVerticalVelocity);
    }

    std::vector<MotorDecision> solveGlide(const Intent& intent,
        MorphologyGraph& body, const FieldRegistry& fields,
        MotorState& state, float dt)
    {
        (void)dt;
        state.inFlight = true;
        activateMuscle(state, MuscleRole::WingUpstrokeL, 0.18f);
        activateMuscle(state, MuscleRole::WingUpstrokeR, 0.18f);
        activateMuscle(state, MuscleRole::TailStabiliser, 0.25f);

        Vec3 com = body.centreOfMass();
        Vec3 forward = intent.mods.targetWorldPos - com;
        forward.y = 0.f;
        if (forward.lengthSq() < 0.0001f) {
            Vec3 vel = body.centreVelocity();
            vel.y = 0.f;
            forward = vel.lengthSq() > 0.0001f ? vel : Vec3(0, 0, 1);
        }
        forward = forward.normalized();
        float requiredLift = std::max(1.f, totalBodyMass(body) * 0.55f);
        AeroResult aero = computeWingPanelAero(body, fields, forward, state, 0.15f, requiredLift, true);
        writeAeroState(state, aero);

        std::vector<MotorDecision> out;
        out.insert(out.end(), aero.decisions.begin(), aero.decisions.end());

        // Tail compensation for pitch
        if (cfg_.tailTipNode != kInvalidNode) {
            Vec3  toTarget  = intent.mods.targetWorldPos - com;
            float pitchCorr = toTarget.y * cfg_.maxTailTorque * 0.1f;
            out.push_back({cfg_.tailTipNode, Vec3(0, pitchCorr, 0), false});
        }

        return out;
    }

    std::vector<MotorDecision> solveDive(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        Vec3 com    = body.centreOfMass();
        Vec3 toTgt  = intent.mods.targetWorldPos - com;
        Vec3 dir    = toTgt.normalized();

        // Fold wings implied by reducing lift area — expressed as a negative lift
        std::vector<MotorDecision> out;
        out.push_back({cfg_.rootNode, dir * cfg_.maxGroundForce * 1.5f, false});

        // Tail flares to steer
        if (cfg_.tailTipNode != kInvalidNode) {
            Vec3 tailSteer = Vec3(dir.x, -dir.y * 0.5f, dir.z) * cfg_.maxTailTorque;
            out.push_back({cfg_.tailTipNode, tailSteer, false});
        }

        state.fatigue = std::min(1.f, state.fatigue + 0.01f * dt);
        return out;
    }

    std::vector<MotorDecision> solveLand(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        Vec3  com   = body.centreOfMass();
        Vec3  toLnd = intent.mods.targetWorldPos - com;
        float dist  = toLnd.length();

        // Counter gravity gradually as we approach
        float brakeFraction = std::min(1.f, 5.f / std::max(dist, 1.f));
        Vec3  brakeForce    = Vec3(0, 9.81f * 0.8f * brakeFraction, 0); // approx anti-grav

        state.inFlight = (dist > 1.f);
        return {{cfg_.rootNode, brakeForce, false}};
    }

    // ── Combat ────────────────────────────────────────────────────────────
    std::vector<MotorDecision> solveStrike(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        Vec3  com   = body.centreOfMass();
        Vec3  toTgt = intent.mods.targetWorldPos - com;
        Vec3  dir   = toTgt.normalized();
        float imp   = cfg_.strikeImpulse * intent.mods.urgency;

        state.fatigue = std::min(1.f, state.fatigue + 0.15f);
        return {{cfg_.rootNode, dir * imp, true}}; // true = impulse
    }

    // Parry: intercept incoming momentum vector
    // HEURISTIC: If within parry window, apply a deflection impulse.
    //            Full momentum interception would require contact resolution.
    std::vector<MotorDecision> solveParry(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        if (state.parryWindowTimer <= 0.f) return {};
        state.parryWindowTimer -= dt;

        // Deflect perpendicular to incoming force
        Vec3  inc  = state.lastIncomingForce;
        float mag  = inc.length();
        if (mag < 0.1f) return {};

        // Choose deflection axis (cross with up is a reasonable first approx)
        Vec3  deflect = inc.cross(Vec3::up()).normalized() * mag * 0.8f;
        Vec3  block   = inc.normalized() * (-mag * 0.5f); // partial block

        return {{cfg_.rootNode, deflect + block, true}};
    }

    std::vector<MotorDecision> solveProtectLimb(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        NodeID limb = intent.mods.protectNode;
        if (limb == kInvalidNode) return {};

        // Pull limb toward body centre
        MorphNode* n = body.node(limb);
        if (!n) return {};
        Vec3 com = body.centreOfMass();
        Vec3 dir = (com - n->worldPos).normalized();
        return {{limb, dir * cfg_.maxGroundForce * 0.5f, false}};
    }

    // ── Balance PD controller ─────────────────────────────────────────────
    std::vector<MotorDecision> solveBalance(MorphologyGraph& body,
                                             MotorState& state, float dt)
    {
        if (cfg_.rootNode == kInvalidNode) return {};
        MorphNode* root = body.node(cfg_.rootNode);
        if (!root) return {};

        // Estimate current up from velocity cross product — HEURISTIC
        // Replace with proper orientation read from your physics body.
        Vec3 vel = root->velocity;
        Vec3 up  = Vec3::up();

        Vec3  error  = up - state.currentUp;
        Vec3  deriv  = (error - state.balanceError) / std::max(dt, 0.001f);
        Vec3  correction = error * cfg_.balanceKP + deriv * cfg_.balanceKD;

        state.balanceError      = error;
        state.balanceErrorDeriv = deriv;

        return {{cfg_.rootNode, correction, false}};
    }

    // ── Environmental reactions ───────────────────────────────────────────
    std::vector<MotorDecision> solveWindReaction(MorphologyGraph& body,
        const Fields::FieldCell& airflow, MotorState& state, float dt)
    {
        // Lean into wind slightly to maintain heading — HEURISTIC
        Vec3 windDir  = airflow.direction;
        float windMag = airflow.value;
        Vec3 reaction = windDir * (-windMag * 0.3f); // counter-lean
        return {{cfg_.rootNode, reaction, false}};
    }

    // ── Flocking ──────────────────────────────────────────────────────────
    std::vector<MotorDecision> solveFlockAlign(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        // intent.mods.targetWorldPos encodes desired velocity direction here
        Vec3 desired = intent.mods.targetWorldPos.normalized();
        Vec3 current = body.centreVelocity().normalized();
        Vec3 align   = (desired - current) * cfg_.maxGroundForce * 0.3f;
        return {{cfg_.rootNode, align, false}};
    }

    std::vector<MotorDecision> solveFlockSeparate(const Intent& intent,
        MorphologyGraph& body, MotorState& state, float dt)
    {
        Vec3 com     = body.centreOfMass();
        Vec3 awayDir = (com - intent.mods.targetWorldPos).normalized();
        float urgency = intent.mods.urgency;
        return {{cfg_.rootNode, awayDir * cfg_.maxGroundForce * urgency * 0.5f, false}};
    }

    // ── Intimidation ──────────────────────────────────────────────────────
    std::vector<MotorDecision> solveIntimidate(const Intent& intent,
        MorphologyGraph& body, const FieldRegistry& fields, float dt)
    {
        // Expand posture: push head, tail tip, and wing tips outward from CoM
        Vec3  com = body.centreOfMass();
        std::vector<MotorDecision> out;
        auto expand = [&](NodeID nid) {
            if (nid == kInvalidNode) return;
            MorphNode* n = body.node(nid);
            if (!n) return;
            Vec3 dir = (n->worldPos - com).normalized();
            out.push_back({nid, dir * cfg_.maxGroundForce * 0.4f, false});
        };
        expand(cfg_.headNode);
        expand(cfg_.tailTipNode);
        expand(cfg_.wingLTipNode);
        expand(cfg_.wingRTipNode);
        return out;
    }

    // ── Biological rhythms ────────────────────────────────────────────────
    std::vector<MotorDecision> solveBreathe(MorphologyGraph& body,
                                             MotorState& state, float dt)
    {
        // Oscillate torso nodes to simulate respiration — purely visual at low intensity
        float breathRate  = 0.3f + state.fatigue * 0.7f; // faster when tired
        state.gaitPhase  += breathRate * dt; // reuse gait phase for breathing rhythm
        float breathForce = std::sin(state.gaitPhase * 6.283f) * 0.5f;
        activateMuscle(state, MuscleRole::Breathing, std::abs(breathForce));
        return {{cfg_.rootNode, Vec3(0, breathForce, 0), false}};
    }

    // ── Field emission ────────────────────────────────────────────────────
    // Entity writes back into world fields based on its current state.
    void emitToFields(MorphologyGraph& body, MotorState& state,
                      const FieldRegistry& fields, float dt)
    {
        // NOTE: FieldRegistry is const here; emission requires a non-const version.
        // In practice you'd pass FieldRegistry& (mutable) to solve().
        // Left as const here to keep the interface conservative — cast at call site
        // if your architecture allows it, or pass separate emit handles.
        // HEURISTIC: Emission amounts are approximate.

        // This method intentionally left as documentation of the intended
        // emission contract. Actual implementation requires mutable field access:
        //
        //   Vec3 com = body.centreOfMass();
        //   Vec3 vel = body.centreVelocity();
        //   float speed = vel.length();
        //
        //   // Air displacement from movement
        //   airflowField->emitSphere(com, speed * 0.5f, speed * 0.1f, vel.normalized());
        //
        //   // Territorial dominance
        //   if (intents.has(IntentType::Intimidate))
        //       territorialField->emitSphere(com, 10.f, 0.8f);
        //
        //   // Fear propagation when fleeing
        //   if (state.fatigue > 0.7f)
        //       fearField->emitSphere(com, 5.f, state.fatigue * 0.4f);
    }

    MotorConfig      cfg_;
    LocomotionPolicy locomotionPolicy_;
};

} // namespace Solver
} // namespace EFE
