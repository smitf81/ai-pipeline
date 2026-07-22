---
name: fail-loud-output-loop
description: Apply a bold, fail-fast working philosophy for ACE/AXIOM agents. Use when a task asks for failing early or loudly, output orientation, no silent fallbacks, rapid ruling-out, honest mistake registration, lateral problem solving, metacognition, or creative attempts that must remain traceable and fixable.
---

# Fail Loud Output Loop

Use this skill when the main risk is not that the agent will be too reckless, but that it will be too vague, cautious, padded, or quietly wrong.

The goal is to produce real evidence quickly, rule out what does not work, and preserve enough failure detail that the next repair knows exactly where to bite. This skill does not override ACE canonical truth, safety, validation, user approvals, or the engineering constitution.

## Core Posture

- Prefer a concrete attempt that can prove or kill a path over a broad speculative plan.
- Be ambitious about the target output, but precise about the evidence required.
- Make uncertainty visible before acting: name the assumption, the expected signal, and the disqualifying signal.
- Treat mistakes as useful only when they are honest, localized, and recorded.
- Use creativity and lateral thinking to generate candidate routes; use evidence, not vibes, to accept them.
- Treat boredom or repeated sameness as a signal to look for a sharper test or different angle.

## Hard Rules

- No silent fallbacks. A fallback path is a failed primary path unless the user explicitly asked for fallback behavior.
- No backup output that pretends the main output succeeded.
- No heuristic truth where a canonical source, direct probe, test, or real artifact can be inspected.
- No success claim without a visible output, validation signal, or exact blocker.
- No vague "it failed" reports. Name the file, route, command, predicate, payload, or assumption that failed.
- No broad retry loops that change many variables at once. Each retry should rule out a specific cause.

If tool limits, sandbox limits, missing dependencies, safety policy, or approval policy force a fallback, label it as `fallback` or `blocked` and do not count it as success.

## Working Loop

1. **Declare the output**
   - State the concrete artifact, behavior, route, UI state, test result, or decision the attempt is meant to produce.

2. **Name the bet**
   - Write the smallest bold assumption that would make the output possible.
   - Prefer one high-leverage bet over several soft guesses.

3. **Define kill criteria**
   - Say what result would prove the bet wrong.
   - The criterion should be observable through a command, direct probe, rendered UI state, payload, or source inspection.

4. **Act**
   - Make the smallest real change or run the smallest real probe that can produce evidence.
   - Do not build speculative scaffolding around an unproven bet.

5. **Inspect the evidence**
   - Compare expected signal with actual signal.
   - If the result is degraded, partial, stale, or inferred, say so.

6. **Register the miss**
   - Record what failed, where, why it matters, and what has been ruled out.
   - Preserve the evidence trail in the relevant doc, issue, changelog, failure register, or final report.

7. **Narrow or pivot**
   - If the bet failed, choose the next attempt based on the failure evidence.
   - If the bet passed, carry the proven output into the next slice without expanding beyond the validated surface.

## Failure Register

Use this shape in docs, handoffs, or reports when an attempt fails or is blocked:

```text
Failure register
- Target output:
- Attempt:
- Expected signal:
- Actual signal:
- Failed assumption:
- Failure location:
- Ruled out:
- Next discriminating test:
- Evidence:
```

Keep the register short. It is a repair map, not a diary.

## Output Contract

When reporting work done under this skill, include:

- Target output
- Bold bet taken
- Evidence produced
- Failures or blockers registered
- What was ruled out
- Current status: `passed`, `failed`, `blocked`, or `partial`

Use `partial` only when the output is genuinely useful and the missing part is explicitly named. Do not use it as a soft success label.

## Fit With ACE/AXIOM

- Pair with `ace-task` or `brain/skills/ace-canonical-truth-map/SKILL.md` when touching ACE truth-bearing behavior.
- Pair with `brain/skills/axiom-plugin-slice-builder/SKILL.md` when the bold attempt belongs in AXIOM's plugin proposal lifecycle.
- Pair with `brain/skills/ace-runtime-smoke/SKILL.md` when the attempt changes repo skills, tools, UI runtime, or validation flow.
- Pair with `brain/skills/negative-space-intent-reasoning/SKILL.md` when the bold attempt depends on an unstated second-order requirement behind the literal ask.

In ACE, this skill turns "no silent degradation" into an active implementation loop. In AXIOM, it keeps agentic repair ambitious without letting generated proposals masquerade as activated truth.
