#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = 'brain/emergence/canonical_truth_domains.json';
const DEFAULT_OUT = 'brain/context/canonical_truth_map.md';

function usage() {
  process.stdout.write(`ACE canonical truth map

Usage:
  node tools/canonical-truth-map.mjs
  node tools/canonical-truth-map.mjs --domain <domainId>
  node tools/canonical-truth-map.mjs --write
  node tools/canonical-truth-map.mjs --check

Options:
  --source <path>  Canonical truth domain JSON. Default: ${DEFAULT_SOURCE}
  --out <path>     Markdown output for --write. Default: ${DEFAULT_OUT}

The JSON source is canonical. The Markdown output is planner-support context.
`);
}

function parseArgs(argv) {
  const args = {
    source: DEFAULT_SOURCE,
    out: DEFAULT_OUT,
    domain: null,
    write: false,
    check: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--source') args.source = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else if (arg === '--domain') args.domain = argv[++index];
    else if (arg === '--write') args.write = true;
    else if (arg === '--check') args.check = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function loadDomains(sourcePath) {
  const absSource = resolve(repoRoot, sourcePath);
  if (!existsSync(absSource)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const payload = JSON.parse(readFileSync(absSource, 'utf8'));
  if (!Array.isArray(payload.domains)) {
    throw new Error('Source must contain a domains array.');
  }
  return payload;
}

function validatePayload(payload) {
  const errors = [];
  const ids = new Set();
  const required = [
    'domainId',
    'label',
    'classificationDefault',
    'systemOfRecord',
    'canonicalOwner',
    'mutationAuthority',
    'allowedProjections'
  ];

  for (const [index, domain] of payload.domains.entries()) {
    for (const key of required) {
      if (domain[key] === undefined || domain[key] === null || domain[key] === '') {
        errors.push(`domains[${index}] missing ${key}`);
      }
    }
    if (domain.domainId) {
      if (ids.has(domain.domainId)) errors.push(`duplicate domainId: ${domain.domainId}`);
      ids.add(domain.domainId);
    }
    if (!Array.isArray(domain.allowedProjections)) {
      errors.push(`${domain.domainId ?? `domains[${index}]`} allowedProjections must be an array`);
    }
  }

  return errors;
}

function renderDomain(domain) {
  const lines = [];
  lines.push(`## ${domain.domainId} - ${domain.label}`);
  lines.push('');
  lines.push(`- classification: ${domain.classificationDefault}`);
  lines.push(`- system of record: ${domain.systemOfRecord}`);
  lines.push(`- canonical owner: ${domain.canonicalOwner}`);
  lines.push(`- mutation authority: ${domain.mutationAuthority}`);
  lines.push(`- allowed projections: ${domain.allowedProjections.join(', ') || 'none'}`);
  if (domain.notes) lines.push(`- notes: ${domain.notes}`);
  lines.push('');
  return lines.join('\n');
}

function renderMarkdown(payload) {
  const lines = [];
  lines.push('# ACE Canonical Truth Map');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Contract: ${payload.contractVersion ?? 'unknown'}`);
  lines.push('');
  lines.push('Source of truth: `brain/emergence/canonical_truth_domains.json`.');
  lines.push('This Markdown file is planner-support context only.');
  lines.push('');
  lines.push('## Use');
  lines.push('');
  lines.push('Before changing a domain, identify its canonical owner, mutation authority, allowed projections, and stale/duplicate paths. If the domain is absent, add or clarify the canonical domain before implementing behavior.');
  lines.push('');
  for (const domain of payload.domains) {
    lines.push(renderDomain(domain).trimEnd());
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function atomicWrite(pathValue, content) {
  const absPath = resolve(repoRoot, pathValue);
  mkdirSync(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, absPath);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  const payload = loadDomains(args.source);
  const errors = validatePayload(payload);
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`[truth-map] ${error}\n`);
    process.exitCode = 1;
    return;
  }

  if (args.check) {
    process.stdout.write(`Canonical truth domain file is valid: ${payload.domains.length} domains.\n`);
    return;
  }

  if (args.domain) {
    const domain = payload.domains.find((entry) => entry.domainId === args.domain);
    if (!domain) {
      throw new Error(`Domain not found: ${args.domain}`);
    }
    process.stdout.write(renderDomain(domain));
    return;
  }

  const markdown = renderMarkdown(payload);
  if (args.write) {
    atomicWrite(args.out, markdown);
    process.stdout.write(`Wrote ${args.out} from ${args.source}.\n`);
    return;
  }

  process.stdout.write(markdown);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[truth-map] ${error.message}\n`);
  process.exitCode = 1;
}
