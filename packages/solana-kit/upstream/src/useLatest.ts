import { type MutableRefObject, useRef } from 'react';

import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

/**
 * Hold `value` in a ref that is re-synced to the latest render's value after every commit.
 *
 * Lets a callback (or a store created once) read the freshest closure value at call time without
 * taking it as a dependency, so the consumer's own identity stays stable across renders. The sync
 * runs in a layout effect so the ref is current before passive effects and event handlers fire.
 *
 * @typeParam T - The type of the value being tracked.
 *
 * @returns A stable {@link MutableRefObject} whose `current` always reflects the most recent render.
 *
 * @internal
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
    const ref = useRef(value);
    useIsomorphicLayoutEffect(() => {
        ref.current = value;
    });
    return ref;
}
