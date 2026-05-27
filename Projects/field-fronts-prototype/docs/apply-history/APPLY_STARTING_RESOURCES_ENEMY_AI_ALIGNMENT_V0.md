# APPLY — Starting Resources + Enemy AI Alignment v0

## Goal
Quickly rebalance opening stockpiles and make the enemy director respect the current early progression/build availability instead of quietly cheating with later-tier units and structures.

## What changed

### 1. Opening resources retuned
Starting resources for both player and enemy are now:

- Supplies: `0`
- Gold: `115`
- Food: `36`
- Wood: `32`
- Population: `10`

This gives the opening camp enough room to build a basic economy structure, train a small early force, or push a builder lodge without instantly flooding the player with too much stockpile bloat.

### 2. Enemy AI now musters available fighters
The enemy director no longer hardcodes infantry as its first force unit.

It now:

- prefers infantry only when progression unlocks it
- falls back to warriors during Tribal Camp stage
- pays the same resource cost as the build catalogue
- spends gold/food/wood/population rather than the old food/supplies shortcut

### 3. Enemy AI now respects available structure progression
The enemy director no longer treats watchtowers/storage as automatically available during Tribal Camp.

It now:

- checks structure availability before using logistics/expansion structures
- ignores storage pressure if `storage_tent` is not unlocked yet
- uses `builder_lodge` as the early expansion structure instead of jumping straight to watchtower

### 4. Opening enemy pressure delayed slightly
The enemy can still become active quickly, but it now has a short opening survey delay before mustering its first autonomous warband.

This avoids the AI polluting early movement/pathfinding tests and gives the player a tiny opening beat instead of getting immediate combat chaos because the enemy can now afford warriors properly.

## Files changed

- `src/game/gameModel.js`
- `tests/gameModel.test.mjs`
- `tests/openingCommanderSupplyRegression.test.mjs`
- `tests/playerControlEnemyDirector.test.mjs`
- `tests/storageSupplyLines.test.mjs`

## Validation

Passed:

```txt
node --check all src/tests/tools JS/MJS files
npm test
```

`npm test` passed all in-process suites:

- editor model
- structure registry/topology/occupancy/joinery
- construction jobs
- resource gathering
- storage + supply lines
- combat mechanics
- navigation + construction regression lock
- player control + enemy director
- game model
- builder population
- runtime events
- runtime performance QA
- app mode routing
- opening commander + supply regression
- UI HUD regression

## Notes

This does not add a full faction-specific tech tree yet. Progression is still global scenario progression.

This is a sensible v0 alignment pass only:

- player UI hides locked things
- enemy AI now also avoids locked things
- opening economy has enough material to test choices
- enemy no longer starts by secretly using unavailable infantry/watchtower logic
