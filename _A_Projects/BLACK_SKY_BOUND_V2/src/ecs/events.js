export function emitEvent(world, type, payload = {}) {
  const event = { type, payload, at: world.events.length };
  world.events.push(event);
  return event;
}

export function drainEvents(world, type = null) {
  if (!type) {
    const events = world.events;
    world.events = [];
    return events;
  }
  const selected = [];
  const remaining = [];
  for (const event of world.events) {
    if (event.type === type) selected.push(event);
    else remaining.push(event);
  }
  world.events = remaining;
  return selected;
}
