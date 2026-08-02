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
			host.nativeTheme.shouldUseDarkColors().then((value) => {
				if (!disposed) setDark(value);
			});
			const stop = host.nativeTheme.onUpdated((value) => setDark(value));
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
