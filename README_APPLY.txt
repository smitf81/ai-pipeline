AXIOM safe_write_documentation v1 patch

Copy the AXIOM folder from this patch over your AXIOM project root.

Changed files:
- AXIOM/apps/plugin-builder/src/mcp/tools/safe_write_documentation.js
- AXIOM/apps/plugin-builder/src/mcp/safe_write_documentation.js
- AXIOM/apps/plugin-builder/docs/tools/safe_write_documentation_v1.md

After copying, restart the AXIOM Plugin Builder / MCP server.

Smoke tests to run in AXIOM MCP Quick Call:

1) Write docs/tools/smoke.md
{
  "path": "docs/tools/smoke.md",
  "content": "# Smoke\n",
  "overwrite": true,
  "reason": "Smoke test doc lane after safe writer v1"
}

2) Write src/mcp/tools/generated_smoke.js
{
  "path": "src/mcp/tools/generated_smoke.js",
  "content": "export async function generated_smoke() { return { ok: true }; }\n",
  "overwrite": true,
  "reason": "Smoke test MCP tool lane after safe writer v1"
}

3) Write plugins/smokeplugin/src/index.js
{
  "path": "plugins/smokeplugin/src/index.js",
  "content": "export async function onLoad(ctx) { ctx.log?.info?.('smoke plugin loaded'); }\n",
  "overwrite": true,
  "reason": "Smoke test plugin script lane after safe writer v1"
}

Expected result: ok true, applied true, lane shown, sha256 shown.
