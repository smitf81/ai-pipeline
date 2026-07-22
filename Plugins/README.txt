```txt
Build a tool for creating, validating, packaging, and registering plugins for AXIOM IDE.

Context:
AXIOM IDE is a cognitive OS, not a normal editor.

The tool must allow:
1. Human & Agentic developers to build AXIOM plugins.
2. AXIOM itself to call the tool as an MCP tool.
3. Plugins to be generated through governed, inspectable, testable workflows.

Core requirement:
Create an MCP-callable Plugin Builder for AXIOM.

The tool must support:
- create_plugin
- inspect_plugin
- validate_plugin
- package_plugin
- register_plugin
- list_plugin_templates
- explain_plugin_contract

Plugins must include:
- plugin manifest
- plugin entry file
- declared capabilities
- declared permissions
- lifecycle hooks
- tool/API contracts
- validation tests
- provenance metadata
- compatibility metadata

Plugin manifest must define:
- id
- name
- version
- description
- author/source
- entrypoint
- capabilities
- permissions
- exposed MCP tools, if any
- AXIOM runtime dependencies
- UI surfaces, if any
- event subscriptions
- safety constraints
- validation status

AXIOM must never load an unvalidated plugin directly.

Plugin lifecycle:
1. draft
2. generated
3. validated
4. packaged
5. registered
6. active
7. suspended
8. rejected

Governance rules:
- generated plugin output is a proposal, not active truth
- validation must run before registration
- registration must produce a receipt
- activation must be explicit and recorded
- failed validation must return structured errors
- plugin permissions must be declared before execution
- no plugin may silently modify AXIOM core files

MCP interface:
Expose the Plugin Builder as an MCP server/tool so AXIOM can call it.

Required MCP tools:
- axiom_plugin_create
- axiom_plugin_validate
- axiom_plugin_package
- axiom_plugin_register
- axiom_plugin_list
- axiom_plugin_inspect

Each MCP response must return:
- ok
- tool
- request_id
- plugin_id
- status
- result
- validation
- errors
- warnings
- receipt

Design priority:
Axiom must be able to call tool through natural language in the chat
Axiom should be able to recognise the need for missing tools and use this to make plugins to bridge gaps in editor capabilities

Do not build a marketplace.

The first working slice should prove:
AXIOM can request a plugin through MCP, receive generated plugin files, validate them, package them, and register them without bypassing governance.

Deliverables:
- folder structure
- plugin manifest schema
- MCP tool contract schema
- minimal working plugin template
- validation rules
- registration receipt format
- implemented tool

```