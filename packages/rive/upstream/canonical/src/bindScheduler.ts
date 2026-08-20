import type { Rive } from '@rive-app/canvas';

// Rive instances with a bind already queued this tick. WeakSet so instances
// coalesce independently and entries free themselves on GC.
const pendingBinds = new WeakSet<Rive>();

/**
 * Coalesces `rive.bind()` (the flush that applies
 * pending set*ViewModelInstance calls before the state machine advances).
 *
 * VM hooks call this instead of binding directly: the first call in a React
 * commit queues a microtask that binds once; later calls that commit are
 * deduped. So hooks resolving in the *same* commit share one bind — those across
 * separate commits each bind.
 *
 * @param rive - The Rive instance to schedule a coalesced bind for.
 */
export function scheduleBind(rive: Rive): void {
  if (pendingBinds.has(rive)) {
    return;
  }
  pendingBinds.add(rive);
  queueMicrotask(() => {
    pendingBinds.delete(rive);
    // bind() is a no-op internally if the instance was cleaned up in the
    // interim (it guards on `destroyed`), so this is safe to call unconditionally.
    rive.bind();
  });
}
