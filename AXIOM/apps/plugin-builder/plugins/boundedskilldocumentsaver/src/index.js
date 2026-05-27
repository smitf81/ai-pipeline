export async function onLoad(ctx) {
  ctx.log?.info?.('boundedskilldocumentsaver: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('boundedskilldocumentsaver.run', async () => ({ ok: true, plugin_id: 'boundedskilldocumentsaver' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('boundedskilldocumentsaver.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('boundedskilldocumentsaver.run');
}
