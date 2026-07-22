#include "spatial_field.h"

#include <cassert>
#include <iostream>
#include <memory>

int main()
{
    EFE::Fields::FieldDescriptor slowDesc{};
    slowDesc.type = EFE::Fields::FieldType::Airflow;
    slowDesc.isVector = true;
    slowDesc.decay = EFE::Fields::DecayModel::Linear;
    slowDesc.decayRate = 0.05f;
    slowDesc.propagation = EFE::Fields::PropagationModel::Linear;
    slowDesc.propagationRate = 0.5f;
    slowDesc.tickRateHz = 10.f;
    slowDesc.activeValueThreshold = 0.0001f;
    slowDesc.activePaddingCells = 1;
    slowDesc.maxActiveCellsPerTick = 12;

    EFE::Fields::FieldRegistry registry;
    auto slowGrid = std::make_unique<EFE::Fields::SpatialFieldGrid>(
        EFE::Vec3(0.f, 0.f, 0.f),
        EFE::Vec3(1.f, 1.f, 1.f),
        8, 8, 8,
        slowDesc);
    slowGrid->emitSphere(EFE::Vec3(4.f, 4.f, 4.f), 1.6f, 0.8f, EFE::Vec3(1.f, 0.f, 0.f));
    const uint32_t dirtyBeforeRegister = slowGrid->dirtyCellCount();
    assert(dirtyBeforeRegister > 0);
    EFE::FieldID slowId = registry.registerField(std::move(slowGrid));

    registry.tick(1.f / 60.f);
    const auto& skippedRegistryStats = registry.lastTickStats();
    auto* registeredSlowGrid = registry.get(slowId);
    assert(registeredSlowGrid);
    assert(skippedRegistryStats.fieldsSkipped == 1);
    assert(registeredSlowGrid->dirtyCellCount() == dirtyBeforeRegister);
    assert(registeredSlowGrid->lastTickStats().accumulatedDt > 0.f);

    registry.tick(0.1f);
    const auto& runRegistryStats = registry.lastTickStats();
    const auto& slowStats = registeredSlowGrid->lastTickStats();
    assert(runRegistryStats.fieldsTicked == 1);
    assert(runRegistryStats.budgetCapped);
    assert(slowStats.ranThisCall);
    assert(slowStats.dirtyCellCount == dirtyBeforeRegister);
    assert(slowStats.processedCellCount <= slowDesc.maxActiveCellsPerTick);
    assert(slowStats.activeCellCount > 0);
    assert(registry.sampleBest(EFE::Fields::FieldType::Airflow,
        EFE::Vec3(4.f, 4.f, 4.f)).value > 0.f);

    EFE::Fields::FieldDescriptor uncappedDesc = slowDesc;
    uncappedDesc.tickRateHz = 0.f;
    uncappedDesc.maxActiveCellsPerTick = 0;
    EFE::Fields::SpatialFieldGrid uncappedGrid(
        EFE::Vec3(0.f, 0.f, 0.f),
        EFE::Vec3(1.f, 1.f, 1.f),
        8, 8, 8,
        uncappedDesc);
    uncappedGrid.emit(EFE::Vec3(4.f, 4.f, 4.f), 0.9f, EFE::Vec3(0.f, 1.f, 0.f));
    uncappedGrid.tick(1.f / 60.f);
    const auto& uncappedStats = uncappedGrid.lastTickStats();
    assert(uncappedStats.ranThisCall);
    assert(uncappedStats.processedCellCount > 0);
    assert(uncappedStats.processedCellCount < uncappedGrid.cellCount());
    assert(!uncappedStats.budgetCapped);
    assert(uncappedStats.activeCellCount > 0);

    std::cout << "slice5 ok: dirty=" << dirtyBeforeRegister
              << " cappedProcessed=" << slowStats.processedCellCount
              << " active=" << slowStats.activeCellCount
              << " uncappedProcessed=" << uncappedStats.processedCellCount
              << " totalCells=" << uncappedGrid.cellCount()
              << "\n";

    return 0;
}
