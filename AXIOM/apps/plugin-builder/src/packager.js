import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_STORE } from './paths.js';

export class PluginPackager {
  async pack(manifest, pluginDir, options = {}) {
    mkdirSync(PACKAGE_STORE, { recursive: true });
    const files = this.collectFiles(pluginDir);
    const bundle = {
      axpkg_version: '1.0.0',
      plugin_id: manifest.id,
      plugin_version: manifest.version,
      packed_at: new Date().toISOString(),
      lifecycle_status_at_pack: manifest.lifecycle.status,
      validation_checksum: manifest.validation_status?.checksum || null,
      include_source_maps: Boolean(options.include_source_maps),
      files
    };
    const payload = JSON.stringify(bundle, null, 2);
    const checksum = createHash('sha256').update(payload).digest('hex');
    const path = join(PACKAGE_STORE, `${manifest.id}-${manifest.version}.axpkg`);
    writeFileSync(path, payload);
    return { path, size: Buffer.byteLength(payload), checksum, file_count: files.length };
  }

  collectFiles(dir, base = '') {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['dist','node_modules','.git'].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = base ? `${base}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out.push(...this.collectFiles(full, rel));
      else {
        const stat = statSync(full);
        const content = readFileSync(full);
        out.push({ path: rel, size: stat.size, sha256: createHash('sha256').update(content).digest('hex'), content: content.toString('utf8') });
      }
    }
    return out;
  }
}
