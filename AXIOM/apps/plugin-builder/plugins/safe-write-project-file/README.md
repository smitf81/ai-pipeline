# safe_write_project_file

Implementation-bearing plugin proposal for: safe_write_project_file

## What this is

A server-side MCP tool proposal for `safe_write_project_file`.

It is not a viewport/editor plugin. It does not install camera controls. It does not modify AXIOM core files while generated.

## Tool modes

- `documentation`: write bounded docs/text/json content.
- `config_patch`: exact-find replacement for config files.
- `core_patch`: exact-find replacement for source/editor files.

## Safety rules

- Project-root path restriction is mandatory.
- core_patch and config_patch require expected_find and replacement.
- expected_find must occur exactly once.
- dry_run must validate without writing.
- write mode must create a timestamped backup before modification.
- binary files must be refused.
- SHA-256 before/after hashes must be returned in the receipt.

## Activation status

proposal_only_until_server_side_mcp_tool_is_patched_into_runtime
