import { afterEach, describe, expect, it } from 'vitest';
import type { OctaneElectronAPI, WindowState } from '../../src/common/types';
import { installElectronBridge } from '../../src/renderer/internal';
import { ThemeReader, WindowStateReader } from '../_fixtures/desktop.tsrx';
import { act, flush, mount, resetBridge } from '../_helpers';

afterEach(async () => {
	await flush();
	resetBridge();
});

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function emptyDesktopApi(
	overrides: Partial<OctaneElectronAPI> & {
		nativeTheme?: OctaneElectronAPI['nativeTheme'];
		window?: OctaneElectronAPI['window'];
	},
): OctaneElectronAPI {
	return {
		invoke: async () => null,
		on: () => () => {},
		app: {} as OctaneElectronAPI['app'],
		dialog: {} as OctaneElectronAPI['dialog'],
		shell: {} as OctaneElectronAPI['shell'],
		clipboard: {} as OctaneElectronAPI['clipboard'],
		screen: {} as OctaneElectronAPI['screen'],
		nativeTheme: {} as OctaneElectronAPI['nativeTheme'],
		window: {} as OctaneElectronAPI['window'],
		...overrides,
	} as OctaneElectronAPI;
}

describe('useNativeTheme', () => {
	it('keeps a live theme update when the initial snapshot resolves later', async () => {
		const snapshot = deferred<boolean>();
		const listeners = new Set<(dark: boolean) => void>();
		installElectronBridge(
			emptyDesktopApi({
				nativeTheme: {
					shouldUseDarkColors: () => snapshot.promise,
					onUpdated: (listener) => {
						listeners.add(listener);
						return () => listeners.delete(listener);
					},
				},
			}),
		);

		const result = mount(ThemeReader);
		await flush();
		expect(result.find('#theme').textContent).toBe('light');

		await act(() => {
			for (const listener of listeners) listener(true);
		});
		expect(result.find('#theme').textContent).toBe('dark');

		await act(() => {
			snapshot.resolve(false);
		});
		await flush();
		expect(result.find('#theme').textContent).toBe('dark');
		result.unmount();
	});

	it('swallows a rejected initial theme snapshot without unhandled rejection', async () => {
		const snapshot = deferred<boolean>();
		const rejections: unknown[] = [];
		const onRejection = (event: PromiseRejectionEvent) => {
			rejections.push(event.reason);
			event.preventDefault();
		};
		window.addEventListener('unhandledrejection', onRejection);

		installElectronBridge(
			emptyDesktopApi({
				nativeTheme: {
					shouldUseDarkColors: () => snapshot.promise,
					onUpdated: () => () => {},
				},
			}),
		);

		const result = mount(ThemeReader);
		await flush();
		await act(() => {
			snapshot.reject(new Error('theme ipc failed'));
		});
		await flush();
		expect(result.find('#theme').textContent).toBe('light');
		expect(rejections).toEqual([]);
		window.removeEventListener('unhandledrejection', onRejection);
		result.unmount();
	});
});

describe('useWindowState', () => {
	it('keeps a live window update when the initial snapshot resolves later', async () => {
		const snapshot = deferred<WindowState>();
		const listeners = new Set<(state: WindowState) => void>();
		installElectronBridge(
			emptyDesktopApi({
				window: {
					minimize: async () => {},
					maximize: async () => {},
					unmaximize: async () => {},
					close: async () => {},
					isMaximized: async () => false,
					setTitle: async () => {},
					getState: () => snapshot.promise,
					onStateChange: (listener) => {
						listeners.add(listener);
						return () => listeners.delete(listener);
					},
				},
			}),
		);

		const result = mount(WindowStateReader);
		await flush();
		expect(result.find('#title').textContent).toBe('');
		expect(result.find('#maximized').textContent).toBe('no');

		await act(() => {
			for (const listener of listeners) {
				listener({
					isMaximized: true,
					isMinimized: false,
					isFullScreen: false,
					title: 'live',
				});
			}
		});
		expect(result.find('#title').textContent).toBe('live');
		expect(result.find('#maximized').textContent).toBe('yes');

		await act(() => {
			snapshot.resolve({
				isMaximized: false,
				isMinimized: false,
				isFullScreen: false,
				title: 'stale',
			});
		});
		await flush();
		expect(result.find('#title').textContent).toBe('live');
		expect(result.find('#maximized').textContent).toBe('yes');
		result.unmount();
	});
});
