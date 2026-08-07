---
name: project-index
description: Maintain and use a compact master index for this AI pipeline repo. Use when starting a new chat, onboarding to ACE/AXIOM, deciding which project files to read, refreshing repository context, or appending an end-of-chat summary without loading the full project into context.
---

# Project Index

Use this skill to keep future sessions context-efficient.

## Start-of-chat workflow

1. Read `agents/AGENTS.md`.
2. Read `brain/context/master_index.md`.
3. Read only the canonical anchors and task-relevant files named by the index.
4. If the index is missing, stale, or contradicts the filesystem, refresh it:

```bash
node tools/project_index_tool.mjs
```

Treat `brain/context/master_index.md` as an orientation map only. It never overrides canonical truth in `brain/emergence/*`, source files, tests, or runtime data.

## End-of-chat workflow

Before ending a substantive implementation or audit chat:

1. Write a short temporary Markdown summary with:
   - task goal
   - files changed or inspected
   - validation run
   - unresolved risks or next slice
2. Append it and refresh the index:

```bash
node tools/project_index_tool.mjs --appendix-file <summary.md>
```

The tool appends the summary to `brain/context/chat_appendix.md`, then rewrites:

- `brain/context/master_index.md`
- `brain/context/master_index.json`

## Reading discipline

- Prefer the master index to broad `rg --files` dumps when choosing context.
- Use `rg` for targeted verification after the index points at likely files.
- Read canonical ACE files before acting on planner-support notes.
- Do not load archives, generated screenshots, dependency folders, or runtime evidence unless the task specifically depends on them.
- Refresh the index after adding, removing, or relocating meaningful project files.

## Tool notes

`tools/project_index_tool.mjs` is deterministic and dependency-free. It records path, category, size, modified time, checksum, and a compact inferred summary for indexed files. It skips known dependency, build, QA-output, and generated index noise.

The Markdown index is intentionally compact. Use `brain/context/master_index.json` for the complete machine-readable file inventory when the Markdown outline does not include the specific path you need.
