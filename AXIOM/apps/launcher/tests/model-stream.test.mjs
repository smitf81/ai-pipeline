import assert from 'node:assert/strict';

await import('../public/model-stream.js');

const { install } = globalThis.AxiomModelStream;
const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;
const messages = [{ role: 'user', content: 'Say hello.' }];
const opts = { system: 'System prompt.', max_tokens: 16, apiKey: 'test-key' };

const providers = [
  {
    name: 'Ollama NDJSON',
    current: { endpoint: { type: 'ollama-native', url: 'http://ollama.test' }, model: 'ollama-test' },
    payload: [
      JSON.stringify({ message: { content: 'he' }, done: false }),
      JSON.stringify({ message: { content: 'llo' }, done: true }),
    ].join('\n'),
    expectedUrl: 'http://ollama.test/api/chat',
    assertRequest(body) {
      assert.equal(body.stream, true);
      assert.equal(body.model, 'ollama-test');
      assert.deepEqual(body.messages, [{ role: 'system', content: opts.system }, ...messages]);
    },
  },
  {
    name: 'OpenAI-compatible SSE',
    current: { endpoint: { type: 'openai-compat', url: 'http://openai.test/v1' }, model: 'openai-test' },
    payload: [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'he' } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'llo' } }] })}`,
    ].join('\r\n'),
    expectedUrl: 'http://openai.test/v1/chat/completions',
    assertRequest(body) {
      assert.equal(body.stream, true);
      assert.equal(body.model, 'openai-test');
      assert.equal(body.max_tokens, opts.max_tokens);
      assert.deepEqual(body.messages, [{ role: 'system', content: opts.system }, ...messages]);
    },
  },
  {
    name: 'Anthropic SSE',
    current: { endpoint: { type: 'anthropic', url: 'http://unused.test' }, model: 'anthropic-test' },
    payload: [
      'event: content_block_delta',
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'he' } })}`,
      '',
      'event: content_block_delta',
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'llo' } })}`,
    ].join('\n'),
    expectedUrl: 'https://api.anthropic.com/v1/messages',
    assertRequest(body) {
      assert.equal(body.stream, true);
      assert.equal(body.model, 'anthropic-test');
      assert.equal(body.max_tokens, opts.max_tokens);
      assert.equal(body.system, opts.system);
      assert.deepEqual(body.messages, messages);
    },
  },
];

try {
  for (const provider of providers) {
    const bytes = encoder.encode(provider.payload);
    const chunkPlans = [
      ...Array.from({ length: bytes.length + 1 }, (_, boundary) => [boundary]),
      Array.from({ length: Math.max(0, bytes.length - 1) }, (_, index) => index + 1),
    ];

    for (const boundaries of chunkPlans) {
      const chunks = splitBytes(bytes, boundaries);
      let request = null;
      globalThis.fetch = async (url, init) => {
        request = { url, init };
        return streamingResponse(chunks);
      };

      const modelBus = { getCurrent: () => provider.current };
      install(modelBus);
      const callbacks = [];
      const result = await modelBus.stream(messages, opts, (delta, accumulated) => {
        callbacks.push([delta, accumulated]);
      });

      assert.equal(result, 'hello', `${provider.name} should reconstruct hello at boundaries ${boundaries.join(',')}`);
      assert.deepEqual(callbacks, [['he', 'he'], ['llo', 'hello']], `${provider.name} callback contract should remain exact`);
      assert.equal(request.url, provider.expectedUrl);
      provider.assertRequest(JSON.parse(request.init.body));
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
console.log('model-stream.test.mjs passed');

function splitBytes(bytes, boundaries) {
  const chunks = [];
  let start = 0;
  for (const boundary of boundaries) {
    chunks.push(bytes.slice(start, boundary));
    start = boundary;
  }
  chunks.push(bytes.slice(start));
  return chunks;
}

function streamingResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
        };
      },
    },
    async text() {
      return '';
    },
  };
}
