import type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';
import * as ReactGrab from 'react-grab';
import * as ReactGrabPrimitives from 'react-grab/primitives';

ReactGrab.init satisfies (options?: object) => object;
ReactGrab.getGlobalApi satisfies () => object | null;
ReactGrab.isInstrumentationActive satisfies () => boolean;
ReactGrab.generateSnippet satisfies (...args: never[]) => PromiseLike<string[]>;
ReactGrab.DEFAULT_THEME satisfies object;
ReactGrab.commentPlugin satisfies object;
ReactGrab.openPlugin satisfies object;
ReactGrab.FreezeError satisfies new (...args: never[]) => Error;
ReactGrab.OpenFileError satisfies new (...args: never[]) => Error;
ReactGrab.PluginSetupError satisfies new (...args: never[]) => Error;
ReactGrab.ReactGrabError satisfies new (...args: never[]) => Error;
ReactGrab.getStack satisfies (...args: never[]) => PromiseLike<object[] | null>;
ReactGrab.formatElementInfo satisfies (...args: never[]) => PromiseLike<string>;
ReactGrab.setGlobalApi satisfies (api: never) => void;
ReactGrab.registerPlugin satisfies (plugin: never) => void;
ReactGrab.unregisterPlugin satisfies (name: string) => void;

ReactGrabPrimitives.isElementGrabbable satisfies (element: Element) => boolean;
ReactGrabPrimitives.freeze satisfies (elements?: Element[]) => void;
ReactGrabPrimitives.unfreeze satisfies () => void;
ReactGrabPrimitives.isFreezeActive satisfies () => boolean;

const api = ReactGrab.init({ enabled: false } as never);
api.getState satisfies () => object;

type OptionsShape = Assert<Equal<keyof Pick<ReactGrab.Options, 'enabled'>, 'enabled'>>;
type APIShape = Assert<Equal<keyof Pick<ReactGrab.ReactGrabAPI, 'getState'>, 'getState'>>;
type ThemeShape = Assert<Equal<keyof Pick<ReactGrab.Theme, 'enabled'>, 'enabled'>>;
type PluginShape = Assert<Equal<keyof Pick<ReactGrab.Plugin, 'name'>, 'name'>>;
type PluginConfigShape = Assert<Equal<keyof Pick<ReactGrab.PluginConfig, 'theme'>, 'theme'>>;
type SourceInfoShape = Assert<Equal<keyof Pick<ReactGrab.SourceInfo, 'filePath'>, 'filePath'>>;
type ReactGrabStateShape = Assert<
	Equal<keyof Pick<ReactGrab.ReactGrabState, 'isActive'>, 'isActive'>
>;
type ToolbarStateShape = Assert<Equal<keyof Pick<ReactGrab.ToolbarState, 'enabled'>, 'enabled'>>;
type OverlayBoundsShape = Assert<Equal<keyof Pick<ReactGrab.OverlayBounds, 'x'>, 'x'>>;
type GrabbedBoxShape = Assert<Equal<keyof Pick<ReactGrab.GrabbedBox, 'id'>, 'id'>>;
type DragRectShape = Assert<Equal<keyof Pick<ReactGrab.DragRect, 'x'>, 'x'>>;
type RectShape = Assert<Equal<keyof Pick<ReactGrab.Rect, 'left'>, 'left'>>;
type PositionShape = Assert<Equal<keyof Pick<ReactGrab.Position, 'x'>, 'x'>>;
type DeepPartialShape = Assert<Equal<ReactGrab.DeepPartial<{ a: number }>, { a?: number }>>;
type ElementLabelVariantShape = Assert<
	Equal<ReactGrab.ElementLabelVariant, 'hover' | 'processing' | 'success'>
>;
type PromptModeContextShape = Assert<Equal<keyof Pick<ReactGrab.PromptModeContext, 'x'>, 'x'>>;
type ElementLabelContextShape = Assert<
	Equal<keyof Pick<ReactGrab.ElementLabelContext, 'content'>, 'content'>
>;
type AgentContextShape = Assert<Equal<keyof Pick<ReactGrab.AgentContext, 'prompt'>, 'prompt'>>;
type SettableOptionsShape = Assert<
	Equal<keyof Pick<ReactGrab.SettableOptions, 'keyHoldDuration'>, 'keyHoldDuration'>
>;
type ActivationModeShape = Assert<Equal<ReactGrab.ActivationMode, 'toggle' | 'hold'>>;
type ContextMenuActionShape = Assert<Equal<keyof Pick<ReactGrab.ContextMenuAction, 'id'>, 'id'>>;
type ContextMenuActionContextShape = Assert<
	Equal<keyof Pick<ReactGrab.ContextMenuActionContext, 'element'>, 'element'>
>;
type ActionContextShape = Assert<Equal<keyof Pick<ReactGrab.ActionContext, 'element'>, 'element'>>;
type ActionContextHooksShape = Assert<
	Equal<keyof Pick<ReactGrab.ActionContextHooks, 'onOpenFile'>, 'onOpenFile'>
>;
type OpenFileActionHooksShape = Assert<
	Equal<keyof Pick<ReactGrab.OpenFileActionHooks, 'onOpenFile'>, 'onOpenFile'>
>;
type PluginHooksShape = Assert<
	Equal<keyof Pick<ReactGrab.PluginHooks, 'onActivate'>, 'onActivate'>
>;
type SelectedElementPayloadShape = Assert<
	Equal<keyof Pick<ReactGrab.SelectedElementPayload, 'tagName'>, 'tagName'>
>;
type ElementSelectedEventDetailShape = Assert<
	Equal<keyof Pick<ReactGrab.ElementSelectedEventDetail, 'elements'>, 'elements'>
>;

void 0 as unknown as [
	OptionsShape,
	APIShape,
	ThemeShape,
	PluginShape,
	PluginConfigShape,
	SourceInfoShape,
	ReactGrabStateShape,
	ToolbarStateShape,
	OverlayBoundsShape,
	GrabbedBoxShape,
	DragRectShape,
	RectShape,
	PositionShape,
	DeepPartialShape,
	ElementLabelVariantShape,
	PromptModeContextShape,
	ElementLabelContextShape,
	AgentContextShape,
	SettableOptionsShape,
	ActivationModeShape,
	ContextMenuActionShape,
	ContextMenuActionContextShape,
	ActionContextShape,
	ActionContextHooksShape,
	OpenFileActionHooksShape,
	PluginHooksShape,
	SelectedElementPayloadShape,
	ElementSelectedEventDetailShape,
];

// @ts-expect-error init rejects a non-options config object shape
ReactGrab.init(false);
// @ts-expect-error isElementGrabbable requires an Element
ReactGrabPrimitives.isElementGrabbable('div');
// @ts-expect-error freeze does not accept a string host
ReactGrabPrimitives.freeze('body');
