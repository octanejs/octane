/**
 * Public consumer type evidence for `@octanejs/grab`.
 */
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
import * as Grab from '@octanejs/grab';
import * as GrabCore from '@octanejs/grab/core';
import * as GrabPrimitives from '@octanejs/grab/primitives';
import '@octanejs/grab/styles.css';
import grabPackage from '@octanejs/grab/package.json';

Grab.init satisfies (options?: object) => object;
Grab.getGlobalApi satisfies () => object | null;
Grab.isInstrumentationActive satisfies () => boolean;
Grab.generateSnippet satisfies (...args: never[]) => unknown;
Grab.DEFAULT_THEME satisfies object;
Grab.commentPlugin satisfies object;
Grab.openPlugin satisfies object;
Grab.FreezeError satisfies new (...args: never[]) => Error;
Grab.OpenFileError satisfies new (...args: never[]) => Error;
Grab.PluginSetupError satisfies new (...args: never[]) => Error;
Grab.ReactGrabError satisfies new (...args: never[]) => Error;
Grab.getStack satisfies (...args: never[]) => Promise<object[] | null>;
Grab.formatElementInfo satisfies (...args: never[]) => unknown;
Grab.setGlobalApi satisfies (api: never) => void;
Grab.registerPlugin satisfies (plugin: never) => void;
Grab.unregisterPlugin satisfies (name: string) => void;

GrabCore.init satisfies (options?: object) => object;
GrabCore.getStack satisfies (...args: never[]) => Promise<object[] | null>;
GrabCore.formatElementInfo satisfies (...args: never[]) => unknown;
GrabCore.isInstrumentationActive satisfies () => boolean;
GrabCore.generateSnippet satisfies (...args: never[]) => unknown;
GrabCore.DEFAULT_THEME satisfies object;
GrabCore.copyContent satisfies (...args: never[]) => unknown;

GrabPrimitives.isElementGrabbable satisfies (element: Element) => boolean;
GrabPrimitives.freeze satisfies (elements?: Element[]) => void;
GrabPrimitives.unfreeze satisfies () => void;
GrabPrimitives.isFreezeActive satisfies () => boolean;
GrabPrimitives.getElementBounds satisfies (element: Element) => object;
GrabPrimitives.getElementSelector satisfies (element: Element) => string;
GrabPrimitives.getElementContext satisfies (element: Element) => PromiseLike<object>;
GrabPrimitives.getElementAtPoint satisfies (...args: never[]) => Element | null;
GrabPrimitives.getElementsAtPoint satisfies (...args: never[]) => Element[];
GrabPrimitives.getElementsAtPosition satisfies (...args: never[]) => Element[];
GrabPrimitives.openFile satisfies (...args: never[]) => PromiseLike<void>;
GrabPrimitives.disposeBaselineStyles satisfies () => void;
GrabPrimitives.copyContent satisfies (...args: never[]) => unknown;
GrabPrimitives.FreezeError satisfies new (...args: never[]) => Error;
GrabPrimitives.OpenFileError satisfies new (...args: never[]) => Error;

grabPackage.name satisfies string;

type DeepPartialShape = Assert<Equal<Grab.DeepPartial<{ a: number }>, { a?: number }>>;
type PositionShape = Assert<Equal<Pick<Grab.Position, 'x'>, { x: number }>>;
type RectShape = Assert<Equal<Pick<Grab.Rect, 'top'>, { top: number }>>;
type DragRectShape = Assert<Equal<Pick<Grab.DragRect, 'x'>, { x: number }>>;
type OverlayBoundsShape = Assert<Equal<Pick<Grab.OverlayBounds, 'x'>, { x: number }>>;
type GrabbedBoxShape = Assert<Equal<Pick<Grab.GrabbedBox, 'id'>, { id: string }>>;
type ThemeShape = Assert<Equal<Pick<Grab.Theme, 'enabled'>, { enabled?: boolean }>>;
type OptionsShape = Assert<Equal<Pick<Grab.Options, 'enabled'>, { enabled?: boolean }>>;
type SettableOptionsShape = Assert<
	Equal<Pick<Grab.SettableOptions, 'keyHoldDuration'>, { keyHoldDuration?: number }>
>;
type SourceInfoShape = Assert<Equal<Pick<Grab.SourceInfo, 'filePath'>, { filePath: string }>>;
type ReactGrabStateShape = Assert<
	Equal<Pick<Grab.ReactGrabState, 'isActive'>, { isActive: boolean }>
>;
type ToolbarStateShape = Assert<Equal<Pick<Grab.ToolbarState, 'enabled'>, { enabled: boolean }>>;
type PluginShape = Assert<Equal<Pick<Grab.Plugin, 'name'>, { name: string }>>;
type PluginConfigShape = Assert<Equal<keyof Pick<Grab.PluginConfig, 'theme'>, 'theme'>>;
type PluginHooksShape = Assert<
	Equal<Pick<Grab.PluginHooks, 'onActivate'>, { onActivate?: () => void | Promise<void> }>
>;
type ReactGrabAPIShape = Assert<
	Equal<Pick<Grab.ReactGrabAPI, 'isActive'>, { isActive: () => boolean }>
>;
type ActivationModeShape = Assert<Equal<Grab.ActivationMode, 'toggle' | 'hold'>>;
type ElementLabelVariantShape = Assert<
	Equal<Grab.ElementLabelVariant, 'hover' | 'processing' | 'success'>
>;
type AgentContextShape = Assert<Equal<Pick<Grab.AgentContext, 'prompt'>, { prompt: string }>>;
type PromptModeContextShape = Assert<Equal<Pick<Grab.PromptModeContext, 'x'>, { x: number }>>;
type ElementLabelContextShape = Assert<
	Equal<Pick<Grab.ElementLabelContext, 'content'>, { content: string }>
>;
type ActionContextShape = Assert<Equal<Pick<Grab.ActionContext, 'element'>, { element: Element }>>;
type ActionContextHooksShape = Assert<
	Equal<
		Pick<Grab.ActionContextHooks, 'onOpenFile'>,
		{ onOpenFile: (filePath: string, lineNumber?: number) => boolean | void }
	>
>;
type OpenFileActionHooksShape = Assert<
	Equal<
		Pick<Grab.OpenFileActionHooks, 'onOpenFile'>,
		{ onOpenFile: (filePath: string, lineNumber?: number) => boolean | void }
	>
>;
type ContextMenuActionShape = Assert<Equal<Pick<Grab.ContextMenuAction, 'id'>, { id: string }>>;
type ContextMenuActionContextShape = Assert<
	Equal<Pick<Grab.ContextMenuActionContext, 'element'>, { element: Element }>
>;
type SelectedElementPayloadShape = Assert<
	Equal<Pick<Grab.SelectedElementPayload, 'tagName'>, { tagName: string }>
>;
type ElementSelectedEventDetailShape = Assert<
	Equal<keyof Pick<Grab.ElementSelectedEventDetail, 'elements'>, 'elements'>
>;

type CoreOptionsShape = Assert<Equal<Pick<GrabCore.Options, 'enabled'>, { enabled?: boolean }>>;
type CoreOverlayBoundsShape = Assert<Equal<Pick<GrabCore.OverlayBounds, 'x'>, { x: number }>>;
type CoreReactGrabRendererPropsShape = Assert<
	Equal<keyof Pick<GrabCore.ReactGrabRendererProps, 'selectionVisible'>, 'selectionVisible'>
>;
type CoreReactGrabAPIShape = Assert<
	Equal<Pick<GrabCore.ReactGrabAPI, 'isActive'>, { isActive: () => boolean }>
>;
type CoreSourceInfoShape = Assert<
	Equal<Pick<GrabCore.SourceInfo, 'filePath'>, { filePath: string }>
>;
type CoreAgentContextShape = Assert<
	Equal<Pick<GrabCore.AgentContext, 'prompt'>, { prompt: string }>
>;
type CoreSettableOptionsShape = Assert<
	Equal<Pick<GrabCore.SettableOptions, 'keyHoldDuration'>, { keyHoldDuration?: number }>
>;
type CoreContextMenuActionShape = Assert<
	Equal<Pick<GrabCore.ContextMenuAction, 'id'>, { id: string }>
>;
type CoreActionContextShape = Assert<
	Equal<Pick<GrabCore.ActionContext, 'element'>, { element: Element }>
>;
type CorePluginShape = Assert<Equal<Pick<GrabCore.Plugin, 'name'>, { name: string }>>;
type CorePluginConfigShape = Assert<Equal<keyof Pick<GrabCore.PluginConfig, 'theme'>, 'theme'>>;
type CorePluginHooksShape = Assert<
	Equal<Pick<GrabCore.PluginHooks, 'onActivate'>, { onActivate?: () => void | Promise<void> }>
>;

type PrimitivesStackFrameShape = Assert<
	Equal<keyof Pick<GrabPrimitives.StackFrame, 'fileName'>, 'fileName'>
>;
type PrimitivesElementAtPointOptionsShape = Assert<
	Equal<keyof Pick<GrabPrimitives.ElementAtPointOptions, 'container'>, 'container'>
>;
type PrimitivesElementBoundsShape = Assert<
	Equal<Pick<GrabPrimitives.ElementBounds, 'width'>, { width: number }>
>;
type PrimitivesReactGrabElementContextShape = Assert<
	Equal<keyof Pick<GrabPrimitives.ReactGrabElementContext, 'element'>, 'element'>
>;

// @ts-expect-error init rejects a non-options config object shape
Grab.init(false);
// @ts-expect-error isElementGrabbable requires an Element
GrabPrimitives.isElementGrabbable('div');
// @ts-expect-error freeze does not accept a string host
GrabPrimitives.freeze('body');
// @ts-expect-error openFile requires a path string
GrabPrimitives.openFile(123);
// @ts-expect-error setGlobalApi requires a ReactGrabAPI or null
Grab.setGlobalApi(false);
