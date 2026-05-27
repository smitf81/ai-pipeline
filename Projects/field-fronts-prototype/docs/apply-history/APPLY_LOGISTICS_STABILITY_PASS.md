# Logistics Stability Pass

## Goal

Stabilise the opening logistics loop without adding strategic/economy feature creep.

This pass makes sure both player and enemy factions start with enough baseline resources to build essential early structures, and that logistics cannot soft-lock before gathering camps exist.

## Changes

### 1. Opening resource stockpiles

Both `player` and `enemy` now start with:

```txt
supplies: 110
food: 20
wood: 24
```

These values fit within the starting outpost storage capacity of `180`.

### 2. Starting outposts provide native foundation gathering

Completed player/enemy outposts now create one native resource worker each.

The worker represents basic camp labour already attached to the outpost, not a new player-facing unit type.

Each completed player/enemy outpost adds a small native trickle per tick:

```txt
food: +0.08
wood: +0.06
```

Source label:

```txt
outpost-native-trickle
```

This is intentionally tiny. It prevents hard soft-locks but does not replace real hunting tents or wood gathering posts.

### 3. Wood gathering post no longer requires wood to build

`wood_gathering_post` construction materials no longer include `timber`.

This prevents the circular failure:

```txt
need wood -> build wood post -> wood post needs wood -> stuck
```

It still costs supplies and labour-style construction work.

### 4. Transport delivery validation strengthened

Tests now cover both friendly and enemy supply delivery:

- construction jobs wait for wood
- transports deliver wood to construction jobs
- hungry squads receive food
- enemy transports also deliver wood/food through the same logistics path

## Files changed

```txt
src/game/gameModel.js
src/game/structureRegistry.js
tests/gameModel.test.mjs
tests/resourceGathering.test.mjs
tests/storageSupplyLines.test.mjs
tests/playerControlEnemyDirector.test.mjs
tests/constructionJobs.test.mjs
tests/structureRegistry.test.mjs
```

## Design boundaries

This is not a new economy design.

It does not change:

- pathfinding
- combat
- structure joinery
- map maker rendering
- terrain generation
- UI layout
- enemy strategy model

Tile/resource state remains canonical. Outpost native trickle is a small stabilising income source only.

## Validation run

Syntax checks passed:

```txt
node --check src/game/gameModel.js
node --check src/game/structureRegistry.js
node --check tests/storageSupplyLines.test.mjs
node --check tests/resourceGathering.test.mjs
node --check tests/gameModel.test.mjs
node --check tests/playerControlEnemyDirector.test.mjs
node --check tests/constructionJobs.test.mjs
node --check tests/structureRegistry.test.mjs
```

Focused tests passed individually:

```txt
storageSupplyLines.test.mjs
resourceGathering.test.mjs
gameModel.test.mjs
playerControlEnemyDirector.test.mjs
constructionJobs.test.mjs
structureRegistry.test.mjs
```

Opening smoke check confirmed:

```txt
player and enemy starting stockpiles exist
player and enemy starting outposts spawn native gatherers
player and enemy starting outposts spawn transports
first tick adds native food/wood trickle
```

## Known test-runner note

`npm test` still hits the existing in-process runner hang/timeout pattern after several test modules. Focused tests for this logistics pass pass individually. This appears to be the already-known shared in-process test contamination problem, not a logistics failure.
