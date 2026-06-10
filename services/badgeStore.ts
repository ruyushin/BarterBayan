/**
 * badgeStore.ts
 *
 * Lightweight listener-based store for the inbox tab badge count.
 * InboxScreen writes via setCount(); TabLayout subscribes via subscribe().
 * Same pattern as welcomeState.ts — no Context, no Redux.
 */

type Listener = (count: number) => void;

let _count = 0;
const _listeners = new Set<Listener>();

export const badgeStore = {
  setCount(n: number) {
    _count = n;
    _listeners.forEach((l) => l(n));
  },
  getCount(): number {
    return _count;
  },
  subscribe(listener: Listener): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
};
