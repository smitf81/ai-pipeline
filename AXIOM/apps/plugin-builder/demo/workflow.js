import {
  axiom_plugin_create,
  axiom_plugin_validate,
  axiom_plugin_package,
  axiom_plugin_register,
  axiom_plugin_inspect
} from '../src/builder/index.js';

const create = await axiom_plugin_create({
  request_id: 'demo-create-001',
  name: 'Git Status Bar',
  description: 'Shows current git branch and workspace status in the AXIOM status bar.',
  template: 'ui_panel'
});
console.log('CREATE', create);

const validate = await axiom_plugin_validate({ request_id: 'demo-validate-001', plugin_id: create.plugin_id });
console.log('VALIDATE', validate);

const pack = await axiom_plugin_package({ request_id: 'demo-package-001', plugin_id: create.plugin_id });
console.log('PACKAGE', pack);

const register = await axiom_plugin_register({ request_id: 'demo-register-001', plugin_id: create.plugin_id });
console.log('REGISTER', register);

const inspect = await axiom_plugin_inspect({ plugin_id: create.plugin_id, include_files: true });
console.log('INSPECT', inspect);
