# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-13T11:02:42.407Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 41545
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-13T11:02:42.405Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight, context-manager
- Example messages:
  - Repository has uncommitted tracked changes.
M agents/evaluator/agent.json
 M agents/evaluator/prompt.md
 M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/qa_1775978504535_bx6x8f.json
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa_mcp_helper.py
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/public/index.html
 M ui/public/spatial/boot-manifest.json
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelLayout.js
 M ui/public/spatial/truthKernelView.js
 M ui/public/style.css
 M ui/qaLeadRunner.js
 M ui/qaMcpLiveStatus.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/bootIntegrity.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/qaLeadRunner.test.mjs
 M ui/tests/qaMcpLiveStatus.test.mjs
 M ui/tests/qaScorecardIntegrity.test.mjs
 M ui/tests/server.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelIntegration.test.mjs
 M ui/tests/truthKernelLayout.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - Repository has uncommitted tracked changes.
M agents/evaluator/agent.json
 M agents/evaluator/prompt.md
 M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/qa_1775978504535_bx6x8f.json
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa_mcp_helper.py
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/public/index.html
 M ui/public/spatial/boot-manifest.json
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelLayout.js
 M ui/public/spatial/truthKernelView.js
 M ui/public/style.css
 M ui/qaLeadRunner.js
 M ui/qaMcpLiveStatus.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/bootIntegrity.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/qaLeadRunner.test.mjs
 M ui/tests/qaMcpLiveStatus.test.mjs
 M ui/tests/qaScorecardIntegrity.test.mjs
 M ui/tests/server.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelIntegration.test.mjs
 M ui/tests/truthKernelLayout.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - blocked | Repository has uncommitted tracked changes.
M agents/evaluator/agent.json
 M agents/evaluator/prompt.md
 M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/qa_1775978504535_bx6x8f.json
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa_mcp_helper.py
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/public/index.html
 M ui/public/spatial/boot-manifest.json
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelLayout.js
 M ui/public/spatial/truthKernelView.js
 M ui/public/style.css
 M ui/qaLeadRunner.js
 M ui/qaMcpLiveStatus.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/bootIntegrity.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/qaLeadRunner.test.mjs
 M ui/tests/qaMcpLiveStatus.test.mjs
 M ui/tests/qaScorecardIntegrity.test.mjs
 M ui/tests/server.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelIntegration.test.mjs
 M ui/tests/truthKernelLayout.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - blocked | Repository has uncommitted tracked changes.
M agents/evaluator/agent.json
 M agents/evaluator/prompt.md
 M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/context/ui_backend_drift.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/qa_1775978504535_bx6x8f.json
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa_mcp_helper.py
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/public/index.html
 M ui/public/spatial/boot-manifest.json
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelLayout.js
 M ui/public/spatial/truthKernelView.js
 M ui/public/style.css
 M ui/qaLeadRunner.js
 M ui/qaMcpLiveStatus.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/bootIntegrity.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/qaLeadRunner.test.mjs
 M ui/tests/qaMcpLiveStatus.test.mjs
 M ui/tests/qaScorecardIntegrity.test.mjs
 M ui/tests/server.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelIntegration.test.mjs
 M ui/tests/truthKernelLayout.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - Repository has uncommitted tracked changes.
- When:
  - Tracked edits already exist before apply starts.
  - The repo cleanliness check blocks the operation.
- Do:
  - Clean or isolate the worktree before rebuilding.
  - Preserve the current task artifacts and stop early.
- Avoid:
  - Applying a new patch on top of unreviewed tracked edits.
- Tags: git, repository, safety
- Source: failure-history

### Rebuild or rebase a patch that no longer applies cleanly
- Status: candidate
- Failure key: git_apply_check_failed
- Pattern: Git apply check failed
- Evidence count: 4
- First seen: 2026-04-09T08:43:52.389Z
- Last seen: 2026-04-13T09:52:42.461Z
- Related tools: git
- Related stages: apply
- Example messages:
  - Apply failed after patch drift.
- When:
  - A patch no longer matches the current tree.
  - git apply reports check failure or rejected hunks.
- Do:
  - Recompute the diff against the current tree.
  - Confirm the task folder still matches the target branch.
  - Apply only after the patch has been regenerated or refreshed.
- Avoid:
  - Retrying the same stale patch without refreshing it.
- Tags: git, patch, apply
- Source: failure-history
