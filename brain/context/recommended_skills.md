# Recommended Missing Skills for AI Pipeline, ACE, and AXIOM

This is an operational recommendation list. It is not canonical truth until promoted into `brain/emergence/*`.

## Closed now

### `project-index`
Implemented in `brain/skills/project-index/SKILL.md` with `tools/project_index_tool.mjs`. Use it to onboard new chats efficiently, append chat summaries, and avoid token-heavy whole-repo reads.

### `ace-runtime-smoke`
Implemented in `brain/skills/ace-runtime-smoke/SKILL.md` with `tools/ace-smoke.mjs`. Use it to run repo, skill, and UI validation through Windows-safe local commands.

### `contextops-maintainer`
Implemented in `brain/skills/contextops-maintainer/SKILL.md`. Use it to maintain `context/*`, `brain/context/*`, master indexes, appendices, and promotion boundaries.

### `ace-canonical-truth-map`
Implemented in `brain/skills/ace-canonical-truth-map/SKILL.md` with `tools/canonical-truth-map.mjs`. Use it to identify canonical owners, mutation authority, projections, and divergent paths before ACE/AXIOM behavior changes.

### `axiom-plugin-slice-builder`
Implemented in `brain/skills/axiom-plugin-slice-builder/SKILL.md` with `tools/axiom-plugin-slice.mjs`. Use it to guide AXIOM plugin proposals through manifest, lifecycle, validation, package, registry, and smoke checks.

## Remaining candidates

### `ace-next-slice-implementer`
Takes `brain/context/next_slice.md` plus canonical `brain/emergence/*` files and executes one narrow slice end-to-end, including exact file ownership and validation. This is more action-oriented than the existing next-slice selector.

### `ui-spatial-ide-change`
Specializes in `ui/server.js`, `ui/public/spatial/*`, and the spatial IDE tests. It should encode the route/data/UI truth-flow rules and require the `ui` test gate.

### `qa-evidence-loop`
Standardizes how QA findings, evidence files, repair jobs, and planner QA queues are read and updated. This would reduce drift between `qa/*`, `data/spatial/qa/*`, and UI QA surfaces.

### `agent-registry-governance`
Owns changes to `agents/*`, agent capabilities, desk routing, and worker registration. It should prevent label-based identity and keep `agents/AGENTS.md`, `ui/agentRegistry.js`, and runtime routes aligned.

### `axiom-file-manager`
Turns the AXIOM file-management implementation docs and verification reports into an executable workflow for continuing that subsystem without rereading all historical reports.

## Useful specialists

### `legacy-to-canonical-migration`
Audits legacy or duplicated implementations and proposes delete/reroute/promote decisions. Useful for `legacy/*`, nested `dev/ai-pipeline/*`, archived AXIOM versions, and old ACE lightweight copies.

### `mcp-server-builder`
Guides local MCP server changes under `tools/mcp/*` and AXIOM services, including protocol smoke tests and tool contract checks.

### `browser-game-project`
Specializes in the `Projects/Breach` and standalone browser-game experiments, keeping game iteration separate from ACE/AXIOM platform work.

### `asset-output-hygiene`
Manages generated screenshots, sprites, hatch-pet outputs, archives, and large binary artifacts so context indices and repo scans stay useful.

### `repo-release-packager`
Creates clean handoff bundles, patch notes, and artifact manifests from a dirty exploratory workspace without sweeping in unrelated generated output.
