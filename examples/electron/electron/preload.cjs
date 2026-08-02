const { contextBridge, ipcRenderer } = require('electron');

/**
 * Hand-rolled preload bridge matching `@octanejs/electron/preload`'s
 * `exposeOctaneElectron` shape. Electron's CJS preload cannot import the
 * package's TypeScript source; apps that bundle main/preload should call
 * `exposeOctaneElectron` from `@octanejs/electron/preload` instead.
 */
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

const allowedInvoke = new Set([...Object.values(C), 'list_tasks', 'describe_task', 'run_task']);
const allowedOn = new Set([
	C.windowStateChanged,
	C.nativeThemeUpdated,
	C.screenDisplayChanged,
	'workbench:log',
]);

function invoke(channel, ...args) {
	if (!allowedInvoke.has(channel) && !channel.startsWith('octane:')) {
		return Promise.reject(new Error(`IPC invoke channel not allowed: ${channel}`));
	}
	return ipcRenderer.invoke(channel, ...args);
}

function on(channel, listener) {
	if (!allowedOn.has(channel) && !channel.startsWith('octane:')) {
		throw new Error(`IPC on channel not allowed: ${channel}`);
	}
	const wrapped = (_event, ...args) => listener(...args);
	ipcRenderer.on(channel, wrapped);
	return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('__OCTANE_ELECTRON__', {
	invoke,
	on,
	app: {
		getVersion: () => invoke(C.appGetVersion),
		getName: () => invoke(C.appGetName),
		getPath: (name) => invoke(C.appGetPath, name),
		quit: () => invoke(C.appQuit),
	},
	window: {
		minimize: () => invoke(C.windowMinimize),
		maximize: () => invoke(C.windowMaximize),
		unmaximize: () => invoke(C.windowUnmaximize),
		close: () => invoke(C.windowClose),
		isMaximized: () => invoke(C.windowIsMaximized),
		setTitle: (title) => invoke(C.windowSetTitle, title),
		getState: () => invoke(C.windowGetState),
		onStateChange: (listener) => on(C.windowStateChanged, (state) => listener(state)),
	},
	dialog: {
		showOpenDialog: (opts) => invoke(C.dialogShowOpen, opts ?? {}),
		showSaveDialog: (opts) => invoke(C.dialogShowSave, opts ?? {}),
		showMessageBox: (opts) => invoke(C.dialogShowMessage, opts ?? {}),
	},
	shell: {
		openExternal: (url) => invoke(C.shellOpenExternal, url),
		showItemInFolder: (fullPath) => invoke(C.shellShowItemInFolder, fullPath),
		openPath: (fullPath) => invoke(C.shellOpenPath, fullPath),
	},
	clipboard: {
		readText: () => invoke(C.clipboardReadText),
		writeText: (text) => invoke(C.clipboardWriteText, text),
	},
	nativeTheme: {
		shouldUseDarkColors: () => invoke(C.nativeThemeShouldUseDarkColors),
		onUpdated: (listener) => on(C.nativeThemeUpdated, (dark) => listener(Boolean(dark))),
	},
	screen: {
		getPrimaryDisplay: () => invoke(C.screenGetPrimaryDisplay),
		getAllDisplays: () => invoke(C.screenGetAllDisplays),
		onDisplayChanged: (listener) => on(C.screenDisplayChanged, () => listener()),
	},
});
