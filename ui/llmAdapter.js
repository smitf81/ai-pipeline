const {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  parseJsonResponse,
} = require('./localModelClient');

function createTimeoutController(timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  return { controller, timeout };
}

async function callOllamaGenerate({
  prompt,
  model = 'mistral:latest',
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  stream = false,
  expectJson = true,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for callOllamaGenerate.');
  }
  const { controller, timeout } = createTimeoutController(timeoutMs);
  try {
    const response = await fetchImpl(`${String(host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: String(prompt || ''),
        stream: Boolean(stream),
      }),
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama generate returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const text = String(payload?.response || '').trim();
    return {
      text,
      payload,
      json: expectJson ? parseJsonResponse(text) : null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Ollama generate timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function callOllamaChat({
  messages = [],
  model = 'mistral:latest',
  host = DEFAULT_OLLAMA_HOST,
  timeoutMs = DEFAULT_OLLAMA_TIMEOUT_MS,
  stream = false,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('No fetch implementation is available for callOllamaChat.');
  }
  const { controller, timeout } = createTimeoutController(timeoutMs);
  try {
    const response = await fetchImpl(`${String(host || DEFAULT_OLLAMA_HOST).replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: Array.isArray(messages) ? messages : [],
        stream: Boolean(stream),
      }),
      signal: controller?.signal,
    });
    if (!response.ok) {
      throw new Error(`Ollama chat returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    const text = String(payload?.message?.content || '').trim();
    return {
      text,
      payload,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Ollama chat timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

module.exports = {
  callOllamaGenerate,
  callOllamaChat,
};
