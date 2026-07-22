---
name: dead-end-detection
description: Detect and exit repeated failing approaches. Use when an agent has hit the same error, blocker, unclear path, test failure, install issue, browser/tool failure, or design contradiction more than once and needs to stop repeating instructions and pivot with evidence.
---

# Dead-End Detection

Use this skill when effort starts looping.

## Core Rule

Do not keep pushing the same path after evidence says the path is not moving.

## Dead-End Signals

- Same command fails twice with the same root error.
- Fixes change surface symptoms but not the failing predicate.
- The approach depends on a missing tool, permission, route, dependency, or runtime.
- The agent is adding fallback logic instead of resolving the failing owner.
- The plan keeps growing while evidence stays flat.
- The user has already rejected or redirected this path.

## Pivot Pattern

1. Name the repeated failure.
2. Identify the assumption that kept the agent on that path.
3. Record what has been ruled out.
4. Choose one discriminating next test or a different owned path.
5. If no meaningful path remains, report the blocker instead of inventing progress.

## Failure Mode

The agent burns time repeating a broken instruction, then hides the stall behind generic "still investigating" language.

## Output Requirement

Report:

- Dead-end signal:
- Failed assumption:
- Ruled out:
- Pivot chosen:
- Next evidence target:
