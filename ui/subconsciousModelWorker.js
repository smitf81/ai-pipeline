const {
  requestOllamaText,
  runOllamaTagsProbe,
} = require('./localModelClient');

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.on('data', (chunk) => {
      input += String(chunk);
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', reject);
  });
}

async function main() {
  const request = await readStdin();
  const probe = await runOllamaTagsProbe({
    host: request.host,
    timeoutMs: Math.min(4000, Number(request.timeoutMs) || 4000),
  });
  if (!probe?.ok) {
    throw new Error(probe?.reason || 'Ollama is unavailable.');
  }
  if (!probe.availableModels.includes(request.model)) {
    throw new Error(`Configured model "${request.model}" is not installed.`);
  }
  const response = await requestOllamaText(request);
  process.stdout.write(JSON.stringify({ ok: true, response }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({
    ok: false,
    error: String(error?.message || error),
  }));
  process.exitCode = 1;
});
