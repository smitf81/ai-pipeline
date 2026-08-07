# AXIOM Refactored Structure

apps/launcher -> primary runtime launcher and MCP bridge
apps/plugin-builder -> plugin generation and repair services
patches -> isolated patch experiments
archives -> historical backups and legacy builds
docs -> operational notes and fix reports
config/mcp-tool-registry.json -> canonical exposed MCP tool registry

Key Fixes:
- Unified SSE and MCP ownership in the launcher server.
- Added safe_write_documentation to launcher MCP registry.
- Removed top-level clutter by grouping apps/services/docs/archives.
