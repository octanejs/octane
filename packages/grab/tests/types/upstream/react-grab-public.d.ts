/**
 * Evidence-only public barrel for `react-grab`.
 *
 * Mirrors the published root surface from upstream-artifact dist/index.d.ts with
 * direct interface / type / declare function exports so type evidence does not
 * see `export { type Foo }` Alias→any. DeepPartial avoids embedding `unknown`.
 */

export interface Position {
	x: number;
	y: number;
}

export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object
		? T[P] extends (...args: never[]) => infer _Return
			? T[P]
			: DeepPartial<T[P]>
		: T[P];
};

export interface Theme {
	enabled?: boolean;
	hue?: number;
	selectionBox?: {
		enabled?: boolean;
	};
	dragBox?: {
		enabled?: boolean;
	};
	grabbedBoxes?: {
		enabled?: boolean;
	};
	elementLabel?: {
		enabled?: boolean;
	};
	toolbar?: {
		enabled?: boolean;
	};
}

export type ElementLabelVariant = 'hover' | 'processing' | 'success';

export interface PromptModeContext {
	x: number;
	y: number;
	targetElement: Element | null;
}

export interface ElementLabelContext {
	x: number;
	y: number;
	content: string;
	element?: Element;
	tagName?: string;
	componentName?: string;
	filePath?: string;
	lineNumber?: number;
}

export interface AgentContext<T = Record<string, never>> {
	content: string[];
	prompt: string;
	options?: T;
	sessionId?: string;
}

export type ActivationMode = 'toggle' | 'hold';

export interface OpenFileActionHooks {
	onOpenFile: (filePath: string, lineNumber?: number) => boolean | void;
	transformOpenFileUrl: (url: string, filePath: string, lineNumber?: number) => string;
}

export interface ActionContextHooks extends OpenFileActionHooks {
	transformHtmlContent: (html: string, elements: Element[]) => Promise<string>;
}

export interface ActionContext {
	element: Element;
	elements: Element[];
	filePath?: string;
	lineNumber?: number;
	componentName?: string;
	tagName?: string;
	enterPromptMode?: () => void;
	hooks: ActionContextHooks;
	performWithFeedback: (action: () => Promise<boolean>) => Promise<void>;
	hideContextMenu: () => void;
	cleanup: () => void;
}

export interface ContextMenuActionContext extends ActionContext {
	copy?: () => void;
}

export interface ContextMenuAction {
	id: string;
	label: string;
	shortcut?: string;
	shortcutModifier?: boolean;
	showInToolbarMenu?: boolean;
	enabled?: boolean | ((context: ActionContext) => boolean);
	onAction: (context: ContextMenuActionContext) => void | Promise<void>;
}

export interface OverlayBounds {
	borderRadius: string;
	height: number;
	width: number;
	x: number;
	y: number;
}

export interface DragRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface GrabbedBox {
	id: string;
	bounds: OverlayBounds;
	createdAt: number;
	element?: Element;
}

export interface ToolbarState {
	edge: 'top' | 'bottom' | 'left' | 'right';
	ratio: number;
	collapsed: boolean;
	enabled: boolean;
	defaultAction?: string;
}

export interface ReactGrabState {
	isActive: boolean;
	isDragging: boolean;
	isCopying: boolean;
	isPromptMode: boolean;
	isSelectionBoxVisible: boolean;
	isDragBoxVisible: boolean;
	targetElement: Element | null;
	dragBounds: DragRect | null;
	grabbedBoxes: Array<{
		id: string;
		bounds: OverlayBounds;
		createdAt: number;
	}>;
	labelInstances: Array<{
		id: string;
		status: 'idle' | 'copying' | 'copied' | 'fading' | 'error';
		tagName: string;
		componentName?: string;
		createdAt: number;
	}>;
	selectionFilePath: string | null;
	toolbarState: ToolbarState | null;
}

export interface PluginHooks {
	onActivate?: () => void | Promise<void>;
	onDeactivate?: () => void | Promise<void>;
	onElementHover?: (element: Element) => void | Promise<void>;
	onElementSelect?: (element: Element) => boolean | void | Promise<boolean>;
	onDragStart?: (startX: number, startY: number) => void | Promise<void>;
	onDragEnd?: (elements: Element[], bounds: DragRect) => void | Promise<void>;
	onBeforeCopy?: (elements: Element[]) => void | Promise<void>;
	transformCopyContent?: (content: string, elements: Element[]) => string | Promise<string>;
	onAfterCopy?: (elements: Element[], success: boolean) => void | Promise<void>;
	onCopySuccess?: (elements: Element[], content: string) => void | Promise<void>;
	onCopyError?: (error: Error) => void | Promise<void>;
	onStateChange?: (state: ReactGrabState) => void | Promise<void>;
	onPromptModeChange?: (isPromptMode: boolean, context: PromptModeContext) => void | Promise<void>;
	onSelectionBox?: (
		visible: boolean,
		bounds: OverlayBounds | null,
		element: Element | null,
	) => void | Promise<void>;
	onDragBox?: (visible: boolean, bounds: OverlayBounds | null) => void | Promise<void>;
	onGrabbedBox?: (bounds: OverlayBounds, element: Element) => void | Promise<void>;
	onElementLabel?: (
		visible: boolean,
		variant: ElementLabelVariant,
		context: ElementLabelContext,
	) => void | Promise<void>;
	onContextMenu?: (element: Element, position: Position) => void | Promise<void>;
	onOpenFile?: (filePath: string, lineNumber?: number) => boolean | void;
	transformHtmlContent?: (html: string, elements: Element[]) => string | Promise<string>;
	transformAgentContext?: (
		context: AgentContext,
		elements: Element[],
	) => AgentContext | Promise<AgentContext>;
	transformActionContext?: (context: ActionContext) => ActionContext;
	transformOpenFileUrl?: (url: string, filePath: string, lineNumber?: number) => string;
}

export interface PluginConfig {
	theme?: DeepPartial<Theme>;
	options?: SettableOptions;
	actions?: ContextMenuAction[];
	hooks?: PluginHooks;
	cleanup?: () => undefined;
}

export interface Plugin {
	name: string;
	theme?: DeepPartial<Theme>;
	options?: SettableOptions;
	actions?: ContextMenuAction[];
	hooks?: PluginHooks;
	setup?: (api: ReactGrabAPI, hooks: ActionContextHooks) => PluginConfig | void;
}

export interface Options {
	enabled?: boolean;
	container?: HTMLElement;
	activationMode?: ActivationMode;
	keyHoldDuration?: number;
	allowActivationInsideInput?: boolean;
	activationKey?: string | ((event: KeyboardEvent) => boolean);
	getContent?: (elements: Element[]) => Promise<string> | string;
	maxContextLines?: number;
	freezeReactUpdates?: boolean;
	telemetry?: boolean;
}

export interface SettableOptions extends Options {
	enabled?: never;
	telemetry?: never;
	container?: never;
}

export interface SourceInfo {
	filePath: string;
	lineNumber: number | null;
	columnNumber: number | null;
	componentName: string | null;
}

export interface SelectedElementPayload {
	tagName: string;
	id?: string;
	className?: string;
	textContent?: string;
	componentName?: string;
	filePath?: string;
	lineNumber?: number;
	columnNumber?: number;
}

export interface ElementSelectedEventDetail {
	elements: SelectedElementPayload[];
}

export interface ReactGrabAPI {
	activate: () => void;
	deactivate: () => void;
	toggle: () => void;
	comment: () => void;
	isActive: () => boolean;
	isEnabled: () => boolean;
	setEnabled: (enabled: boolean) => void;
	getToolbarState: () => ToolbarState | null;
	setToolbarState: (state: Partial<ToolbarState>) => void;
	onToolbarStateChange: (callback: (state: ToolbarState) => void) => () => void;
	reset: () => void;
	dispose: () => void;
	copyElement: (elements: Element | Element[]) => Promise<boolean>;
	getSource: (element: Element) => Promise<SourceInfo | null>;
	getStackContext: (element: Element) => Promise<string>;
	getState: () => ReactGrabState;
	setOptions: (options: SettableOptions) => void;
	registerPlugin: (plugin: Plugin) => void;
	unregisterPlugin: (name: string) => void;
	getPlugins: () => string[];
	getDisplayName: (element: Element) => string | null;
}

export declare const init: (rawOptions?: Options) => ReactGrabAPI;
export declare const getGlobalApi: () => ReactGrabAPI | null;
export declare const setGlobalApi: (api: ReactGrabAPI | null) => void;
export declare const registerPlugin: (plugin: Plugin) => void;
export declare const unregisterPlugin: (name: string) => void;
export declare const isInstrumentationActive: () => boolean;
export declare const generateSnippet: (
	elements: Element[],
	options?: { maxLines?: number },
) => Promise<string[]>;
export declare const DEFAULT_THEME: Required<Theme>;
export declare const commentPlugin: Plugin;
export declare const openPlugin: Plugin;
export declare const getStack: (element: Element) => Promise<object[] | null>;
export declare const formatElementInfo: (
	element: Element,
	options?: { maxLines?: number },
) => Promise<string>;

export declare class ReactGrabError extends Error {
	static prepareStackTrace(
		error: Error,
		_structuredStackTrace: ReadonlyArray<{
			getFileName(): string | null;
			getFunctionName(): string | null;
			getLineNumber(): number | null;
			getColumnNumber(): number | null;
		}>,
	): string;
	constructor(message: string, options?: ErrorOptions);
}
export declare class FreezeError extends ReactGrabError {
	constructor(cause?: object | string | number | boolean | null);
}
export declare class OpenFileError extends ReactGrabError {
	readonly filePath: string;
	readonly lineNumber: number | undefined;
	constructor(filePath: string, lineNumber: number | undefined, cause?: object | string | null);
}
export declare class PluginSetupError extends ReactGrabError {
	readonly pluginName: string;
	constructor(pluginName: string, cause?: object | string | null);
}
