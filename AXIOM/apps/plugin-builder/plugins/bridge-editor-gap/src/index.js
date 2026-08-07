export async function onLoad(ctx) {
  ctx.log?.info?.('bridge-editor-gap: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('bridge-editor-gap.run', async () => ({ ok: true, plugin_id: 'bridge-editor-gap' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('bridge-editor-gap.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('bridge-editor-gap.run');
}
