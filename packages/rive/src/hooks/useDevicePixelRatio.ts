import { useEffect, useState } from 'octane';
import { splitSlot, subSlot } from '../internal.ts';

/**
 * Listen for devicePixelRatio changes and set the new value accordingly. This could
 * happen for reasons such as:
 * - User moves window from retina screen display to a separate monitor
 * - User controls zoom settings on the browser
 *
 * Source: https://github.com/rexxars/use-device-pixel-ratio/blob/main/index.ts
 *
 * @param customDevicePixelRatio - Number to force a dpr to abide by, rather than using the window's
 *
 * @returns dpr: Number - Device pixel ratio; ratio of physical px to resolution in CSS pixels for current device
 */
export default function useDevicePixelRatio(...rawArgs: unknown[]) {
	const [args, slot] = splitSlot(rawArgs);
	const customDevicePixelRatio = args[0] as number | undefined;
	const dpr = customDevicePixelRatio || getDevicePixelRatio();
	const [currentDpr, setCurrentDpr] = useState(dpr, subSlot(slot, 'dpr'));

	useEffect(
		function listenForDpr() {
			const canListen = typeof window !== 'undefined' && 'matchMedia' in window;
			if (!canListen) {
				return;
			}

			function updateDpr() {
				const newDpr = customDevicePixelRatio || getDevicePixelRatio();
				setCurrentDpr(newDpr);
			}
			const mediaMatcher = window.matchMedia(`screen and (resolution: ${currentDpr}dppx)`);
			if (Object.prototype.hasOwnProperty.call(mediaMatcher, 'addEventListener')) {
				mediaMatcher.addEventListener('change', updateDpr);
			} else {
				mediaMatcher.addListener(updateDpr);
			}

			return function cleanup() {
				if (Object.prototype.hasOwnProperty.call(mediaMatcher, 'removeEventListener')) {
					mediaMatcher.removeEventListener('change', updateDpr);
				} else {
					mediaMatcher.removeListener(updateDpr);
				}
			};
		},
		[currentDpr, customDevicePixelRatio],
		subSlot(slot, 'listen'),
	);

	return currentDpr;
}

function getDevicePixelRatio(): number {
	const hasDprProp = typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number';
	const dpr = hasDprProp ? window.devicePixelRatio : 1;
	return Math.min(Math.max(1, dpr), 3);
}
