import { expectTypeOf } from 'vitest';
import * as Grab from '@octanejs/grab';
import * as GrabCore from '@octanejs/grab/core';
import * as GrabPrimitives from '@octanejs/grab/primitives';

// Root entry point: values.
expectTypeOf(Grab.init).parameter(0).toEqualTypeOf<Grab.Options | undefined>();
expectTypeOf(Grab.init).returns.toEqualTypeOf<Grab.ReactGrabAPI>();
expectTypeOf(Grab.getStack).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(Grab.getStack).returns.toEqualTypeOf<Promise<GrabPrimitives.StackFrame[] | null>>();
expectTypeOf(Grab.formatElementInfo).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(Grab.formatElementInfo).returns.toEqualTypeOf<Promise<string>>();
expectTypeOf(Grab.isInstrumentationActive).returns.toEqualTypeOf<boolean>();
expectTypeOf(Grab.DEFAULT_THEME).toEqualTypeOf<Required<Grab.Theme>>();
expectTypeOf(Grab.commentPlugin).toEqualTypeOf<Grab.Plugin>();
expectTypeOf(Grab.openPlugin).toEqualTypeOf<Grab.Plugin>();
expectTypeOf(Grab.generateSnippet).parameter(0).toEqualTypeOf<Element[]>();
expectTypeOf(Grab.generateSnippet).returns.toEqualTypeOf<Promise<string[]>>();
expectTypeOf(Grab.getGlobalApi).returns.toEqualTypeOf<Grab.ReactGrabAPI | null>();
expectTypeOf(Grab.setGlobalApi).parameter(0).toEqualTypeOf<Grab.ReactGrabAPI | null>();
expectTypeOf(Grab.setGlobalApi).returns.toEqualTypeOf<void>();
expectTypeOf(Grab.registerPlugin).parameter(0).toEqualTypeOf<Grab.Plugin>();
expectTypeOf(Grab.registerPlugin).returns.toEqualTypeOf<void>();
expectTypeOf(Grab.unregisterPlugin).parameter(0).toEqualTypeOf<string>();
expectTypeOf(Grab.unregisterPlugin).returns.toEqualTypeOf<void>();
expectTypeOf(Grab.ReactGrabError).toBeConstructibleWith('message');
expectTypeOf(Grab.PluginSetupError).toBeConstructibleWith('plugin', new Error('cause'));
expectTypeOf(Grab.FreezeError).toBeConstructibleWith(new Error('cause'));
expectTypeOf(Grab.OpenFileError).toBeConstructibleWith('file.ts', 1, new Error('cause'));
expectTypeOf<Grab.ReactGrabError>().toMatchTypeOf<Error>();

// Root entry point: types.
expectTypeOf<Grab.Options>();
expectTypeOf<Grab.ReactGrabAPI>();
expectTypeOf<Grab.SourceInfo>();
expectTypeOf<Grab.Theme>();
expectTypeOf<Grab.ReactGrabState>();
expectTypeOf<Grab.ToolbarState>();
expectTypeOf<Grab.OverlayBounds>();
expectTypeOf<Grab.GrabbedBox>();
expectTypeOf<Grab.DragRect>();
expectTypeOf<Grab.Rect>();
expectTypeOf<Grab.Position>();
expectTypeOf<Grab.DeepPartial<{ theme: Grab.Theme }>>();
expectTypeOf<Grab.ElementLabelVariant>();
expectTypeOf<Grab.PromptModeContext>();
expectTypeOf<Grab.ElementLabelContext>();
expectTypeOf<Grab.AgentContext>();
expectTypeOf<Grab.SettableOptions>();
expectTypeOf<Grab.ActivationMode>();
expectTypeOf<Grab.ContextMenuAction>();
expectTypeOf<Grab.ContextMenuActionContext>();
expectTypeOf<Grab.ActionContext>();
expectTypeOf<Grab.ActionContextHooks>();
expectTypeOf<Grab.OpenFileActionHooks>();
expectTypeOf<Grab.Plugin>();
expectTypeOf<Grab.PluginConfig>();
expectTypeOf<Grab.PluginHooks>();
expectTypeOf<Grab.SelectedElementPayload>();
expectTypeOf<Grab.ElementSelectedEventDetail>();

// ./core entry point: values.
expectTypeOf(GrabCore.init).toEqualTypeOf(Grab.init);
expectTypeOf(GrabCore.getStack).toEqualTypeOf(Grab.getStack);
expectTypeOf(GrabCore.formatElementInfo).toEqualTypeOf(Grab.formatElementInfo);
expectTypeOf(GrabCore.isInstrumentationActive).toEqualTypeOf(Grab.isInstrumentationActive);
expectTypeOf(GrabCore.DEFAULT_THEME).toEqualTypeOf(Grab.DEFAULT_THEME);
expectTypeOf(GrabCore.generateSnippet).toEqualTypeOf(Grab.generateSnippet);
expectTypeOf(GrabCore.copyContent).parameter(0).toEqualTypeOf<string>();
expectTypeOf(GrabCore.copyContent).returns.toEqualTypeOf<boolean>();

// ./core entry point: types.
expectTypeOf<GrabCore.Options>().toEqualTypeOf<Grab.Options>();
expectTypeOf<GrabCore.OverlayBounds>().toEqualTypeOf<Grab.OverlayBounds>();
expectTypeOf<GrabCore.ReactGrabRendererProps>();
expectTypeOf<GrabCore.ReactGrabAPI>().toEqualTypeOf<Grab.ReactGrabAPI>();
expectTypeOf<GrabCore.SourceInfo>().toEqualTypeOf<Grab.SourceInfo>();
expectTypeOf<GrabCore.AgentContext>().toEqualTypeOf<Grab.AgentContext>();
expectTypeOf<GrabCore.SettableOptions>().toEqualTypeOf<Grab.SettableOptions>();
expectTypeOf<GrabCore.ContextMenuAction>().toEqualTypeOf<Grab.ContextMenuAction>();
expectTypeOf<GrabCore.ActionContext>().toEqualTypeOf<Grab.ActionContext>();
expectTypeOf<GrabCore.Plugin>().toEqualTypeOf<Grab.Plugin>();
expectTypeOf<GrabCore.PluginConfig>().toEqualTypeOf<Grab.PluginConfig>();
expectTypeOf<GrabCore.PluginHooks>().toEqualTypeOf<Grab.PluginHooks>();

// ./primitives entry point: values.
expectTypeOf(GrabPrimitives.copyContent).toEqualTypeOf(GrabCore.copyContent);
expectTypeOf(GrabPrimitives.disposeBaselineStyles).returns.toEqualTypeOf<void>();
expectTypeOf(GrabPrimitives.isElementGrabbable).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(GrabPrimitives.isElementGrabbable).returns.toEqualTypeOf<boolean>();
expectTypeOf(GrabPrimitives.getElementBounds).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(GrabPrimitives.getElementBounds).returns.toEqualTypeOf<GrabPrimitives.ElementBounds>();
expectTypeOf(GrabPrimitives.getElementSelector).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(GrabPrimitives.getElementSelector).returns.toEqualTypeOf<string>();
expectTypeOf(GrabPrimitives.getElementContext).parameter(0).toEqualTypeOf<Element>();
expectTypeOf(GrabPrimitives.getElementContext).returns.toEqualTypeOf<
	Promise<GrabPrimitives.ReactGrabElementContext>
>();
expectTypeOf(GrabPrimitives.getElementsAtPosition).parameter(0).toEqualTypeOf<number>();
expectTypeOf(GrabPrimitives.getElementsAtPosition).returns.toEqualTypeOf<Element[]>();
expectTypeOf(GrabPrimitives.getElementAtPoint).toBeFunction();
expectTypeOf(GrabPrimitives.getElementsAtPoint).returns.toEqualTypeOf<Element[]>();
expectTypeOf(GrabPrimitives.freeze).parameter(0).toEqualTypeOf<Element[] | undefined>();
expectTypeOf(GrabPrimitives.freeze).returns.toEqualTypeOf<void>();
expectTypeOf(GrabPrimitives.unfreeze).returns.toEqualTypeOf<void>();
expectTypeOf(GrabPrimitives.isFreezeActive).returns.toEqualTypeOf<boolean>();
expectTypeOf(GrabPrimitives.openFile).parameter(0).toEqualTypeOf<string>();
expectTypeOf(GrabPrimitives.openFile).returns.toEqualTypeOf<Promise<void>>();
expectTypeOf(GrabPrimitives.FreezeError).toEqualTypeOf(Grab.FreezeError);
expectTypeOf(GrabPrimitives.OpenFileError).toEqualTypeOf(Grab.OpenFileError);

// ./primitives entry point: types.
expectTypeOf<GrabPrimitives.StackFrame>();
expectTypeOf<GrabPrimitives.ElementAtPointOptions>();
expectTypeOf<GrabPrimitives.ElementBounds>();
expectTypeOf<GrabPrimitives.ReactGrabElementContext>();

// @ts-expect-error init rejects a non-Options argument
Grab.init(42);

// @ts-expect-error registerPlugin requires a Plugin with name and setup
Grab.registerPlugin({});

// @ts-expect-error freeze rejects a non-Element array
GrabPrimitives.freeze([42]);
