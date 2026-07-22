---
name: contextops-maintainer
description: Maintain ACE context and planner-support artifacts without confusing them with canonical brain truth. Use when refreshing master indexes, appending chat summaries, updating brain/context notes, touching context/* ContextOps tiers, retiring stale operational notes, or promoting verified context into brain/emergence canonical files.
---

# Contextops Maintainer

Use this skill to keep context artifacts useful, bounded, and correctly classified.

## Truth Boundaries

- `brain/emergence/*` is canonical ACE truth.
- `brain/context/*` is operational planner support.
- `context/*` is the ContextOps tier/spec area.
- `brain/context/master_index.md` is an orientation map, not truth.
- `brain/context/master_index.json` is a machine inventory, not a decision record.

If operational context conflicts with canonical brain files, trust `brain/emergence/*` and record the conflict as a follow-up instead of silently rewriting truth.

## Maintenance Workflow

1. Read `agents/AGENTS.md` for the current canonical read order.
2. Refresh the master index after meaningful file changes:

```bash
.\run.cmd index:project
```

3. Validate generated JSON:

```bash
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('brain/context/master_index.json','utf8')); console.log('ok')"
```

4. For skill/context changes, run:

```bash
.\run.cmd smoke:ace
```

## Chat Appendix

For substantive chats, append a compact summary instead of relying on hidden conversation history:

```bash
node tools/project_index_tool.mjs --appendix-file <summary.md>
```

Include goal, files changed or inspected, validation, and unresolved risks. Do not paste long transcripts.

## Promotion Rules

- Keep new audits, digests, and recommendations in `brain/context/`.
- Promote into `brain/emergence/*` only when the user asks or the finding is verified against canonical source files/tests.
- When promoting, preserve provenance by naming the operational file and exact evidence.
- Retire stale context by updating or superseding it; do not leave contradictory planner notes active without a warning.

## Hygiene Rules

- Do not index dependency caches, generated QA runs, screenshots, archives, or local tool installs as project context.
- Keep Markdown context readable enough for a new session to scan quickly.
- Keep full inventories in JSON when detail would make Markdown too large.
- Never use context artifacts as a substitute for inspecting source files before code changes.
