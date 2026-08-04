import { useEffect, useState } from 'octane';
import { getElectronBridge, splitSlot, subSlot } from './internal';

/**
 * Subscribe to Electron `nativeTheme.shouldUseDarkColors` through the bridge.
 * SSR / off-host returns `false` until a host is present.
 */
export function useNativeTheme(): boolean;
export function useNativeTheme(slot: symbol | undefined): boolean;
export function useNativeTheme(...rest: [symbol?]): boolean {
	const [, slot] = splitSlot(rest);
	const [dark, setDark] = useState(false, subSlot(slot, 'theme:state'));

	useEffect(
		() => {
			const host = getElectronBridge();
			if (host === undefined) return;
			let disposed = false;
			// Live pushes win over the initial snapshot: subscribe first, then ignore
			// the async read if an update already landed (or the effect cleaned up).
			let seenLiveUpdate = false;
			const stop = host.nativeTheme.onUpdated((value) => {
				seenLiveUpdate = true;
				setDark(value);
			});
			host.nativeTheme
				.shouldUseDarkColors()
				.then((value) => {
					if (!disposed && !seenLiveUpdate) setDark(value);
				})
				.catch(() => {});
			return () => {
				disposed = true;
				stop();
			};
		},
		[],
		subSlot(slot, 'theme:effect'),
	);

	return dark;
}
