import { useEffect, useState } from 'octane';
import { resolveHookSlot, subSlot } from './slot';
import type { ColorMode, ColorModeClass } from '@xyflow/system';

function getMediaQuery() {
	if (typeof window === 'undefined' || !window.matchMedia) {
		return null;
	}

	return window.matchMedia('(prefers-color-scheme: dark)');
}

/**
 * Hook for receiving the current color mode class 'dark' or 'light'.
 *
 * @internal
 * @param colorMode - The color mode to use ('dark', 'light' or 'system')
 */
export function useColorModeClass(colorMode: ColorMode, ...rest: [slot?: symbol]): ColorModeClass {
	const slot = resolveHookSlot(rest);
	const [colorModeClass, setColorModeClass] = useState<ColorModeClass | null>(
		colorMode === 'system' ? null : colorMode,
		subSlot(slot, 'state'),
	);

	useEffect(
		function syncColorModeClass() {
			if (colorMode !== 'system') {
				setColorModeClass(colorMode);
				return;
			}

			const mediaQuery = getMediaQuery();
			const updateColorModeClass = function updateColorModeClass() {
				setColorModeClass(mediaQuery?.matches ? 'dark' : 'light');
			};

			updateColorModeClass();
			mediaQuery?.addEventListener('change', updateColorModeClass);

			return function cleanup() {
				mediaQuery?.removeEventListener('change', updateColorModeClass);
			};
		},
		[colorMode],
		subSlot(slot, 'effect'),
	);

	return colorModeClass !== null ? colorModeClass : getMediaQuery()?.matches ? 'dark' : 'light';
}
