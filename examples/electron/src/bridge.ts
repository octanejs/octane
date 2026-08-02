import { hasElectronHost, installElectronBridge } from '@octanejs/electron';
import type { OctaneElectronAPI, WindowState } from '@octanejs/electron';
import { TASKS, describeTask, logScript } from './fixtures';
import type { LogLine } from './types';

export type BridgeMode = 'electron' | 'browser';

const DEFAULT_LINE_INTERVAL_MS = 150;

/**
 * Under a real Electron shell the preload bridge answers. In an ordinary
 * browser — Vite, preview, and Playwright — install a mock
 * `window.__OCTANE_ELECTRON__` that answers the same channels from local
 * fixtures so the example needs no Electron binary in CI.
 */
export function installBrowserBridge(): BridgeMode {
	if (hasElectronHost()) return 'electron';

	const params = new URLSearchParams(window.location.search);
	const fault = params.get('fault');
	const requestedInterval = Number(params.get('interval'));
	const lineInterval =
		Number.isFinite(requestedInterval) && requestedInterval > 0
			? requestedInterval
			: DEFAULT_LINE_INTERVAL_MS;
	const spentFaults = new Set<string>();
	const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
	let runTimers: number[] = [];
	let clipboardText = '';
	let windowState: WindowState = {
		isMaximized: false,
		isMinimized: false,
		isFullScreen: false,
		title: 'Electron Shell',
	};

	const failOnce = (scenario: string, message: string): Promise<never> | null => {
		if (fault !== scenario || spentFaults.has(scenario)) return null;
		spentFaults.add(scenario);
		return Promise.reject(message);
	};

	const emit = (channel: string, ...args: unknown[]) => {
		for (const listener of [...(listeners.get(channel) ?? [])]) listener(...args);
	};

	const pushWindowState = () => {
		emit('octane:window:stateChanged', { ...windowState });
	};

	const startRun = (taskId: string) => {
		for (const timer of runTimers) window.clearTimeout(timer);
		runTimers = [];
		const lines = logScript(taskId);
		lines.forEach((text, index) => {
			const line: LogLine = {
				taskId,
				seq: index + 1,
				text,
				done: index === lines.length - 1,
			};
			runTimers.push(
				window.setTimeout(() => emit('workbench:log', line), (index + 1) * lineInterval),
			);
		});
	};

	const api: OctaneElectronAPI = {
		invoke: async <T = unknown>(channel: string, ...args: unknown[]) => {
			const payload = (args[0] ?? {}) as Record<string, unknown>;
			switch (channel) {
				case 'list_tasks':
					return (failOnce('list', 'the task index is locked by another process') ?? TASKS) as T;
				case 'describe_task':
					return (failOnce('describe', 'the task manifest could not be read') ??
						describeTask(String(payload.id))) as T;
				case 'run_task': {
					const failure = failOnce('run', 'the runner refused to start');
					if (failure !== null) return failure as T;
					startRun(String(payload.id));
					return null as T;
				}
				default:
					throw new Error(`unknown channel: ${channel}`);
			}
		},
		on: (channel, listener) => {
			let set = listeners.get(channel);
			if (set === undefined) listeners.set(channel, (set = new Set()));
			set.add(listener);
			return () => set!.delete(listener);
		},
		app: {
			getVersion: async () => '0.0.0-browser',
			getName: async () => 'electron-example',
			getPath: async () => '/tmp',
			quit: async () => {},
		},
		window: {
			minimize: async () => {
				windowState = { ...windowState, isMinimized: true };
				pushWindowState();
			},
			maximize: async () => {
				windowState = { ...windowState, isMaximized: true, isMinimized: false };
				pushWindowState();
			},
			unmaximize: async () => {
				windowState = { ...windowState, isMaximized: false };
				pushWindowState();
			},
			close: async () => {},
			isMaximized: async () => windowState.isMaximized,
			setTitle: async (title) => {
				windowState = { ...windowState, title };
				pushWindowState();
			},
			getState: async () => ({ ...windowState }),
			onStateChange: (listener) =>
				api.on('octane:window:stateChanged', (state) => listener(state as WindowState)),
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
			readText: async () => clipboardText,
			writeText: async (text) => {
				clipboardText = text;
			},
		},
		nativeTheme: {
			shouldUseDarkColors: async () => window.matchMedia('(prefers-color-scheme: dark)').matches,
			onUpdated: (listener) => {
				const mq = window.matchMedia('(prefers-color-scheme: dark)');
				const onChange = () => listener(mq.matches);
				mq.addEventListener('change', onChange);
				return () => mq.removeEventListener('change', onChange);
			},
		},
		screen: {
			getPrimaryDisplay: async () => ({
				id: 1,
				label: 'primary',
				bounds: { x: 0, y: 0, width: 1280, height: 800 },
				workArea: { x: 0, y: 0, width: 1280, height: 760 },
				scaleFactor: 1,
				rotation: 0,
			}),
			getAllDisplays: async () => [],
			onDisplayChanged: (listener) => api.on('octane:screen:displayChanged', () => listener()),
		},
	};

	installElectronBridge(api);
	return 'browser';
}
