import type { InternalFieldStore } from '../../types/index.ts';

/**
 * Walks through the field store and all nested children, calling the callback
 * for each field store in depth-first order. The callback may return `true` to
 * stop the walk early, in which case `walkFieldStore` returns `true` as well.
 *
 * The walk reads array `items` reactively, so a reactive caller subscribes to
 * structural changes naturally. Imperative callers that must not subscribe
 * (e.g. when invoked inside an effect) should wrap the call in `untrack`.
 *
 * @param internalFieldStore The field store to walk.
 * @param callback The callback to invoke for each field store. Return `true` to stop the walk early.
 *
 * @returns Whether the walk was stopped early by the callback.
 */
export function walkFieldStore(
  internalFieldStore: InternalFieldStore,
  callback: (internalFieldStore: InternalFieldStore) => boolean | void
): boolean {
  // Invoke callback for current field store and stop early if requested
  if (callback(internalFieldStore)) {
    return true;
  }

  // If field store is array, walk all children
  if (internalFieldStore.kind === 'array') {
    // Walk each array item
    for (
      let index = 0;
      index < internalFieldStore.items.value.length;
      index++
    ) {
      // Recursively walk child and stop early if requested
      if (walkFieldStore(internalFieldStore.children[index], callback)) {
        return true;
      }
    }

    // Otherwise, if field store is object, walk all children
  } else if (internalFieldStore.kind === 'object') {
    // Walk each object property
    for (const key in internalFieldStore.children) {
      // Recursively walk child and stop early if requested
      if (walkFieldStore(internalFieldStore.children[key], callback)) {
        return true;
      }
    }
  }

  // Otherwise, return that the walk completed without stopping early
  return false;
}
