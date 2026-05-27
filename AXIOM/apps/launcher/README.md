# AXIOM Local Launcher Bundle

This bundle turns the AXIOM SSE bridge + AXIOM HTML editor into a double-click Windows launcher.

## What you get

- `AXIOM Launcher.cmd` — double-click this to boot everything.
- `Install Desktop Shortcut.cmd` — creates a desktop shortcut called **AXIOM Launcher**.
- `AXIOM Stop.cmd` — stops the AXIOM SSE bridge process started by the launcher.
- `public/axiom-editor.html` — the AXIOM editor page.
- `public/sse-demo.html` — simple SSE test page.
- `server.js` + `server/sse.js` — local bridge server.
- `logs/` — boot/server logs.
- `runtime/` — pid file used by the stop script.

## Dependencies

Required:

1. Windows 11
2. Node.js LTS
3. npm, installed with Node.js

Optional:

4. Ollama, if you want local model chat inside AXIOM.

The launcher checks Node and npm before doing anything. It then runs `npm install`, starts the AXIOM SSE Bridge, verifies `/health`, verifies the required web assets, then opens the editor.

If Ollama is installed, the launcher checks `http://127.0.0.1:11434/api/tags`. If Ollama is installed but not live, it attempts to start `ollama serve`.

## First-time setup

1. Unzip this folder somewhere stable, for example:

   `C:\Users\felix\Desktop\AXIOM Launcher`

2. Double-click:

   `Install Desktop Shortcut.cmd`

3. Use the desktop shortcut:

   **AXIOM Launcher**

## What the launcher verifies

The launcher will not declare success until these pass:

- Node exists
- npm exists
- Node dependencies are installed/updated
- AXIOM SSE Bridge starts on port `3007`
- `http://localhost:3007/health` returns `ok: true`
- `axiom-sse-client.js` is served
- `sse-demo.html` is served
- `axiom-editor.html` is served

## URLs

- Editor: `http://localhost:3007/axiom-editor.html`
- Demo: `http://localhost:3007/sse-demo.html`
- Health: `http://localhost:3007/health`

## Notes

This is not a compiled native `.exe`. It is a Windows executable launcher script bundle, because that is safer and more transparent for this stage. A compiled `.exe` wrapper can come later once the boot process is stable.

The SSE bridge is the live UI/event stream. MCP should be added later as callable tool hands, not as a replacement for SSE.
