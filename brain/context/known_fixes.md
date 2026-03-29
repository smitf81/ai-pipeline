# Known Fixes Library

Tiny, trusted fix patterns ACE can include in prompts before solving a familiar failure mode.

Version: ace/known-fixes.v1
Updated: 2026-03-29T00:00:00.000Z

### Quote Windows paths at the shell boundary
- Pattern: Path quoting
- When:
  - PowerShell parses paths with spaces or brackets
  - A command uses literal filesystem paths
  - A helper is feeding file paths into subprocess arguments
- Do:
  - Pass command arguments as arrays where possible.
  - Use `-LiteralPath` for PowerShell file operations.
  - Normalize repo-relative paths with forward slashes before prompt serialization.
- Avoid:
  - Building shell commands by string concatenation.
  - Letting unquoted paths cross a shell boundary.
- Tags: windows, powershell, paths
- Source: slice-2-known-fixes

### Create branches from a clean tracked worktree
- Pattern: Branch creation
- When:
  - ACE needs a disposable branch for apply or review
  - The repo already has tracked edits
  - Branch name collisions are possible
- Do:
  - Verify tracked worktree cleanliness before branch creation.
  - Prefer a `codex/` prefix or the repo's existing branch prefix rule.
  - Derive a unique branch name before checkout.
- Avoid:
  - Creating branches on top of unreviewed tracked edits.
  - Reusing branch names that may already exist remotely or locally.
- Tags: git, branch, safety
- Source: slice-2-known-fixes

### Treat patch apply failures as rollback events
- Pattern: Patch apply failure
- When:
  - A generated diff touches disallowed paths
  - Git apply fails after branch creation
  - The patch may have drifted from the current tree
- Do:
  - Validate patch paths before applying.
  - Apply with `git apply --index` on a clean branch.
  - Rollback branch state immediately if apply fails.
- Avoid:
  - Retrying the same broken patch without a rollback.
  - Applying to a dirty tracked worktree.
- Tags: git, patch, rollback
- Source: slice-2-known-fixes

### Resolve test commands from explicit repo-local context
- Pattern: Test command resolution
- When:
  - npm scripts differ by workspace
  - A command must be executed from a known project root
  - The test harness should avoid guessing the current folder
- Do:
  - Resolve the intended cwd explicitly before running a command.
  - Prefer repo-local scripts over ambient global tools.
  - Capture stdout and stderr together for diagnostics.
- Avoid:
  - Assuming the current shell directory is already the project root.
  - Hiding command selection inside a string-built shell pipeline.
- Tags: tests, cwd, scripts
- Source: slice-2-known-fixes

### Use array args for Windows subprocesses
- Pattern: Windows subprocess weirdness
- When:
  - A Node or Python subprocess fails only on Windows
  - The command mixes shell quoting with file paths
  - Spawn or EPERM errors appear in a local run
- Do:
  - Keep subprocess arguments structured instead of shell-joined.
  - Prefer direct executable paths and explicit `cwd` values.
  - Log the command shape before execution when debugging.
- Avoid:
  - Feeding Windows commands through `cmd /c` unless there is no alternative.
  - Assuming POSIX shell quoting rules apply on Windows.
- Tags: windows, subprocess, node, python
- Source: slice-2-known-fixes
