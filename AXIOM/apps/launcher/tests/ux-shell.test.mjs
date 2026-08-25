import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const editor = await readFile(join(launcherRoot, 'public', 'axiom-editor.html'), 'utf8');
const sseClient = await readFile(join(launcherRoot, 'public', 'axiom-sse-client.js'), 'utf8');
const capabilityAcquisition = await readFile(join(launcherRoot, 'public', 'capability-acquisition.js'), 'utf8');
const chatSendStart = editor.indexOf('async function send(userText, options = {})');
const chatSendEnd = editor.indexOf('// ── activate pending result', chatSendStart);
const chatSend = editor.slice(chatSendStart, chatSendEnd);

for (const needle of [
  'AxiomUXRuntime',
  'axiom.shell.ux.v1',
  'axiom.shell.layout.v1',
  'DropdownDismissalModel',
  'PanelTabRelationshipModel',
  'ShellLayoutPersistence',
  'data-ux-relationship-rules',
  'role="menubar"',
  'role="tablist"',
  'data-panel-id="files"',
  'data-panel-id="bsb-scenario"',
  'BSB Objects',
  'Scene Object Workbench',
  'black-sky-bound.axiom-scene-authoring.v1',
  'Scene Outliner',
  'Apply to Runtime',
  'bsb-v2-map-authoring.js',
  'setRuntimeQuery',
  "command === 'scene.applyRuntime' ? 8000 : 1800",
  'ux-disclosure fm-disclosure',
  'PanelManager.getState',
  'PanelManager.setCollapsed',
  'AxiomShellUXCapability'
  ,'workspace-context-indicator'
  ,'workspaceContext: () => FileManagerRuntime.getWorkspaceContext()'
  ,'num_predict: opts.max_tokens || 2048'
  ,'chat-workspace-strip'
  ,'chat-project-auto'
  ,'BSB_WORKSPACE_TABS'
  ,'applyWorkspaceContext'
  ,'bsb-workspace-active'
  ,'ActiveProjectWorkspaceContextCapability'
  ,'workspace: workspaceContext'
  ,'return ChatRuntime.send(msg)'
  ,'AxiomNaturalLanguageAgent'
  ,'axiom.agent-intent.v1'
  ,'mapforge.terrain.patch'
  ,'natural-language-agent.js'
  ,'capability-acquisition.js'
  ,'axiom.runtime-plugin-host.v1'
  ,'declared_plugin_tools_not_registered'
  ,'acquisition_did_not_close_gap'
]) {
  assert.ok(editor.includes(needle), `editor should include UX contract marker: ${needle}`);
}

assert.match(editor, /function switchTab\(name\)\s*{\s*if \(!AxiomUXRuntime\.showLeftPanel\(name\)\)/, 'switchTab should delegate to AxiomUXRuntime first');
assert.match(editor, /function toggleAddMenu\(\)\s*{\s*AxiomUXRuntime\.toggleAddMenu\(\);?\s*}/, 'add menu should be managed by AxiomUXRuntime');
assert.match(editor, /const STORAGE_KEY = 'axiom\.shell\.layout\.v1';\s*const LEGACY_STORAGE_KEY = 'axiom\.panels\.v3';/, 'PanelManager should migrate legacy layout state');
assert.match(editor, /if \(typedRoot && typedRoot !== '\.'\) return typedRoot;/, 'a typed non-root project path should win over a stale project selector');
assert.match(editor, /activeSurfaceId === 'bsb-v2-map-authoring'/, 'loading a declared BSB workspace should activate its authoring surface automatically');
assert.ok(chatSendStart >= 0 && chatSendEnd > chatSendStart, 'ChatRuntime send source should be discoverable');
assert.doesNotMatch(chatSend, /const parsedByFileManager = window\.FileManagerRuntime\?\.tryHandleChatIntent\?\.\(userText\)/, 'ordinary prose should not be intercepted by the legacy FileManager classifier before the model');
assert.doesNotMatch(chatSend, /Think parse failed — falling back to conversation mode/, 'invalid structured intent must fail visibly instead of becoming conversation');
assert.match(editor, /const BRIDGE = \/\^https\?:\$\/\.test\(window\.location\.protocol\)\s*\? window\.location\.origin/, 'the editor bridge should follow the current loopback origin');
assert.match(sseClient, /const bridgeUrl = \/\^https\?:\$\/\.test\(globalThis\.location\?\.protocol \|\| ''\)\s*\? globalThis\.location\.origin/, 'the standalone SSE client should follow the current loopback origin');
assert.match(capabilityAcquisition, /axiom\.capability-acquisition\.v1/, 'capability acquisition should expose a versioned contract');
assert.match(capabilityAcquisition, /explicit_runtime_activation_and_callable_tool_verification/, 'registration must remain separate from runtime activation and verification');

console.log('ux-shell.test.mjs passed');
