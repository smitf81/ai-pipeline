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
      listeners.get(type)?.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error('[EventBus] Unhandled error in handler for', type, err);
        }
      });
    }
  };
}
