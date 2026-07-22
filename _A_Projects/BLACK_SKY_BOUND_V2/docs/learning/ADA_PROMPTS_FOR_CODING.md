# BSB Coding Session Prompts

Use these when asking Ada/Codex for help. They are designed to keep the work small and educational.

## Explain-before-edit prompt

```txt
Ada, before I edit this BSB file, explain what it owns in the architecture, what it must not own, and one safe tiny change I can make. File: [path]
```

## Review-my-change prompt

```txt
Ada, review this BSB coding change as a learning exercise. Tell me:
1. whether I changed the right ownership lane,
2. whether the code is likely to break tests,
3. what concept I should learn from it,
4. the smallest next improvement.
Patch/summary: [paste]
```

## Test-writing prompt

```txt
Ada, help me write the smallest useful test for this BSB change. Do not broaden the feature. I want one assertion that proves the contract.
Change: [describe]
Relevant files: [paths]
```

## Debug prompt

```txt
Ada, I changed [file/path]. Expected [visible result]. Actual [result]. Tests [passed/failed]. Help me debug by tracing data → component → system → projection → renderer, one step at a time.
```

## Do-not-let-me-go-mad prompt

```txt
Ada, I am about to overbuild this. Cut the idea down to one shippable BSB learning slice with one file changed and one proof.
```
