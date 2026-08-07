export function buildUnitSpawnerFixtureProjection(fixtures, tileSize) {
  return fixtures.map((fixture) => {
    const healthRatio = fixture.maxHp > 0 ? Math.max(0, Math.min(1, fixture.hp / fixture.maxHp)) : 0;
    const worldRadius = Math.max(3, (fixture.radius ?? fixture.fixtureRadiusTiles ?? 0.48) * tileSize);
    return {
      classification: 'renderer_neutral_unit_spawner_fixture_projection',
      id: fixture.id,
      spawnerId: fixture.spawnerId,
      label: fixture.label,
      type: fixture.type,
      team: fixture.team,
      alive: fixture.alive !== false,
      enabled: fixture.enabled !== false,
      destroyed: fixture.destroyed === true,
      x: fixture.x,
      y: fixture.y,
      worldX: fixture.x * tileSize,
      worldY: fixture.y * tileSize,
      radius: fixture.radius,
      worldRadius,
      hp: fixture.hp,
      maxHp: fixture.maxHp,
      healthRatio,
      cooldownSeconds: fixture.cooldownSeconds,
      spawnedCount: fixture.spawnedCount,
      aliveCount: fixture.aliveCount,
      spawnRadiusTiles: fixture.spawnRadiusTiles,
      worldSpawnRadius: Math.max(0, (fixture.spawnRadiusTiles ?? 0) * tileSize),
      depthY: fixture.y * tileSize + worldRadius * 0.68
    };
  });
}
