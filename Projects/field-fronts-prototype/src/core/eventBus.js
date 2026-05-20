export function createEventBus() {
  const listeners = new Map();

  return {
    on(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
      return () => listeners.get(type)?.delete(handler);
    },
    emit(type, payload) {
      listeners.get(type)?.forEach((handler) => handler(payload));
    }
  };
}
