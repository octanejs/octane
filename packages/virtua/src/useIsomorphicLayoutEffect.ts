import { useEffect, useLayoutEffect } from 'octane';
import { isBrowser } from 'virtua/unstable_core';

/**
 * @internal
 */
export const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;
