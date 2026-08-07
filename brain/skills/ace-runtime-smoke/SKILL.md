---
name: ace-runtime-smoke
description: Run the smallest reliable ACE/AXIOM validation checks for repo, skill, and UI changes. Use when finishing implementation slices, changing tools/package scripts, touching brain/skills, editing context/index artifacts, modifying ui/server.js or ui/public/spatial files, or needing a Windows-safe smoke path that avoids PowerShell npm execution-policy failures.
---

# Ace Runtime Smoke

Use this skill to choose and run the narrowest validation that proves an ACE/AXIOM change did not break the local workflow.

## Quick Commands

Use the repo-local runner, not raw `npm`, on Windows:

```bash
.\run.cmd smoke:ace
.\run.cmd smoke:ace:ui
.\run.cmd --cwd ui test
.\tools\skill-validator.cmd brain\skills\<skill-name>
```

`run.cmd` routes through `npm.cmd`, uses the repo-local `.npm-cache`, and avoids PowerShell `npm.ps1` execution-policy failures.

## Scope Selection

- **Repo/tooling change**: run `.\run.cmd smoke:ace`.
- **Skill change**: run `.\run.cmd smoke:ace` or `.\tools\skill-validator.cmd brain\skills\<skill-name>` for a single skill.
- **Context/index change**: run `.\run.cmd index:project`, parse `brain/context/master_index.json`, then run `.\run.cmd smoke:ace`.
- **UI shell/server change** touching `ui/server.js`, `ui/public/spatial/*`, `ui/public/style.css`, or browser-loaded shell code: run `.\run.cmd --cwd ui test` or `.\run.cmd smoke:ace:ui`.
- **Broad slice before handoff**: run `.\run.cmd smoke:ace:all` if time permits.

## Validation Rules

- Report exact commands and pass/fail results.
- If a command fails, stop and preserve the first actionable error.
- Do not claim UI completion without the `ui` test gate when the changed files touch UI shell code.
- Refresh `brain/context/master_index.md` after adding, removing, or moving project files.
- Use direct Node/Python syntax checks for changed tools when available.

## Smoke Runner

`tools/ace-smoke.mjs` supports:

```bash
node tools/ace-smoke.mjs
node tools/ace-smoke.mjs --scope repo
node tools/ace-smoke.mjs --scope skills
node tools/ace-smoke.mjs --scope ui
node tools/ace-smoke.mjs --scope all
```

Default scope is repo plus skill validation. UI is explicit because it is heavier.
