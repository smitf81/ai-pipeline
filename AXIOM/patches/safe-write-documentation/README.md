# AXIOM Safe Write Documentation Patch

This bundle adds a bounded MCP/server-side write tool:

safe_write_documentation

It is intended for saving AXIOM documentation, operating skills, and plugin-builder workspace files without giving AXIOM unrestricted filesystem access.

## Files

- mcp/tools/safe_write_documentation.js
- docs/skills/axiom-agentic-repair-loop.md
- INTEGRATION_NOTES.md

## What this does

Allows writes only under:

- docs/
- docs/skills/
- pluginbuilder_workspace/
- pluginbuilder_finished/

Blocks absolute paths, traversal, node_modules, .env, package files, core-ish paths, and launcher/script paths.

Every write returns a receipt.
