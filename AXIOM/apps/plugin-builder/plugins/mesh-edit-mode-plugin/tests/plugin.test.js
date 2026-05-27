import * as plugin from '../src/index.js';
if (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');
console.log('mesh-edit-mode-plugin editor plugin exports OK');
