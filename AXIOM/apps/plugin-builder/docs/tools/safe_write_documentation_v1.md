# safe_write_documentation v1 — Bounded AXIOM Workspace Writer

## Purpose

`safe_write_documentation` remains the existing AXIOM safe writer, but now supports bounded functionality-bearing workspace files instead of documentation only.

It can write docs, skills, JSON contracts, MCP tool files, plugin scripts/assets, snippets, config files, and helper scripts inside explicit allowlisted lanes.

## Required input

```json
{
  "path": "workspace-relative/path.ext",
  "content": "text content",
  "overwrite": false,
  "reason": "audit reason",
  "dry_run": false
}
```

`reason` is required.

## Allowed lanes

- `docs/` — `.md`, `.txt`, `.json`, `.jsonl`, `.yaml`, `.yml`
- `docs/skills/` — `.md`, `.txt`, `.json`, `.jsonl`, `.yaml`, `.yml`
- `docs/tools/` — `.md`, `.txt`, `.json`, `.jsonl`, `.yaml`, `.yml`
- `src/mcp/tools/` — `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.txt`
- `plugins/` — `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.txt`, `.css`, `.html`
- `pluginbuilder_workspace/` — `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.txt`, `.css`, `.html`, `.py`
- `pluginbuilder_finished/` — `.js`, `.mjs`, `.cjs`, `.json`, `.md`, `.txt`, `.css`, `.html`, `.py`
- `snippets/` — `.js`, `.mjs`, `.json`, `.md`, `.txt`, `.html`, `.css`
- `config/` — `.json`, `.md`, `.txt`
- `scripts/` — `.py`, `.js`, `.mjs`, `.json`, `.md`, `.txt`
- `tools/` — `.py`, `.js`, `.mjs`, `.json`, `.md`, `.txt`

## Blocked paths

The writer blocks absolute paths, path traversal, dependency folders, environment files, package manifests/locks, server core files, launcher files, and MCP core/server files.

## Code safety checks

JavaScript-like files reject obvious high-risk patterns:

- `child_process`
- `execSync`, `execFileSync`, `spawn`, `spawnSync`, `exec(`
- shell launchers such as `powershell`, `cmd.exe`, `bash -c`, `sh -c`
- destructive commands such as `rm -rf`, `Remove-Item -Recurse`, `rmdir /s`
- server listeners such as `listen(` and `createServer(`
- dynamic eval/function/vm execution

MCP tool files and plugin source files must include an export.

Python files reject obvious high-risk patterns:

- subprocess/shell execution
- destructive file deletion helpers
- local server frameworks/listeners
- dynamic `eval`, `exec`, or `compile`

## JSON validation

`.json` content must parse before writing.

## Receipt

Successful writes return:

```json
{
  "ok": true,
  "applied": true,
  "tool": "safe_write_documentation",
  "path": "...",
  "lane": "...",
  "extension": ".js",
  "existed_before": false,
  "exists_after": true,
  "bytes_written": 123,
  "sha256": "...",
  "timestamp": "...",
  "reason": "..."
}
```

## Important

This tool writes bounded files. It does not itself activate plugins, register MCP tools, restart servers, or claim runtime success. Those remain separate validation/activation steps.
