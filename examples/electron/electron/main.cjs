const path = require('node:path');
const {
	BrowserWindow,
	Menu,
	app,
	clipboard,
	dialog,
	ipcMain,
	nativeTheme,
	screen,
	shell,
} = require('electron');

const TASKS = [
	{ id: 'typecheck', name: 'Typecheck', summary: 'Project-wide TypeScript pass' },
	{ id: 'bundle', name: 'Bundle', summary: 'Production client build' },
	{ id: 'migrate', name: 'Migrate', summary: 'Apply pending schema migrations' },
];

const DETAILS = {
	typecheck: {
		id: 'typecheck',
		command: 'tsrx-tsc --noEmit',
		workingDirectory: '~/projects/electron-shell',
		lastRun: '2026-08-02 09:14',
		averageMs: 8400,
	},
	bundle: {
		id: 'bundle',
		command: 'vite build --mode production',
		workingDirectory: '~/projects/electron-shell',
		lastRun: '2026-08-02 09:02',
		averageMs: 15200,
	},
	migrate: {
		id: 'migrate',
		command: 'electron-shell migrate --yes',
		workingDirectory: '~/projects/electron-shell/db',
		lastRun: '2026-08-01 18:41',
		averageMs: 2600,
	},
};

const LOGS = {
	typecheck: [
		'resolving project references',
		'loading tsconfig.json',
		'checking 412 files',
		'checking 812 files',
		'checking 1204 files',
		'checking 1611 files',
		'no diagnostics reported',
		'typecheck finished',
	],
	bundle: [
		'clearing dist/',
		'compiling 96 modules',
		'compiling 214 modules',
		'compiling 388 modules',
		'inlining assets',
		'minifying chunks',
		'writing dist/client',
		'bundle finished',
	],
	migrate: [
		'connecting to local database',
		'reading migration ledger',
		'applying 2026_07_14_projects',
		'applying 2026_07_21_runs',
		'applying 2026_07_24_logs',
		'verifying constraints',
		'writing schema snapshot',
		'migrate finished',
	],
};

const LINE_INTERVAL_MS = 150;
/** Timers for the in-flight run_task stream; cleared when a new run starts. */
let runTimers = [];
const C = {
	appGetVersion: 'octane:app:getVersion',
	appGetName: 'octane:app:getName',
	appGetPath: 'octane:app:getPath',
	appQuit: 'octane:app:quit',
	windowMinimize: 'octane:window:minimize',
	windowMaximize: 'octane:window:maximize',
	windowUnmaximize: 'octane:window:unmaximize',
	windowClose: 'octane:window:close',
	windowIsMaximized: 'octane:window:isMaximized',
	windowSetTitle: 'octane:window:setTitle',
	windowGetState: 'octane:window:getState',
	windowStateChanged: 'octane:window:stateChanged',
	dialogShowOpen: 'octane:dialog:showOpenDialog',
	dialogShowSave: 'octane:dialog:showSaveDialog',
	dialogShowMessage: 'octane:dialog:showMessageBox',
	shellOpenExternal: 'octane:shell:openExternal',
	shellShowItemInFolder: 'octane:shell:showItemInFolder',
	shellOpenPath: 'octane:shell:openPath',
	clipboardReadText: 'octane:clipboard:readText',
	clipboardWriteText: 'octane:clipboard:writeText',
	nativeThemeShouldUseDarkColors: 'octane:nativeTheme:shouldUseDarkColors',
	nativeThemeUpdated: 'octane:nativeTheme:updated',
	screenGetPrimaryDisplay: 'octane:screen:getPrimaryDisplay',
	screenGetAllDisplays: 'octane:screen:getAllDisplays',
	screenDisplayChanged: 'octane:screen:displayChanged',
};

function windowFromEvent(event) {
	return BrowserWindow.fromWebContents(event.sender);
}

function windowState(win) {
	return {
		isMaximized: win.isMaximized(),
		isMinimized: win.isMinimized(),
		isFullScreen: win.isFullScreen(),
		title: win.getTitle(),
	};
}

function registerDefaultBridge() {
	ipcMain.handle(C.appGetVersion, () => app.getVersion());
	ipcMain.handle(C.appGetName, () => app.getName());
	ipcMain.handle(C.appGetPath, (_event, name) => app.getPath(name));
	ipcMain.handle(C.appQuit, () => {
		app.quit();
	});
	ipcMain.handle(C.windowMinimize, (event) => windowFromEvent(event)?.minimize());
	ipcMain.handle(C.windowMaximize, (event) => windowFromEvent(event)?.maximize());
	ipcMain.handle(C.windowUnmaximize, (event) => windowFromEvent(event)?.unmaximize());
	ipcMain.handle(C.windowClose, (event) => windowFromEvent(event)?.close());
	ipcMain.handle(C.windowIsMaximized, (event) => windowFromEvent(event)?.isMaximized() ?? false);
	ipcMain.handle(C.windowSetTitle, (event, title) => windowFromEvent(event)?.setTitle(title));
	ipcMain.handle(C.windowGetState, (event) => {
		const win = windowFromEvent(event);
		return win ? windowState(win) : null;
	});
	ipcMain.handle(C.dialogShowOpen, (event, opts) =>
		dialog.showOpenDialog(windowFromEvent(event), opts ?? {}),
	);
	ipcMain.handle(C.dialogShowSave, (event, opts) =>
		dialog.showSaveDialog(windowFromEvent(event), opts ?? {}),
	);
	ipcMain.handle(C.dialogShowMessage, (event, opts) =>
		dialog.showMessageBox(windowFromEvent(event), opts ?? {}),
	);
	ipcMain.handle(C.shellOpenExternal, (_event, url) => shell.openExternal(url));
	ipcMain.handle(C.shellShowItemInFolder, (_event, fullPath) => {
		shell.showItemInFolder(fullPath);
	});
	ipcMain.handle(C.shellOpenPath, (_event, fullPath) => shell.openPath(fullPath));
	ipcMain.handle(C.clipboardReadText, () => clipboard.readText());
	ipcMain.handle(C.clipboardWriteText, (_event, text) => {
		clipboard.writeText(text);
	});
	ipcMain.handle(C.nativeThemeShouldUseDarkColors, () => nativeTheme.shouldUseDarkColors);
	ipcMain.handle(C.screenGetPrimaryDisplay, () => {
		const display = screen.getPrimaryDisplay();
		return {
			id: display.id,
			label: display.label,
			bounds: { ...display.bounds },
			workArea: { ...display.workArea },
			scaleFactor: display.scaleFactor,
			rotation: display.rotation,
		};
	});
	ipcMain.handle(C.screenGetAllDisplays, () =>
		screen.getAllDisplays().map((display) => ({
			id: display.id,
			label: display.label,
			bounds: { ...display.bounds },
			workArea: { ...display.workArea },
			scaleFactor: display.scaleFactor,
			rotation: display.rotation,
		})),
	);

	nativeTheme.on('updated', () => {
		for (const contents of require('electron').webContents.getAllWebContents()) {
			if (!contents.isDestroyed()) {
				contents.send(C.nativeThemeUpdated, nativeTheme.shouldUseDarkColors);
			}
		}
	});
}

function trackWindow(win) {
	const push = () => {
		if (win.webContents.isDestroyed()) return;
		win.webContents.send(C.windowStateChanged, windowState(win));
	};
	for (const event of [
		'maximize',
		'unmaximize',
		'minimize',
		'restore',
		'enter-full-screen',
		'leave-full-screen',
		'page-title-updated',
	]) {
		win.on(event, push);
	}
}

function registerIpcHandlers() {
	registerDefaultBridge();
	ipcMain.handle('list_tasks', () => TASKS);
	ipcMain.handle('describe_task', (_event, args) => DETAILS[args?.id] ?? null);
	ipcMain.handle('run_task', (event, args) => {
		const taskId = String(args?.id ?? '');
		const lines = LOGS[taskId] ?? [];
		for (const timer of runTimers) clearTimeout(timer);
		runTimers = [];
		lines.forEach((text, index) => {
			runTimers.push(
				setTimeout(
					() => {
						if (event.sender.isDestroyed()) return;
						event.sender.send('workbench:log', {
							taskId,
							seq: index + 1,
							text,
							done: index === lines.length - 1,
						});
					},
					(index + 1) * LINE_INTERVAL_MS,
				),
			);
		});
		return null;
	});
}

function createWindow() {
	const win = new BrowserWindow({
		width: 1100,
		height: 720,
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});
	trackWindow(win);

	const devUrl = process.env.ELECTRON_START_URL;
	if (devUrl) void win.loadURL(devUrl);
	else void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

let ipcRegistered = false;

app.whenReady().then(() => {
	// Register once for the process. createWindow also runs on macOS activate
	// after all windows close; re-calling ipcMain.handle for the same channel
	// throws and leaves the dock unable to open a new window.
	if (!ipcRegistered) {
		registerIpcHandlers();
		Menu.setApplicationMenu(
			Menu.buildFromTemplate([
				{ label: 'Electron Shell', submenu: [{ role: 'quit' }] },
				{ label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
			]),
		);
		ipcRegistered = true;
	}
	createWindow();
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
