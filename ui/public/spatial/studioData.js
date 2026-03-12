const STATIONS = [
  {
    id: 'context-manager',
    name: 'Context Manager',
    shortLabel: 'Context',
    role: 'Curates project context, live constraints, and working memory for the rest of ACE.',
    responsibility: 'books / archive / memory terminal',
    scope: ['context', 'constraint', 'memory', 'intent', 'brief'],
    theme: { accent: '#66c7ff', shadow: 'rgba(64, 133, 184, 0.38)' },
    position: { x: 16, y: 18 },
  },
  {
    id: 'planner',
    name: 'Planner',
    shortLabel: 'Planner',
    role: 'Breaks intent into sequences, milestones, and queued execution steps.',
    responsibility: 'whiteboard / sticky notes / task desk',
    scope: ['task', 'plan', 'todo', 'roadmap', 'flow'],
    theme: { accent: '#ffd36e', shadow: 'rgba(180, 132, 54, 0.38)' },
    position: { x: 54, y: 18 },
  },
  {
    id: 'executor',
    name: 'Executor',
    shortLabel: 'Exec',
    role: 'Owns build-facing delivery, implementation throughput, and task completion.',
    responsibility: 'terminal / build station',
    scope: ['build', 'implement', 'file', 'module', 'code', 'service'],
    theme: { accent: '#5ce29f', shadow: 'rgba(49, 132, 94, 0.38)' },
    position: { x: 16, y: 56 },
  },
  {
    id: 'memory-archivist',
    name: 'Memory Archivist',
    shortLabel: 'Archivist',
    role: 'Tracks saved notes, sketches, architecture snapshots, and historical decisions.',
    responsibility: 'filing system / repository shelves',
    scope: ['annotation', 'history', 'decision', 'archive', 'snapshot'],
    theme: { accent: '#d2a3ff', shadow: 'rgba(126, 87, 160, 0.38)' },
    position: { x: 54, y: 56 },
  },
  {
    id: 'cto-architect',
    name: 'CTO / Architect',
    shortLabel: 'CTO',
    role: 'Supervises ACE self-updates, guardrails, architecture boundaries, and review gates.',
    responsibility: 'control desk / oversight station',
    scope: ['architecture', 'rule', 'governance', 'review', 'ace'],
    theme: { accent: '#ff8f7a', shadow: 'rgba(166, 86, 72, 0.42)' },
    position: { x: 74, y: 35 },
    isOversight: true,
  },
];

function recentRunSummary(runs) {
  return (runs || []).slice(0, 3).map((run) => {
    const target = [run.action, run.payload?.taskId].filter(Boolean).join(' ');
    return `${run.status}: ${target || 'pipeline event'}`;
  });
}

function summarizeRunLog(run) {
  const events = run?.logs || [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const raw = `${event?.message || ''} ${event?.text || ''}`.trim();
    if (!raw) continue;
    const line = raw.split(/\\r?\\n/).map((entry) => entry.trim()).filter(Boolean)[0];
    if (line) return line.slice(0, 140);
  }
  return null;
}

function runMatchesAgent(agentId, run) {
  const action = String(run?.action || '').toLowerCase();
  if (agentId === 'context-manager') return ['scan', 'manage'].includes(action);
  if (agentId === 'planner') return action === 'manage';
  if (agentId === 'executor') return ['build', 'run', 'apply'].includes(action);
  if (agentId === 'cto-architect') return ['apply', 'manage'].includes(action);
  if (agentId === 'memory-archivist') return Boolean(run?.artifacts?.length);
  return false;
}

function latestRunSignal(agentId, runs) {
  const run = (runs || []).find((entry) => runMatchesAgent(agentId, entry)) || null;
  if (!run) return null;
  return {
    runId: run.runId,
    status: run.status,
    action: run.action,
    summary: summarizeRunLog(run) || `${run.status}: ${run.action}`,
  };
}

function matchesScope(agent, text) {
  return agent.scope.some((keyword) => text.includes(keyword));
}

function latestIntentReport(workspace) {
  return workspace.intentState?.contextReport || workspace.intentState?.latest || workspace.intentState?.reports?.[0] || null;
}

function collectNodeMetrics(agent, graph, workspace) {
  const nodes = (graph?.nodes || []).filter((node) => {
    const content = `${node.type} ${node.content || ''}`.toLowerCase();
    return matchesScope(agent, content);
  });
  const latestIntent = latestIntentReport(workspace);
  if (agent.id === 'planner' && latestIntent?.tasks?.length) {
    return {
      nodes,
      count: Math.max(nodes.length, latestIntent.tasks.length),
      queue: Math.max(0, latestIntent.tasks.length - 1),
    };
  }
  if (agent.id === 'executor' && latestIntent?.tasks?.length) {
    return {
      nodes,
      count: Math.max(nodes.length, Math.min(2, latestIntent.tasks.length)),
      queue: Math.max(0, latestIntent.tasks.length - 2),
    };
  }
  return {
    nodes,
    count: nodes.length,
    queue: Math.max(0, nodes.length - 1),
  };
}

function defaultRecentActions(agent, workspace, runs) {
  const summaries = recentRunSummary(runs);
  const intent = latestIntentReport(workspace);
  if (agent.id === 'context-manager') {
    return [
      intent?.summary || `Synced ${(workspace.graph?.edges || []).length} workspace links`,
      intent ? `Intent confidence ${Math.round((intent.confidence || 0) * 100)}% across ${(intent.tasks || []).length} tasks` : (summaries[0] || 'Watching current focus and constraints'),
    ];
  }
  if (agent.id === 'planner') {
    return [
      intent?.tasks?.length ? `Received ${(intent.tasks || []).length} intent tasks from Context Manager` : `Tracking ${(workspace.graph?.nodes || []).filter((node) => node.type === 'task').length} task notes`,
      summaries.find((entry) => entry.includes('manage')) || 'Waiting for a new plan decomposition',
    ];
  }
  if (agent.id === 'executor') {
    return [
      summaries.find((entry) => entry.includes('build') || entry.includes('run')) || 'No build execution in recent history',
      intent?.tasks?.length ? `Execution queue seeded from ${(intent.tasks || []).length} intent tasks` : `Modules/files in workspace: ${(workspace.graph?.nodes || []).filter((node) => ['module', 'file'].includes(node.type)).length}`,
    ];
  }
  if (agent.id === 'memory-archivist') {
    return [
      `Saved ${(workspace.annotations || []).length} annotations and ${(workspace.sketches || []).length} sketch strokes`,
      `Architecture versions: ${(workspace.architectureMemory?.versions || []).length}`,
    ];
  }
  return [
    summaries[0] || 'Reviewing ACE governance boundaries',
    `Rules in force: ${(workspace.architectureMemory?.rules || []).length}`,
  ];
}

function deriveStatus(agent, metrics, workspace, dashboardState, runSignal) {
  const blockers = dashboardState?.blockers || [];
  const intent = latestIntentReport(workspace);
  if (runSignal?.status === 'running') return 'processing';
  if (runSignal?.status === 'error') return 'needs review';
  if (agent.id === 'cto-architect' && blockers.length) return 'needs review';
  if (agent.id === 'planner' && blockers.length) return 'blocked';
  if (agent.id === 'executor' && metrics.queue > 2) return 'processing';
  if (agent.id === 'context-manager' && intent && (intent.confidence || 0) < 0.45) return 'needs review';
  if (agent.id === 'context-manager' && metrics.count > 0) return 'thinking';
  if (agent.id === 'memory-archivist' && ((workspace.annotations || []).length || (workspace.sketches || []).length)) return 'processing';
  if (agent.id === 'cto-architect' && (workspace.architectureMemory?.versions || []).length > 0) return 'thinking';
  return metrics.count ? 'processing' : 'idle';
}

function statusDetail(status) {
  const map = {
    idle: 'Station is quiet and ready for new work.',
    thinking: 'Analyzing context and shaping next moves.',
    processing: 'Actively working through queued tasks.',
    blocked: 'Waiting on blockers or missing inputs.',
    'needs review': 'Holding for system-level review before changes continue.',
  };
  return map[status] || map.idle;
}

export function createInitialComments() {
  return Object.fromEntries(STATIONS.map((agent) => [agent.id, []]));
}

export function getStudioAgents() {
  return STATIONS.map((agent) => ({ ...agent }));
}

export function buildAgentSnapshots({ workspace, dashboardState, runs, agentComments }) {
  return STATIONS.map((agent) => {
    const metrics = collectNodeMetrics(agent, workspace.graph || { nodes: [], edges: [] }, workspace);
    const comments = agentComments?.[agent.id] || [];
    const outputs = recentRunSummary(runs).slice(0, 2);
    const intent = latestIntentReport(workspace);
    const runSignal = latestRunSignal(agent.id, runs);
    const reviewReport = agent.id === 'context-manager' ? intent : null;
    const status = deriveStatus(agent, metrics, workspace, dashboardState, runSignal);
    const recentActions = [
      ...(runSignal ? [`${runSignal.action}: ${runSignal.summary}`] : []),
      ...defaultRecentActions(agent, workspace, runs),
      ...outputs,
    ].slice(0, 4);
    return {
      ...agent,
      status,
      statusDetail: statusDetail(status),
      workload: {
        assignedTasks: metrics.count,
        queueSize: metrics.queue,
        outputs: Math.max(outputs.length, runSignal ? 1 : 0),
      },
      recentActions,
      comments,
      focusSummary: agent.id === 'context-manager' && intent
        ? `${intent.summary || 'Intent captured'} (${Math.round((intent.confidence || 0) * 100)}%)`
        : `${metrics.count} related items in workspace`,
      throughputLabel: agent.id === 'context-manager' && intent
        ? `${(intent.tasks || []).length} intent tasks / ${Math.round((intent.confidence || 0) * 100)}% confidence`
        : `${metrics.count} tracked / ${metrics.queue} queued`,
      activityPulse: Boolean(runSignal?.status === 'running' || status === 'processing' || status === 'thinking'),
      unresolved: Boolean(runSignal?.status === 'error' || status === 'blocked' || status === 'needs review'),
      latestSignal: runSignal?.summary || reviewReport?.summary || null,
      latestRunStatus: runSignal?.status || null,
      latestRunSummary: runSignal?.summary || null,
      reviewReport,
    };
  });
}

