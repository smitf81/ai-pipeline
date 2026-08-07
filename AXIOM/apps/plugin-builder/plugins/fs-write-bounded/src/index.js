export async function onLoad(ctx) {
  ctx.log?.info?.('fs-write-bounded: loaded');
}

export async function onActivate(ctx) {
  ctx.commands?.register?.('fs-write-bounded.run', async () => ({ ok: true, plugin_id: 'fs-write-bounded' }));
}

export async function onDeactivate(ctx) {
  ctx.commands?.unregister?.('fs-write-bounded.run');
}

export async function onUnload(ctx) {
  ctx.commands?.unregister?.('fs-write-bounded.run');
}
