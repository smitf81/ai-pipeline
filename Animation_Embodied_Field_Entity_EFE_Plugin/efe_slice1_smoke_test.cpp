#include "dragon_builder.h"

#include <cassert>
#include <iostream>

int main()
{
    EFE::Fields::FieldRegistry fields;
    auto dragon = EFE::Debug::buildDragon(1, EFE::Vec3(0.f, 0.f, 0.f));

    const auto before = EFE::Debug::validateDragonBuild(*dragon);
    assert(before.readyToTick());

    const float gaitBefore = dragon->motorState().gaitPhase;
    const float breathBefore = dragon->lastExpression().breathPhase;

    dragon->tick(fields, 1.f / 60.f);

    const auto after = EFE::Debug::validateDragonBuild(*dragon);
    assert(after.readyToTick());
    assert(after.nodeCount == before.nodeCount);
    assert(after.constraintCount == before.constraintCount);
    assert(dragon->motorState().gaitPhase != gaitBefore);
    assert(dragon->lastExpression().breathPhase != breathBefore);
    assert(dragon->lastExpression().alertness > 0.f);

    std::cout << "slice1 ok: nodes=" << after.nodeCount
              << " constraints=" << after.constraintCount
              << " groundNodes=" << after.validGroundNodeCount
              << " gaitPhase=" << dragon->motorState().gaitPhase
              << " breathPhase=" << dragon->lastExpression().breathPhase
              << "\n";

    return 0;
}
