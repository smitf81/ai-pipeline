# Next Slice

Generated: 2026-03-29T00:00:00Z

## Interpreted Task

The repo now has repeated-failure tracking plus review-only candidate fixes, and the next useful slice is to surface those candidates in a reviewable desk or archivist view without contaminating the trusted prompt path.

## Scope Risks

- This touches the archivist, known-fixes review path, and desk surfacing all at once.
- If candidate fixes leak into the trusted prompt path, the repo will silently lose the separation we just created.
- The right slice is narrow: keep trusted output trusted-only, then show review-only candidates where humans can inspect them.

## Best Next Slice

Objective: surface repeated-failure candidates in a reviewable view so humans can inspect the evidence without polluting worker prompts.

Exact focus: show the repeated-failure history and candidate known-fix proposals from `ui/failureMemory.js` and `ui/knownFixes.js`, while keeping normal worker prompts trusted-only.

Likely systems involved:

- `ui/server.js`
- `ui/failureMemory.js`
- `ui/knownFixes.js`
- `ui/archivistWriteback.js`
- `ui/tests/failureMemory.test.mjs`
- `brain/context/`

Why this comes first:

- It keeps the trusted prompt lane clean while still learning from repeated failures.
- It makes candidate fixes inspectable without auto-promoting them.
- It keeps the archivist as the review gate for what becomes visible to the rest of ACE.

Explicitly leave out:

- planner policy changes
- UI redesign work
- broad prompt architecture changes
- auto-promotion from candidate fixes into the trusted library

## Definition of Done

- Repeated failures are stored locally with stable keys and bounded examples.
- Candidate fixes appear only in review/debug surfaces unless explicitly requested.
- The trusted library still feeds worker prompts without candidate contamination.

## Likely Follow-up Slices

1. Add a compact review panel for candidate fixes and their failure evidence.
2. Show repeated-failure counts in the archivist or QA desk surfaces.
3. Add a manual promotion path from candidate to trusted once a human approves it.
4. Only then broaden the failure matcher or collapse more paths into the same review surface.

## Confidence / Uncertainty

- Assumption: stable failure keys are enough to cluster the noisy raw error text we already see.
- Assumption: candidate fixes should stay review-only until a human explicitly promotes them.
- Unclear: whether the review surface should live in the archivist desk, the QA department, or both.
