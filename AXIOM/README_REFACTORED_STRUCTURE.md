# AXIOM Refactored Structure

apps/launcher -> primary runtime launcher and MCP bridge
apps/plugin-builder -> plugin generation and repair services
services/sse-bridge -> SSE bridge runtime
patches -> isolated patch experiments
archives -> historical backups and legacy builds
docs -> operational notes and fix reports
config/mcp-tool-registry.json -> canonical exposed MCP tool registry

Key Fixes:
- Unified MCP exposure expectations around launcher server.
- Added safe_write_documentation to launcher MCP registry.
- Removed top-level clutter by grouping apps/services/docs/archives.
