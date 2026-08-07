/** Built-in IPC channels for the default Octane Electron bridge. */
export const OCTANE_ELECTRON_CHANNELS = {
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
} as const;

export type OctaneElectronChannel =
	(typeof OCTANE_ELECTRON_CHANNELS)[keyof typeof OCTANE_ELECTRON_CHANNELS];

export const OCTANE_ELECTRON_GLOBAL = '__OCTANE_ELECTRON__';
