# Quest 00 — Boot And Read The Runtime Path

## Goal

Get comfortable with the project being a real thing you can launch, test, and inspect.

## Concept

A browser game is not magic. BSB boots through a chain of files.

```txt
index.html → src/app.js → game state → systems → renderer
```

## Do this

1. Run tests:

```bash
npm test
```

2. Run the learning checks:

```bash
npm run learn
```

3. Launch the game on Windows:

```txt
LAUNCH_BSB.bat
```

4. In the browser console, run:

```js
window.render_game_to_text()
```

5. Paste the first 20 lines of the result into your notes.

## What you are learning

- the app exposes debug hooks deliberately
- tests prove code contracts
- the game state can be inspected as data

## Visible progress

You can now launch, test, and inspect BSB without needing me to hold your little coding hand. Proud of you. Slightly.

## Done when

- `npm test` passes
- `npm run learn` passes
- the game launches
- `window.render_game_to_text()` returns JSON-looking text
