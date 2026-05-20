# Supply Economy Slice

This slice adds the first grounded revenue loop without turning Field Fronts into a deep logistics simulator yet.

## Rule

Controlled outposts generate **Supply** each tick.

- Player home outpost: +10 Supply per tick
- Enemy home outpost: +10 Supply per tick
- Built outposts: +10 Supply per tick
- Neutral/contested outposts pay on a control gradient: each faction receives `10 * outpost.supply * controlShare` per tick.

For the current Signal Knoll seed, `supply: 0.62` means the neutral node contributes up to 6.2 Supply per tick split across the live control meter. A 52/48 contest therefore pays 3.224 Supply to player and 2.976 Supply to enemy before either side fully captures it.

## Why Supply is an aggregate

`Supply` is intentionally not a flat number internally. The player sees one simple pool, but the runtime stores child components:

- `provisions` — food, field endurance, morale sustainment
- `materiel` — physical kit, construction stock, weapons, ammunition
- `transit` — route capacity, carts, runners, local distribution

Current spending checks the aggregate Supply pool. Later passes can make a unit or structure require specific child components without replacing the economy contract.

Current income splits aggregate Supply evenly into those child components. The split is intentionally simple for now, but it keeps the stockpile shape ready for resource-specific costs later.

## Spawn loop

The HUD buttons now request actual runtime actions:

- Structure buttons spend player Supply and spawn a structure near the player anchor.
- Unit buttons spend player Supply and spawn a unit near the player anchor.
- Depot currently adds +40 Supply capacity.
- Outpost currently creates another income-producing outpost.

## Later seams

The obvious next seams are:

1. Place-build mode instead of instant spawn near anchor.
2. Neutral/contestable outposts with `controlMultiplier` based on command pressure.
3. Terrain logistics and route integrity feeding `calculateOutpostSupplyIncome()`.
4. Supply children becoming meaningful costs: e.g. artillery needs high `materiel`, recon needs `transit`, infantry leans `provisions`.
