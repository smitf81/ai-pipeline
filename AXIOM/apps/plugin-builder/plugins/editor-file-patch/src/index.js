export async function onLoad(ctx) {
  ctx.log?.info?.('editor-file-patch: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('editor-file-patch.run', async () => ({ ok: true, plugin_id: 'editor-file-patch' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('editor-file-patch.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('editor-file-patch.run');
}
