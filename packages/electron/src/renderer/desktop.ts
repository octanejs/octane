import type { DisplaySnapshot, OctaneElectronAPI } from '../common/types';
import { ElectronUnavailableError, getElectronBridge } from './internal';

function requireBridge(what: string): OctaneElectronAPI {
	const bridge = getElectronBridge();
	if (bridge === undefined) throw new ElectronUnavailableError(what);
	return bridge;
}

/** Promise helpers over the default app bridge (non-hook). */
export const app = {
	getVersion: () => requireBridge('app.getVersion').app.getVersion(),
	getName: () => requireBridge('app.getName').app.getName(),
	getPath: (name: string) => requireBridge('app.getPath').app.getPath(name),
	quit: () => requireBridge('app.quit').app.quit(),
};

export const windowControls = {
	minimize: () => requireBridge('window.minimize').window.minimize(),
	maximize: () => requireBridge('window.maximize').window.maximize(),
	unmaximize: () => requireBridge('window.unmaximize').window.unmaximize(),
	close: () => requireBridge('window.close').window.close(),
	isMaximized: () => requireBridge('window.isMaximized').window.isMaximized(),
	setTitle: (title: string) => requireBridge('window.setTitle').window.setTitle(title),
	getState: () => requireBridge('window.getState').window.getState(),
};

export const dialog = {
	showOpenDialog: (options?: Record<string, unknown>) =>
		requireBridge('dialog.showOpenDialog').dialog.showOpenDialog(options),
	showSaveDialog: (options?: Record<string, unknown>) =>
		requireBridge('dialog.showSaveDialog').dialog.showSaveDialog(options),
	showMessageBox: (options?: Record<string, unknown>) =>
		requireBridge('dialog.showMessageBox').dialog.showMessageBox(options),
};

export const shell = {
	openExternal: (url: string) => requireBridge('shell.openExternal').shell.openExternal(url),
	showItemInFolder: (fullPath: string) =>
		requireBridge('shell.showItemInFolder').shell.showItemInFolder(fullPath),
	openPath: (fullPath: string) => requireBridge('shell.openPath').shell.openPath(fullPath),
};

export const clipboard = {
	readText: () => requireBridge('clipboard.readText').clipboard.readText(),
	writeText: (text: string) => requireBridge('clipboard.writeText').clipboard.writeText(text),
};

export const screen = {
	getPrimaryDisplay: (): Promise<DisplaySnapshot> =>
		requireBridge('screen.getPrimaryDisplay').screen.getPrimaryDisplay(),
	getAllDisplays: (): Promise<DisplaySnapshot[]> =>
		requireBridge('screen.getAllDisplays').screen.getAllDisplays(),
};
