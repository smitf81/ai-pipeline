// Future integration seam for local LLM adapters (e.g., Mixtral).
export function createConversationalParserStub() {
  return {
    parseNaturalLanguage() {
      return {
        ok: false,
        error: 'Natural language parsing is not enabled in thin-slice mode yet.'
      };
    }
  };
}

// Future integration seam for MCP-driven command intake.
export function createMcpCommandBridgeStub() {
  return {
    pullCommands() {
      return [];
    }
  };
}

// Future integration seam for queued embodied actions and world-edit tasks.
export function enqueueAgentAction(agent, action) {
  agent.actionQueue.push(action);
}

export function tickAgentActionQueue(agent) {
  const next = agent.actionQueue.shift();
  if (!next) return;
  if (next.kind === 'move') {
    agent.x = next.x;
    agent.y = next.y;
    agent.state = 'moving';
  }
}
