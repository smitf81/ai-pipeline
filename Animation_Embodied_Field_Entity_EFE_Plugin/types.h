#pragma once
// =============================================================================
// types.h — Shared primitives for the Embodied Field Entity system
//
// INTEGRATION NOTES (ACE/Axiom):
//   - Replace Vec3, Quat, Mat4 with your engine's math types via the typedefs below.
//   - EntityID / FieldID are plain uint32_t handles; swap for your ECS handle type.
//   - All timestamps are in seconds (float). Map to your engine's time unit if needed.
//   - No STL containers cross API boundaries; internal use only.
// =============================================================================

#include <cstdint>
#include <cmath>
#include <cassert>
#include <cfloat>

namespace EFE { // Embodied Field Entity

// ── Swap these four aliases to your engine's math library ──────────────────
struct Vec3 {
    float x, y, z;
    Vec3() : x(0), y(0), z(0) {}
    Vec3(float x, float y, float z) : x(x), y(y), z(z) {}
    Vec3 operator+(const Vec3& o) const { return {x+o.x, y+o.y, z+o.z}; }
    Vec3 operator-(const Vec3& o) const { return {x-o.x, y-o.y, z-o.z}; }
    Vec3 operator*(float s)       const { return {x*s, y*s, z*s}; }
    Vec3 operator/(float s)       const { return {x/s, y/s, z/s}; }
    Vec3& operator+=(const Vec3& o) { x+=o.x; y+=o.y; z+=o.z; return *this; }
    float dot(const Vec3& o)  const { return x*o.x + y*o.y + z*o.z; }
    Vec3  cross(const Vec3& o) const {
        return {y*o.z - z*o.y, z*o.x - x*o.z, x*o.y - y*o.x};
    }
    float lengthSq() const { return dot(*this); }
    float length()   const { return std::sqrt(lengthSq()); }
    Vec3  normalized() const {
        float l = length();
        return (l > 1e-6f) ? (*this / l) : Vec3{};
    }
    static Vec3 zero()  { return {0,0,0}; }
    static Vec3 up()    { return {0,1,0}; }
    static Vec3 lerp(const Vec3& a, const Vec3& b, float t) {
        return a + (b - a) * t;
    }
};

struct Quat {
    float x, y, z, w;
    Quat() : x(0), y(0), z(0), w(1) {}
    Quat(float x, float y, float z, float w) : x(x), y(y), z(z), w(w) {}
    static Quat identity() { return {0,0,0,1}; }
    Quat operator*(const Quat& o) const {
        return {
            w*o.x + x*o.w + y*o.z - z*o.y,
            w*o.y - x*o.z + y*o.w + z*o.x,
            w*o.z + x*o.y - y*o.x + z*o.w,
            w*o.w - x*o.x - y*o.y - z*o.z
        };
    }
    Vec3 rotate(const Vec3& v) const {
        // Rodrigues via double cross
        Vec3 u{x,y,z};
        float s = w;
        return u * (2.f * u.dot(v))
             + v  * (s*s - u.dot(u))
             + u.cross(v) * (2.f * s);
    }
    static Quat fromAxisAngle(Vec3 axis, float rad) {
        float s = std::sin(rad * 0.5f);
        Vec3  a = axis.normalized();
        return {a.x*s, a.y*s, a.z*s, std::cos(rad * 0.5f)};
    }
    Quat normalized() const {
        float l = std::sqrt(x*x+y*y+z*z+w*w);
        return (l > 1e-6f) ? Quat{x/l,y/l,z/l,w/l} : identity();
    }
    static Quat lerp(const Quat& a, const Quat& b, float t) {
        // Simple lerp + renorm (use slerp if your engine provides it)
        float dt = a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w;
        float s  = (dt < 0.f) ? -1.f : 1.f;
        return Quat{a.x + s*b.x*t, a.y + s*b.y*t,
                    a.z + s*b.z*t, a.w + s*b.w*t}.normalized();
    }
};

using EntityID = uint32_t;
using FieldID  = uint32_t;
using NodeID   = uint32_t;
using EdgeID   = uint32_t;

constexpr EntityID kInvalidEntity = UINT32_MAX;
constexpr FieldID  kInvalidField  = UINT32_MAX;
constexpr NodeID   kInvalidNode   = UINT32_MAX;

// ── Simulation LOD — controls fidelity by distance from camera ────────────
enum class SimLOD : uint8_t {
    Full     = 0,  // Full constraint + field + expression
    Reduced  = 1,  // Constraint solver only, no expression layer
    Abstract = 2,  // Field agent only, no constraint graph
    Culled   = 3,  // Not simulated
};

// ── Force application descriptor ──────────────────────────────────────────
struct ForceApplication {
    Vec3   worldPoint;    // World-space point of application
    Vec3   impulse;       // N·s (instantaneous) or N (sustained per-second)
    NodeID targetNode;    // kInvalidNode = closest node resolved at runtime
    bool   isImpulse;     // true = single-frame impulse, false = sustained force
};

} // namespace EFE
