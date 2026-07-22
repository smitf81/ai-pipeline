export async function onLoad(ctx) {
  ctx.log?.info?.('file-io-patch: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('file-io-patch.run', async () => ({ ok: true, plugin_id: 'file-io-patch' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('file-io-patch.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('file-io-patch.run');
}
