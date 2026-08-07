import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

const ALLOWED_CAPABILITIES = new Set([
  'file-read', 'file-write', 'file-watch', 'terminal-exec', 'terminal-read',
  'network-request', 'network-listen', 'ui-panel', 'ui-statusbar', 'ui-command-palette',
  'ui-overlay', 'editor-decoration', 'editor-completion', 'editor-diagnostic',
  'workspace-index', 'workspace-config', 'mcp-tool-expose', 'mcp-tool-consume',
  'event-emit', 'event-subscribe', 'storage-read', 'storage-write', 'ipc-send', 'ipc-receive',
  'project-file-patch'
]);

const VALID_STATUS = new Set(['draft', 'generated', 'validated', 'packaged', 'registered', 'active', 'suspended', 'rejected']);
const VALID_AUTHOR_SOURCE = new Set(['human', 'axiom-agent', 'external']);
const FORBIDDEN_CORE_PATHS = ['/axiom/core', '/axiom/runtime', '/axiom/kernel', 'src/core', 'src/runtime', 'src/kernel'];

function err(rule, field, message, severity = 'error', context = {}) {
  return { rule, field, message, severity, context };
}

export class PluginValidator {
  constructor({ strict = true } = {}) { this.strict = strict; }

  async validate(manifest, pluginDir) {
    const errors = [];
    const warnings = [];
    const add = item => (item.severity === 'warning' ? warnings : errors).push(item);

    if (!manifest || typeof manifest !== 'object') {
      return { passed: false, rule_count: 1, errors: [err('MANIFEST_OBJECT', 'manifest', 'manifest must be an object')], warnings: [] };
    }

    const required = ['id','name','version','description','author','entrypoint','capabilities','permissions','mcp_tools','lifecycle_hooks','event_subscriptions','ui_surfaces','axiom_runtime','lifecycle','safety','provenance','compatibility','validation_status'];
    for (const field of required) if (manifest[field] === undefined) add(err('REQUIRED_FIELD', field, `${field} is required`));

    if (!/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/.test(manifest.id || '')) add(err('MANIFEST_ID_FORMAT', 'id', `Invalid plugin id: ${manifest.id}`));
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(manifest.version || '')) add(err('MANIFEST_SEMVER', 'version', `Invalid SemVer: ${manifest.version}`));
    const descLen = String(manifest.description || '').length;
    if (descLen < 10 || descLen > 500) add(err('MANIFEST_DESCRIPTION_LENGTH', 'description', `Description length ${descLen} is outside 10-500`));
    if (!VALID_AUTHOR_SOURCE.has(manifest.author?.source)) add(err('MANIFEST_AUTHOR_SOURCE', 'author.source', `Invalid author.source: ${manifest.author?.source}`));

    const implementationKind = manifest.implementation?.implementation_kind;
    const safeWriteCorePatchProposal = Boolean(
      implementationKind === 'safe_write_project_file' &&
      manifest.implementation?.proposal_only === true &&
      manifest.safety?.proposal_only === true &&
      manifest.permissions?.filesystem?.project_root_only === true
    );

    if (manifest.safety?.may_modify_core !== false && !safeWriteCorePatchProposal) {
      add(err('SAFETY_NO_CORE_MODIFY', 'safety.may_modify_core', 'Plugins may not modify AXIOM core files'));
    }
    if (manifest.safety?.sandboxed !== true) add(err('SAFETY_SANDBOXED', 'safety.sandboxed', 'Plugin must be sandboxed'));
    if (manifest.safety?.timeout_ms && manifest.safety.timeout_ms > 120000) add(err('SAFETY_TIMEOUT', 'safety.timeout_ms', 'Timeout too high', 'warning'));

    if (!manifest.permissions || typeof manifest.permissions !== 'object') add(err('PERMISSIONS_DECLARED', 'permissions', 'permissions object must be declared'));
    if (!Array.isArray(manifest.capabilities) || manifest.capabilities.length === 0) add(err('CAPABILITIES_NON_EMPTY', 'capabilities', 'at least one capability is required'));
    const unknownCaps = (manifest.capabilities || []).filter(c => !ALLOWED_CAPABILITIES.has(c));
    if (unknownCaps.length) add(err('CAPABILITIES_VALID', 'capabilities', `Unknown capabilities: ${unknownCaps.join(', ')}`));

    if (manifest.capabilities?.includes('file-write') && !manifest.permissions?.file_access?.write?.length) add(err('PERMISSIONS_MATCH_CAPABILITIES', 'permissions.file_access.write', 'file-write capability lacks write permission declaration', 'warning'));
    if ((manifest.capabilities || []).some(c => c.startsWith('network-')) && !manifest.permissions?.network?.hosts?.length) add(err('PERMISSIONS_MATCH_CAPABILITIES', 'permissions.network.hosts', 'network capability lacks host allow-list', 'warning'));

    if (!VALID_STATUS.has(manifest.lifecycle?.status)) add(err('LIFECYCLE_STATUS_VALID', 'lifecycle.status', `Invalid lifecycle status: ${manifest.lifecycle?.status}`));
    if (!/^[a-zA-Z0-9_./-]+\.(js|mjs|ts)$/.test(manifest.entrypoint || '')) add(err('ENTRYPOINT_DECLARED', 'entrypoint', `Invalid entrypoint: ${manifest.entrypoint}`));

    if (pluginDir && manifest.entrypoint) {
      const entry = join(pluginDir, manifest.entrypoint);
      if (!existsSync(entry)) add(err('ENTRYPOINT_EXISTS', 'entrypoint', `Entrypoint file not found: ${manifest.entrypoint}`));
      else {
        const src = readFileSync(entry, 'utf8');
        if (!/export\s+(async\s+)?function\s+onLoad/.test(src) || !/export\s+(async\s+)?function\s+onActivate/.test(src)) {
          add(err('ENTRYPOINT_EXPORTS_LIFECYCLE', 'entrypoint', 'Entrypoint must export onLoad and onActivate'));
        }
        if (manifest.implementation?.kind === 'implementation_bearing_plugin_proposal') {
          const isSafeWriteProposal = implementationKind === 'safe_write_project_file';

          if (isSafeWriteProposal) {
            if (!Array.isArray(manifest.implementation.required_runtime_apis)) {
              add(err('IMPLEMENTATION_REQUIRED_APIS_DECLARED', 'implementation.required_runtime_apis', 'Safe write proposal must declare required_runtime_apis as an array'));
            }
            if (!/export\s+function\s+createSafeWriteProjectFileTool/.test(src)) {
              add(err('IMPLEMENTATION_SAFE_WRITE_EXPORT', 'entrypoint', 'Safe write proposal must export createSafeWriteProjectFileTool'));
            }
            const requiredGuards = ['path_outside_project_root', 'dry_run', 'expected_find_not_exactly_once', 'binary_file_refused'];
            const missingGuards = requiredGuards.filter(token => !src.includes(token));
            if (missingGuards.length) {
              add(err('IMPLEMENTATION_SAFE_WRITE_GUARDS', 'entrypoint', `Safe write proposal missing guards: ${missingGuards.join(', ')}`));
            }
            if (!/export\s+const\s+tools/.test(src)) {
              add(err('IMPLEMENTATION_SAFE_WRITE_TOOLS_EXPORT', 'entrypoint', 'Safe write proposal must export tools for MCP registration'));
            }
          } else {
            if (!/export\s+function\s+install[A-Za-z0-9_]+/.test(src)) {
              add(err('IMPLEMENTATION_INSTALL_EXPORT', 'entrypoint', 'Implementation-bearing plugin must export an install function'));
            }
            if (!/export\s+function\s+uninstall[A-Za-z0-9_]+/.test(src)) {
              add(err('IMPLEMENTATION_UNINSTALL_EXPORT', 'entrypoint', 'Implementation-bearing plugin must export an uninstall/cleanup function'));
            }
            if (!/missing_runtime_api/.test(src)) {
              add(err('IMPLEMENTATION_RUNTIME_GUARD', 'entrypoint', 'Implementation-bearing plugin must guard missing runtime APIs'));
            }
            if (!Array.isArray(manifest.implementation.required_runtime_apis) || manifest.implementation.required_runtime_apis.length === 0) {
              add(err('IMPLEMENTATION_REQUIRED_APIS_DECLARED', 'implementation.required_runtime_apis', 'Implementation-bearing plugin must declare required runtime APIs'));
            }
          }
          if (manifest.implementation.proposal_only !== true) {
            add(err('IMPLEMENTATION_PROPOSAL_ONLY', 'implementation.proposal_only', 'Implementation-bearing plugin must remain proposal-only until explicit activation'));
          }
          const contractPath = join(pluginDir, manifest.implementation.integration_contract_path || 'integration-contract.json');
          if (!existsSync(contractPath)) add(err('IMPLEMENTATION_CONTRACT_EXISTS', 'implementation.integration_contract_path', 'Integration contract file is required'));
        }
        const forbiddenSrc = ['child_process', 'fs.rmSync', 'fs.rmdirSync', 'eval(', 'Function('].filter(token => src.includes(token));
        if (forbiddenSrc.length) add(err('ENTRYPOINT_FORBIDDEN_SOURCE', 'entrypoint', `Potentially unsafe source tokens: ${forbiddenSrc.join(', ')}`));
      }
      const testPath = join(pluginDir, 'tests', 'plugin.test.js');
      if (!existsSync(testPath)) add(err('TESTS_EXIST', 'tests/plugin.test.js', 'Plugin should include tests/plugin.test.js', 'warning'));
    }

    const allPaths = [...(manifest.permissions?.file_access?.read || []), ...(manifest.permissions?.file_access?.write || [])].map(p => normalize(String(p)).replaceAll('\\','/'));
    const violations = allPaths.filter(p => FORBIDDEN_CORE_PATHS.some(f => p.startsWith(f)));
    if (violations.length) add(err('NO_CORE_PATH_ACCESS', 'permissions.file_access', `Forbidden core paths: ${violations.join(', ')}`));

    const missingSchemas = (manifest.mcp_tools || []).filter(t => !t.input_schema);
    if (missingSchemas.length) add(err('MCP_TOOLS_HAVE_SCHEMAS', 'mcp_tools', `MCP tools missing input_schema: ${missingSchemas.map(t=>t.name).join(', ')}`));
    if (!manifest.axiom_runtime?.min_version) add(err('AXIOM_RUNTIME_MIN_VERSION', 'axiom_runtime.min_version', 'Minimum AXIOM runtime version required'));

    const rule_count = manifest.implementation?.kind === 'implementation_bearing_plugin_proposal'
      ? (implementationKind === 'safe_write_project_file' ? 28 : 26)
      : 20;
    return { passed: errors.length === 0, rule_count, errors, warnings };
  }
}
