# Quest 01 — Change Game Feel Through Data

## Goal

Make one visible change by editing data only.

## Concept

Data files are where design values live. Systems should consume those values instead of hiding magic numbers.

## Target files

- `src/data/actors.js`
- `src/data/abilities.js`
- `src/data/napalmDribble.js`

## Choose one tiny edit

Pick exactly one:

### Option A — Wyvern movement feel

In `src/data/actors.js`, find the young dragon actor and adjust:

```js
speed: 4.9
```

Try `4.4` or `5.3`.

### Option B — Smoke linger

In `src/data/abilities.js`, find `SMOKE_BURST` and adjust:

```js
duration: 3.2
```

Try `4.0`. Do not change the radius yet.

### Option C — Napalm drip cadence

In `src/data/napalmDribble.js`, adjust:

```js
movingDripInterval: 0.34
```

Try `0.48` for less frequent drips.

## Do this loop

```bash
npm test
npm run learn
```

Then launch the game and check whether the change feels visible.

## What you are learning

- object properties
- nested data
- how systems use tuning
- safe edits before architecture edits

## Ada verification prompt

Paste this to me after the edit:

```txt
Ada, review my Quest 01 data-only BSB change. I edited [file/path], changed [value] from [old] to [new], tests passed/failed, and visually I observed [effect]. Tell me if this stayed in the right ownership lane.
```

## Done when

- you changed one value
- tests still pass
- you can describe the visual/gameplay effect in one sentence
