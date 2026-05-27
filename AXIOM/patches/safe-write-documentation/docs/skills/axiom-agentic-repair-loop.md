# AXIOM Agentic Repair Loop v0

## Purpose

Define AXIOM's bounded try / validate / retry workflow for plugin repair, editor capability gaps, MCP/tool gaps, and safe documentation persistence.

## Core principle

AXIOM should not stop after one failed tool call. A failed tool call is evidence.

## Loop

1. Classify intent.
2. Inspect available tools and current state.
3. Choose the smallest safe action.
4. Execute.
5. Validate.
6. If failed, classify failure.
7. Retry with a changed strategy.
8. Stop only on success proven, hard safety boundary, missing capability, or retry budget exhausted.

## Retry rules

- Maximum 3 attempts per phase.
- Never repeat the same failed call unchanged.
- Never guess filesystem paths when inspect/list/search tools exist.
- Use receipts as truth, not optimistic chat text.
- Prefer dry-run before write when available.
- Escalate only when the missing capability is real.

## Plugin lifecycle

For editor capability gaps:

1. axiom_plugin_create_from_gap
2. axiom_plugin_inspect
3. axiom_plugin_validate
4. axiom_plugin_package
5. axiom_plugin_register
6. axiom_plugin_activate
7. axiom_plugin_runtime_status

If the plugin is only a stub, report it honestly.

## Documentation persistence

For approved operating notes and skill markdown, use safe_write_documentation when available.

Allowed paths:

- docs/
- docs/skills/
- pluginbuilder_workspace/
- pluginbuilder_finished/

Blocked:

- absolute paths outside project root
- ../ traversal
- node_modules
- .env
- package files
- core server files
- launcher scripts

The tool must return a receipt with applied, path, existed_before, exists_after, bytes_written, timestamp, sha256, and blocked_reason if blocked.

## Safety without button-monkey nonsense

Safety should come from path constraints, schema validation, dry runs, receipts, audit logs, small retry budgets, blocked path rules, and reversible changes where possible.

Not endless manual approval prompts.
