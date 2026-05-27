const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const DEFAULT_ACE_BASE_URL = 'http://localhost:3000';
const DEFAULT_ACE_TIMEOUT_MS = 20000;

const ACE_RESOURCE_DEFINITIONS = Object.freeze([
  {
    name: 'ace_health',
    uri: 'ace://health',
    title: 'ACE Health',
    description: 'Health and self-upgrade readiness for the local ACE server.',
  },
  {
    name: 'ace_runtime',
    uri: 'ace://runtime',
    title: 'ACE Runtime',
    description: 'Live ACE runtime state including orchestrator, pages, handoffs, and desk activity.',
  },
  {
    name: 'ace_workspace',
    uri: 'ace://workspace',
    title: 'ACE Workspace',
    description: 'Persisted ACE workspace state including graphs, studio state, and intent memory.',
  },
  {
    name: 'ace_team_board',
    uri: 'ace://team-board',
    title: 'ACE Team Board',
    description: 'The global kanban board ACE uses to track planned, active, complete, and gated work.',
  },
  {
    name: 'ace_throughput_latest',
    uri: 'ace://throughput/latest',
    title: 'Latest Throughput Session',
    description: 'The latest end-to-end ACE throughput debug session, if one exists.',
  },
  {
    name: 'ace_qa_latest',
    uri: 'ace://qa/latest',
    title: 'Latest Browser QA Run',
    description: 'The latest ACE browser QA pass, including diagnostics and captured artifacts.',
  },
]);

function resolveAceBaseUrl(baseUrl = process.env.ACE_BASE_URL || DEFAULT_ACE_BASE_URL) {
  const trimmed = String(baseUrl || '').trim() || DEFAULT_ACE_BASE_URL;
  return trimmed.replace(/\/+$/, '');
}

function resolveAceTimeoutMs(timeoutMs = process.env.ACE_TIMEOUT_MS || DEFAULT_ACE_TIMEOUT_MS) {
  const parsed = Number.parseInt(String(timeoutMs), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACE_TIMEOUT_MS;
}

function buildAceUrl(baseUrl, pathname) {
  return `${resolveAceBaseUrl(baseUrl)}${pathname}`;
}

function formatJson(payload) {
  return JSON.stringify(payload, null, 2);
}

function createJsonResource(uri, payload) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: formatJson(payload),
      },
    ],
  };
}

function createJsonToolResult(payload, heading) {
  const body = formatJson(payload);
  return {
    content: [
      {
        type: 'text',
        text: heading ? `${heading}\n${body}` : body,
      },
    ],
    structuredContent: payload,
  };
}

function buildAceErrorMessage(method, pathname, status, payload) {
  const detail = typeof payload === 'string'
    ? payload
    : payload?.error || payload?.message || payload?.status || '';
  return `ACE request failed: ${method} ${pathname} (${status})${detail ? ` ${detail}` : ''}`;
}

function createAceFetchClient(options = {}) {
  const baseUrl = resolveAceBaseUrl(options.baseUrl);
  const timeoutMs = resolveAceTimeoutMs(options.timeoutMs);
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('ACE MCP requires a fetch implementation.');
  }

  async function requestJson(method, pathname, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(buildAceUrl(baseUrl, pathname), {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let payload = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (_error) {
          payload = text;
        }
      }
      if (!response.ok) {
        throw new Error(buildAceErrorMessage(method, pathname, response.status, payload));
      }
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    baseUrl,
    timeoutMs,
    get(pathname) {
      return requestJson('GET', pathname);
    },
    post(pathname, body) {
      return requestJson('POST', pathname, body);
    },
  };
}

async function readLatestThroughputSession(client) {
  const listing = await client.get('/api/spatial/debug/throughput');
  const latestSessionId = listing?.latestSession?.id || listing?.sessions?.[0]?.id || null;
  if (!latestSessionId) {
    return {
      latestSession: null,
      sessions: Array.isArray(listing?.sessions) ? listing.sessions : [],
    };
  }
  const detail = await client.get(`/api/spatial/debug/throughput/${encodeURIComponent(latestSessionId)}`);
  return {
    latestSession: detail?.session || null,
    sessions: Array.isArray(listing?.sessions) ? listing.sessions : [],
  };
}

async function readLatestQaRun(client) {
  const listing = await client.get('/api/spatial/qa/runs');
  const latestRunId = listing?.latestRun?.id || listing?.runs?.[0]?.id || null;
  if (!latestRunId) {
    return {
      latestRun: null,
      runs: Array.isArray(listing?.runs) ? listing.runs : [],
    };
  }
  const detail = await client.get(`/api/spatial/qa/runs/${encodeURIComponent(latestRunId)}`);
  return {
    latestRun: detail?.run || null,
    runs: Array.isArray(listing?.runs) ? listing.runs : [],
  };
}

async function readAceResource(uri, options = {}) {
  const client = options.client || createAceFetchClient(options);
  switch (uri) {
    case 'ace://health':
      return client.get('/api/health');
    case 'ace://runtime':
      return client.get('/api/spatial/runtime');
    case 'ace://workspace':
      return client.get('/api/spatial/workspace');
    case 'ace://team-board': {
      const workspace = await client.get('/api/spatial/workspace');
      return {
        teamBoard: workspace?.studio?.teamBoard || null,
        activePageId: workspace?.activePageId || null,
        source: '/api/spatial/workspace',
      };
    }
    case 'ace://throughput/latest':
      return readLatestThroughputSession(client);
    case 'ace://qa/latest':
      return readLatestQaRun(client);
    default:
      throw new Error(`Unknown ACE MCP resource: ${uri}`);
  }
}

function listAceResources() {
  return ACE_RESOURCE_DEFINITIONS.map((resource) => ({ ...resource }));
}

async function callAceTool(name, args = {}, options = {}) {
  const client = options.client || createAceFetchClient(options);
  switch (name) {
    case 'get_runtime':
      return client.get('/api/spatial/runtime');
    case 'get_workspace':
      return client.get('/api/spatial/workspace');
    case 'get_team_board': {
      const workspace = await client.get('/api/spatial/workspace');
      return {
        teamBoard: workspace?.studio?.teamBoard || null,
        activePageId: workspace?.activePageId || null,
      };
    }
    case 'run_throughput_debug':
      return client.post('/api/spatial/debug/throughput', {
        prompt: args.prompt,
        mode: args.mode,
        project: args.project,
        runQa: args.runQa,
        confirmDeploy: args.confirmDeploy,
        simulate: args.simulate,
      });
    case 'get_throughput_session':
      return client.get(`/api/spatial/debug/throughput/${encodeURIComponent(args.sessionId)}`);
    case 'run_browser_pass':
      return client.post('/api/spatial/qa/run', {
        scenario: args.scenario,
        mode: args.mode,
        trigger: args.trigger,
        prompt: args.prompt,
        actions: Array.isArray(args.actions) ? args.actions : [],
        linked: args.linked && typeof args.linked === 'object' ? args.linked : {},
      });
    case 'get_qa_run':
      return client.get(`/api/spatial/qa/runs/${encodeURIComponent(args.runId)}`);
    case 'team_board_action':
      return client.post('/api/spatial/team-board/action', {
        action: args.action,
        cardId: args.cardId,
      });
    default:
      throw new Error(`Unknown ACE MCP tool: ${name}`);
  }
}

function createAceRuntimeMcpServer(options = {}) {
  const client = createAceFetchClient(options);
  const mcpServer = new McpServer(
    {
      name: 'ace-runtime',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  for (const resource of ACE_RESOURCE_DEFINITIONS) {
    mcpServer.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: resource.description,
        mimeType: 'application/json',
      },
      async () => {
        const payload = await readAceResource(resource.uri, { client });
        return createJsonResource(resource.uri, payload);
      },
    );
  }

  mcpServer.registerTool(
    'get_runtime',
    {
      title: 'Get ACE Runtime',
      description: 'Fetch the live ACE runtime snapshot.',
    },
    async () => {
      const payload = await callAceTool('get_runtime', {}, { client });
      return createJsonToolResult(payload, 'ACE runtime');
    },
  );

  mcpServer.registerTool(
    'get_workspace',
    {
      title: 'Get ACE Workspace',
      description: 'Fetch the persisted ACE workspace snapshot.',
    },
    async () => {
      const payload = await callAceTool('get_workspace', {}, { client });
      return createJsonToolResult(payload, 'ACE workspace');
    },
  );

  mcpServer.registerTool(
    'get_team_board',
    {
      title: 'Get ACE Team Board',
      description: 'Fetch the ACE team board and active page context.',
    },
    async () => {
      const payload = await callAceTool('get_team_board', {}, { client });
      return createJsonToolResult(payload, 'ACE team board');
    },
  );

  mcpServer.registerTool(
    'run_throughput_debug',
    {
      title: 'Run ACE Throughput Debug',
      description: 'Run an end-to-end ACE throughput session from prompt to runtime audit.',
      inputSchema: {
        prompt: z.string().min(1).optional(),
        project: z.string().min(1).optional(),
        mode: z.enum(['live', 'fixture']).optional(),
        runQa: z.boolean().optional(),
        confirmDeploy: z.boolean().optional(),
        simulate: z.boolean().optional(),
      },
    },
    async (args) => {
      const payload = await callAceTool('run_throughput_debug', args, { client });
      return createJsonToolResult(payload, 'ACE throughput debug');
    },
  );

  mcpServer.registerTool(
    'get_throughput_session',
    {
      title: 'Get Throughput Session',
      description: 'Fetch a specific ACE throughput session by id.',
      inputSchema: {
        sessionId: z.string().min(1),
      },
    },
    async (args) => {
      const payload = await callAceTool('get_throughput_session', args, { client });
      return createJsonToolResult(payload, 'ACE throughput session');
    },
  );

  mcpServer.registerTool(
    'run_browser_pass',
    {
      title: 'Run Browser QA Pass',
      description: 'Launch a browser-based QA pass against the local ACE UI.',
      inputSchema: {
        scenario: z.string().min(1).optional(),
        mode: z.enum(['observation', 'interactive']).optional(),
        trigger: z.string().min(1).optional(),
        prompt: z.string().optional(),
        actions: z.array(z.any()).optional(),
        linked: z.record(z.any()).optional(),
      },
    },
    async (args) => {
      const payload = await callAceTool('run_browser_pass', args, { client });
      return createJsonToolResult(payload, 'ACE browser pass');
    },
  );

  mcpServer.registerTool(
    'get_qa_run',
    {
      title: 'Get Browser QA Run',
      description: 'Fetch a specific ACE browser QA run by id.',
      inputSchema: {
        runId: z.string().min(1),
      },
    },
    async (args) => {
      const payload = await callAceTool('get_qa_run', args, { client });
      return createJsonToolResult(payload, 'ACE browser QA run');
    },
  );

  mcpServer.registerTool(
    'team_board_action',
    {
      title: 'Run Team Board Action',
      description: 'Approve, reject, bin, or start backend-owned ACE team board work.',
      inputSchema: {
        action: z.enum(['approve-apply', 'reject-to-builder', 'bin', 'start-builder']),
        cardId: z.string().min(1),
      },
    },
    async (args) => {
      const payload = await callAceTool('team_board_action', args, { client });
      return createJsonToolResult(payload, 'ACE team board action');
    },
  );

  return {
    client,
    mcpServer,
  };
}

async function startAceRuntimeMcp(options = {}) {
  const runtime = createAceRuntimeMcpServer(options);
  const transport = new StdioServerTransport();
  await runtime.mcpServer.connect(transport);
  return runtime;
}

module.exports = {
  ACE_RESOURCE_DEFINITIONS,
  DEFAULT_ACE_BASE_URL,
  DEFAULT_ACE_TIMEOUT_MS,
  buildAceUrl,
  callAceTool,
  createAceFetchClient,
  createAceRuntimeMcpServer,
  listAceResources,
  readAceResource,
  readLatestQaRun,
  readLatestThroughputSession,
  resolveAceBaseUrl,
  resolveAceTimeoutMs,
  startAceRuntimeMcp,
};

if (require.main === module) {
  startAceRuntimeMcp().catch((error) => {
    process.stderr.write(`ACE MCP server failed to start: ${error?.stack || String(error)}\n`);
    process.exitCode = 1;
  });
}
