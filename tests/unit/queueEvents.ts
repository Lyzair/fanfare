/** `subscribe` for a fake AudioQueue in panel tests, plus `emit` to report playing/stopped. */
export function queueEvents() {
  const listeners = new Set<(playing: boolean) => void>();
  return {
    subscribe: (fn: (playing: boolean) => void) => {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    emit: (playing: boolean) => listeners.forEach(fn => fn(playing)),
  };
}
