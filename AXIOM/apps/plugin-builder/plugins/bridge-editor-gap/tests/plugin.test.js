import * as plugin from '../src/index.js';
if (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');
console.log('bridge-editor-gap editor plugin exports OK');
