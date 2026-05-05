# Local Ollama Panel — Unreal Editor Plugin

Tiny **read-only** Unreal Editor plugin panel for testing a local Ollama model from inside Unreal.

It does only this:

1. Sends a prompt to `http://127.0.0.1:11434/api/generate`
2. Receives a response
3. Displays response text, model name, status, response time, and provenance
4. Executes no commands and edits no assets

## Default model

Default model in the panel and dependency script:

```txt
qwen2.5-coder:1.5b
```

Why this one: it is small, fast, and less likely to melt the laptop while we prove the pipe. You can change it in the panel to `mistral:latest`, `codellama:latest`, etc.

## Boot dependency check

From PowerShell:

```powershell
cd "<where you extracted this plugin>"
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\check_ollama.ps1
```

Optional model override:

```powershell
.\scripts\check_ollama.ps1 -Model "mistral:latest"
```

The script checks:

- `ollama` exists on PATH
- Ollama HTTP server responds at `127.0.0.1:11434`
- the target model is installed, pulling it if missing
- `/api/generate` returns a live response

## Install into an Unreal project

Copy the whole `LocalOllamaPanel` folder into:

```txt
<YourUnrealProject>/Plugins/LocalOllamaPanel
```

If `Plugins` does not exist, create it.

Then:

1. Close Unreal Editor.
2. Right-click your `.uproject` file.
3. Click **Generate Visual Studio project files**.
4. Open the project in Visual Studio / Rider.
5. Build the Editor target.
6. Launch Unreal Editor.
7. Enable the plugin if Unreal asks.
8. Open it from **Tools → Local Ollama Panel**.

## Expected first test prompt

```txt
Say hello from the local model and confirm you are running through Ollama.
```

Expected status:

```txt
live
```

If Ollama is not running, status becomes:

```txt
error
```

If you tick **Use deterministic fallback on error**, status becomes:

```txt
fallback
```

That fallback is deliberately dumb. It is only there to prove the UI status path. It is not AI.

## Hard boundaries

This plugin does **not**:

- edit assets
- run console commands
- write project files
- execute Python
- touch Blueprints
- modify levels
- act as an agent

That is intentional. First we prove Unreal can talk to the local model cleanly. Then ACE can wrap that pipe with governance later.
