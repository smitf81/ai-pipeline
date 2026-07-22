import * as plugin from '../src/index.js';
if (typeof plugin.onActivate !== 'function') throw new Error('onActivate missing');
console.log('boundedskilldocumentsaver editor plugin exports OK');
