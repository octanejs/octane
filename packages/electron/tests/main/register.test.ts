import { describe, expect, it, vi } from 'vitest';
import { OCTANE_ELECTRON_CHANNELS } from '../../src/common/channels';
import { registerOctaneElectronMain, trackOctaneElectronWindow } from '../../src/main/index';

describe('registerOctaneElectronMain', () => {
	it('registers handlers and serves app metadata', async () => {
		const handlers = new Map<string, (...args: any[]) => any>();
		const ipcMain = {
			handle: (channel: string, listener: (...args: any[]) => any) => {
				handlers.set(channel, listener);
			},
			removeHandler: (channel: string) => {
				handlers.delete(channel);
			},
		};

		const dispose = registerOctaneElectronMain({
			ipcMain,
			app: {
				getVersion: () => '9.9.9',
				getName: () => 'OctaneApp',
				getPath: (name) => `/paths/${name}`,
				quit: vi.fn(),
			},
			dialog: {
				showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
				showSaveDialog: async () => ({ canceled: true }),
				showMessageBox: async () => ({ response: 0 }),
			},
			shell: {
				openExternal: async () => {},
				showItemInFolder: () => {},
				openPath: async () => '',
			},
			clipboard: {
				readText: () => 'clip',
				writeText: () => {},
			},
			nativeTheme: {
				shouldUseDarkColors: true,
				on: () => {},
			},
			screen: {
				getPrimaryDisplay: () => ({
					id: 1,
					label: 'main',
					bounds: { x: 0, y: 0, width: 100, height: 100 },
					workArea: { x: 0, y: 0, width: 100, height: 80 },
					scaleFactor: 1,
					rotation: 0,
				}),
				getAllDisplays: () => [],
				on: () => {},
			},
		});

		expect(await handlers.get(OCTANE_ELECTRON_CHANNELS.appGetVersion)!({})).toBe('9.9.9');
		expect(await handlers.get(OCTANE_ELECTRON_CHANNELS.clipboardReadText)!({})).toBe('clip');
		expect(await handlers.get(OCTANE_ELECTRON_CHANNELS.nativeThemeShouldUseDarkColors)!({})).toBe(
			true,
		);

		dispose();
		expect(handlers.size).toBe(0);
	});
});

describe('trackOctaneElectronWindow', () => {
	it('pushes window state on maximize', () => {
		const sent: unknown[] = [];
		const listeners = new Map<string, Array<() => void>>();
		const win = {
			minimize: () => {},
			maximize: () => {},
			unmaximize: () => {},
			close: () => {},
			isMaximized: () => true,
			isMinimized: () => false,
			isFullScreen: () => false,
			getTitle: () => 'T',
			setTitle: () => {},
			webContents: {
				send: (channel: string, ...args: unknown[]) => {
					sent.push([channel, ...args]);
				},
			},
			on: (event: string, listener: () => void) => {
				let list = listeners.get(event);
				if (list === undefined) listeners.set(event, (list = []));
				list.push(listener);
			},
			removeListener: (event: string, listener: () => void) => {
				const list = listeners.get(event);
				if (list === undefined) return;
				const index = list.indexOf(listener);
				if (index >= 0) list.splice(index, 1);
			},
		};

		const stop = trackOctaneElectronWindow(win);
		for (const listener of listeners.get('maximize') ?? []) listener();
		expect(sent[0]).toEqual([
			OCTANE_ELECTRON_CHANNELS.windowStateChanged,
			{
				isMaximized: true,
				isMinimized: false,
				isFullScreen: false,
				title: 'T',
			},
		]);
		stop();
	});
});
