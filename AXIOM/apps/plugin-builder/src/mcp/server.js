#!/usr/bin/env node
import http from 'node:http';
import {
  axiom_plugin_create,
  axiom_plugin_create_from_gap,
  axiom_plugin_generate_patch,
  axiom_plugin_build_slice,
  axiom_plugin_build_from_candidate,
  axiom_plugin_model_build_slice,
  axiom_plugin_validate,
  axiom_plugin_package,
  axiom_plugin_register,
  axiom_plugin_delete,
  axiom_plugin_list,
  axiom_plugin_inspect,
  list_plugin_templates,
  explain_plugin_contract
} from '../builder/index.js';

import { createSafeWriteDocumentationTool } from "./tools/safe_write_documentation.js";

export const TOOLS = {
  axiom_plugin_create: {
    name: 'axiom_plugin_create',
    description: 'Create an AXIOM plugin proposal from a template. The generated plugin is not active until validated, packaged, registered, and explicitly activated.',
    inputSchema: { type: 'object', required: ['name', 'description'], properties: { name: { type: 'string' }, description: { type: 'string' }, template: { type: 'string', enum: ['base', 'ui_panel', 'mcp_tool', 'editor'], default: 'base' }, capabilities: { type: 'array', items: { type: 'string' } }, permissions: { type: 'object' }, author_source: { type: 'string', enum: ['human', 'axiom-agent', 'external'], default: 'axiom-agent' }, request_id: { type: 'string' } } },
    handler: axiom_plugin_create
  },
  axiom_plugin_create_from_gap: {
    name: 'axiom_plugin_create_from_gap',
    description: 'Create a non-implementation plugin proposal for a missing AXIOM capability/tool gap. Refuses implementation-like gaps unless a placeholder scaffold is explicitly requested.',
    inputSchema: { type: 'object', required: ['capability_gap'], properties: { capability_gap: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, template: { type: 'string', enum: ['base', 'ui_panel', 'mcp_tool', 'editor'] }, allow_template_placeholder: { type: 'boolean', default: false }, author_source: { type: 'string', enum: ['human', 'axiom-agent', 'external'], default: 'axiom-agent' }, request_id: { type: 'string' } } },
    handler: axiom_plugin_create_from_gap
  },
  axiom_plugin_generate_patch: {
    name: 'axiom_plugin_generate_patch',
    description: 'Generate an implementation-bearing plugin proposal for a bounded AXIOM capability gap without modifying AXIOM core files. Refuses unsupported gaps instead of emitting misleading template code. Supported generators: viewport_navigation, safe_write_project_file.',
    inputSchema: {
      type: 'object',
      required: ['capability_gap'],
      properties: {
        plugin_id: { type: 'string' },
        capability_gap: { type: 'string' },
        target_area: { type: 'string', default: 'editor.viewport', enum: ['editor.viewport', 'editor.viewport.navigation', 'viewport.navigation', 'viewport.camera_controls', 'editor.camera_controls', 'mcp.project_file_write', 'mcp.tool', 'project.file_write'] },
        existing_context: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' } },
            known_functions: { type: 'array', items: { type: 'string' } },
            runtime_apis: { type: 'array', items: { type: 'string' } },
            constraints: { type: 'array', items: { type: 'string' } }
          }
        },
        template: { type: 'string', enum: ['editor', 'mcp_tool'], default: 'editor' },
        name: { type: 'string' },
        request_id: { type: 'string' }
      }
    },
    handler: axiom_plugin_generate_patch
  },
  axiom_plugin_build_slice: {
    name: 'axiom_plugin_build_slice',
    description: 'One-shot governed plugin slice build for supported implementation gaps: generate implementation-bearing proposal, validate, package, and optionally register. It does not activate runtime plugins.',
    inputSchema: {
      type: 'object',
      required: ['capability_gap'],
      properties: {
        plugin_id: { type: 'string' },
        capability_gap: { type: 'string' },
        target_area: { type: 'string' },
        existing_context: { type: 'object' },
        template: { type: 'string', enum: ['editor', 'mcp_tool'] },
        name: { type: 'string' },
        register: { type: 'boolean', default: true },
        request_id: { type: 'string' }
      }
    },
    handler: axiom_plugin_build_slice
  },
  axiom_plugin_build_from_candidate: {
    name: 'axiom_plugin_build_from_candidate',
    description: 'Land an agent/model-generated plugin candidate by writing files, validating, packaging, and optionally registering. Failed validation returns exact errors and a retry prompt.',
    inputSchema: {
      type: 'object',
      required: ['candidate'],
      properties: {
        plugin_id: { type: 'string' },
        name: { type: 'string' },
        capability_gap: { type: 'string' },
        target_area: { type: 'string' },
        template: { type: 'string', enum: ['base', 'ui_panel', 'mcp_tool', 'editor'], default: 'base' },
        register: { type: 'boolean', default: true },
        candidate: { type: 'object' },
        request_id: { type: 'string' }
      }
    },
    handler: axiom_plugin_build_from_candidate
  },
  axiom_plugin_model_build_slice: {
    name: 'axiom_plugin_model_build_slice',
    description: 'Ask the local Ollama model for a concrete plugin candidate, then write, validate, package, and optionally register it. Bad model output returns validation/retry feedback instead of a fake success.',
    inputSchema: {
      type: 'object',
      required: ['capability_gap'],
      properties: {
        plugin_id: { type: 'string' },
        name: { type: 'string' },
        capability_gap: { type: 'string' },
        target_area: { type: 'string' },
        template: { type: 'string', enum: ['base', 'ui_panel', 'mcp_tool', 'editor'], default: 'base' },
        register: { type: 'boolean', default: true },
        model: { type: 'string', default: 'qwen3.5-9b' },
        host: { type: 'string', default: 'http://127.0.0.1:11434' },
        timeout_ms: { type: 'number', default: 60000 },
        model_candidate: { type: 'object' },
        request_id: { type: 'string' }
      }
    },
    handler: axiom_plugin_model_build_slice
  },
  axiom_plugin_validate: {
    name: 'axiom_plugin_validate',
    description: 'Validate a generated plugin against AXIOM governance and safety rules. Required before packaging/registration.',
    inputSchema: { type: 'object', required: ['plugin_id'], properties: { plugin_id: { type: 'string' }, strict: { type: 'boolean', default: true }, request_id: { type: 'string' } } },
    handler: axiom_plugin_validate
  },
  axiom_plugin_package: {
    name: 'axiom_plugin_package',
    description: 'Package a validated plugin into a .axpkg bundle. Blocks unvalidated plugins.',
    inputSchema: { type: 'object', required: ['plugin_id'], properties: { plugin_id: { type: 'string' }, include_source_maps: { type: 'boolean', default: false }, request_id: { type: 'string' } } },
    handler: axiom_plugin_package
  },
  axiom_plugin_register: {
    name: 'axiom_plugin_register',
    description: 'Register a packaged plugin into the AXIOM registry. Produces a receipt. Activation must be explicit.',
    inputSchema: { type: 'object', required: ['plugin_id'], properties: { plugin_id: { type: 'string' }, activate: { type: 'boolean', default: false }, auto_activate: { type: 'boolean', default: false }, request_id: { type: 'string' } } },
    handler: axiom_plugin_register
  },
  axiom_plugin_delete: {
    name: 'axiom_plugin_delete',
    description: 'Delete a generated/rejected/unvalidated plugin proposal from the Plugin Builder store. Registered or validated plugins require force=true.',
    inputSchema: { type: 'object', required: ['plugin_id'], properties: { plugin_id: { type: 'string' }, force: { type: 'boolean', default: false }, request_id: { type: 'string' } } },
    handler: axiom_plugin_delete
  },
  axiom_plugin_list: {
    name: 'axiom_plugin_list',
    description: 'List generated/validated/packaged/registered AXIOM plugins.',
    inputSchema: { type: 'object', properties: { status_filter: { type: 'string' }, capability_filter: { type: 'string' }, request_id: { type: 'string' } } },
    handler: axiom_plugin_list
  },
  axiom_plugin_inspect: {
    name: 'axiom_plugin_inspect',
    description: 'Inspect manifest, validation state, lifecycle log, and optionally plugin files.',
    inputSchema: { type: 'object', required: ['plugin_id'], properties: { plugin_id: { type: 'string' }, include_files: { type: 'boolean', default: false }, request_id: { type: 'string' } } },
    handler: axiom_plugin_inspect
  },
  list_plugin_templates: {
    name: 'list_plugin_templates',
    description: 'List available plugin templates.',
    inputSchema: { type: 'object', properties: { request_id: { type: 'string' } } },
    handler: list_plugin_templates
  },
  explain_plugin_contract: {
    name: 'explain_plugin_contract',
    description: 'Explain AXIOM plugin lifecycle, governance rules, manifest requirements, and MCP response shape.',
    inputSchema: { type: 'object', properties: { request_id: { type: 'string' } } },
    handler: explain_plugin_contract
  },
  safe_write_documentation: {
    ...createSafeWriteDocumentationTool({
      rootDir: process.cwd()
    })
  }
};

function asMcpTool(t) { return { name: t.name, description: t.description, inputSchema: t.inputSchema }; }

export async function callTool(name, args = {}) {
  const tool = TOOLS[name];
  if (!tool) return { ok: false, tool: name, request_id: args?.request_id || null, plugin_id: args?.plugin_id || null, status: 'error', result: {}, validation: { ran: false, passed: false }, errors: [{ code: 'UNKNOWN_TOOL', message: `Unknown tool: ${name}`, severity: 'error' }], warnings: [], receipt: null };
  try { return await tool.handler(args || {}); }
  catch (e) { return { ok: false, tool: name, request_id: args?.request_id || null, plugin_id: args?.plugin_id || null, status: 'error', result: {}, validation: { ran: false, passed: false }, errors: [{ code: 'TOOL_EXCEPTION', message: e.message, severity: 'error', stack: e.stack }], warnings: [], receipt: null }; }
}

async function handleJsonRpc(req) {
  const { id, method, params } = req;
  if (method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'axiom-plugin-builder', version: '1.0.0' } } };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: Object.values(TOOLS).map(asMcpTool) } };
  if (method === 'tools/call') {
    const result = await callTool(params?.name, params?.arguments || {});
    return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError: !result.ok } };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

function startStdio() {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  process.stdin.on('data', async chunk => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try { process.stdout.write(JSON.stringify(await handleJsonRpc(JSON.parse(line))) + '\n'); }
      catch (e) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: e.message } }) + '\n'); }
    }
  });
  process.stderr.write('[axiom-plugin-builder] MCP stdio ready\n');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

function send(res, code, data) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
  res.end(JSON.stringify(data, null, 2));
}

function startHttp() {
  const port = Number(process.env.PORT || 4242);
  http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'axiom-plugin-builder', tool_count: Object.keys(TOOLS).length });
    if (req.method === 'GET' && req.url === '/tools') return send(res, 200, { ok: true, tools: Object.values(TOOLS).map(asMcpTool) });
    if (req.method === 'POST' && req.url === '/call') {
      const body = await readBody(req);
      return send(res, 200, await callTool(body.name, body.arguments || {}));
    }
    return send(res, 404, { ok: false, error: 'not found' });
  }).listen(port, '127.0.0.1', () => process.stderr.write(`[axiom-plugin-builder] HTTP ready http://127.0.0.1:${port}\n`));
}

if (process.argv.includes('--http')) startHttp();
else startStdio();
