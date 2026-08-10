import { useEffect, useLayoutEffect } from 'octane';

export const useSafeLayoutEffect =
	typeof globalThis.document !== 'undefined' ? useLayoutEffect : useEffect;
