---
name: cognitive-skill-kernel
description: Route and combine ACE/AXIOM cognitive operating skills. Use when planning, interpreting intent, auditing completion, deciding whether to take goal-preserving initiative, choosing proof, avoiding orphan work, separating projection from truth, or selecting which reasoning contract should govern an agent task.
---

# Cognitive Skill Kernel

Use this skill as the router for ACE/AXIOM cognitive operating skills: small behavioural contracts that tell an agent how to think before it acts.

The kernel does not replace the specific skills. It chooses the smallest set of reasoning contracts needed for the task.

## Package Rule

Do not load every cognitive skill by default. Pick the skill that protects the nearest failure boundary:

- Misread intent -> use an intent interpretation skill.
- Tempted to stop too early or wander too far -> use a goal-preserving initiative skill.
- Work lands nowhere -> use an implementation discipline skill.
- Success is unproven -> use a QA/proof skill.
- State is confused with preview -> use a truth/projection skill.
- Completion feels technically true but practically hollow -> use Felix completion sense.

## Skill Map

### Intent Interpretation

- `brain/skills/negative-space-intent-reasoning/SKILL.md`: detect unstated requirements behind the literal ask.
- `brain/skills/literal-vs-useful-completion/SKILL.md`: compare technical completion with useful completion.
- `brain/skills/goal-preserving-initiative/SKILL.md`: take the necessary extra mile when it completes the same goal.

### Implementation Discipline

- `brain/skills/ace-canonical-truth-map/SKILL.md`: canonical-owner thinking for ACE/AXIOM truth-bearing changes.
- `brain/skills/implementation-gravity/SKILL.md`: locate every physical landing point a change must touch.
- `brain/skills/no-orphan-work/SKILL.md`: prevent disconnected files, panels, routes, helpers, docs, or tests.
- `brain/skills/projection-vs-truth-discipline/SKILL.md`: separate candidate/projection/advisory state from canonical truth.

### QA And Proof

- `brain/skills/evidence-first-completion/SKILL.md`: require proof before claiming completion.
- `brain/skills/dead-end-detection/SKILL.md`: stop repeated failing approaches and pivot with evidence.
- `brain/skills/fail-loud-output-loop/SKILL.md`: make bold attempts that fail early, loudly, and repairably.
- `brain/skills/ace-runtime-smoke/SKILL.md`: choose repo, skill, and UI validation commands.

### Felix Collaboration

- `brain/skills/felix-completion-sense/SKILL.md`: judge whether the work would feel actually done, visible, useful, and not hollow for Felix's ACE/AXIOM workflow.

## Routing Pattern

1. Name the task boundary.
2. Pick one primary cognitive skill.
3. Add at most two supporting cognitive skills if the task crosses intent, implementation, and proof boundaries.
4. Execute the underlying task with those contracts active.
5. Report which cognitive skills materially changed the plan or completion bar.

## Output Requirement

When this kernel triggers, state:

- Primary cognitive skill used
- Supporting skills used, if any
- Reason each was selected
- Completion bar those skills imposed

Keep this short. The package exists to sharpen action, not to decorate the plan.
