import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { REGISTRY_PATH } from './paths.js';

export class PluginRegistry {
  load() {
    if (!existsSync(REGISTRY_PATH)) return { plugins: {}, receipts: [], updated_at: null };
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  }
  save(registry) {
    mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
    registry.updated_at = new Date().toISOString();
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  }
  async register(manifest, receipt = null) {
    const registry = this.load();
    registry.plugins[manifest.id] = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      status: manifest.lifecycle.status,
      registered_at: manifest.lifecycle.registered_at || new Date().toISOString(),
      activated_at: manifest.lifecycle.activated_at || null,
      validated: manifest.validation_status?.passed === true,
      checksum: manifest.validation_status?.checksum || null,
      capabilities: manifest.capabilities || [],
      permissions: manifest.permissions || {},
      author: manifest.author || {},
      bundle_path: manifest.lifecycle.bundle_path || null
    };
    if (receipt) registry.receipts.push(receipt);
    this.save(registry);
    return registry.plugins[manifest.id];
  }
  async list(filters = {}) {
    let plugins = Object.values(this.load().plugins);
    if (filters.status) plugins = plugins.filter(p => p.status === filters.status);
    if (filters.capability) plugins = plugins.filter(p => p.capabilities?.includes(filters.capability));
    return plugins;
  }
  async get(id) { return this.load().plugins[id] || null; }
  async remove(id, receipt = null) {
    const registry = this.load();
    const existing = registry.plugins[id] || null;
    if (existing) delete registry.plugins[id];
    if (receipt) registry.receipts.push(receipt);
    this.save(registry);
    return existing;
  }
}
