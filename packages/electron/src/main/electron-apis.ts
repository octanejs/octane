/**
 * Main-process Electron APIs for apps that prefer a single
 * `@octanejs/electron/main` import path. These stay main-only under
 * contextIsolation — the same layout a React Electron app uses. They are not
 * bridged into the renderer; construct menus, trays, sessions, and protocols
 * here and talk to Octane UI over IPC when needed.
 */
export {
	BrowserWindow,
	Menu,
	MenuItem,
	Notification,
	Tray,
	app,
	autoUpdater,
	globalShortcut,
	ipcMain,
	nativeTheme,
	net,
	protocol,
	screen,
	session,
	shell,
	webContents,
} from 'electron';
