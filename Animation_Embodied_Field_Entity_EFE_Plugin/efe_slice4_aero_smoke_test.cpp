#include "dragon_builder.h"

#include <cassert>
#include <iostream>

namespace {

EFE::Entity::Intent makeGlideIntent()
{
    EFE::Entity::Intent glide;
    glide.type = EFE::Entity::IntentType::Glide;
    glide.priority = 1.0f;
    glide.weight = 1.0f;
    glide.mods.urgency = 1.0f;
    glide.mods.targetWorldPos = EFE::Vec3(0.f, 4.f, 30.f);
    return glide;
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
    EFE::Fields::FieldRegistry fields;

    auto dragon = EFE::Debug::buildDragon(6, EFE::Vec3(0.f, 0.f, 0.f));
    assert(EFE::Debug::validateDragonBuild(*dragon).readyToTick());
    setBodyVelocity(dragon->body(), EFE::Vec3(0.f, 0.f, 12.f));
    dragon->intents().push(makeGlideIntent());
    dragon->tick(fields, 1.f / 60.f);

    const auto& glideState = dragon->motorState();
    const auto& glideExpr = dragon->lastExpression();
    assert(glideState.aeroPanelCount >= 8.f);
    assert(glideState.aeroLiftTotal > 0.f);
    assert(glideState.aeroDragTotal > 0.f);
    assert(glideState.wingLoadL > 0.f);
    assert(glideState.wingLoadR > 0.f);
    assert(glideExpr.aeroLiftTotal == glideState.aeroLiftTotal);
    assert(glideExpr.aeroPanelCount == glideState.aeroPanelCount);

    auto damagedDragon = EFE::Debug::buildDragon(7, EFE::Vec3(0.f, 0.f, 0.f));
    const auto& damagedCfg = damagedDragon->solver().config();
    damagedDragon->body().node(damagedCfg.wingLTipNode)->structuralHP = 0.f;
    setBodyVelocity(damagedDragon->body(), EFE::Vec3(0.f, 0.f, 12.f));
    damagedDragon->intents().push(makeGlideIntent());
    damagedDragon->tick(fields, 1.f / 60.f);

    const auto& damagedState = damagedDragon->motorState();
    assert(damagedState.aeroPanelCount >= 8.f);
    assert(damagedState.wingLoadL < damagedState.wingLoadR);

    auto stalledDragon = EFE::Debug::buildDragon(8, EFE::Vec3(0.f, 0.f, 0.f));
    setBodyVelocity(stalledDragon->body(), EFE::Vec3(0.f, -18.f, 0.f));
    stalledDragon->intents().push(makeGlideIntent());
    stalledDragon->tick(fields, 1.f / 60.f);

    const auto& stalledState = stalledDragon->motorState();
    assert(stalledState.aeroPanelCount >= 8.f);
    assert(stalledState.aeroStallL > 0.f || stalledState.aeroStallR > 0.f);

    std::cout << "slice4 ok: panels=" << glideState.aeroPanelCount
              << " lift=" << glideState.aeroLiftTotal
              << " drag=" << glideState.aeroDragTotal
              << " asymL=" << damagedState.wingLoadL
              << " asymR=" << damagedState.wingLoadR
              << " stallL=" << stalledState.aeroStallL
              << " stallR=" << stalledState.aeroStallR
              << "\n";

    return 0;
}
