import { describe, expect, it, vi } from 'vitest';
import { OCTANE_ELECTRON_CHANNELS } from '../../src/common/channels';
import {
	registerOctaneElectronMain,
	registerOctaneElectronMainFromElectron,
	trackOctaneElectronWindow,
} from '../../src/main/index';

const electronHandlers = new Map<string, (...args: any[]) => any>();
const fakeWindow = {
	minimize: vi.fn(),
	maximize: vi.fn(),
	unmaximize: vi.fn(),
	close: vi.fn(),
	isMaximized: () => true,
	isMinimized: () => false,
	isFullScreen: () => false,
	getTitle: () => 'T',
	setTitle: vi.fn(),
	webContents: { send: vi.fn() },
	on: vi.fn(),
	removeListener: vi.fn(),
};

vi.mock('electron', () => ({
	ipcMain: {
		handle: (channel: string, listener: (...args: any[]) => any) => {
			electronHandlers.set(channel, listener);
		},
		removeHandler: (channel: string) => {
			electronHandlers.delete(channel);
		},
	},
	app: {
		getVersion: () => '1.0.0',
		getName: () => 'App',
		getPath: (name: string) => `/paths/${name}`,
		quit: vi.fn(),
	},
	dialog: {
		showOpenDialog: vi.fn(async (window: unknown) => ({ window, canceled: true, filePaths: [] })),
		showSaveDialog: vi.fn(async () => ({ canceled: true })),
		showMessageBox: vi.fn(async () => ({ response: 0 })),
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
	webContents: { getAllWebContents: () => [] },
	BrowserWindow: {
		fromWebContents: (sender: unknown) => (sender === 'the-sender' ? fakeWindow : null),
	},
}));

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

describe('registerOctaneElectronMainFromElectron', () => {
	it('resolves the invoking BrowserWindow via BrowserWindow.fromWebContents by default', async () => {
		const dispose = await registerOctaneElectronMainFromElectron();
		const event = { sender: 'the-sender' };

		await electronHandlers.get(OCTANE_ELECTRON_CHANNELS.windowMinimize)!(event);
		expect(fakeWindow.minimize).toHaveBeenCalledTimes(1);

		const state = await electronHandlers.get(OCTANE_ELECTRON_CHANNELS.windowGetState)!(event);
		expect(state).toEqual({
			isMaximized: true,
			isMinimized: false,
			isFullScreen: false,
			title: 'T',
		});

		const { window } = await electronHandlers.get(OCTANE_ELECTRON_CHANNELS.dialogShowOpen)!(
			event,
			{},
		);
		expect(window).toBe(fakeWindow);

		dispose();
	});

	it('yields no window for a sender with no owning BrowserWindow', async () => {
		const dispose = await registerOctaneElectronMainFromElectron();
		const event = { sender: 'unknown-sender' };

		const state = await electronHandlers.get(OCTANE_ELECTRON_CHANNELS.windowGetState)!(event);
		expect(state).toBeNull();

		dispose();
	});
});
