export interface WindowState {
	isMaximized: boolean;
	isMinimized: boolean;
	isFullScreen: boolean;
	title: string;
}

export interface DisplaySnapshot {
	id: number;
	label: string;
	bounds: { x: number; y: number; width: number; height: number };
	workArea: { x: number; y: number; width: number; height: number };
	scaleFactor: number;
	rotation: number;
}

/**
 * Renderer-facing Electron bridge installed by `@octanejs/electron/preload`.
 * Matches the process layout React Electron apps use: UI code never imports
 * `electron` directly under contextIsolation.
 */
export interface OctaneElectronAPI {
	invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
	on(channel: string, listener: (...args: unknown[]) => void): () => void;

	app: {
		getVersion(): Promise<string>;
		getName(): Promise<string>;
		getPath(name: string): Promise<string>;
		quit(): Promise<void>;
	};

	window: {
		minimize(): Promise<void>;
		maximize(): Promise<void>;
		unmaximize(): Promise<void>;
		close(): Promise<void>;
		isMaximized(): Promise<boolean>;
		setTitle(title: string): Promise<void>;
		getState(): Promise<WindowState>;
		onStateChange(listener: (state: WindowState) => void): () => void;
	};

	dialog: {
		showOpenDialog(options?: Record<string, unknown>): Promise<unknown>;
		showSaveDialog(options?: Record<string, unknown>): Promise<unknown>;
		showMessageBox(options?: Record<string, unknown>): Promise<unknown>;
	};

	shell: {
		openExternal(url: string): Promise<void>;
		showItemInFolder(fullPath: string): Promise<void>;
		openPath(fullPath: string): Promise<string>;
	};

	clipboard: {
		readText(): Promise<string>;
		writeText(text: string): Promise<void>;
	};

	nativeTheme: {
		shouldUseDarkColors(): Promise<boolean>;
		onUpdated(listener: (dark: boolean) => void): () => void;
	};

	screen: {
		getPrimaryDisplay(): Promise<DisplaySnapshot>;
		getAllDisplays(): Promise<DisplaySnapshot[]>;
		onDisplayChanged(listener: () => void): () => void;
	};
}
