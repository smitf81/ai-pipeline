# Integration Notes — safe_write_documentation

Because I do not have your exact MCP server registry file in front of me, this is a drop-in CommonJS tool module plus a generic integration pattern.

## 1. Copy the tool

Copy:

mcp/tools/safe_write_documentation.js

into your AXIOM MCP/server tools folder, beside fs_ls, fs_cat, fs_grep, and the axiom_plugin_* tools.

## 2. Register the tool

Somewhere in your MCP server startup/registry code, add roughly:

```js
const { createSafeWriteDocumentationTool } = require("./tools/safe_write_documentation");

const safeWriteDocumentation = createSafeWriteDocumentationTool({
  rootDir: AXIOM_PROJECT_ROOT
});

registry.registerTool(
  safeWriteDocumentation.name,
  safeWriteDocumentation.description,
  safeWriteDocumentation.inputSchema,
  safeWriteDocumentation.handler
);
```

Adapt this to match however your existing fs_cat / fs_grep tools are registered.

## 3. Test manually

Tool:

safe_write_documentation

Params:

```json
{
  "path": "docs/skills/axiom-agentic-repair-loop.md",
  "content": "# Test\n\nsafe_write_documentation is live.",
  "overwrite": true,
  "reason": "manual smoke test"
}
```

## 4. Test blocked traversal

```json
{
  "path": "../bad.md",
  "content": "nope",
  "overwrite": true
}
```

Expected blocked_reason:

path_traversal_blocked

## 5. Why MCP/server, not editor plugin sandbox

The camera plugin worked because it only needed browser runtime hooks.

Writing real .md files crosses from browser/editor sandbox into server/filesystem authority.

That belongs in MCP/server with bounded paths, schema validation, receipts, and audit logs.
