import { useEffect, useState } from 'octane';
import type { WindowState } from '../common/types';
import { getElectronBridge, splitSlot, subSlot } from './internal';

const EMPTY: WindowState = {
	isMaximized: false,
	isMinimized: false,
	isFullScreen: false,
	title: '',
};

/**
 * Live BrowserWindow state pushed over the default bridge.
 * SSR / off-host returns a static empty snapshot until a host is present.
 */
export function useWindowState(): WindowState;
export function useWindowState(slot: symbol | undefined): WindowState;
export function useWindowState(...rest: [symbol?]): WindowState {
	const [, slot] = splitSlot(rest);
	const [state, setState] = useState<WindowState>(EMPTY, subSlot(slot, 'window:state'));

	useEffect(
		() => {
			const bridge = getElectronBridge();
			if (bridge === undefined) return;
			let disposed = false;
			// Live pushes win over the initial snapshot: subscribe first, then ignore
			// the async read if an update already landed (or the effect cleaned up).
			let seenLiveUpdate = false;
			const stop = bridge.window.onStateChange((next) => {
				seenLiveUpdate = true;
				setState(next);
			});
			bridge.window
				.getState()
				.then((next) => {
					if (!disposed && !seenLiveUpdate && next != null) setState(next);
				})
				.catch(() => {});
			return () => {
				disposed = true;
				stop();
			};
		},
		[],
		subSlot(slot, 'window:effect'),
	);

	return state;
}
