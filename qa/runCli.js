#!/usr/bin/env node

const { runAll } = require('./qaLead');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--fixture') {
      options.fixture = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--allow') {
      const raw = argv[index + 1] || '';
      options.allowedPaths = raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      index += 1;
    }
  }
  return options;
}

async function main() {
  try {
    const report = await runAll(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.status === 'pass' ? 0 : 1);
  } catch (error) {
    const report = {
      status: 'fail',
      summary: 'qa lead crashed',
      failures: [
        {
          desk: 'qa',
          test: 'suite_boot',
          reason: String(error.message || error),
        },
      ],
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  }
}

main();
