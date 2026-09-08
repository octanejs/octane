import { useEffect, useLayoutEffect } from 'octane';

export const useIsomorphicLayoutEffect =
	typeof window === 'undefined' ? useEffect : useLayoutEffect;
