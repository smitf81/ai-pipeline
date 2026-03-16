const fs = require('fs');
const path = require('path');
const { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_TIMEOUT_MS } = require('./localModelClient');

const AGENTS_ROOT = 'agents';
const DEFAULT_AGENT_BACKEND = 'ollama';
const DEFAULT_AGENT_MODEL = 'mixtral';

function normalizeAgentId(agentId = '') {
  return String(agentId || '').trim().toLowerCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildFallbackManifest(agentId, fallbackManifest = {}) {
  const id = normalizeAgentId(agentId);
  return {
    id,
    name: fallbackManifest.name || id,
    deskId: fallbackManifest.deskId || id,
    runtime: fallbackManifest.runtime || 'ollama-json',
    backend: fallbackManifest.backend || DEFAULT_AGENT_BACKEND,
    model: fallbackManifest.model || DEFAULT_AGENT_MODEL,
    host: fallbackManifest.host || DEFAULT_OLLAMA_HOST,
    timeoutMs: Number(fallbackManifest.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS),
    autoRun: Boolean(fallbackManifest.autoRun),
    inputs: Array.isArray(fallbackManifest.inputs) ? fallbackManifest.inputs : [],
    outputs: Array.isArray(fallbackManifest.outputs) ? fallbackManifest.outputs : [],
    writesCanonicalBrain: Boolean(fallbackManifest.writesCanonicalBrain),
  };
}

function validateManifest(manifest, expectedAgentId) {
  const errors = [];
  const id = normalizeAgentId(expectedAgentId);
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    errors.push('agent.json must contain an object.');
    return errors;
  }
  if (normalizeAgentId(manifest.id) !== id) {
    errors.push(`agent.json id must match "${id}".`);
  }
  if (!String(manifest.name || '').trim()) {
    errors.push('agent.json must include a non-empty name.');
  }
  if (!String(manifest.backend || '').trim()) {
    errors.push('agent.json must include a backend.');
  }
  if (!String(manifest.model || '').trim()) {
    errors.push('agent.json must include a model.');
  }
  if (!Number.isFinite(Number(manifest.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS)) || Number(manifest.timeoutMs || DEFAULT_OLLAMA_TIMEOUT_MS) <= 0) {
    errors.push('agent.json timeoutMs must be a positive number.');
  }
  return errors;
}

function agentDirectory(rootPath, agentId) {
  return path.join(rootPath, AGENTS_ROOT, normalizeAgentId(agentId));
}

function readAgentDefinition(rootPath, agentId) {
  const id = normalizeAgentId(agentId);
  const dir = agentDirectory(rootPath, id);
  const manifestPath = path.join(dir, 'agent.json');
  const promptPath = path.join(dir, 'prompt.md');
  const errors = [];
  let manifest = null;
  let prompt = '';

  if (!rootPath) {
    errors.push('rootPath is required to resolve agent definitions.');
    return {
      id,
      dir,
      manifestPath,
      promptPath,
      exists: false,
      valid: false,
      manifest,
      prompt,
      errors,
    };
  }

  if (!fs.existsSync(dir)) {
    errors.push(`Agent directory is missing for "${id}".`);
  }

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = readJson(manifestPath);
    } catch (error) {
      errors.push(`agent.json could not be parsed: ${error.message}`);
    }
  } else {
    errors.push('agent.json is missing.');
  }

  if (manifest) {
    errors.push(...validateManifest(manifest, id));
  }

  if (fs.existsSync(promptPath)) {
    prompt = String(fs.readFileSync(promptPath, 'utf8') || '').trim();
    if (!prompt) errors.push('prompt.md is empty.');
  } else {
    errors.push('prompt.md is missing.');
  }

  return {
    id,
    dir,
    manifestPath,
    promptPath,
    exists: fs.existsSync(dir),
    valid: errors.length === 0,
    manifest,
    prompt,
    errors,
  };
}

function resolveAgentDefinition(rootPath, agentId, { fallbackManifest = null, fallbackPrompt = '' } = {}) {
  const definition = readAgentDefinition(rootPath, agentId);
  const manifest = definition.valid
    ? definition.manifest
    : buildFallbackManifest(agentId, fallbackManifest || {});
  const prompt = String(definition.prompt || fallbackPrompt || '').trim();
  return {
    ...definition,
    manifest,
    prompt,
  };
}

function loadAgentDefinition(rootPath, agentId) {
  const definition = readAgentDefinition(rootPath, agentId);
  if (!definition.valid) {
    throw new Error(`Invalid agent definition for "${normalizeAgentId(agentId)}": ${definition.errors.join(' ')}`);
  }
  return definition;
}

module.exports = {
  AGENTS_ROOT,
  DEFAULT_AGENT_BACKEND,
  DEFAULT_AGENT_MODEL,
  agentDirectory,
  buildFallbackManifest,
  loadAgentDefinition,
  normalizeAgentId,
  readAgentDefinition,
  resolveAgentDefinition,
  validateManifest,
};
