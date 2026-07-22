# AXIOM Plugin Builder

MCP-callable governed plugin builder for AXIOM IDE.

AXIOM is treated as a cognitive OS: generated plugin output is a proposal until it is validated, packaged, registered, and explicitly activated.

## What this provides

- `axiom_plugin_create`
- `axiom_plugin_validate`
- `axiom_plugin_package`
- `axiom_plugin_register`
- `axiom_plugin_list`
- `axiom_plugin_inspect`
- `list_plugin_templates`
- `explain_plugin_contract`
- `axiom_plugin_create_from_gap`

## First proof slice

Run:

```bash
npm test
```

This creates a sample plugin, validates it, packages it, registers it, and proves unvalidated registration is blocked.

## MCP usage

Start stdio MCP server:

```bash
npm start
```

Or HTTP helper mode for quick local testing:

```bash
npm run start:http
```

HTTP endpoints:

- `GET /health`
- `GET /tools`
- `POST /call` with `{ "name": "axiom_plugin_create", "arguments": {...} }`

## Governance model

Lifecycle:

`draft -> generated -> validated -> packaged -> registered -> active -> suspended -> rejected`

Rules:

- Generated plugin output is a proposal, not active truth.
- Validation must pass before packaging or registration.
- Registration produces a receipt.
- Activation is explicit and recorded.
- Permissions and capabilities must be declared before execution.
- Plugins may not silently modify AXIOM core files.
- AXIOM must never load an unvalidated plugin directly.

## Folder structure

```txt
axiom-plugin-builder/
  src/
    builder/index.js
    builder/templates.js
    mcp/server.js
    validator.js
    packager.js
    registry.js
    paths.js
  schemas/
    plugin-manifest.schema.json
    mcp-contract.schema.json
  scripts/smoke-test.js
  demo/workflow.js
  plugins/       generated plugin proposals
  packages/      packaged .axpkg bundles
  registry.json  created at runtime
```


## Slice 2: implementation-bearing plugin generation

New MCP tool:

- `axiom_plugin_generate_patch`

This generates bounded implementation-bearing plugin proposals for known AXIOM capability gaps. Slice 2 supports viewport navigation plugins.

Example HTTP call:

```powershell
Invoke-RestMethod `
  -Uri "http://127.0.0.1:4242/call" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"name":"axiom_plugin_generate_patch","arguments":{"plugin_id":"viewport-navigation-v2","name":"Viewport Navigation V2","capability_gap":"AXIOM viewport navigation needs middle mouse orbit, WASD movement while middle mouse is held, and F focus.","target_area":"editor.viewport","template":"editor"}}'
```

The generated plugin remains proposal-only until validated, packaged, registered, and explicitly activated by an AXIOM runtime plugin loader.

See `SLICE-2-REPORT.md` for details.
