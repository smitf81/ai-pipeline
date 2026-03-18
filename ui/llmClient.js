const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
const DEFAULT_OLLAMA_MODEL = 'mixtral';
const DEFAULT_TIMEOUT_MS = 45000;

/**
 * @typedef {Object} LLMClient
 * @property {(args: { prompt: string, system?: string, model?: string, temperature?: number }) => Promise<{ text: string, model: string }>} generateText
 * @property {(args: { prompt: string, system?: string, model?: string, schema?: Object }) => Promise<{ data: any, model: string, raw: string }>} generateStructured
 */

function toJson(value) {
  if (!value || typeof value !== 'object') return {};
  return value;
}

function safeParseJson(text = '') {
  try {
    return JSON.parse(String(text || '').trim());
  } catch {
    return null;
  }
}

class OllamaClient {
  constructor({
    host = DEFAULT_OLLAMA_HOST,
    model = DEFAULT_OLLAMA_MODEL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.host = host;
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async request(path, body = {}) {
    if (typeof this.fetchImpl !== 'function') throw new Error('A fetch implementation is required for OllamaClient.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Ollama request failed (${response.status}): ${detail || response.statusText}`);
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async generateText({ prompt, system = '', model = null, temperature = 0.2 } = {}) {
    const textPrompt = String(prompt || '').trim();
    if (!textPrompt) throw new Error('prompt is required');
    const payload = {
      model: model || this.model,
      prompt: textPrompt,
      stream: false,
      options: { temperature: Number(temperature) || 0.2 },
    };
    if (system) payload.system = String(system);
    const response = await this.request('/api/generate', payload);
    return {
      text: String(response.response || '').trim(),
      model: String(response.model || payload.model),
    };
  }

  async generateStructured({ prompt, system = '', model = null, schema = null } = {}) {
    const textPrompt = String(prompt || '').trim();
    if (!textPrompt) throw new Error('prompt is required');
    const message = [{ role: 'user', content: textPrompt }];
    if (system) message.unshift({ role: 'system', content: String(system) });
    const payload = {
      model: model || this.model,
      messages: message,
      stream: false,
      format: schema ? toJson(schema) : 'json',
    };
    const response = await this.request('/api/chat', payload);
    const raw = String(response?.message?.content || '').trim();
    const data = safeParseJson(raw);
    if (!data) throw new Error('Ollama did not return valid JSON.');
    return {
      data,
      raw,
      model: String(response.model || payload.model),
    };
  }
}

async function withRetry(operation, { retries = 2, delayMs = 200 } = {}) {
  let lastError = null;
  const maxAttempts = Math.max(1, Number(retries) + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error('withRetry failed.');
}

function withLogging(client, logger = console) {
  const sink = logger && typeof logger.info === 'function' ? logger : console;
  return {
    async generateText(args = {}) {
      const startedAt = Date.now();
      try {
        const result = await client.generateText(args);
        sink.info?.(`[llm] generateText ok model=${result.model} ms=${Date.now() - startedAt}`);
        return result;
      } catch (error) {
        sink.warn?.(`[llm] generateText failed ms=${Date.now() - startedAt} error=${error.message}`);
        throw error;
      }
    },
    async generateStructured(args = {}) {
      const startedAt = Date.now();
      try {
        const result = await client.generateStructured(args);
        sink.info?.(`[llm] generateStructured ok model=${result.model} ms=${Date.now() - startedAt}`);
        return result;
      } catch (error) {
        sink.warn?.(`[llm] generateStructured failed ms=${Date.now() - startedAt} error=${error.message}`);
        throw error;
      }
    },
  };
}

async function generateText(client, args = {}) {
  return client.generateText(args);
}

async function generateStructured(client, args = {}) {
  return client.generateStructured(args);
}

async function chatWithContext(client, {
  question,
  contextBlocks = [],
  systemPrompt = 'You are ACE CTO assistant. Reply concisely and ground your answer in the provided project context.',
  model = null,
} = {}) {
  const text = String(question || '').trim();
  if (!text) throw new Error('question is required');
  const context = (contextBlocks || []).filter(Boolean).join('\n\n');
  const prompt = [
    context ? `Project context:\n${context}` : 'Project context: none provided.',
    `User question:\n${text}`,
    'Respond with practical guidance and reference the most relevant context details.',
  ].join('\n\n');
  const result = await client.generateText({
    prompt,
    system: systemPrompt,
    model,
  });
  return result.text;
}

module.exports = {
  OllamaClient,
  generateText,
  generateStructured,
  chatWithContext,
  withRetry,
  withLogging,
};
