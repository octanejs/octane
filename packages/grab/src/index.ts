export { init } from './core/index.js';
export {
	getStack,
	formatElementInfo,
	isInstrumentationActive,
	DEFAULT_THEME,
} from './core/index.js';
export { commentPlugin } from './core/plugins/comment.js';
export { openPlugin } from './core/plugins/open.js';
export { FreezeError } from './errors.js';
export { OpenFileError } from './errors.js';
export { generateSnippet } from './utils/generate-snippet.js';
export { PluginSetupError, ReactGrabError } from './errors.js';

import type {
	Options as OptionsType,
	ReactGrabAPI as ReactGrabAPIType,
	SourceInfo as SourceInfoType,
	Theme as ThemeType,
	ReactGrabState as ReactGrabStateType,
	ToolbarState as ToolbarStateType,
	OverlayBounds as OverlayBoundsType,
	GrabbedBox as GrabbedBoxType,
	DragRect as DragRectType,
	Rect as RectType,
	Position as PositionType,
	DeepPartial as DeepPartialType,
	ElementLabelVariant as ElementLabelVariantType,
	PromptModeContext as PromptModeContextType,
	ElementLabelContext as ElementLabelContextType,
	AgentContext as AgentContextType,
	SettableOptions as SettableOptionsType,
	ActivationMode as ActivationModeType,
	ContextMenuAction as ContextMenuActionType,
	ContextMenuActionContext as ContextMenuActionContextType,
	ActionContext as ActionContextType,
	ActionContextHooks as ActionContextHooksType,
	OpenFileActionHooks as OpenFileActionHooksType,
	Plugin as PluginType,
	PluginConfig as PluginConfigType,
	PluginHooks as PluginHooksType,
	SelectedElementPayload as SelectedElementPayloadType,
	ElementSelectedEventDetail as ElementSelectedEventDetailType,
} from './types.js';

export type Options = OptionsType;
export type ReactGrabAPI = ReactGrabAPIType;
export type SourceInfo = SourceInfoType;
export type Theme = ThemeType;
export type ReactGrabState = ReactGrabStateType;
export type ToolbarState = ToolbarStateType;
export type OverlayBounds = OverlayBoundsType;
export type GrabbedBox = GrabbedBoxType;
export type DragRect = DragRectType;
export type Rect = RectType;
export type Position = PositionType;
export type DeepPartial<T> = DeepPartialType<T>;
export type ElementLabelVariant = ElementLabelVariantType;
export type PromptModeContext = PromptModeContextType;
export type ElementLabelContext = ElementLabelContextType;
export type AgentContext<T = Record<string, never>> = AgentContextType<T>;
export type SettableOptions = SettableOptionsType;
export type ActivationMode = ActivationModeType;
export type ContextMenuAction = ContextMenuActionType;
export type ContextMenuActionContext = ContextMenuActionContextType;
export type ActionContext = ActionContextType;
export type ActionContextHooks = ActionContextHooksType;
export type OpenFileActionHooks = OpenFileActionHooksType;
export type Plugin = PluginType;
export type PluginConfig = PluginConfigType;
export type PluginHooks = PluginHooksType;
export type SelectedElementPayload = SelectedElementPayloadType;
export type ElementSelectedEventDetail = ElementSelectedEventDetailType;

import { init } from './core/index.js';
import { getGlobalApi, setGlobalApi } from './global-api.js';
import type { ReactGrabAPI as ReactGrabAPIValue } from './types.js';
import { getParentReactGrabApi } from './utils/get-parent-react-grab-api.js';

export { getGlobalApi, setGlobalApi, registerPlugin, unregisterPlugin } from './global-api.js';

declare global {
	interface Window {
		/** @deprecated Prefer `__OCTANE_GRAB__`; retained for upstream script compatibility. */
		__REACT_GRAB__?: ReactGrabAPIValue;
		__OCTANE_GRAB__?: ReactGrabAPIValue;
		__REACT_GRAB_DISABLED__?: boolean;
		__OCTANE_GRAB_DISABLED__?: boolean;
	}
}

if (
	typeof window !== 'undefined' &&
	!window.__OCTANE_GRAB_DISABLED__ &&
	!window.__REACT_GRAB_DISABLED__
) {
	const existingApi = window.__OCTANE_GRAB__ ?? window.__REACT_GRAB__ ?? getParentReactGrabApi();
	if (existingApi) {
		setGlobalApi(existingApi);
	} else {
		setGlobalApi(init());
	}
	const api = getGlobalApi();
	if (api) {
		window.__OCTANE_GRAB__ = api;
		window.__REACT_GRAB__ = api;
		window.dispatchEvent(new CustomEvent('octane-grab:init', { detail: api }));
		window.dispatchEvent(new CustomEvent('react-grab:init', { detail: api }));
	}
}
