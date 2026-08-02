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
			bridge.window.getState().then((next) => {
				if (!disposed && next != null) setState(next);
			});
			const stop = bridge.window.onStateChange((next) => setState(next));
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
