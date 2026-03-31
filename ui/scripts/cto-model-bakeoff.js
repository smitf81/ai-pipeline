const { runCtoGovernanceModelBakeOff } = require('../server.js');

function parseArgs(argv = []) {
  const options = {
    models: null,
    text: null,
    json: false,
  };
  argv.forEach((arg) => {
    const value = String(arg || '').trim();
    if (!value) return;
    if (value === '--json') {
      options.json = true;
      return;
    }
    if (value.startsWith('--models=')) {
      options.models = value
        .slice('--models='.length)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      return;
    }
    if (value.startsWith('--text=')) {
      options.text = value.slice('--text='.length).trim() || null;
    }
  });
  return options;
}

function renderSummary(result = {}) {
  const lines = [];
  lines.push(`Generated: ${result.generatedAt || 'unknown'}`);
  lines.push(`Backend: ${result.backend || 'unknown'} @ ${result.host || 'unknown'}`);
  lines.push(`Prompt: ${result.promptText || ''}`);
  lines.push(`Recommended: ${result.summary?.recommendedModel || 'none'}`);
  lines.push(`Basis: ${result.summary?.recommendationBasis || 'n/a'}`);
  lines.push('');
  (result.results || []).forEach((entry) => {
    lines.push([
      `- ${entry.model}`,
      `reachable=${entry.reachable ? 'yes' : 'no'}`,
      `raw_json=${entry.rawJsonParse?.ok ? 'pass' : 'fail'}`,
      `fenced_json=${entry.fencedJsonParse?.ok ? 'pass' : 'fail'}`,
      `contract=${entry.contractValidation?.ok ? 'pass' : 'fail'}`,
      `score=${entry.score || 0}`,
    ].join(' | '));
    if (entry.contractValidation?.reason) {
      lines.push(`  reason: ${entry.contractValidation.reason}`);
    }
    if (entry.rawOutput) {
      lines.push(`  output: ${entry.rawOutput}`);
    }
  });
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await runCtoGovernanceModelBakeOff({
    models: options.models,
    ...(options.text ? { text: options.text } : {}),
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderSummary(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.stack || String(error)}\n`);
  process.exitCode = 1;
});
