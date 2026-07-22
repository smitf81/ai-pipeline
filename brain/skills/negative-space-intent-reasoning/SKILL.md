---
name: negative-space-intent-reasoning
description: Detect unstated but necessary requirements behind a user's literal request. Use when a task may technically satisfy the words while missing the real goal, including latent requirement detection, pragmatic inference, abductive reasoning, second-order intent, goal-preserving gap detection, "reading between the lines", AXIOM import/open/render workflows, ACE intent interpretation, or deciding whether to act on or explicitly surface implied follow-up work.
---

# Negative-Space Intent Reasoning

Use this skill to protect the user's actual goal from being under-delivered by a literal implementation.

Negative-space intent reasoning is the ability to notice what is not said but must be true for the request to be meaningfully complete. It is not permission to wander into a new goal. It is a disciplined way to detect latent requirements, decide whether they are safe to include, and make the inference visible.

## Core Move

Separate four layers:

- **Literal ask**: what the user explicitly requested.
- **Goal frame**: what outcome would make the request feel complete to the user.
- **Latent requirement**: the unstated work needed to bridge the literal ask to the goal frame.
- **Resolution choice**: handle it now, ask a question, or record it as an unresolved second-order requirement.

## Detection Signals

Look for negative-space requirements when:

- A literal task would produce an artifact that is technically present but not usable.
- A workflow naturally has two stages, and the user named only the first.
- A user says "load", "open", "import", "wire", "connect", "make available", "make work", "put into", or "hook up" in a system where visibility, rendering, activation, persistence, or validation are separate steps.
- The requested result crosses a known boundary, such as file manager to viewport, UI to backend, proposal to activation, intent record to projection, or saved data to runtime state.
- The user likely assumes an implementation detail is automatic, but the repo separates it into distinct contracts.
- A narrow implementation would force the user to immediately ask for the obvious next step.

## Guardrails

- Do not invent product direction, hidden preferences, or large new features.
- Do not bypass canonical truth, validation gates, safety, or approval policy.
- Do not silently expand into a new goal. State the inferred requirement and why it belongs on the same road.
- Do not treat speculation as fact. Mark confidence as high, medium, or low.
- Do not use latent intent to override an explicit constraint from the user.
- If the implied work touches a risky boundary, ask or surface it instead of quietly doing it.

## Act Or Ask Decision

Handle the latent requirement now when all are true:

- It is necessary for the literal request to satisfy the goal.
- It is close to the requested work, not a new project direction.
- The repo already exposes the relevant boundary or canonical owner.
- The blast radius is small and validation is available.
- The user has not constrained the work to the literal layer only.

Ask or explicitly report it when any are true:

- The inferred requirement changes data ownership, permissions, destructive behavior, or runtime activation.
- There are multiple plausible user goals.
- The implied work is substantially larger than the literal request.
- Validation cannot distinguish success from a convincing local placeholder.
- The user may prefer a different interaction model or UX.

## Workflow

1. **Restate the literal ask**
   - Keep this short and concrete.

2. **Infer the goal frame**
   - Ask: "What would the user expect to be true after this?"

3. **List latent requirements**
   - Include only requirements needed for the goal to be usable, visible, executable, or validated.

4. **Classify each requirement**
   - `required`: needed for meaningful completion.
   - `likely`: probably wanted, but not essential.
   - `optional`: useful polish or expansion; do not include unless asked.

5. **Choose act, ask, or report**
   - Act on required, bounded, safe requirements.
   - Ask about ambiguous or risky requirements.
   - Report optional requirements as follow-up context, not hidden work.

6. **Validate against the goal**
   - Do not stop at "the file exists" if the goal is "the project opens and renders".
   - Use the validation surface that proves the inferred goal, not just the literal step.

## Example

Literal ask:

```text
Make it so Black Sky Bound can be loaded in as an example import into AXIOM.
```

Negative-space reading:

```text
Literal ask: add Black Sky Bound to AXIOM's example import path.
Goal frame: make Black Sky Bound usable as a loaded example project.
Latent requirement: after import/discovery, AXIOM must instantiate or render the project into the viewport.
Resolution: handle both if the file-manager and viewport contracts are already available; otherwise import it and explicitly report viewport instantiation as the unresolved second-order requirement.
```

## Output Contract

When using this skill on a task, include:

- Literal ask
- Inferred goal frame
- Latent requirements found
- Acted-on requirements
- Requirements surfaced but not acted on
- Validation that proves the goal, not only the literal step

For tiny tasks, this can be one sentence in the final report. For larger ACE/AXIOM work, make it a short section in the plan or handoff.

## Fit With ACE/AXIOM

- Pair with `brain/skills/ace-canonical-truth-map/SKILL.md` when the latent requirement touches ACE truth ownership, projections, runtime state, or mutation authority.
- Pair with `brain/skills/axiom-plugin-slice-builder/SKILL.md` when the inferred requirement belongs in AXIOM's plugin proposal lifecycle.
- Pair with `brain/skills/fail-loud-output-loop/SKILL.md` when the inferred requirement creates an uncertain but high-value bet that needs fast evidence.

In ACE terms, this skill helps convert vague user pressure into a more complete intent record without inventing parallel truth. In AXIOM terms, it prevents "loaded in a panel" from being mistaken for "available and working in the engine."
