import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export default async function runLlmAdapterTests() {
  const adapterPath = path.resolve(process.cwd(), 'llmAdapter.js');
  const { callOllamaGenerate, callOllamaChat } = require(adapterPath);

  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (String(url).endsWith('/api/chat')) {
      return {
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: 'REAL LLM RESPONSE' } }),
      };
    }
    return {
      ok: true,
      json: async () => ({ response: 'REAL LLM RESPONSE' }),
    };
  };

  const generate = await callOllamaGenerate({
    prompt: 'Reply with the words REAL LLM RESPONSE',
    expectJson: false,
    fetchImpl,
  });
  assert.equal(generate.text, 'REAL LLM RESPONSE');
  assert.ok(String(requests[0].url).endsWith('/api/generate'));

  const chat = await callOllamaChat({
    messages: [{ role: 'user', content: 'Reply with the words REAL LLM RESPONSE' }],
    fetchImpl,
  });
  assert.equal(chat.text, 'REAL LLM RESPONSE');
  assert.ok(String(requests[1].url).endsWith('/api/chat'));
}
