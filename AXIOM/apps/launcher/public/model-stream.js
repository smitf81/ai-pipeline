(function installAxiomModelStream(root) {
  'use strict';

  function createIncrementalLineDecoder(onLine) {
    if (typeof onLine !== 'function') throw new TypeError('onLine must be a function');

    let pending = '';
    let finished = false;

    function emit(line) {
      onLine(line.endsWith('\r') ? line.slice(0, -1) : line);
    }

    return Object.freeze({
      push(fragment) {
        if (finished) throw new Error('Cannot push after decoder finish');
        pending += String(fragment || '');

        let newlineAt = pending.indexOf('\n');
        while (newlineAt !== -1) {
          emit(pending.slice(0, newlineAt));
          pending = pending.slice(newlineAt + 1);
          newlineAt = pending.indexOf('\n');
        }
      },

      finish() {
        if (finished) return;
        finished = true;
        if (pending) emit(pending);
        pending = '';
      },
    });
  }

  async function consumeStreamingLines(body, onLine) {
    if (!body?.getReader) throw new Error('Streaming response body unavailable');

    const reader = body.getReader();
    const textDecoder = new TextDecoder();
    const lineDecoder = createIncrementalLineDecoder(onLine);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lineDecoder.push(textDecoder.decode(value, { stream: true }));
    }

    lineDecoder.push(textDecoder.decode());
    lineDecoder.finish();
  }

  function parseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  async function stream(current, messages, opts = {}, onChunk = null) {
    if (!current) throw new Error('No model selected');
    const ep = current.endpoint;
    let full = '';

    function emit(delta) {
      if (!delta) return;
      full += delta;
      if (typeof onChunk === 'function') onChunk(delta, full);
    }

    if (ep.type === 'anthropic') {
      const response = await root.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'messages-2023-06-01',
          'x-api-key': opts.apiKey || '',
        },
        body: JSON.stringify({
          model: current.model || 'claude-sonnet-4-20250514',
          max_tokens: opts.max_tokens || 2048,
          stream: true,
          system: opts.system || '',
          messages,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await consumeStreamingLines(response.body, line => {
        if (!line.startsWith('data: ')) return;
        const raw = line.slice(6);
        if (raw === '[DONE]') return;
        const frame = parseJson(raw);
        emit(frame?.delta?.text || frame?.choices?.[0]?.delta?.content || '');
      });
      return full;
    }

    if (ep.type === 'ollama-native') {
      const response = await root.fetch(`${ep.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: current.model,
          messages: opts.system ? [{ role: 'system', content: opts.system }, ...messages] : messages,
          stream: true,
          options: { num_ctx: 4096 },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      await consumeStreamingLines(response.body, line => {
        if (!line) return;
        const frame = parseJson(line);
        emit(frame?.message?.content || '');
      });
      return full;
    }

    const systemMessages = opts.system ? [{ role: 'system', content: opts.system }] : [];
    const response = await root.fetch(`${ep.url}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: current.model,
        messages: [...systemMessages, ...messages],
        max_tokens: opts.max_tokens || 2048,
        stream: true,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    await consumeStreamingLines(response.body, line => {
      if (!line.startsWith('data: ')) return;
      const raw = line.slice(6);
      if (raw === '[DONE]') return;
      const frame = parseJson(raw);
      emit(frame?.choices?.[0]?.delta?.content || '');
    });
    return full;
  }

  function install(modelBus) {
    if (!modelBus?.getCurrent) throw new Error('ModelBus.getCurrent is required');
    modelBus.stream = async function streamFromCurrentModel(messages, opts = {}, onChunk = null) {
      return stream(modelBus.getCurrent(), messages, opts, onChunk);
    };
    return modelBus.stream;
  }

  root.AxiomModelStream = Object.freeze({
    createIncrementalLineDecoder,
    consumeStreamingLines,
    install,
    stream,
  });
})(globalThis);
