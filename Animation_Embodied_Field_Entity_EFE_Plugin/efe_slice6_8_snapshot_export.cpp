#include "dragon_builder.h"
#include "render_frame.h"
#include "sim_runner.h"

#include <cassert>
#include <fstream>
#include <functional>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace {

EFE::Entity::Intent makeIntent(
    EFE::Entity::IntentType type,
    EFE::Vec3 target,
    float priority,
    float urgency = 1.f)
{
    EFE::Entity::Intent intent;
    intent.type = type;
    intent.priority = priority;
    intent.weight = 1.f;
    intent.mods.urgency = urgency;
    intent.mods.targetWorldPos = target;
    return intent;
}

void pushBreathing(EFE::Entity::EmbodiedEntity& dragon)
{
    EFE::Entity::Intent breathe;
    breathe.type = EFE::Entity::IntentType::Breathe;
    breathe.priority = 0.1f;
    breathe.weight = 0.3f;
    dragon.intents().push(breathe);
}

void setPrimaryIntent(
    EFE::Entity::EmbodiedEntity& dragon,
    EFE::Entity::IntentType type,
    EFE::Vec3 target,
    float priority = 1.f,
    float urgency = 1.f)
{
    dragon.intents().clear();
    pushBreathing(dragon);
    if (type != EFE::Entity::IntentType::Idle &&
        type != EFE::Entity::IntentType::Breathe) {
        dragon.intents().push(makeIntent(type, target, priority, urgency));
    }
}

EFE::FieldID registerAirflowField(EFE::Fields::FieldRegistry& fields)
{
    EFE::Fields::FieldDescriptor airflow{};
    airflow.type = EFE::Fields::FieldType::Airflow;
    airflow.isVector = true;
    airflow.tickRateHz = 20.f;
    airflow.maxActiveCellsPerTick = 512;
    return fields.registerField(std::make_unique<EFE::Fields::SpatialFieldGrid>(
        EFE::Vec3(-16.f, -4.f, -16.f),
        EFE::Vec3(2.f, 2.f, 2.f),
        16, 8, 16,
        airflow));
}

struct SnapshotFrame {
    std::string label;
    EFE::Render::CreatureRenderFrame frame;
    EFE::Runtime::SimRunnerStats runnerStats;
    EFE::Fields::FieldRegistryTickStats fieldStats;
};

template <typename SetupFn, typename StopFn>
SnapshotFrame captureScenario(
    const std::string& label,
    EFE::Vec3 spawn,
    int maxSteps,
    SetupFn setup,
    StopFn stop)
{
    EFE::Fields::FieldRegistry fields;
    EFE::FieldID airflowId = registerAirflowField(fields);
    auto dragon = EFE::Debug::buildDragon(9, spawn);
    assert(EFE::Debug::validateDragonBuild(*dragon).readyToTick());

    EFE::Runtime::FixedStepSimRunner runner;
    EFE::Render::RenderFrameBuilder frameBuilder;

    setup(*dragon, fields, airflowId);
    for (int i = 0; i < maxSteps; ++i) {
        runner.advance(*dragon, fields, 1.f / 60.f);
        if (stop(*dragon)) break;
    }

    SnapshotFrame captured;
    captured.label = label;
    captured.frame = frameBuilder.build(*dragon);
    captured.runnerStats = runner.lastStats();
    captured.fieldStats = fields.lastTickStats();
    return captured;
}

template <typename SetupFn>
SnapshotFrame captureScenario(
    const std::string& label,
    EFE::Vec3 spawn,
    int maxSteps,
    SetupFn setup)
{
    return captureScenario(label, spawn, maxSteps, setup,
        [](const EFE::Entity::EmbodiedEntity&) { return false; });
}

std::string jsString(const std::string& input)
{
    std::string out;
    out.reserve(input.size() + 2);
    out.push_back('"');
    for (char c : input) {
        if (c == '"' || c == '\\') out.push_back('\\');
        out.push_back(c);
    }
    out.push_back('"');
    return out;
}

void writeVec(std::ostream& os, const EFE::Vec3& v)
{
    os << "[" << v.x << "," << v.y << "," << v.z << "]";
}

void writeFrame(std::ostream& os, const std::string& label, const EFE::Render::CreatureRenderFrame& frame)
{
    os << "{";
    os << "label:" << jsString(label) << ",";
    os << "entity:" << jsString(frame.debugName) << ",";
    os << "metrics:{";
    os << "nodeCount:" << frame.nodes.size() << ",";
    os << "constraintCount:" << frame.constraints.size() << ",";
    os << "muscleCount:" << frame.muscles.size() << ",";
    os << "wingPanelCount:" << frame.wingPanels.size() << ",";
    os << "speed:" << frame.speed << ",";
    os << "inAir:" << frame.inAir << ",";
    os << "takeOffReadiness:" << frame.takeOffReadiness << ",";
    os << "launchLiftReserve:" << frame.launchLiftReserve << ",";
    os << "aeroLiftTotal:" << frame.aeroLiftTotal << ",";
    os << "aeroDragTotal:" << frame.aeroDragTotal << ",";
    os << "aeroLiftReserve:" << frame.aeroLiftReserve << ",";
    os << "aeroStallL:" << frame.aeroStallL << ",";
    os << "aeroStallR:" << frame.aeroStallR << ",";
    os << "muscleForceTotal:" << frame.muscleForceTotal << ",";
    os << "muscleTensionL:" << frame.muscleTensionL << ",";
    os << "muscleTensionR:" << frame.muscleTensionR << ",";
    os << "fatigue:" << frame.fatigue << ",";
    os << "takeOffPhase:" << static_cast<int>(frame.takeOffPhase) << ",";
    os << "takeOffFailureReason:" << static_cast<int>(frame.takeOffFailureReason);
    os << "},";

    os << "vectors:{com:"; writeVec(os, frame.centreOfMass);
    os << ",velocity:"; writeVec(os, frame.centreVelocity);
    os << ",centreOfLift:"; writeVec(os, frame.aeroCentreOfLift);
    os << ",lift:"; writeVec(os, frame.aeroLiftVector);
    os << ",drag:"; writeVec(os, frame.aeroDragVector);
    os << "},";

    os << "nodes:[";
    for (size_t i = 0; i < frame.nodes.size(); ++i) {
        const auto& n = frame.nodes[i];
        if (i) os << ",";
        os << "{id:" << n.id << ",label:" << jsString(n.label) << ",pos:";
        writeVec(os, n.worldPos);
        os << ",vel:"; writeVec(os, n.velocity);
        os << ",hp:" << n.structuralHP << ",damage:" << static_cast<int>(n.damageState) << "}";
    }
    os << "],";

    os << "constraints:[";
    for (size_t i = 0; i < frame.constraints.size(); ++i) {
        const auto& c = frame.constraints[i];
        if (i) os << ",";
        os << "{id:" << c.id << ",a:" << c.nodeA << ",b:" << c.nodeB
           << ",hp:" << c.structuralHP
           << ",membrane:" << (c.isMembrane ? "true" : "false")
           << ",spinal:" << (c.isSpinal ? "true" : "false") << "}";
    }
    os << "],";

    os << "muscles:[";
    for (size_t i = 0; i < frame.muscles.size(); ++i) {
        const auto& m = frame.muscles[i];
        if (i) os << ",";
        os << "{id:" << m.id << ",label:" << jsString(m.label)
           << ",origin:" << m.originNode
           << ",insertion:" << m.insertionNode
           << ",activation:" << m.activation
           << ",force:" << m.force
           << ",tendon:" << m.tendonForce
           << ",fatigue:" << m.fatigue
           << ",health:" << m.health << "}";
    }
    os << "],";

    os << "wingPanels:[";
    for (size_t i = 0; i < frame.wingPanels.size(); ++i) {
        const auto& p = frame.wingPanels[i];
        if (i) os << ",";
        os << "{index:" << p.index
           << ",left:" << (p.left ? "true" : "false")
           << ",root:" << p.rootNode
           << ",tip:" << p.tipNode
           << ",inner:"; writeVec(os, p.inner);
        os << ",outer:"; writeVec(os, p.outer);
        os << ",leading:"; writeVec(os, p.leading);
        os << ",trailing:"; writeVec(os, p.trailing);
        os << ",centre:"; writeVec(os, p.centre);
        os << ",liftShare:" << p.liftShare
           << ",stall:" << p.stall << "}";
    }
    os << "]";
    os << "}";
}

void setBodyVelocity(EFE::Entity::MorphologyGraph& body, EFE::Vec3 velocity)
{
    for (auto& node : body.nodes()) {
        node.velocity = velocity;
    }
}

} // namespace

int main()
{
    std::vector<SnapshotFrame> frames;

    frames.push_back(captureScenario(
        "breathing idle",
        EFE::Vec3(0.f, 0.f, 0.f),
        1,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Idle, EFE::Vec3::zero());
        }));

    frames.push_back(captureScenario(
        "native pursue",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Pursue, EFE::Vec3(0.f, 1.2f, 14.f));
        }));

    frames.push_back(captureScenario(
        "native evade",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Evade, EFE::Vec3(0.f, 1.2f, -3.f));
        }));

    frames.push_back(captureScenario(
        "native takeoff",
        EFE::Vec3(0.f, 0.f, 0.f),
        120,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::TakeOff, EFE::Vec3(0.f, 8.f, 24.f));
        },
        [](const EFE::Entity::EmbodiedEntity& dragon) {
            return dragon.motorState().inFlight;
        }));

    frames.push_back(captureScenario(
        "native glide",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Glide, EFE::Vec3(0.f, 6.f, 34.f));
            setBodyVelocity(dragon.body(), EFE::Vec3(0.f, 0.f, 12.f));
        }));

    frames.push_back(captureScenario(
        "glide plus wind field",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry& fields, EFE::FieldID airflowId) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Glide, EFE::Vec3(0.f, 6.f, 34.f));
            setBodyVelocity(dragon.body(), EFE::Vec3(0.f, 0.f, 12.f));
            if (auto* airflow = fields.get(airflowId)) {
                airflow->emitSphere(
                    dragon.body().centreOfMass() + EFE::Vec3(0.f, 0.f, 4.f),
                    11.f,
                    2.2f,
                    EFE::Vec3(-1.f, 0.05f, 0.15f).normalized());
            }
        }));

    frames.push_back(captureScenario(
        "left wing damage glide",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            const auto& cfg = dragon.solver().config();
            if (const auto* tip = dragon.body().node(cfg.wingLTipNode)) {
                dragon.body().applyDamage(tip->worldPos, 0.62f, 2.8f);
            }
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Glide, EFE::Vec3(0.f, 6.f, 34.f));
            setBodyVelocity(dragon.body(), EFE::Vec3(0.f, 0.f, 12.f));
        }));

    frames.push_back(captureScenario(
        "native dive",
        EFE::Vec3(0.f, 3.f, 0.f),
        30,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Dive, EFE::Vec3(0.f, -2.f, 28.f));
            setBodyVelocity(dragon.body(), EFE::Vec3(0.f, 0.f, 10.f));
        }));

    frames.push_back(captureScenario(
        "native strike",
        EFE::Vec3(0.f, 0.f, 0.f),
        8,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Strike, EFE::Vec3(0.f, 2.f, 9.f), 1.f, 1.f);
        }));

    frames.push_back(captureScenario(
        "native intimidate",
        EFE::Vec3(0.f, 0.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Intimidate, EFE::Vec3(0.f, 2.f, 8.f));
        }));

    frames.push_back(captureScenario(
        "native land",
        EFE::Vec3(0.f, 4.f, 0.f),
        36,
        [](EFE::Entity::EmbodiedEntity& dragon, EFE::Fields::FieldRegistry&, EFE::FieldID) {
            setPrimaryIntent(dragon, EFE::Entity::IntentType::Land, EFE::Vec3(0.f, 0.f, 12.f));
            setBodyVelocity(dragon.body(), EFE::Vec3(0.f, -0.2f, 8.f));
        }));

    const auto& finalFrame = frames.back().frame;
    assert(finalFrame.nodes.size() >= 20);
    assert(finalFrame.constraints.size() >= 20);
    assert(finalFrame.muscles.size() >= 10);
    assert(finalFrame.wingPanels.size() >= 8);
    assert(frames.size() >= 10);

    bool sawInAir = false;
    bool sawAeroLift = false;
    bool sawDamage = false;
    float maxLift = 0.f;
    for (const auto& captured : frames) {
        sawInAir = sawInAir || captured.frame.inAir > 0.f;
        sawAeroLift = sawAeroLift || captured.frame.aeroLiftTotal > 0.f;
        maxLift = std::max(maxLift, captured.frame.aeroLiftTotal);
        for (const auto& n : captured.frame.nodes) {
            sawDamage = sawDamage || n.structuralHP < 0.99f;
        }
    }
    assert(sawInAir);
    assert(sawAeroLift);
    assert(sawDamage);

    std::ofstream out("efe_native_snapshot.js", std::ios::trunc);
    assert(out && "failed to open efe_native_snapshot.js");
    out << std::fixed << std::setprecision(4);
    out << "window.EFE_NATIVE_SNAPSHOT={";
    out << "source:" << jsString("native C++ snapshot exporter") << ",";
    out << "notes:["
        << jsString("HTML is a native snapshot viewer with local playback and camera controls.")
        << "," << jsString("Skin preview is procedural; simulation values come from C++.")
        << "," << jsString("Use wyvern_efe_musculotendon_v4.html for the older browser-side sandbox.")
        << "],";
    out << "runner:{stepsRun:" << frames.back().runnerStats.stepsRun
        << ",droppedSteps:" << frames.back().runnerStats.droppedSteps
        << ",clampedNodes:" << frames.back().runnerStats.clampedNodes
        << ",nonFiniteNodes:" << frames.back().runnerStats.nonFiniteNodes
        << ",failSafe:" << (frames.back().runnerStats.failSafeTriggered ? "true" : "false")
        << "},";
    out << "fieldStats:{fieldsTicked:" << frames.back().fieldStats.fieldsTicked
        << ",fieldsSkipped:" << frames.back().fieldStats.fieldsSkipped
        << ",processedCells:" << frames.back().fieldStats.processedCellCount
        << ",activeCells:" << frames.back().fieldStats.activeCellCount
        << ",dirtyCells:" << frames.back().fieldStats.dirtyCellCount
        << ",budgetCapped:" << (frames.back().fieldStats.budgetCapped ? "true" : "false")
        << "},";
    out << "todo:["
        << jsString("Replace procedural tubes/membranes with real mesh skin binding.")
        << "," << jsString("Expose live native frames via engine/WASM bridge instead of a generated JS snapshot.")
        << "," << jsString("Add joint limits, contact state, terrain/landing fields, and renderer material pass.")
        << "," << jsString("Clean existing placeholder C4100 warnings.")
        << "],";
    out << "frames:[";
    for (size_t i = 0; i < frames.size(); ++i) {
        if (i) out << ",";
        writeFrame(out, frames[i].label, frames[i].frame);
    }
    out << "]};\n";
    out.close();

    std::cout << "slice6_8 ok: frames=" << frames.size()
              << " nodes=" << finalFrame.nodes.size()
              << " muscles=" << finalFrame.muscles.size()
              << " panels=" << finalFrame.wingPanels.size()
              << " maxLift=" << maxLift
              << " file=efe_native_snapshot.js"
              << "\n";

    return 0;
}
