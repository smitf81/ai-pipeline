#pragma once
// =============================================================================
// fields/spatial_field.h — Layered continuous spatial field system
//
// PURPOSE:
//   Represents the world as overlapping continuous scalar/vector fields that
//   entities both read and write. This replaces discrete gameplay triggers.
//
// INTEGRATION NOTES:
//   - SpatialFieldGrid owns its own memory; no engine allocator assumed.
//     Swap allocator by overriding EFE_ALLOC/EFE_FREE macros before including.
//   - GPU acceleration: the grid is laid out for easy upload as a 3D texture.
//     See toGPUBuffer() for the expected format.
//   - For Axiom/ACE: register fields with FieldRegistry at world init, then
//     pass a FieldRegistry* into each EntityMotorSolver.
//   - HEURISTIC: Propagation and decay are first-order approximations. A
//     full fluid sim (Navier-Stokes) would replace propagate(). Hook point
//     is clearly marked below.
// =============================================================================

#if __has_include("../types.h")
#include "../types.h"
#else
#include "types.h"
#endif
#include <vector>
#include <array>
#include <unordered_map>
#include <string>
#include <functional>
#include <cstring>
#include <memory>
#include <algorithm>

#ifndef EFE_ALLOC
  #include <cstdlib>
  #define EFE_ALLOC(sz) std::malloc(sz)
  #define EFE_FREE(p)   std::free(p)
#endif

namespace EFE {
namespace Fields {

// ── Field type catalogue ──────────────────────────────────────────────────
// Add new types without touching existing code; systems filter by type.
enum class FieldType : uint16_t {
    Airflow            = 0,
    Pressure           = 1,
    Temperature        = 2,
    SoundPropagation   = 3,
    Visibility         = 4,
    MagicalInfluence   = 5,
    CrowdPressure      = 6,
    TerritorialDominance = 7,
    FearStress         = 8,
    TerrainStability   = 9,
    MomentumFlow       = 10,
    EcologicalDensity  = 11,
    // ── Add domain-specific types here ──
    Count              // sentinel
};

static constexpr size_t kFieldTypeCount = static_cast<size_t>(FieldType::Count);

// ── Per-cell value ─────────────────────────────────────────────────────────
// Scalar fields use only .value; vector fields use all components.
struct FieldCell {
    float value;     // primary scalar (e.g. pressure magnitude, fear level)
    Vec3  direction; // optional directional component (e.g. airflow vector)
};

// ── Propagation model ─────────────────────────────────────────────────────
enum class PropagationModel : uint8_t {
    None,           // No spread between cells
    Linear,         // Simple neighbor averaging (cheap, approximate)
    // HEURISTIC NOTE: Replace with FluidSim for physically accurate diffusion.
    // Hook: set model = FluidSim and implement your solver in propagate().
    FluidSim,       // Placeholder — requires external fluid solver integration
};

enum class DecayModel : uint8_t {
    None,
    Linear,         // value -= decayRate * dt
    Exponential,    // value *= exp(-decayRate * dt)
};

// ── Field descriptor ───────────────────────────────────────────────────────
struct FieldDescriptor {
    FieldType        type;
    PropagationModel propagation    = PropagationModel::Linear;
    DecayModel       decay          = DecayModel::Exponential;
    float            decayRate      = 1.0f;   // units/sec or 1/sec depending on model
    float            propagationRate = 0.5f;  // fraction of delta transferred per sec
    float            maxValue        = 1.0f;
    float            minValue        = 0.0f;
    bool             isVector        = false; // true: direction component is meaningful
    float            tickRateHz      = 60.0f; // <=0 ticks every call
    float            activeValueThreshold = 0.001f;
    uint32_t         activePaddingCells = 1;  // neighbor halo around dirty/active cells
    uint32_t         maxActiveCellsPerTick = 4096; // 0 = unlimited
};

struct FieldTickStats {
    uint32_t ticksRun = 0;
    uint32_t ticksSkipped = 0;
    uint32_t dirtyCellCount = 0;
    uint32_t activeCellCount = 0;
    uint32_t processedCellCount = 0;
    uint32_t decayedCellCount = 0;
    uint32_t propagatedCellCount = 0;
    bool budgetCapped = false;
    bool ranThisCall = false;
    float accumulatedDt = 0.f;
    float simulatedDt = 0.f;
};

struct FieldRegistryTickStats {
    uint32_t fieldCount = 0;
    uint32_t fieldsTicked = 0;
    uint32_t fieldsSkipped = 0;
    uint32_t dirtyCellCount = 0;
    uint32_t activeCellCount = 0;
    uint32_t processedCellCount = 0;
    bool budgetCapped = false;
};

// ── Uniform grid field ────────────────────────────────────────────────────
// Axis-aligned, uniform resolution. For non-uniform or octree variants,
// swap SpatialFieldGrid with your own type and keep the IField interface.
class SpatialFieldGrid {
public:
    SpatialFieldGrid(Vec3 origin, Vec3 cellSize, int nx, int ny, int nz,
                     const FieldDescriptor& desc)
        : origin_(origin), cellSize_(cellSize)
        , nx_(nx), ny_(ny), nz_(nz)
        , desc_(desc)
    {
        size_t count = static_cast<size_t>(nx) * ny * nz;
        cells_ = static_cast<FieldCell*>(EFE_ALLOC(count * sizeof(FieldCell)));
        assert(cells_ && "SpatialFieldGrid: allocation failed");
        dirtyMarks_.resize(count, 0);
        activeMarks_.resize(count, 0);
        workMarks_.resize(count, 0);
        nextActiveMarks_.resize(count, 0);
        clear();
    }

    ~SpatialFieldGrid() { EFE_FREE(cells_); }

    // No copy — grids can be large
    SpatialFieldGrid(const SpatialFieldGrid&) = delete;
    SpatialFieldGrid& operator=(const SpatialFieldGrid&) = delete;

    // ── World ↔ grid coordinate conversion ───────────────────────────────
    bool worldToCell(const Vec3& world, int& ox, int& oy, int& oz) const {
        Vec3 local = world - origin_;
        ox = static_cast<int>(local.x / cellSize_.x);
        oy = static_cast<int>(local.y / cellSize_.y);
        oz = static_cast<int>(local.z / cellSize_.z);
        return inBounds(ox, oy, oz);
    }

    Vec3 cellToWorld(int cx, int cy, int cz) const {
        return origin_ + Vec3(
            (cx + 0.5f) * cellSize_.x,
            (cy + 0.5f) * cellSize_.y,
            (cz + 0.5f) * cellSize_.z
        );
    }

    size_t cellCount() const {
        return static_cast<size_t>(nx_) * ny_ * nz_;
    }

    // ── Write ─────────────────────────────────────────────────────────────
    // Emit a source value into the grid. Additive — multiple emitters combine.
    void emit(const Vec3& worldPos, float value, const Vec3& dir = Vec3::zero()) {
        int cx, cy, cz;
        if (!worldToCell(worldPos, cx, cy, cz)) return;
        FieldCell& c = cell(cx, cy, cz);
        c.value     = std::min(c.value + value, desc_.maxValue);
        if (desc_.isVector) {
            c.direction = (c.direction + dir).normalized();
        }
        markDirty(cx, cy, cz);
    }

    // Splat with a radius (Gaussian falloff)
    void emitSphere(const Vec3& worldPos, float radius, float value,
                    const Vec3& dir = Vec3::zero())
    {
        int x0, y0, z0, x1, y1, z1;
        clampedRange(worldPos, radius, x0, y0, z0, x1, y1, z1);
        float r2 = radius * radius;
        for (int z = z0; z <= z1; ++z)
        for (int y = y0; y <= y1; ++y)
        for (int x = x0; x <= x1; ++x) {
            Vec3  cw   = cellToWorld(x, y, z);
            Vec3  diff = cw - worldPos;
            float d2   = diff.lengthSq();
            if (d2 > r2) continue;
            float falloff = 1.f - (d2 / r2); // linear; swap to Gaussian if desired
            emit(cw, value * falloff, dir);
        }
    }

    // ── Read (trilinear interpolation) ────────────────────────────────────
    FieldCell sampleAt(const Vec3& worldPos) const {
        int cx, cy, cz;
        if (!worldToCell(worldPos, cx, cy, cz)) return {};

        // Trilinear interpolation weights
        Vec3  local = worldPos - origin_;
        float lx = local.x / cellSize_.x - cx;
        float ly = local.y / cellSize_.y - cy;
        float lz = local.z / cellSize_.z - cz;

        FieldCell result{};
        float totalW = 0.f;
        for (int dz = 0; dz <= 1; ++dz)
        for (int dy = 0; dy <= 1; ++dy)
        for (int dx = 0; dx <= 1; ++dx) {
            int nx = cx+dx, ny = cy+dy, nz = cz+dz;
            if (!inBounds(nx, ny, nz)) continue;
            float w = (dx ? lx : 1.f-lx) * (dy ? ly : 1.f-ly) * (dz ? lz : 1.f-lz);
            const FieldCell& nc = cell(nx, ny, nz);
            result.value     += nc.value * w;
            result.direction  = result.direction + nc.direction * w;
            totalW += w;
        }
        if (totalW > 1e-6f) {
            result.value    /= totalW;
            result.direction = result.direction / totalW;
        }
        return result;
    }

    // ── Simulate one tick ─────────────────────────────────────────────────
    void tick(float dt) {
        lastStats_.ranThisCall = false;
        tickAccumulator_ += dt;

        if (desc_.tickRateHz > 0.f) {
            float interval = 1.f / std::max(desc_.tickRateHz, 0.001f);
            if (tickAccumulator_ + 1e-6f < interval) {
                ++lastStats_.ticksSkipped;
                lastStats_.accumulatedDt = tickAccumulator_;
                return;
            }
        }

        float stepDt = tickAccumulator_;
        tickAccumulator_ = 0.f;
        lastStats_.ranThisCall = true;
        lastStats_.simulatedDt = stepDt;
        lastStats_.accumulatedDt = 0.f;
        ++lastStats_.ticksRun;

        std::vector<size_t> workset;
        buildActiveWorkset(workset);
        lastStats_.dirtyCellCount = static_cast<uint32_t>(dirtyIndices_.size());
        lastStats_.budgetCapped = false;

        size_t processCount = workset.size();
        if (desc_.maxActiveCellsPerTick > 0 &&
            processCount > static_cast<size_t>(desc_.maxActiveCellsPerTick)) {
            processCount = desc_.maxActiveCellsPerTick;
            lastStats_.budgetCapped = true;
        }

        lastStats_.processedCellCount = static_cast<uint32_t>(processCount);
        lastStats_.decayedCellCount = decayActive(stepDt, workset, processCount);
        lastStats_.propagatedCellCount = propagateActive(stepDt, workset, processCount);
        rebuildActiveSet(workset, processCount);
        lastStats_.activeCellCount = static_cast<uint32_t>(activeIndices_.size());
        clearDirtySet();
    }

    // ── GPU upload helper ──────────────────────────────────────────────────
    // Fills a caller-supplied buffer (nx*ny*nz floats) with scalar values.
    // Extend to RGBA if you need vector fields on GPU.
    void toGPUBuffer(float* outScalar) const {
        size_t count = static_cast<size_t>(nx_) * ny_ * nz_;
        for (size_t i = 0; i < count; ++i)
            outScalar[i] = cells_[i].value;
    }

    // ── Accessors ──────────────────────────────────────────────────────────
    const FieldDescriptor& descriptor() const { return desc_; }
    int nx() const { return nx_; }
    int ny() const { return ny_; }
    int nz() const { return nz_; }
    Vec3 origin()   const { return origin_; }
    Vec3 cellSize() const { return cellSize_; }
    const FieldTickStats& lastTickStats() const { return lastStats_; }
    uint32_t dirtyCellCount() const { return static_cast<uint32_t>(dirtyIndices_.size()); }
    uint32_t activeCellCount() const { return static_cast<uint32_t>(activeIndices_.size()); }

    void clear() {
        size_t count = cellCount();
        for (size_t i = 0; i < count; ++i) cells_[i] = FieldCell{};
        std::fill(dirtyMarks_.begin(), dirtyMarks_.end(), uint8_t{0});
        std::fill(activeMarks_.begin(), activeMarks_.end(), uint8_t{0});
        std::fill(workMarks_.begin(), workMarks_.end(), uint8_t{0});
        std::fill(nextActiveMarks_.begin(), nextActiveMarks_.end(), uint8_t{0});
        dirtyIndices_.clear();
        activeIndices_.clear();
        tickAccumulator_ = 0.f;
        lastStats_ = FieldTickStats{};
    }

private:
    bool inBounds(int x, int y, int z) const {
        return x>=0 && x<nx_ && y>=0 && y<ny_ && z>=0 && z<nz_;
    }

    size_t cellIndex(int x, int y, int z) const {
        return static_cast<size_t>(z) * ny_ * nx_ +
               static_cast<size_t>(y) * nx_ +
               static_cast<size_t>(x);
    }

    void indexToCell(size_t idx, int& x, int& y, int& z) const {
        size_t plane = static_cast<size_t>(ny_) * nx_;
        z = static_cast<int>(idx / plane);
        size_t rem = idx - static_cast<size_t>(z) * plane;
        y = static_cast<int>(rem / nx_);
        x = static_cast<int>(rem - static_cast<size_t>(y) * nx_);
    }

    FieldCell& cell(int x, int y, int z) {
        return cells_[cellIndex(x, y, z)];
    }
    const FieldCell& cell(int x, int y, int z) const {
        return cells_[cellIndex(x, y, z)];
    }

    void markDirty(int x, int y, int z) {
        if (!inBounds(x, y, z)) return;
        size_t idx = cellIndex(x, y, z);
        if (dirtyMarks_[idx]) return;
        dirtyMarks_[idx] = 1;
        dirtyIndices_.push_back(idx);
    }

    void addWorkIndex(std::vector<size_t>& workset, size_t idx) {
        if (idx >= cellCount() || workMarks_[idx]) return;
        workMarks_[idx] = 1;
        workset.push_back(idx);
    }

    void addWorkNeighborhood(std::vector<size_t>& workset, size_t idx, uint32_t radius) {
        int cx, cy, cz;
        indexToCell(idx, cx, cy, cz);
        int r = static_cast<int>(radius);
        for (int z = std::max(0, cz - r); z <= std::min(nz_ - 1, cz + r); ++z)
        for (int y = std::max(0, cy - r); y <= std::min(ny_ - 1, cy + r); ++y)
        for (int x = std::max(0, cx - r); x <= std::min(nx_ - 1, cx + r); ++x) {
            addWorkIndex(workset, cellIndex(x, y, z));
        }
    }

    void buildActiveWorkset(std::vector<size_t>& workset) {
        uint32_t radius = std::max(1u, desc_.activePaddingCells);
        for (size_t idx : activeIndices_) {
            addWorkNeighborhood(workset, idx, radius);
        }
        for (size_t idx : dirtyIndices_) {
            addWorkNeighborhood(workset, idx, radius);
        }
    }

    uint32_t decayActive(float dt, const std::vector<size_t>& workset, size_t processCount) {
        if (desc_.decay == DecayModel::None) return 0;
        uint32_t count = 0;
        float factor = desc_.decay == DecayModel::Exponential
            ? std::exp(-desc_.decayRate * dt)
            : 1.f;

        for (size_t i = 0; i < processCount; ++i) {
            FieldCell& c = cells_[workset[i]];
            switch (desc_.decay) {
                case DecayModel::Linear:
                    c.value = std::max(desc_.minValue, c.value - desc_.decayRate * dt);
                    break;
                case DecayModel::Exponential:
                    c.value = std::max(desc_.minValue, c.value * factor);
                    break;
                default:
                    break;
            }
            ++count;
        }
        return count;
    }

    uint32_t propagateActive(float dt, const std::vector<size_t>& workset, size_t processCount) {
        if (desc_.propagation != PropagationModel::Linear) return 0;

        propagationIndices_.clear();
        propagationValues_.clear();
        propagationIndices_.reserve(processCount);
        propagationValues_.reserve(processCount);

        float alpha = std::clamp(desc_.propagationRate * dt, 0.f, 1.f);
        for (size_t i = 0; i < processCount; ++i) {
            int x, y, z;
            indexToCell(workset[i], x, y, z);
            if (x <= 0 || x >= nx_ - 1 ||
                y <= 0 || y >= ny_ - 1 ||
                z <= 0 || z >= nz_ - 1) {
                continue;
            }

            float avg = (
                cell(x + 1, y, z).value +
                cell(x - 1, y, z).value +
                cell(x, y + 1, z).value +
                cell(x, y - 1, z).value +
                cell(x, y, z + 1).value +
                cell(x, y, z - 1).value
            ) / 6.f;
            float value = cells_[workset[i]].value;
            float next = std::clamp(value + alpha * (avg - value),
                desc_.minValue, desc_.maxValue);
            propagationIndices_.push_back(workset[i]);
            propagationValues_.push_back(next);
        }

        for (size_t i = 0; i < propagationIndices_.size(); ++i) {
            cells_[propagationIndices_[i]].value = propagationValues_[i];
        }
        return static_cast<uint32_t>(propagationIndices_.size());
    }

    void appendNextActive(size_t idx) {
        if (idx >= cellCount() || nextActiveMarks_[idx]) return;
        nextActiveMarks_[idx] = 1;
        nextActiveIndices_.push_back(idx);
    }

    void appendNextActiveNeighborhood(size_t idx, uint32_t radius) {
        int cx, cy, cz;
        indexToCell(idx, cx, cy, cz);
        int r = static_cast<int>(radius);
        for (int z = std::max(0, cz - r); z <= std::min(nz_ - 1, cz + r); ++z)
        for (int y = std::max(0, cy - r); y <= std::min(ny_ - 1, cy + r); ++y)
        for (int x = std::max(0, cx - r); x <= std::min(nx_ - 1, cx + r); ++x) {
            appendNextActive(cellIndex(x, y, z));
        }
    }

    void rebuildActiveSet(const std::vector<size_t>& workset, size_t processCount) {
        nextActiveIndices_.clear();
        uint32_t radius = std::max(1u, desc_.activePaddingCells);
        for (size_t i = processCount; i < workset.size(); ++i) {
            appendNextActive(workset[i]);
        }
        for (size_t i = 0; i < processCount; ++i) {
            size_t idx = workset[i];
            if (cells_[idx].value > desc_.activeValueThreshold || dirtyMarks_[idx]) {
                appendNextActiveNeighborhood(idx, radius);
            }
        }

        for (size_t idx : activeIndices_) {
            activeMarks_[idx] = 0;
        }
        activeIndices_.clear();
        activeIndices_.swap(nextActiveIndices_);
        for (size_t idx : activeIndices_) {
            activeMarks_[idx] = 1;
            nextActiveMarks_[idx] = 0;
        }
        for (size_t idx : workset) {
            workMarks_[idx] = 0;
        }
    }

    void clearDirtySet() {
        for (size_t idx : dirtyIndices_) {
            dirtyMarks_[idx] = 0;
        }
        dirtyIndices_.clear();
    }

    void clampedRange(const Vec3& center, float radius,
                      int& x0, int& y0, int& z0,
                      int& x1, int& y1, int& z1) const
    {
        auto clamp = [](int v, int lo, int hi) { return v<lo?lo:v>hi?hi:v; };
        int rx = static_cast<int>(std::ceil(radius / cellSize_.x));
        int ry = static_cast<int>(std::ceil(radius / cellSize_.y));
        int rz = static_cast<int>(std::ceil(radius / cellSize_.z));
        int cx, cy, cz;
        worldToCell(center, cx, cy, cz);
        x0 = clamp(cx-rx, 0, nx_-1); x1 = clamp(cx+rx, 0, nx_-1);
        y0 = clamp(cy-ry, 0, ny_-1); y1 = clamp(cy+ry, 0, ny_-1);
        z0 = clamp(cz-rz, 0, nz_-1); z1 = clamp(cz+rz, 0, nz_-1);
    }

    Vec3             origin_;
    Vec3             cellSize_;
    int              nx_, ny_, nz_;
    FieldDescriptor  desc_;
    FieldCell*       cells_;
    std::vector<uint8_t> dirtyMarks_;
    std::vector<uint8_t> activeMarks_;
    std::vector<uint8_t> workMarks_;
    std::vector<uint8_t> nextActiveMarks_;
    std::vector<size_t>  dirtyIndices_;
    std::vector<size_t>  activeIndices_;
    std::vector<size_t>  nextActiveIndices_;
    std::vector<size_t>  propagationIndices_;
    std::vector<float>   propagationValues_;
    FieldTickStats       lastStats_;
    float                tickAccumulator_ = 0.f;
};

// ── Field registry ────────────────────────────────────────────────────────
// Central store for all world fields. Pass by pointer into subsystems.
class FieldRegistry {
public:
    // Register a field. Returns assigned FieldID.
    FieldID registerField(std::unique_ptr<SpatialFieldGrid> grid) {
        FieldID id = static_cast<FieldID>(grids_.size());
        typeIndex_[static_cast<size_t>(grid->descriptor().type)].push_back(id);
        grids_.push_back(std::move(grid));
        return id;
    }

    SpatialFieldGrid* get(FieldID id) {
        return (id < grids_.size()) ? grids_[id].get() : nullptr;
    }

    // Returns all fields of a given type (there can be multiple, e.g. two airflow zones)
    const std::vector<FieldID>& fieldsOfType(FieldType t) const {
        static const std::vector<FieldID> empty;
        auto it = typeIndex_.find(static_cast<size_t>(t));
        return (it != typeIndex_.end()) ? it->second : empty;
    }

    // Sample the strongest (highest value) field of a type at a world position
    FieldCell sampleBest(FieldType type, const Vec3& worldPos) const {
        FieldCell best{};
        for (FieldID id : fieldsOfType(type)) {
            FieldCell c = grids_[id]->sampleAt(worldPos);
            if (c.value > best.value) best = c;
        }
        return best;
    }

    void tick(float dt) {
        lastStats_ = FieldRegistryTickStats{};
        lastStats_.fieldCount = static_cast<uint32_t>(grids_.size());
        for (auto& g : grids_) {
            g->tick(dt);
            const FieldTickStats& s = g->lastTickStats();
            if (s.ranThisCall) {
                ++lastStats_.fieldsTicked;
            } else {
                ++lastStats_.fieldsSkipped;
            }
            lastStats_.dirtyCellCount += s.dirtyCellCount;
            lastStats_.activeCellCount += s.activeCellCount;
            lastStats_.processedCellCount += s.processedCellCount;
            lastStats_.budgetCapped = lastStats_.budgetCapped || s.budgetCapped;
        }
    }

    const FieldRegistryTickStats& lastTickStats() const { return lastStats_; }

private:
    std::vector<std::unique_ptr<SpatialFieldGrid>>      grids_;
    std::unordered_map<size_t, std::vector<FieldID>>    typeIndex_;
    FieldRegistryTickStats                              lastStats_;
};

} // namespace Fields
} // namespace EFE
