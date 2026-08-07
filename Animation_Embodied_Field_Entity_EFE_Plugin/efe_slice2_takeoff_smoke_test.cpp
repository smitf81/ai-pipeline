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

    auto dragon = EFE::Debug::buildDragon(2, EFE::Vec3(0.f, 0.f, 0.f));
    assert(EFE::Debug::validateDragonBuild(*dragon).readyToTick());
    dragon->intents().push(makeTakeOffIntent());

    bool becameAirborne = false;
    for (int i = 0; i < 120; ++i) {
        dragon->tick(fields, 1.f / 60.f);
        assert(dragon->motorState().takeOffPhase != EFE::Solver::TakeOffPhase::Failed);
        if (dragon->motorState().inFlight) {
            becameAirborne = true;
            break;
        }
    }

    const auto& successState = dragon->motorState();
    const auto& successExpr = dragon->lastExpression();
    assert(becameAirborne);
    assert(successState.takeOffPhase == EFE::Solver::TakeOffPhase::Airborne);
    assert(successState.takeOffFailureReason == EFE::Solver::TakeOffFailureReason::None);
    assert(successState.launchLiftReserve >= dragon->solver().config().minTakeOffLiftReserve);
    assert(successState.launchVerticalVelocity >= dragon->solver().config().minTakeOffVerticalVelocity);
    assert(successExpr.inAir == 1.f);
    assert(successExpr.takeOffReadiness == 1.f);

    auto damagedDragon = EFE::Debug::buildDragon(3, EFE::Vec3(0.f, 0.f, 0.f));
    const auto& damagedCfg = damagedDragon->solver().config();
    damagedDragon->body().node(damagedCfg.wingLTipNode)->structuralHP = 0.f;
    damagedDragon->body().node(damagedCfg.wingRTipNode)->structuralHP = 0.f;
    damagedDragon->intents().push(makeTakeOffIntent());
    damagedDragon->tick(fields, 1.f / 60.f);

    const auto& failState = damagedDragon->motorState();
    const auto& failExpr = damagedDragon->lastExpression();
    assert(failState.takeOffPhase == EFE::Solver::TakeOffPhase::Failed);
    assert(failState.takeOffFailureReason == EFE::Solver::TakeOffFailureReason::InsufficientLiftReserve);
    assert(failExpr.launchFailureReason ==
        static_cast<uint8_t>(EFE::Solver::TakeOffFailureReason::InsufficientLiftReserve));

    std::cout << "slice2 ok: phase=airborne"
              << " liftReserve=" << successState.launchLiftReserve
              << " verticalVelocity=" << successState.launchVerticalVelocity
              << " failureReason="
              << EFE::Solver::takeOffFailureReasonName(failState.takeOffFailureReason)
              << "\n";

    return 0;
}
