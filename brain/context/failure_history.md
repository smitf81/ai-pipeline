# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-03-30T09:00:21.361Z

### unknown_failure
- Count: 10966
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-03-29T10:12:36.572Z
- Last seen: 2026-03-30T09:00:21.361Z
- Failure class: panel_degraded
- Last error timestamp: 2026-03-30T09:00:21.361Z
- Last error: M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/pages.json
 M data/spatial/workspace.json
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Related projects: ace-self
- Related agents: planner, builder
- Example messages:
  - M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/pages.json
 M data/spatial/workspace.json
  - M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M data/spatial/workspace.json
  - M  brain/context/agent_audits/builder/builder_0001.json
M  brain/context/agent_audits/builder/builder_0001.md
M  brain/context/autonomy_fix_tasks.json
M  brain/context/autonomy_fix_tasks.md
M  brain/context/failure_history.json
M  brain/context/failure_history.md
M  brain/context/known_fixes_candidates.json
M  brain/context/known_fixes_candidates.md
M  brain/context/next_slice.md
M  brain/context/ui_backend_drift.md
M  brain/emergence/slices.json
M  brain/emergence/slices.md
M  data/spatial/history.json
M  data/spatial/pages.json
M  data/spatial/qa/local-gates/test-unit-latest.json
A  data/spatial/qa/qa_1774789903018_45iajn.json
A  data/spatial/qa/qa_1774789903018_45iajn/01-initial.png
A  data/spatial/qa/qa_1774789903018_45iajn/02-studio-smoke.png
A  data/spatial/qa/qa_1774789903018_45iajn/console.json
A  data/spatial/qa/qa_1774789903018_45iajn/dom.html
A  data/spatial/qa/qa_1774789903018_45iajn/layout-findings.json
A  data/spatial/qa/qa_1774789903018_45iajn/network.json
A  data/spatial/qa/qa_1774789903018_45iajn/runtime.json
A  data/spatial/qa/qa_1774790231800_ghkqx0.json
A  data/spatial/qa/qa_1774790291086_abdcvm.json
A  data/spatial/qa/qa_1774790291086_abdcvm/01-initial.png
A  data/spatial/qa/qa_1774790291086_abdcvm/02-studio-smoke.png
A  data/spatial/qa/qa_1774790291086_abdcvm/console.json
A  data/spatial/qa/qa_1774790291086_abdcvm/dom.html
A  data/spatial/qa/qa_1774790291086_abdcvm/layout-findings.json
A  data/spatial/qa/qa_1774790291086_abdcvm/network.json
A  data/spatial/qa/qa_1774790291086_abdcvm/runtime.json
A  data/spatial/qa/qa_1774790812529_ohme3t.json
A  data/spatial/qa/qa_1774790812529_ohme3t/01-initial.png
A  data/spatial/qa/qa_1774790812529_ohme3t/02-studio-smoke.png
A  data/spatial/qa/qa_1774790812529_ohme3t/console.json
A  data/spatial/qa/qa_1774790812529_ohme3t/dom.html
A  data/spatial/qa/qa_1774790812529_ohme3t/layout-findings.json
A  data/spatial/qa/qa_1774790812529_ohme3t/network.json
A  data/spatial/qa/qa_1774790812529_ohme3t/runtime.json
A  data/spatial/qa/qa_1774791125212_44dtth.json
A  data/spatial/qa/qa_1774791125212_44dtth/01-initial.png
A  data/spatial/qa/qa_1774791125212_44dtth/02-studio-smoke.png
A  data/spatial/qa/qa_1774791125212_44dtth/console.json
A  data/spatial/qa/qa_1774791125212_44dtth/dom.html
A  data/spatial/qa/qa_1774791125212_44dtth/layout-findings.json
A  data/spatial/qa/qa_1774791125212_44dtth/network.json
A  data/spatial/qa/qa_1774791125212_44dtth/runtime.json
A  data/spatial/qa/qa_1774791498144_wfeb10.json
A  data/spatial/qa/qa_1774791498144_wfeb10/01-initial.png
A  data/spatial/qa/qa_1774791498144_wfeb10/02-studio-smoke.png
A  data/spatial/qa/qa_1774791498144_wfeb10/console.json
A  data/spatial/qa/qa_1774791498144_wfeb10/dom.html
A  data/spatial/qa/qa_1774791498144_wfeb10/layout-findings.json
A  data/spatial/qa/qa_1774791498144_wfeb10/network.json
A  data/spatial/qa/qa_1774791498144_wfeb10/runtime.json
A  data/spatial/qa/qa_1774791805474_kuvwns.json
A  data/spatial/qa/qa_1774791805474_kuvwns/01-initial.png
A  data/spatial/qa/qa_1774791805474_kuvwns/02-studio-smoke.png
A  data/spatial/qa/qa_1774791805474_kuvwns/console.json
A  data/spatial/qa/qa_1774791805474_kuvwns/dom.html
A  data/spatial/qa/qa_1774791805474_kuvwns/layout-findings.json
A  data/spatial/qa/qa_1774791805474_kuvwns/network.json
A  data/spatial/qa/qa_1774791805474_kuvwns/runtime.json
M  data/spatial/ta-department.json
M  data/spatial/workspace.json
A  ui/constrainedAutoFix.js
M  ui/failureMemory.js
M  ui/public/spatial/spatialApp.js
M  ui/server.js
A  ui/tests/constrainedAutoFix.test.mjs
M  ui/tests/failureMemory.test.mjs
M  ui/tests/helpers/browser-module-loader.mjs
M  ui/tests/run-ui-tests.mjs
M  ui/tests/server.test.mjs
M  ui/tests/spatialApp.smoke.test.mjs
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/next_slice.md
 M brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/failureMemory.js
 M ui/public/spatial/spatialApp.js
 M ui/server.js
 M ui/tests/failureMemory.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/next_slice.md
 D brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/failureMemory.js
 M ui/public/spatial/spatialApp.js
 M ui/server.js
 M ui/tests/failureMemory.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs

### git_apply_check_failed
- Count: 30
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-03-29T13:43:22.952Z
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.
