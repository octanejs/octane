import { OCTANE_ELECTRON_CHANNELS, OCTANE_ELECTRON_GLOBAL } from '../common/channels';
import type { DisplaySnapshot, OctaneElectronAPI, WindowState } from '../common/types';

export type { DisplaySnapshot, OctaneElectronAPI, WindowState } from '../common/types';
export { OCTANE_ELECTRON_CHANNELS, OCTANE_ELECTRON_GLOBAL } from '../common/channels';

export interface IpcRendererLike {
	invoke(channel: string, ...args: unknown[]): Promise<unknown>;
	on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
	removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

export interface ContextBridgeLike {
	exposeInMainWorld(apiKey: string, api: unknown): void;
}

export interface ExposeOctaneElectronOptions {
	ipcRenderer: IpcRendererLike;
	contextBridge?: ContextBridgeLike;
	/** Global key. Defaults to `__OCTANE_ELECTRON__`. */
	apiKey?: string;
	/**
	 * Extra channels allowed for raw `invoke` / `on` beyond the built-in
	 * `octane:*` set. Omit to allow any channel (convenient; tighten for
	 * production apps that load remote content).
	 */
	allowInvoke?: readonly string[] | ((channel: string) => boolean);
	allowOn?: readonly string[] | ((channel: string) => boolean);
}

function channelAllowed(
	channel: string,
	allow: readonly string[] | ((channel: string) => boolean) | undefined,
): boolean {
	if (channel.startsWith('octane:')) return true;
	if (allow === undefined) return true;
	if (typeof allow === 'function') return allow(channel);
	return allow.includes(channel);
}

/** Build the renderer-facing bridge object from an `ipcRenderer`-like handle. */
export function createOctaneElectronAPI(
	ipcRenderer: IpcRendererLike,
	options?: Pick<ExposeOctaneElectronOptions, 'allowInvoke' | 'allowOn'>,
): OctaneElectronAPI {
	const C = OCTANE_ELECTRON_CHANNELS;

	const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
		if (!channelAllowed(channel, options?.allowInvoke)) {
			return Promise.reject(new Error(`IPC invoke channel not allowed: ${channel}`));
		}
		return ipcRenderer.invoke(channel, ...args) as Promise<T>;
	};

	const on = (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
		if (!channelAllowed(channel, options?.allowOn)) {
			throw new Error(`IPC on channel not allowed: ${channel}`);
		}
		const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
		ipcRenderer.on(channel, wrapped);
		return () => ipcRenderer.removeListener(channel, wrapped);
	};

	return {
		invoke,
		on,
		app: {
			getVersion: () => invoke<string>(C.appGetVersion),
			getName: () => invoke<string>(C.appGetName),
			getPath: (name) => invoke<string>(C.appGetPath, name),
			quit: () => invoke<void>(C.appQuit),
		},
		window: {
			minimize: () => invoke<void>(C.windowMinimize),
			maximize: () => invoke<void>(C.windowMaximize),
			unmaximize: () => invoke<void>(C.windowUnmaximize),
			close: () => invoke<void>(C.windowClose),
			isMaximized: () => invoke<boolean>(C.windowIsMaximized),
			setTitle: (title) => invoke<void>(C.windowSetTitle, title),
			getState: () => invoke<WindowState>(C.windowGetState),
			onStateChange: (listener) =>
				on(C.windowStateChanged, (state) => listener(state as WindowState)),
		},
		dialog: {
			showOpenDialog: (opts) => invoke(C.dialogShowOpen, opts ?? {}),
			showSaveDialog: (opts) => invoke(C.dialogShowSave, opts ?? {}),
			showMessageBox: (opts) => invoke(C.dialogShowMessage, opts ?? {}),
		},
		shell: {
			openExternal: (url) => invoke<void>(C.shellOpenExternal, url),
			showItemInFolder: (fullPath) => invoke<void>(C.shellShowItemInFolder, fullPath),
			openPath: (fullPath) => invoke<string>(C.shellOpenPath, fullPath),
		},
		clipboard: {
			readText: () => invoke<string>(C.clipboardReadText),
			writeText: (text) => invoke<void>(C.clipboardWriteText, text),
		},
		nativeTheme: {
			shouldUseDarkColors: () => invoke<boolean>(C.nativeThemeShouldUseDarkColors),
			onUpdated: (listener) => on(C.nativeThemeUpdated, (dark) => listener(Boolean(dark))),
		},
		screen: {
			getPrimaryDisplay: () => invoke<DisplaySnapshot>(C.screenGetPrimaryDisplay),
			getAllDisplays: () => invoke<DisplaySnapshot[]>(C.screenGetAllDisplays),
			onDisplayChanged: (listener) => on(C.screenDisplayChanged, () => listener()),
		},
	};
}

/**
 * Expose the Octane Electron bridge into the renderer main world.
 * Call from the app preload script under contextIsolation.
 */
export function exposeOctaneElectron(options: ExposeOctaneElectronOptions): OctaneElectronAPI {
	const api = createOctaneElectronAPI(options.ipcRenderer, options);
	const key = options.apiKey ?? OCTANE_ELECTRON_GLOBAL;
	if (options.contextBridge !== undefined) {
		options.contextBridge.exposeInMainWorld(key, api);
	} else if (typeof globalThis !== 'undefined') {
		(globalThis as any)[key] = api;
	}
	return api;
}

/**
 * Convenience: import Electron's preload modules and expose the bridge.
 */
export async function exposeOctaneElectronFromElectron(
	options?: Omit<ExposeOctaneElectronOptions, 'ipcRenderer' | 'contextBridge'>,
): Promise<OctaneElectronAPI> {
	const electron = await import('electron');
	return exposeOctaneElectron({
		...options,
		ipcRenderer: electron.ipcRenderer,
		contextBridge: electron.contextBridge,
	});
}
