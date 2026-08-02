import { afterEach, describe, expect, it } from 'vitest';
import type { OctaneElectronAPI } from '../../src/common/types';
import {
	clearElectronBridge,
	getElectronBridge,
	getElectronBridgeKey,
	hasElectronHost,
	installElectronBridge,
	setElectronBridgeKey,
} from '../../src/renderer/internal';
import { OCTANE_ELECTRON_GLOBAL } from '../../src/common/channels';
import { exposeOctaneElectron } from '../../src/preload/index';

function stubApi(label: string): OctaneElectronAPI {
	return {
		invoke: async <T = unknown>() => label as T,
		on: () => () => {},
		app: {
			getVersion: async () => label,
			getName: async () => label,
			getPath: async () => label,
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
				title: label,
			}),
			onStateChange: () => () => {},
		},
		dialog: {
			showOpenDialog: async () => ({}),
			showSaveDialog: async () => ({}),
			showMessageBox: async () => ({}),
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
			onUpdated: () => () => {},
		},
		screen: {
			getPrimaryDisplay: async () => ({
				id: 1,
				label,
				bounds: { x: 0, y: 0, width: 1, height: 1 },
				workArea: { x: 0, y: 0, width: 1, height: 1 },
				scaleFactor: 1,
				rotation: 0,
			}),
			getAllDisplays: async () => [],
			onDisplayChanged: () => () => {},
		},
	};
}

afterEach(() => {
	clearElectronBridge();
	setElectronBridgeKey(OCTANE_ELECTRON_GLOBAL);
	delete (globalThis as any).myElectronAPI;
	delete (globalThis as any)[OCTANE_ELECTRON_GLOBAL];
});

describe('custom electron bridge apiKey', () => {
	it('installElectronBridge remembers the key so hooks resolve the same global', async () => {
		installElectronBridge(stubApi('custom'), 'myElectronAPI');
		expect(getElectronBridgeKey()).toBe('myElectronAPI');
		expect(hasElectronHost()).toBe(true);
		await expect(getElectronBridge()!.app.getVersion()).resolves.toBe('custom');
		expect((globalThis as any).__OCTANE_ELECTRON__).toBeUndefined();
	});

	it('setElectronBridgeKey follows a preload expose under a custom apiKey', async () => {
		exposeOctaneElectron({
			apiKey: 'myElectronAPI',
			ipcRenderer: {
				invoke: async () => 'from-preload',
				on: () => {},
				removeListener: () => {},
			},
			// Simulate contextBridge writing onto globalThis in this jsdom test.
			contextBridge: {
				exposeInMainWorld: (key, api) => {
					(globalThis as any)[key] = api;
				},
			},
		});

		expect(hasElectronHost()).toBe(false);
		setElectronBridgeKey('myElectronAPI');
		expect(hasElectronHost()).toBe(true);
		await expect(getElectronBridge()!.invoke('any')).resolves.toBe('from-preload');
	});
});
