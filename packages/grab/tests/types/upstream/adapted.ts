import type { Assert, Equal } from '../../../../../scripts/react-port/type-assertions.js';
import * as OctaneGrab from '@octanejs/grab';
import * as OctaneGrabPrimitives from '@octanejs/grab/primitives';

OctaneGrab.init satisfies (options?: object) => object;
OctaneGrab.getGlobalApi satisfies () => object | null;
OctaneGrab.isInstrumentationActive satisfies () => boolean;
OctaneGrab.generateSnippet satisfies (...args: never[]) => PromiseLike<string[]>;
OctaneGrab.DEFAULT_THEME satisfies object;
OctaneGrab.commentPlugin satisfies object;
OctaneGrab.openPlugin satisfies object;
OctaneGrab.FreezeError satisfies new (...args: never[]) => Error;
OctaneGrab.OpenFileError satisfies new (...args: never[]) => Error;
OctaneGrab.PluginSetupError satisfies new (...args: never[]) => Error;
OctaneGrab.ReactGrabError satisfies new (...args: never[]) => Error;
OctaneGrab.getStack satisfies (...args: never[]) => PromiseLike<object[] | null>;
OctaneGrab.formatElementInfo satisfies (...args: never[]) => PromiseLike<string>;
OctaneGrab.setGlobalApi satisfies (api: never) => void;
OctaneGrab.registerPlugin satisfies (plugin: never) => void;
OctaneGrab.unregisterPlugin satisfies (name: string) => void;

OctaneGrabPrimitives.isElementGrabbable satisfies (element: Element) => boolean;
OctaneGrabPrimitives.freeze satisfies (elements?: Element[]) => void;
OctaneGrabPrimitives.unfreeze satisfies () => void;
OctaneGrabPrimitives.isFreezeActive satisfies () => boolean;

const api = OctaneGrab.init({ enabled: false } as never);
api.getState satisfies () => object;

type OptionsShape = Assert<Equal<keyof Pick<OctaneGrab.Options, 'enabled'>, 'enabled'>>;
type APIShape = Assert<Equal<keyof Pick<OctaneGrab.ReactGrabAPI, 'getState'>, 'getState'>>;
type ThemeShape = Assert<Equal<keyof Pick<OctaneGrab.Theme, 'enabled'>, 'enabled'>>;
type PluginShape = Assert<Equal<keyof Pick<OctaneGrab.Plugin, 'name'>, 'name'>>;
type PluginConfigShape = Assert<Equal<keyof Pick<OctaneGrab.PluginConfig, 'theme'>, 'theme'>>;
type SourceInfoShape = Assert<Equal<keyof Pick<OctaneGrab.SourceInfo, 'filePath'>, 'filePath'>>;
type ReactGrabStateShape = Assert<
	Equal<keyof Pick<OctaneGrab.ReactGrabState, 'isActive'>, 'isActive'>
>;
type ToolbarStateShape = Assert<Equal<keyof Pick<OctaneGrab.ToolbarState, 'enabled'>, 'enabled'>>;
type OverlayBoundsShape = Assert<Equal<keyof Pick<OctaneGrab.OverlayBounds, 'x'>, 'x'>>;
type GrabbedBoxShape = Assert<Equal<keyof Pick<OctaneGrab.GrabbedBox, 'id'>, 'id'>>;
type DragRectShape = Assert<Equal<keyof Pick<OctaneGrab.DragRect, 'x'>, 'x'>>;
type RectShape = Assert<Equal<keyof Pick<OctaneGrab.Rect, 'left'>, 'left'>>;
type PositionShape = Assert<Equal<keyof Pick<OctaneGrab.Position, 'x'>, 'x'>>;
type DeepPartialShape = Assert<Equal<OctaneGrab.DeepPartial<{ a: number }>, { a?: number }>>;
type ElementLabelVariantShape = Assert<
	Equal<OctaneGrab.ElementLabelVariant, 'hover' | 'processing' | 'success'>
>;
type PromptModeContextShape = Assert<Equal<keyof Pick<OctaneGrab.PromptModeContext, 'x'>, 'x'>>;
type ElementLabelContextShape = Assert<
	Equal<keyof Pick<OctaneGrab.ElementLabelContext, 'content'>, 'content'>
>;
type AgentContextShape = Assert<Equal<keyof Pick<OctaneGrab.AgentContext, 'prompt'>, 'prompt'>>;
type SettableOptionsShape = Assert<
	Equal<keyof Pick<OctaneGrab.SettableOptions, 'keyHoldDuration'>, 'keyHoldDuration'>
>;
type ActivationModeShape = Assert<Equal<OctaneGrab.ActivationMode, 'toggle' | 'hold'>>;
type ContextMenuActionShape = Assert<Equal<keyof Pick<OctaneGrab.ContextMenuAction, 'id'>, 'id'>>;
type ContextMenuActionContextShape = Assert<
	Equal<keyof Pick<OctaneGrab.ContextMenuActionContext, 'element'>, 'element'>
>;
type ActionContextShape = Assert<Equal<keyof Pick<OctaneGrab.ActionContext, 'element'>, 'element'>>;
type ActionContextHooksShape = Assert<
	Equal<keyof Pick<OctaneGrab.ActionContextHooks, 'onOpenFile'>, 'onOpenFile'>
>;
type OpenFileActionHooksShape = Assert<
	Equal<keyof Pick<OctaneGrab.OpenFileActionHooks, 'onOpenFile'>, 'onOpenFile'>
>;
type PluginHooksShape = Assert<
	Equal<keyof Pick<OctaneGrab.PluginHooks, 'onActivate'>, 'onActivate'>
>;
type SelectedElementPayloadShape = Assert<
	Equal<keyof Pick<OctaneGrab.SelectedElementPayload, 'tagName'>, 'tagName'>
>;
type ElementSelectedEventDetailShape = Assert<
	Equal<keyof Pick<OctaneGrab.ElementSelectedEventDetail, 'elements'>, 'elements'>
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
OctaneGrab.init(false);
// @ts-expect-error isElementGrabbable requires an Element
OctaneGrabPrimitives.isElementGrabbable('div');
// @ts-expect-error freeze does not accept a string host
OctaneGrabPrimitives.freeze('body');
