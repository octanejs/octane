import { useEffect, useId, useLayoutEffect } from 'octane';
import { hasRequestAnimationFrame, isLegacyDeno, isWindowDefined } from './helper.js';

export const IS_REACT_LEGACY = !useId;
export const IS_SERVER = !isWindowDefined || isLegacyDeno;

export const rAF = (f: (...args: any[]) => void): number | ReturnType<typeof setTimeout> =>
	hasRequestAnimationFrame() ? window.requestAnimationFrame(f) : setTimeout(f, 1);

export const useIsomorphicLayoutEffect = IS_SERVER ? useEffect : useLayoutEffect;

const navigatorConnection =
	typeof navigator !== 'undefined' &&
	(
		navigator as Navigator & {
			connection?: { effectiveType: string; saveData: boolean };
		}
	).connection;

export const slowConnection =
	!IS_SERVER &&
	navigatorConnection &&
	(['slow-2g', '2g'].includes(navigatorConnection.effectiveType) || navigatorConnection.saveData);
