# Runtime Contracts

This slice keeps the prototype in one project while separating authored map data from mutable game runtime data.

## MapData

**Owner:** map maker / editor export  
**Primary path:** `data/maps/field-fronts-map.json`

MapData contains the level input:

- `version`
- `width`
- `height`
- `tiles`
- `terrain`
- `provenance`
- `exportedAt`

MapData should stay safe to round-trip through the map maker. Runtime entities, leader decisions, tick counters, contestation, and combat state do not belong in the map export.

## GameState

**Owner:** game runtime  
**Contract:** `field-fronts.game-state.v1`  
**Local autosave key:** `field-fronts-game-state-v1`

GameState contains mutable play state:

- `contract`
- `version`
- `mapRef`
- `tick`
- `phase`
- `mode`
- `selectedEntityId`
- `economy`
- `outposts`
- `leaders`

Derived influence fields are not persisted. They are rebuilt from MapData + GameState through `recomputeGameState()`. Contest control on an outpost is persisted, but projected pressure is derived.

## Economy

Economy state is runtime-owned and persisted with GameState, not MapData. The first resource is `supplies`, an aggregate resource made from component buckets:

```js
{
  resources: {
    supplies: {
      id: 'supplies',
      role: 'aggregate',
      components: {
        provisions: { id, label, weight },
        materiel: { id, label, weight },
        transit: { id, label, weight }
      }
    }
  },
  factions: {
    player: { stockpiles: { supplies: { amount, components } } },
    enemy: { stockpiles: { supplies: { amount, components } } }
  }
}
```

The aggregate shape is intentionally expandable: later resources can either contribute new component buckets into `supplies` or become separate resource definitions without changing map data.

Supply income is resolved once per game tick:

- non-contestable owned outposts pay full base income to their owner
- contestable outposts pay on the current control gradient, even while neutral or contested
- income is stored in `lastIncome.supplies` for inspection, then added to the faction stockpile

## Entity

All runtime entities share this base shape:

```js
{ id, type, factionId, name, tile }
```

Current entity types:

- `leader`
- `outpost`

## Outpost

Outposts are buildable/spawnable command anchors:

```js
{
  id,
  type: 'outpost',
  factionId,
  name,
  tile,
  buildable,
  buildableBy,
  spawnLeaderId,
  supply,
  contestable,
  ownerFactionId,
  control,
  projectedPressure,
  status
}
```

The neutral `Signal Knoll` node is an outpost with `contestable: true`, `factionId: 'neutral'`, and no committed owner until its control meter crosses a threshold.

## Leader

Leaders are command-field emitters:

```js
{
  id,
  type: 'leader',
  factionId,
  name,
  tile,
  qualities,
  behavior,
  command,
  commandScore,
  influenceRadius,
  objectiveProjection
}
```

`qualities` and `behavior` are persisted. `command`, `commandScore`, `influenceRadius`, and `objectiveProjection` are derived each recompute.

`behavior` currently contains:

```js
{ controller, stance, intent, lastDecision }
```

The player leader uses `controller: 'player'` and changes stance only through player orders. The enemy leader uses `controller: 'ai'` and updates stance on ticks.

## CommandGraph

The leader command graph remains an inspectable weighted graph of subinfluences instead of becoming a flat stat:

- presence
- morale cohesion
- terrain logistics
- outpost anchor
- initiative clarity
- logistical discipline

Each node keeps:

```js
{ id, label, value, weight, sources, contribution }
```

## Save/load rule

Map save/load and game save/load are intentionally separate:

- Map export/import changes authored terrain.
- Game export/import changes runtime state only.
- Browser autosave uses separate localStorage keys for map and game state.

This gives us a clean attachment point for the next slice: movement orders or logistics routing can read the neutral contest node without contaminating the map-maker JSON.
