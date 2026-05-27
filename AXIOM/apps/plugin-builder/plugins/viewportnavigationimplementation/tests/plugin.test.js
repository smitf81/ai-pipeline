import * as plugin from '../src/index.js';

const requiredExports = [
  'onLoad',
  'onActivate',
  'onDeactivate',
  'onUnload',
  'installViewportNavigation',
  'uninstallViewportNavigation'
];

for (const name of requiredExports) {
  if (typeof plugin[name] !== 'function') throw new Error(name + ' export missing');
}

const result = plugin.installViewportNavigation({ scene: {} });
if (result?.ok !== false || result?.reason !== 'missing_runtime_api') {
  throw new Error('missing runtime API guard did not fire');
}

if (!plugin.integrationContract?.required_context?.scene?.includes('getCamera()')) {
  throw new Error('integration contract missing scene.getCamera requirement');
}

if (!plugin.integrationContract?.behaviour?.some(line => line.includes('Mouse wheel zooms'))) {
  throw new Error('integration contract missing wheel zoom behaviour');
}

if (!plugin.integrationContract?.behaviour?.some(line => line.includes('Right mouse drag'))) {
  throw new Error('integration contract missing mouse pan behaviour');
}

console.log('viewportnavigationimplementation implementation-bearing viewport plugin exports OK');
