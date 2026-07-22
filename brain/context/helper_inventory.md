# Helper Inventory

This is a targeted ownership record, not mandatory boot context. A helper launches, adapts, bridges, tests, or validates another system; it remains only while it has a live consumer or a named compatibility role.

## Retained

| Helper | Owner and caller | Activation path | Proof path | Retirement condition |
| --- | --- | --- | --- | --- |
| `qa_mcp_helper.py` | `ui/qaMcpLauncher.js`, called by `ui/server.js` | ACE dependency boot probes and launches the local QA HTTP contract | `ui/tests/qaMcpLauncher.test.mjs`, `ui/tests/server.test.mjs`, and intent-route coverage | Remove only when the QA endpoint has a replacement and server dependency state plus launcher tests no longer reference it |
| `ui/legacyRunnerAdapter.js` | `ui/server.js` | Bounded sync/stream fallback routes prefer the preserved `legacy/runner/ai.py`, with compatibility fallbacks | `ui/tests/legacyRunnerAdapter.test.mjs`, `ui/tests/server.test.mjs`, and the complete UI gate | Remove when both fallback routes and their payload resolver are retired or migrated |
| `ui/tests/helpers/browser-module-loader.mjs` | UI test suite and boot-integrity policy | Imported directly by browser-module tests | Complete `ui` test gate | Remove when browser modules can be loaded directly by the test runtime and all imports/trust-policy entries are migrated |
| User-scoped `develop-web-game/scripts/web_game_playwright_client.js` | Compatibility surface for historical project validation commands | Explicit command invocation only; no longer mandatory in the skill workflow | User-skill validation plus project-specific browser proof when selected | Remove when repository searches show no active or historical workflow still needs the compatibility command |

## Removed After Caller Proof

| Removed path | Canonical replacement | Evidence |
| --- | --- | --- |
| `AXIOM/services/sse-bridge/` | `AXIOM/apps/launcher` owns the SSE server, browser client, and runtime lifecycle | Zero imports/launchers/registry/test consumers; shared `server/sse.js` was byte-identical; launcher suite passes |
| `AXIOM/snippets/` | Integrated launcher server/editor/plugin runtime source | Only the obsolete root patch README referenced the snippets; no runtime or test consumer remained |
| `ui/server_DEPRECIATED.js` | `ui/server.js` | Zero imports, launchers, registry entries, documentation links, or tests |
| v0.3 MCP patch, v1.2 launcher hotfix, and activation-seam install notes | Current launcher source and tests | The notes instructed copying superseded bundles/patches and had no remaining consumers |
