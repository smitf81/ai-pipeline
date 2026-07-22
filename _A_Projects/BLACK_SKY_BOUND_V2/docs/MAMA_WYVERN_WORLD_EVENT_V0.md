# Mama Wyvern World Event v0

Mama Wyvern is a world-owned spatial event, not a giant combat actor and not a renderer-only effect.

## Event flow

`warning roar -> shadow flyover -> optional inferno wall -> residual burnout`

- Automatic events begin after a quiet opening interval and recur on a bounded deterministic cadence.
- Automatic events alternate between a visual flyover and an inferno flyover.
- The shadow mesh is rebuilt from the live player wyvern projection, enlarged, darkened, rotated, and swept through world space.
- Inferno walls do not propagate. They persist for 18 seconds and gradually lose damage, slow, light, flame height, and smoke.

## Gameplay ownership

- `worldEventSystem` owns event timing, fire-wall lifetime, all-damageable hit checks, slow application, and AI avoidance pressure.
- Fire damage is faction-neutral and can damage the player, enemies, and damageable spawner fixtures.
- Enemy avoidance reuses the existing retreat/steering path. It does not add pathfinding or let units ghost through blockers.
- `game.spatialHazards` exposes active barriers for diagnostics and later steering improvements.
- Existing light and smoke projection paths consume the residual fire; the world-event renderer does not invent duplicate light truth.

## Manual validation controls

The normal play view stays uncluttered. Manual controls live on the existing browser app object:

```js
app.worldEvents.flyover()
app.worldEvents.inferno()
app.worldEvents.lightningFlyover()
app.worldEvents.lightningInferno()
app.worldEvents.setAutoEnabled(false)
```

The same one-shot controls are available as query parameters:

```text
?mamaEvent=flyover
?mamaEvent=inferno
?mamaEvent=lightning-flyover
?mamaEvent=lightning-inferno
?mamaAuto=0
```

Lightning-sync modes queue a real storm scene-light flash when the shadow flyover begins. They exist to validate the enlarged silhouette against the same lighting and shadow system used by natural lightning.

## Deliberately out of scope

- egg-emergence opening;
- a targetable Mama Wyvern actor;
- propagating fire or a general fire simulation;
- new pathfinding/navmesh work;
- new authored dragon assets;
- a permanent debug panel.
