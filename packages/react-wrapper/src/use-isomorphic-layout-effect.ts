import { useEffect, useLayoutEffect } from 'react';

// React SSR warns on useLayoutEffect; the server pass renders only the empty
// container, so effect timing there is irrelevant.
export const useIsomorphicLayoutEffect =
	typeof document === 'undefined' ? useEffect : useLayoutEffect;
