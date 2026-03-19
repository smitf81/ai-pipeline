# Test Upgrade Completion Walkthrough

The QA test suite has been successfully upgraded to be substantially more reliable, rigorous, and actionable.

## 1. Severity Added to Test Failures
Test outcomes now include a `severity` field whenever they fail. By default, [makeTest()](file:///c:/Users/felix/Desktop/Automated_AI_Pipeline/dev/ai-pipeline/ai-pipeline-updated/ai-pipeline/qa/shared/debugSuite.js#52-57) throws a `critical` severity, but this is parameterizable for future testing needs:
```json
{
  "name": "contract_check",
  "status": "fail",
  "severity": "critical",
  "reason": "..."
}
```
This enables automated prioritization of test fixes.

## 2. Brutal `contract_check` Implemented
The `contract_check` no longer depends on a hardcoded list of endpoints in the test file. 
Instead:
- **UI Endpoint Verification**: Test files now dynamically scan the `ui/public` JavaScript bundle for strings matching `/api/*`. It runs those paths through `routeExists` against the actual server layer to ensure every UI reference corresponds to a defined backend route.
- **Specific Shape Constraints (CTO Chat Bug)**: By submitting an empty payload to the CTO Chat LLM route (`/api/spatial/cto/chat`), we force the backend routing mechanism to respond immediately. The test strictly validates that `reply_text` is returned as a string, asserting that the shape is what the UI actually depends on.
- **CLI Commands (Apply Mismatch)**: The `runnerQA.js` test extracts subcommands from the Python runner CLI (`runner/ai.py`) using RegExp parsing. It correlates UI capabilities (such as the actions found in `index.html` like `apply`) with the backend Python implementation, explicitly enforcing that all requested UI processes exist in the codebase.

## 3. Idempotency Testing
Added an idempotency validation step inside `uiQA.js`. 
- **Mechanism**: The backend route (`/api/spatial/mutations/preview`) is bombarded with duplicate requests consecutively.
- **Validation**: The test captures the responses and asserts that not only do they return identically positive payload responses (HTTP 200), but the inner payload state exactly matches in both JSON objects, showing no side-effects or duplicate generation.

## 4. Universal LLM Trace Logger (`callLLM`)
We have completely wrapped the Python `caller` functions into a central utility (`callLLM()`) within `runner/ai.py`. All LLM generations must pass through this funnel.
- For each usage, the pipeline automatically writes a trace to `/runtime/llm_invocations.json`.
- The log stamps the exact `timestamp`, generating agent and stage names, and a SHA-256 hash for both the `prompt_hash` and `response_hash`. 

## 5. Brutal LLM Invocation Check (The Rule)
To ensure absolute integrity of agent executions (killing cached nonsense, stale fallback mocking, and silent skips), the QA Suite enforces the *Brutal Rule*: **No agent output is valid without a fresh LLM invocation.**
- Every QA test dynamically examines `rootPath / runtime / llm_invocations.json`.
- If an agent is detected running (e.g., outputs candidates or generates a patch) but the suite does not locate an invocation timestamp *newer* than the test initialization time, the test terminates as a `critical` failure. 

## Results
The base tests compile correctly. However, as specifically designed, tests mapping to the `ta` module currently **FAIL** on the `llm_invocation_check` because its stubs attempt to simulate agent responses without genuinely activating an LLM pipeline. This proves the system is successfully protected against fallback pretending!
