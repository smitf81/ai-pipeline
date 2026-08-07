---
name: literal-vs-useful-completion
description: Check whether a task is merely technically complete or actually useful. Use when an implementation could satisfy the literal wording while leaving the user unable to see, use, run, validate, activate, render, persist, or benefit from the result.
---

# Literal Vs Useful Completion

Use this skill before claiming a task is done when "it exists" may not mean "it works for the user."

## Core Rule

Do not equate literal completion with useful completion.

Literal completion satisfies the narrow words. Useful completion satisfies the practical goal in the system.

## Reasoning Pattern

1. Identify the literal completion claim.
2. Identify the user-visible or system-visible useful completion state.
3. List what must be true for the user to benefit from the work.
4. Validate the useful state, not just the literal artifact.
5. If useful completion is not reached, report the remaining gap plainly.

## Common Split

- File added vs file loaded.
- File loaded vs rendered in viewport.
- Route exists vs UI calls it.
- UI control exists vs backend state changes.
- Data saved vs runtime rehydrates it.
- Plugin generated vs validated, packaged, registered, and activated.
- Test file created vs relevant behavior protected.
- Projection displayed vs canonical truth mutated.

## Failure Mode

The agent says "done" because a file, route, panel, or record exists, while Felix still cannot use the feature or verify the intended outcome.

## Output Requirement

Report:

- Literal completion:
- Useful completion:
- Gap closed:
- Remaining gap, if any:
- Proof of useful completion:
