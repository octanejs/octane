import { useEffect, useLayoutEffect } from 'react';

/**
 * `useLayoutEffect` warns when run on the server because layout effects only make sense after a
 * DOM is mounted. For our use, plain `useEffect` is functionally equivalent on the server (no
 * event handlers can fire mid-render anyway), so we pick at module load time and stay silent
 * during SSR.
 *
 * @internal
 */
export const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
