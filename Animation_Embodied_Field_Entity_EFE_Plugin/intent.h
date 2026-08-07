#pragma once
// =============================================================================
// entity/intent.h — High-level intent encoding
//
// PURPOSE:
//   Intent is not an animation state machine. It biases force priorities in
//   the motor solver. Multiple intents can coexist with weights.
//
// INTEGRATION NOTES:
//   - IntentStack is a small fixed-capacity priority queue (no heap alloc).
//   - For AI integration: your behaviour tree / GOAP / utility AI writes
//     intents here. The motor solver reads them — no direct animation calls.
//   - IntentModifiers carry float parameters so one IntentType covers a
//     continuous range of behaviours (e.g. pursue at varying urgency).
// =============================================================================

#if __has_include("../types.h")
#include "../types.h"
#else
#include "types.h"
#endif
#include <array>
#include <algorithm>
#include <string_view>

namespace EFE {
namespace Entity {

enum class IntentType : uint16_t {
    // Locomotion
    Idle            = 0,
    Pursue,           // move toward a target
    Evade,            // move away from a threat
    Land,
    TakeOff,
    Stabilize,        // resist perturbation, maintain current pose
    Climb,
    Glide,
    Dive,
    // Combat
    Strike,
    Parry,
    Recoil,
    ProtectLimb,      // guard a specific body region
    RecoverBalance,
    // Biological
    Breathe,          // respiratory rhythm (always present, low priority)
    Intimidate,
    Rest,
    Feed,
    Flee,
    // Social / ecological
    FlockAlign,       // match velocity to neighbours
    FlockCohesion,    // move toward group centre
    FlockSeparate,    // avoid crowding
    TerritorialClaim,
    // Extension point — add domain-specific types here
    Custom0 = 200,
    Custom1,
    Custom2,
    Custom3,
    Count = 256
};

// ── Intent modifier bag ───────────────────────────────────────────────────
// Carries contextual parameters without allocation.
struct IntentModifiers {
    Vec3    targetWorldPos  = Vec3::zero(); // for Pursue, Land, Strike, etc.
    EntityID targetEntity   = kInvalidEntity;
    NodeID   protectNode    = kInvalidNode; // for ProtectLimb
    float    urgency        = 1.0f;         // 0–1 scalar affecting force magnitude
    float    param0         = 0.0f;         // domain-specific float slot
    float    param1         = 0.0f;
};

// ── A single active intent ────────────────────────────────────────────────
struct Intent {
    IntentType      type     = IntentType::Idle;
    float           weight   = 1.0f;   // 0–1; multiple intents blend by weight
    float           priority = 0.0f;   // higher = more dominant in conflict
    IntentModifiers mods;
};

// ── Intent stack (no dynamic allocation) ─────────────────────────────────
// Keeps up to kMaxIntents concurrent intents, sorted by priority descending.
class IntentStack {
public:
    static constexpr size_t kMaxIntents = 8;

    // Push or update an intent. If the type already exists, replaces it.
    void push(const Intent& intent) {
        // Find existing slot for same type
        for (auto& slot : slots_) {
            if (slot.type == intent.type) {
                slot = intent;
                sort();
                return;
            }
        }
        // Find an empty slot
        for (auto& slot : slots_) {
            if (slot.type == IntentType::Idle && slot.weight < 0.001f) {
                slot = intent;
                sort();
                return;
            }
        }
        // Evict lowest-priority if full
        auto* lowest = &slots_[0];
        for (auto& s : slots_)
            if (s.priority < lowest->priority) lowest = &s;
        if (intent.priority > lowest->priority) {
            *lowest = intent;
            sort();
        }
    }

    void remove(IntentType type) {
        for (auto& slot : slots_)
            if (slot.type == type) { slot = Intent{}; break; }
        sort();
    }

    void clear() {
        for (auto& s : slots_) s = Intent{};
        count_ = 0;
    }

    // Returns true if any active intent matches the given type
    bool has(IntentType type) const {
        for (size_t i = 0; i < count_; ++i)
            if (slots_[i].type == type) return true;
        return false;
    }

    const Intent* get(IntentType type) const {
        for (size_t i = 0; i < count_; ++i)
            if (slots_[i].type == type) return &slots_[i];
        return nullptr;
    }

    // Dominant intent (highest priority)
    const Intent& dominant() const {
        return (count_ > 0) ? slots_[0] : kNullIntent;
    }

    size_t count() const { return count_; }

    // Iterate active intents in priority order
    const Intent* begin() const { return slots_.data(); }
    const Intent* end()   const { return slots_.data() + count_; }

    // Aggregate urgency across all active intents (weighted sum, clamped)
    float totalUrgency() const {
        float u = 0.f;
        for (size_t i = 0; i < count_; ++i)
            u += slots_[i].weight * slots_[i].mods.urgency;
        return std::min(u, 1.0f);
    }

private:
    void sort() {
        std::sort(slots_.begin(), slots_.end(),
            [](const Intent& a, const Intent& b) {
                return a.priority > b.priority; // descending
            });
        count_ = 0;
        for (const auto& s : slots_)
            if (s.weight > 0.001f) ++count_;
            else break;
    }

    std::array<Intent, kMaxIntents> slots_{};
    size_t count_ = 0;

    static const Intent kNullIntent;
};

inline const Intent IntentStack::kNullIntent = {};

} // namespace Entity
} // namespace EFE
