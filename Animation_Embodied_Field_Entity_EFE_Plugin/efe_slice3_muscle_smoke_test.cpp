#include "dragon_builder.h"

#include <cassert>
#include <iostream>

namespace {

EFE::Entity::Intent makeTakeOffIntent()
{
    EFE::Entity::Intent takeOff;
    takeOff.type = EFE::Entity::IntentType::TakeOff;
    takeOff.priority = 1.0f;
    takeOff.weight = 1.0f;
    takeOff.mods.urgency = 1.0f;
    takeOff.mods.targetWorldPos = EFE::Vec3(0.f, 8.f, 24.f);
    return takeOff;
}

} // namespace

int main()
{
    EFE::Fields::FieldRegistry fields;

    auto dragon = EFE::Debug::buildDragon(4, EFE::Vec3(0.f, 0.f, 0.f));
    const auto validation = EFE::Debug::validateDragonBuild(*dragon);
    assert(validation.readyToTick());
    assert(validation.muscleCount >= 10);

    dragon->intents().push(makeTakeOffIntent());

    bool sawWingActivation = false;
    bool sawMuscleForce = false;
    bool sawExpressionMuscle = false;

    for (int i = 0; i < 120; ++i) {
        dragon->tick(fields, 1.f / 60.f);
        const auto& state = dragon->motorState();
        const auto& expr = dragon->lastExpression();

        sawWingActivation = sawWingActivation ||
            state.muscleActivations.getRole(EFE::Entity::MuscleRole::WingDownstrokeL) > 0.f ||
            state.muscleActivations.getRole(EFE::Entity::MuscleRole::WingDownstrokeR) > 0.f;
        sawMuscleForce = sawMuscleForce ||
            (state.activeMuscleCount > 0 && state.muscleForceTotal > 0.f);
        sawExpressionMuscle = sawExpressionMuscle ||
            (expr.muscleFlexL > 0.f || expr.muscleFlexR > 0.f || expr.skinStretch > 0.f);

        if (state.inFlight && sawWingActivation && sawMuscleForce && sawExpressionMuscle) {
            break;
        }
    }

    assert(sawWingActivation);
    assert(sawMuscleForce);
    assert(sawExpressionMuscle);
    assert(dragon->muscles().lastStats().totalForce == dragon->motorState().muscleForceTotal);

    auto disabledMuscleDragon = EFE::Debug::buildDragon(5, EFE::Vec3(0.f, 0.f, 0.f));
    for (auto& muscle : disabledMuscleDragon->muscles().muscles()) {
        muscle.health = 0.f;
    }
    disabledMuscleDragon->intents().push(makeTakeOffIntent());

    bool sawDisabledActivation = false;
    for (int i = 0; i < 40; ++i) {
        disabledMuscleDragon->tick(fields, 1.f / 60.f);
        sawDisabledActivation = sawDisabledActivation ||
            disabledMuscleDragon->motorState().muscleActivationMax > 0.f;
    }

    assert(sawDisabledActivation);
    assert(disabledMuscleDragon->motorState().muscleForceTotal == 0.f);

    std::cout << "slice3 ok: muscles=" << validation.muscleCount
              << " active=" << dragon->motorState().activeMuscleCount
              << " force=" << dragon->motorState().muscleForceTotal
              << " disabledForce=" << disabledMuscleDragon->motorState().muscleForceTotal
              << "\n";

    return 0;
}
