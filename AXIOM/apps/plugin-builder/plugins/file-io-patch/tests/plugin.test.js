import * as plugin from '../src/index.js';
if (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');
console.log('file-io-patch editor plugin exports OK');
