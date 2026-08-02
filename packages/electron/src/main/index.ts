import { OCTANE_ELECTRON_CHANNELS } from '../common/channels';
import type { DisplaySnapshot, WindowState } from '../common/types';

export type { DisplaySnapshot, OctaneElectronAPI, WindowState } from '../common/types';
export { OCTANE_ELECTRON_CHANNELS, OCTANE_ELECTRON_GLOBAL } from '../common/channels';

type Handler = (...args: any[]) => any;

export interface IpcMainLike {
	handle(channel: string, listener: Handler): void;
	removeHandler(channel: string): void;
}

export interface WebContentsLike {
	send(channel: string, ...args: unknown[]): void;
	isDestroyed?: () => boolean;
}

export interface BrowserWindowLike {
	minimize(): void;
	maximize(): void;
	unmaximize(): void;
	close(): void;
	isMaximized(): boolean;
	isMinimized(): boolean;
	isFullScreen(): boolean;
	getTitle(): string;
	setTitle(title: string): void;
	webContents: WebContentsLike;
	on(event: string, listener: (...args: any[]) => void): void;
	off?(event: string, listener: (...args: any[]) => void): void;
	removeListener?(event: string, listener: (...args: any[]) => void): void;
}

export interface AppLike {
	getVersion(): string;
	getName(): string;
	getPath(name: any): string;
	quit(): void;
}

export interface DialogLike {
	showOpenDialog(window: any, options: any): Promise<unknown>;
	showSaveDialog(window: any, options: any): Promise<unknown>;
	showMessageBox(window: any, options: any): Promise<unknown>;
}

export interface ShellLike {
	openExternal(url: string): Promise<void>;
	showItemInFolder(fullPath: string): void;
	openPath(fullPath: string): Promise<string>;
}

export interface ClipboardLike {
	readText(): string;
	writeText(text: string): void;
}

export interface NativeThemeLike {
	shouldUseDarkColors: boolean;
	on(event: 'updated', listener: () => void): void;
	off?(event: 'updated', listener: () => void): void;
	removeListener?(event: 'updated', listener: () => void): void;
}

export interface DisplayLike {
	id: number;
	label: string;
	bounds: DisplaySnapshot['bounds'];
	workArea: DisplaySnapshot['workArea'];
	scaleFactor: number;
	rotation: number;
}

export interface ScreenLike {
	getPrimaryDisplay(): DisplayLike;
	getAllDisplays(): DisplayLike[];
	on(event: string, listener: () => void): void;
	off?(event: string, listener: () => void): void;
	removeListener?(event: string, listener: () => void): void;
}

export interface RegisterOctaneElectronMainOptions {
	ipcMain: IpcMainLike;
	app: AppLike;
	dialog: DialogLike;
	shell: ShellLike;
	clipboard: ClipboardLike;
	nativeTheme: NativeThemeLike;
	screen: ScreenLike;
	/** Resolve the BrowserWindow that owns an invoke sender. */
	getWindow?: (event: { sender: unknown }) => BrowserWindowLike | undefined;
	/** Broadcast push events (theme, screen) to renderer webContents. */
	getAllWebContents?: () => WebContentsLike[];
}

function snapshotDisplay(display: DisplayLike): DisplaySnapshot {
	return {
		id: display.id,
		label: display.label,
		bounds: { ...display.bounds },
		workArea: { ...display.workArea },
		scaleFactor: display.scaleFactor,
		rotation: display.rotation,
	};
}

function windowState(win: BrowserWindowLike): WindowState {
	return {
		isMaximized: win.isMaximized(),
		isMinimized: win.isMinimized(),
		isFullScreen: win.isFullScreen(),
		title: win.getTitle(),
	};
}

function detach(
	target: {
		off?(event: string, listener: (...args: any[]) => void): void;
		removeListener?(event: string, listener: (...args: any[]) => void): void;
	},
	event: string,
	listener: (...args: any[]) => void,
): void {
	if (typeof target.off === 'function') target.off(event, listener);
	else target.removeListener?.(event, listener);
}

function broadcast(
	getAllWebContents: (() => WebContentsLike[]) | undefined,
	channel: string,
	...args: unknown[]
): void {
	if (getAllWebContents === undefined) return;
	for (const contents of getAllWebContents()) {
		if (contents.isDestroyed?.()) continue;
		contents.send(channel, ...args);
	}
}

/**
 * Register default `ipcMain` handlers for the Octane Electron bridge.
 * Call once from the app's main process after creating windows.
 */
export function registerOctaneElectronMain(options: RegisterOctaneElectronMainOptions): () => void {
	const {
		ipcMain,
		app,
		dialog,
		shell,
		clipboard,
		nativeTheme,
		screen,
		getWindow = () => undefined,
		getAllWebContents,
	} = options;

	const C = OCTANE_ELECTRON_CHANNELS;
	const channels: string[] = [];
	const cleanups: Array<() => void> = [];

	const handle = (channel: string, listener: Handler) => {
		ipcMain.handle(channel, listener);
		channels.push(channel);
	};

	handle(C.appGetVersion, () => app.getVersion());
	handle(C.appGetName, () => app.getName());
	handle(C.appGetPath, (_event, name: string) => app.getPath(name));
	handle(C.appQuit, () => {
		app.quit();
	});

	handle(C.windowMinimize, (event) => getWindow(event)?.minimize());
	handle(C.windowMaximize, (event) => getWindow(event)?.maximize());
	handle(C.windowUnmaximize, (event) => getWindow(event)?.unmaximize());
	handle(C.windowClose, (event) => getWindow(event)?.close());
	handle(C.windowIsMaximized, (event) => getWindow(event)?.isMaximized() ?? false);
	handle(C.windowSetTitle, (event, title: string) => getWindow(event)?.setTitle(title));
	handle(C.windowGetState, (event) => {
		const win = getWindow(event);
		return win ? windowState(win) : null;
	});

	handle(C.dialogShowOpen, (event, opts: Record<string, unknown> = {}) =>
		dialog.showOpenDialog(getWindow(event), opts),
	);
	handle(C.dialogShowSave, (event, opts: Record<string, unknown> = {}) =>
		dialog.showSaveDialog(getWindow(event), opts),
	);
	handle(C.dialogShowMessage, (event, opts: Record<string, unknown> = {}) =>
		dialog.showMessageBox(getWindow(event), opts),
	);

	handle(C.shellOpenExternal, (_event, url: string) => shell.openExternal(url));
	handle(C.shellShowItemInFolder, (_event, fullPath: string) => {
		shell.showItemInFolder(fullPath);
	});
	handle(C.shellOpenPath, (_event, fullPath: string) => shell.openPath(fullPath));

	handle(C.clipboardReadText, () => clipboard.readText());
	handle(C.clipboardWriteText, (_event, text: string) => {
		clipboard.writeText(text);
	});

	handle(C.nativeThemeShouldUseDarkColors, () => nativeTheme.shouldUseDarkColors);

	handle(C.screenGetPrimaryDisplay, () => snapshotDisplay(screen.getPrimaryDisplay()));
	handle(C.screenGetAllDisplays, () => screen.getAllDisplays().map(snapshotDisplay));

	const onThemeUpdated = () => {
		broadcast(getAllWebContents, C.nativeThemeUpdated, nativeTheme.shouldUseDarkColors);
	};
	nativeTheme.on('updated', onThemeUpdated);
	cleanups.push(() => detach(nativeTheme, 'updated', onThemeUpdated));

	const onDisplayChanged = () => {
		broadcast(getAllWebContents, C.screenDisplayChanged);
	};
	for (const event of ['display-added', 'display-removed', 'display-metrics-changed'] as const) {
		screen.on(event, onDisplayChanged);
		cleanups.push(() => detach(screen, event, onDisplayChanged));
	}

	return () => {
		for (const channel of channels) ipcMain.removeHandler(channel);
		for (const cleanup of cleanups) cleanup();
	};
}

/**
 * Wire maximize/unmaximize/enter-full-screen/leave-full-screen/page-title-updated
 * pushes for one BrowserWindow onto the default bridge channel.
 */
export function trackOctaneElectronWindow(win: BrowserWindowLike): () => void {
	const C = OCTANE_ELECTRON_CHANNELS;
	const push = () => {
		if (win.webContents.isDestroyed?.()) return;
		win.webContents.send(C.windowStateChanged, windowState(win));
	};
	const events = [
		'maximize',
		'unmaximize',
		'minimize',
		'restore',
		'enter-full-screen',
		'leave-full-screen',
		'page-title-updated',
	];
	for (const event of events) win.on(event, push);
	return () => {
		for (const event of events) detach(win, event, push);
	};
}

/**
 * Convenience: load Electron's main modules and register the default bridge.
 * Prefer injecting fakes in tests; apps can call this from main.
 */
export async function registerOctaneElectronMainFromElectron(options?: {
	getWindow?: RegisterOctaneElectronMainOptions['getWindow'];
}): Promise<() => void> {
	const electron = await import('electron');
	const getWindow =
		options?.getWindow ??
		((event: { sender: unknown }) =>
			electron.BrowserWindow.fromWebContents(event.sender as Electron.WebContents) ?? undefined);
	return registerOctaneElectronMain({
		ipcMain: electron.ipcMain,
		app: electron.app,
		dialog: electron.dialog,
		shell: electron.shell,
		clipboard: electron.clipboard,
		nativeTheme: electron.nativeTheme,
		screen: electron.screen,
		getWindow,
		getAllWebContents: () => electron.webContents.getAllWebContents(),
	});
}
