const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_TIMEOUT_MS = 30000;

function stripCodeFence(value = '') {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonCandidate(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/i) || raw.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) return stripCodeFence(fenceMatch[1]);
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) return raw.slice(firstBrace, lastBrace + 1);
  return raw;
}

function parseJsonResponse(text = '') {
  const candidate = extractJsonCandidate(text);
  if (!candidate) {
    throw new Error('Local model returned an empty response.');
  }
  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Local model response was not valid JSON: ${error.message}`);
  }
}

async function requestOllamaJson({
  prompt,
  model = 'mistral:latest',
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for the local model client.');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(`${String(host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: String(prompt || ''),
        stream: false,
      }),
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const text = String(payload?.response || '').trim();
    return {
      text,
      json: parseJsonResponse(text),
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Local model request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  parseJsonResponse,
  requestOllamaJson,
};
