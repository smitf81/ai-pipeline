export async function onLoad(ctx) {
  ctx.log?.info?.('mesh-edit-mode-plugin: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('mesh-edit-mode-plugin.run', async () => ({ ok: true, plugin_id: 'mesh-edit-mode-plugin' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('mesh-edit-mode-plugin.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('mesh-edit-mode-plugin.run');
}
