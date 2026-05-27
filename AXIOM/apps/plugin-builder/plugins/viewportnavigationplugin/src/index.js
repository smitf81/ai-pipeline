export async function onLoad(ctx) {
  ctx.log?.info?.('viewportnavigationplugin: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('viewportnavigationplugin.run', async () => ({ ok: true, plugin_id: 'viewportnavigationplugin' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('viewportnavigationplugin.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('viewportnavigationplugin.run');
}
