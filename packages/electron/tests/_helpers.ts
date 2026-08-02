export { mount, nextPaint, flushEffects, createLog, act } from '../../octane/tests/_helpers';

import { nextPaint } from '../../octane/tests/_helpers';
import type { OctaneElectronAPI } from '../src/common/types';
import { clearElectronBridge, installElectronBridge } from '../src/renderer/internal';

/**
 * Settle an IPC round trip. An in-flight invoke is invisible to the scheduler,
 * so `act` returns before the response reaches a hook.
 */
export async function flush(): Promise<void> {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		await nextPaint();
	}
}

type InvokeHandler = (channel: string, args: unknown[]) => unknown;

export function installMockBridge(handler: InvokeHandler): {
	calls: Array<{ channel: string; args: unknown[] }>;
	emit: (channel: string, ...args: unknown[]) => void;
} {
	const calls: Array<{ channel: string; args: unknown[] }> = [];
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

	const api: OctaneElectronAPI = {
		invoke: async <T = unknown>(channel: string, ...args: unknown[]) => {
			calls.push({ channel, args });
			return handler(channel, args) as T;
		},
		on: (channel, listener) => {
			let set = listeners.get(channel);
			if (set === undefined) listeners.set(channel, (set = new Set()));
			set.add(listener);
			return () => set!.delete(listener);
		},
		app: {
			getVersion: async () => '1.0.0',
			getName: async () => 'test',
			getPath: async () => '/tmp',
			quit: async () => {},
		},
		window: {
			minimize: async () => {},
			maximize: async () => {},
			unmaximize: async () => {},
			close: async () => {},
			isMaximized: async () => false,
			setTitle: async () => {},
			getState: async () => ({
				isMaximized: false,
				isMinimized: false,
				isFullScreen: false,
				title: 'test',
			}),
			onStateChange: (listener) =>
				api.on('octane:window:stateChanged', (state) => listener(state as any)),
		},
		dialog: {
			showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
			showSaveDialog: async () => ({ canceled: true }),
			showMessageBox: async () => ({ response: 0 }),
		},
		shell: {
			openExternal: async () => {},
			showItemInFolder: async () => {},
			openPath: async () => '',
		},
		clipboard: {
			readText: async () => '',
			writeText: async () => {},
		},
		nativeTheme: {
			shouldUseDarkColors: async () => false,
			onUpdated: (listener) =>
				api.on('octane:nativeTheme:updated', (dark) => listener(Boolean(dark))),
		},
		screen: {
			getPrimaryDisplay: async () => ({
				id: 1,
				label: 'primary',
				bounds: { x: 0, y: 0, width: 1920, height: 1080 },
				workArea: { x: 0, y: 0, width: 1920, height: 1040 },
				scaleFactor: 1,
				rotation: 0,
			}),
			getAllDisplays: async () => [],
			onDisplayChanged: (listener) => api.on('octane:screen:displayChanged', () => listener()),
		},
	};

	installElectronBridge(api);
	return {
		calls,
		emit: (channel, ...args) => {
			for (const listener of listeners.get(channel) ?? []) listener(...args);
		},
	};
}

export function resetBridge(): void {
	clearElectronBridge();
}
