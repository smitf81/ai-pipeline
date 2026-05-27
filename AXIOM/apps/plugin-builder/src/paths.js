import { resolve } from 'node:path';

const base = process.env.AXIOM_PLUGIN_BUILDER_HOME
  ? resolve(process.env.AXIOM_PLUGIN_BUILDER_HOME)
  : process.cwd();

export const ROOT_DIR = base;
export const PLUGIN_STORE = resolve(base, 'plugins');
export const PACKAGE_STORE = resolve(base, 'packages');
export const REGISTRY_PATH = resolve(base, 'registry.json');
export const SCHEMA_VERSION = '1.0.0';
export const VALIDATOR_VERSION = '1.0.0';
