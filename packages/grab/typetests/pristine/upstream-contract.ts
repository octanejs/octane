// Generated from tests/types/published-contract.ts.
// Every upstream export participates in a consumer assertion against the pinned npm types.
// These assertions prove the pristine lane can consume the complete upstream surface.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type * as Upstream0 from 'react-grab';
import type * as Upstream1 from 'react-grab/core';
import type * as Upstream2 from 'react-grab/primitives';

type SharedKeys0 = 'dragBox' | 'elementLabel' | 'hue' | 'selectionBox' | 'toolbar';
type SharedKeys1 = 'name' | 'setup';
type SharedKeys2 =
	'captureStackTrace' | 'isError' | 'prepareStackTrace' | 'prototype' | 'stackTraceLimit';
type SharedKeys3 =
	| 'activationKey'
	| 'activationMode'
	| 'allowActivationInsideInput'
	| 'freezeReactUpdates'
	| 'getContent'
	| 'keyHoldDuration'
	| 'maxContextLines'
	| 'telemetry';
type SharedKeys4 =
	| 'activate'
	| 'comment'
	| 'copyElement'
	| 'deactivate'
	| 'dispose'
	| 'getDisplayName'
	| 'getPlugins'
	| 'getSource'
	| 'getStackContext'
	| 'getState'
	| 'getToolbarState'
	| 'isEnabled'
	| 'registerPlugin'
	| 'reset'
	| 'setEnabled'
	| 'setOptions'
	| 'setToolbarState'
	| 'toggle'
	| 'unregisterPlugin';
type SharedKeys5 = 'componentName' | 'filePath';
type SharedKeys6 = 'dragBounds' | 'isPromptMode' | 'labelInstances' | 'selectionFilePath';
type SharedKeys7 =
	'isCopying' | 'isDragBoxVisible' | 'isDragging' | 'isSelectionBoxVisible' | 'toolbarState';
type SharedKeys8 = 'collapsed' | 'defaultAction' | 'edge' | 'ratio';
type SharedKeys9 = 'height' | 'width';
type SharedKeys10 = 'x' | 'y';
type SharedKeys11 = 'bounds' | 'createdAt';
type SharedKeys12 = 'bottom' | 'left' | 'right' | 'top';
type SharedKeys13 =
	| 'anchor'
	| 'at'
	| 'big'
	| 'blink'
	| 'bold'
	| 'charAt'
	| 'charCodeAt'
	| 'codePointAt'
	| 'concat'
	| 'endsWith'
	| 'fixed'
	| 'fontcolor'
	| 'fontsize'
	| 'includes'
	| 'indexOf'
	| 'isWellFormed'
	| 'italics'
	| 'lastIndexOf'
	| 'length'
	| 'link'
	| 'localeCompare'
	| 'match'
	| 'matchAll'
	| 'normalize'
	| 'padEnd'
	| 'padStart'
	| 'repeat'
	| 'replace'
	| 'replaceAll'
	| 'search'
	| 'slice'
	| 'small'
	| 'split'
	| 'startsWith'
	| 'strike'
	| 'sub'
	| 'substr'
	| 'substring'
	| 'sup'
	| 'toLocaleLowerCase'
	| 'toLocaleUpperCase'
	| 'toLowerCase'
	| 'toString'
	| 'toUpperCase'
	| 'toWellFormed'
	| 'trim'
	| 'trimEnd'
	| 'trimLeft'
	| 'trimRight'
	| 'trimStart'
	| 'valueOf'
	| number
	| typeof Symbol.iterator;
type SharedKeys14 = 'prompt' | 'sessionId';
type SharedKeys15 = 'label' | 'onAction' | 'shortcut' | 'shortcutModifier' | 'showInToolbarMenu';
type SharedKeys16 = 'enterPromptMode' | 'hideContextMenu' | 'performWithFeedback';
type SharedKeys17 = 'onOpenFile' | 'transformOpenFileUrl';
type SharedKeys18 =
	| 'onActivate'
	| 'onAfterCopy'
	| 'onBeforeCopy'
	| 'onContextMenu'
	| 'onCopyError'
	| 'onCopySuccess'
	| 'onDeactivate'
	| 'onDragBox'
	| 'onDragEnd'
	| 'onDragStart'
	| 'onElementHover'
	| 'onElementLabel'
	| 'onElementSelect'
	| 'onGrabbedBox'
	| 'onPromptModeChange'
	| 'onSelectionBox'
	| 'onStateChange'
	| 'transformActionContext'
	| 'transformAgentContext'
	| 'transformCopyContent';
type SharedKeys19 = 'className' | 'textContent';
type SharedKeys20 =
	| 'actionContext'
	| 'activeActionId'
	| 'contextMenuBounds'
	| 'contextMenuComponentName'
	| 'contextMenuHasFilePath'
	| 'contextMenuPosition'
	| 'contextMenuTagName'
	| 'defaultActionId'
	| 'defaultActionLabel'
	| 'discardPrompt'
	| 'dragVisible'
	| 'frozenLabelEntryAccessors'
	| 'hierarchyMenuPosition'
	| 'hierarchyState'
	| 'inputValue'
	| 'isFrozen'
	| 'labelInstanceAccessors'
	| 'mouseX'
	| 'onAcknowledgeErrorInstance'
	| 'onConfirmDismiss'
	| 'onContextMenuDismiss'
	| 'onContextMenuHide'
	| 'onInputChange'
	| 'onInputSubmit'
	| 'onLabelInstanceHoverChange'
	| 'onOpenSelectionFile'
	| 'onRetryInstance'
	| 'onSetDefaultAction'
	| 'onShowContextMenuInstance'
	| 'onSubscribeToToolbarStateChanges'
	| 'onToggleActive'
	| 'onToggleToolbarMenu'
	| 'onToolbarMenuDismiss'
	| 'onToolbarRef'
	| 'onToolbarSelectHoverChange'
	| 'pendingShiftPreviewEntry'
	| 'selectionBounds'
	| 'selectionBoundsMultiple'
	| 'selectionComponentName'
	| 'selectionElementsCount'
	| 'selectionLabelShakeCount'
	| 'selectionLabelStatus'
	| 'selectionLabelVisible'
	| 'selectionShouldSnap'
	| 'selectionTagName'
	| 'selectionVisible'
	| 'shakeCount'
	| 'toolbarMenuActions'
	| 'toolbarMenuPosition'
	| 'toolbarVisible';
type SharedKeys21 =
	| 'args'
	| 'enclosingColumnNumber'
	| 'enclosingLineNumber'
	| 'fileName'
	| 'functionName'
	| 'isIgnoreListed'
	| 'isServer'
	| 'isSymbolicated'
	| 'source';
type SharedKeys22 =
	'fiber' | 'htmlPreview' | 'selector' | 'snippet' | 'stack' | 'stackString' | 'styles';
type PublishedKeys0 = SharedKeys0 | 'enabled' | 'grabbedBoxes';
type PublishedKeys1 = 'actions' | 'hooks' | SharedKeys1 | 'options' | 'theme';
type PublishedKeys2 = SharedKeys2;
type PublishedKeys3 = 'enabled' | SharedKeys3 | 'container';
type PublishedKeys4 = SharedKeys4 | 'isActive' | 'onToolbarStateChange';
type PublishedKeys5 = 'columnNumber' | SharedKeys5 | 'lineNumber';
type PublishedKeys6 = 'grabbedBoxes' | 'isActive' | SharedKeys6 | SharedKeys7 | 'targetElement';
type PublishedKeys7 = 'enabled' | SharedKeys8;
type PublishedKeys8 = 'borderRadius' | SharedKeys9 | SharedKeys10;
type PublishedKeys9 = SharedKeys11 | 'element' | 'id';
type PublishedKeys10 = SharedKeys9 | SharedKeys10;
type PublishedKeys11 = SharedKeys12;
type PublishedKeys12 = SharedKeys10;
type PublishedKeys13 = 'sample';
type PublishedKeys14 = SharedKeys13;
type PublishedKeys15 = 'targetElement' | SharedKeys10;
type PublishedKeys16 =
	SharedKeys5 | 'lineNumber' | SharedKeys10 | 'element' | 'content' | 'tagName';
type PublishedKeys17 = 'options' | 'content' | SharedKeys14;
type PublishedKeys18 = 'enabled' | 'id' | SharedKeys15;
type PublishedKeys19 =
	| 'hooks'
	| SharedKeys5
	| 'lineNumber'
	| 'element'
	| 'tagName'
	| 'cleanup'
	| 'copy'
	| 'elements'
	| SharedKeys16;
type PublishedKeys20 =
	| 'hooks'
	| SharedKeys5
	| 'lineNumber'
	| 'element'
	| 'tagName'
	| 'cleanup'
	| 'elements'
	| SharedKeys16;
type PublishedKeys21 = SharedKeys17 | 'transformHtmlContent';
type PublishedKeys22 = SharedKeys17;
type PublishedKeys23 = 'actions' | 'hooks' | 'options' | 'theme' | 'cleanup';
type PublishedKeys24 = SharedKeys17 | 'transformHtmlContent' | SharedKeys18;
type PublishedKeys25 =
	'columnNumber' | SharedKeys5 | 'lineNumber' | 'id' | 'tagName' | SharedKeys19;
type PublishedKeys26 = 'elements';
type PublishedKeys27 =
	| 'enabled'
	| 'grabbedBoxes'
	| 'actions'
	| 'isActive'
	| 'onToolbarStateChange'
	| SharedKeys6
	| SharedKeys20;
type PublishedKeys28 = 'columnNumber' | 'lineNumber' | SharedKeys21;
type PublishedKeys29 = 'container' | 'filter';
type PublishedKeys30 = 'columnNumber' | SharedKeys5 | 'lineNumber' | 'element' | SharedKeys22;

type Contract0 = Assert<Equal<Parameters<typeof Upstream0.init>['length'], 0 | 1>>;
type Contract1 = Assert<Equal<Parameters<typeof Upstream0.getStack>['length'], 1>>;
type Contract2 = Assert<Equal<Parameters<typeof Upstream0.formatElementInfo>['length'], 1 | 2>>;
type Contract3 = Assert<Equal<Parameters<typeof Upstream0.isInstrumentationActive>['length'], 0>>;
type Contract4 = Assert<
	Equal<keyof Pick<typeof Upstream0.DEFAULT_THEME, PublishedKeys0>, PublishedKeys0>
>;
type Contract5 = Assert<
	Equal<keyof Pick<typeof Upstream0.commentPlugin, PublishedKeys1>, PublishedKeys1>
>;
type Contract6 = Assert<
	Equal<keyof Pick<typeof Upstream0.openPlugin, PublishedKeys1>, PublishedKeys1>
>;
type Contract7 = Assert<
	Equal<keyof Pick<typeof Upstream0.FreezeError, PublishedKeys2>, PublishedKeys2>
>;
type Contract8 = Assert<
	Equal<keyof Pick<typeof Upstream0.OpenFileError, PublishedKeys2>, PublishedKeys2>
>;
type Contract9 = Assert<Equal<Parameters<typeof Upstream0.generateSnippet>['length'], 1 | 2>>;
type Contract10 = Assert<
	Equal<keyof Pick<typeof Upstream0.PluginSetupError, PublishedKeys2>, PublishedKeys2>
>;
type Contract11 = Assert<
	Equal<keyof Pick<typeof Upstream0.ReactGrabError, PublishedKeys2>, PublishedKeys2>
>;
type Contract12 = Assert<Equal<keyof Pick<Upstream0.Options, PublishedKeys3>, PublishedKeys3>>;
type Contract13 = Assert<Equal<keyof Pick<Upstream0.ReactGrabAPI, PublishedKeys4>, PublishedKeys4>>;
type Contract14 = Assert<Equal<keyof Pick<Upstream0.SourceInfo, PublishedKeys5>, PublishedKeys5>>;
type Contract15 = Assert<Equal<keyof Pick<Upstream0.Theme, PublishedKeys0>, PublishedKeys0>>;
type Contract16 = Assert<
	Equal<keyof Pick<Upstream0.ReactGrabState, PublishedKeys6>, PublishedKeys6>
>;
type Contract17 = Assert<Equal<keyof Pick<Upstream0.ToolbarState, PublishedKeys7>, PublishedKeys7>>;
type Contract18 = Assert<
	Equal<keyof Pick<Upstream0.OverlayBounds, PublishedKeys8>, PublishedKeys8>
>;
type Contract19 = Assert<Equal<keyof Pick<Upstream0.GrabbedBox, PublishedKeys9>, PublishedKeys9>>;
type Contract20 = Assert<Equal<keyof Pick<Upstream0.DragRect, PublishedKeys10>, PublishedKeys10>>;
type Contract21 = Assert<Equal<keyof Pick<Upstream0.Rect, PublishedKeys11>, PublishedKeys11>>;
type Contract22 = Assert<Equal<keyof Pick<Upstream0.Position, PublishedKeys12>, PublishedKeys12>>;
type Contract23 = Assert<
	Equal<keyof Pick<Upstream0.DeepPartial<{ sample: string }>, PublishedKeys13>, PublishedKeys13>
>;
type Contract24 = Assert<
	Equal<keyof Pick<Upstream0.ElementLabelVariant, PublishedKeys14>, PublishedKeys14>
>;
type Contract25 = Assert<
	Equal<keyof Pick<Upstream0.PromptModeContext, PublishedKeys15>, PublishedKeys15>
>;
type Contract26 = Assert<
	Equal<keyof Pick<Upstream0.ElementLabelContext, PublishedKeys16>, PublishedKeys16>
>;
type Contract27 = Assert<
	Equal<keyof Pick<Upstream0.AgentContext, PublishedKeys17>, PublishedKeys17>
>;
type Contract28 = Assert<
	Equal<keyof Pick<Upstream0.SettableOptions, PublishedKeys3>, PublishedKeys3>
>;
type Contract29 = Assert<
	Equal<keyof Pick<Upstream0.ActivationMode, PublishedKeys14>, PublishedKeys14>
>;
type Contract30 = Assert<
	Equal<keyof Pick<Upstream0.ContextMenuAction, PublishedKeys18>, PublishedKeys18>
>;
type Contract31 = Assert<
	Equal<keyof Pick<Upstream0.ContextMenuActionContext, PublishedKeys19>, PublishedKeys19>
>;
type Contract32 = Assert<
	Equal<keyof Pick<Upstream0.ActionContext, PublishedKeys20>, PublishedKeys20>
>;
type Contract33 = Assert<
	Equal<keyof Pick<Upstream0.ActionContextHooks, PublishedKeys21>, PublishedKeys21>
>;
type Contract34 = Assert<
	Equal<keyof Pick<Upstream0.OpenFileActionHooks, PublishedKeys22>, PublishedKeys22>
>;
type Contract35 = Assert<Equal<keyof Pick<Upstream0.Plugin, PublishedKeys1>, PublishedKeys1>>;
type Contract36 = Assert<
	Equal<keyof Pick<Upstream0.PluginConfig, PublishedKeys23>, PublishedKeys23>
>;
type Contract37 = Assert<
	Equal<keyof Pick<Upstream0.PluginHooks, PublishedKeys24>, PublishedKeys24>
>;
type Contract38 = Assert<
	Equal<keyof Pick<Upstream0.SelectedElementPayload, PublishedKeys25>, PublishedKeys25>
>;
type Contract39 = Assert<
	Equal<keyof Pick<Upstream0.ElementSelectedEventDetail, PublishedKeys26>, PublishedKeys26>
>;
type Contract40 = Assert<Equal<Parameters<typeof Upstream0.getGlobalApi>['length'], 0>>;
type Contract41 = Assert<Equal<Parameters<typeof Upstream0.setGlobalApi>['length'], 1>>;
type Contract42 = Assert<Equal<Parameters<typeof Upstream0.registerPlugin>['length'], 1>>;
type Contract43 = Assert<Equal<Parameters<typeof Upstream0.unregisterPlugin>['length'], 1>>;
type Contract44 = Assert<Equal<Parameters<typeof Upstream1.init>['length'], 0 | 1>>;
type Contract45 = Assert<Equal<Parameters<typeof Upstream1.getStack>['length'], 1>>;
type Contract46 = Assert<Equal<Parameters<typeof Upstream1.formatElementInfo>['length'], 1 | 2>>;
type Contract47 = Assert<Equal<Parameters<typeof Upstream1.isInstrumentationActive>['length'], 0>>;
type Contract48 = Assert<
	Equal<keyof Pick<typeof Upstream1.DEFAULT_THEME, PublishedKeys0>, PublishedKeys0>
>;
type Contract49 = Assert<Equal<keyof Pick<Upstream1.Options, PublishedKeys3>, PublishedKeys3>>;
type Contract50 = Assert<
	Equal<keyof Pick<Upstream1.OverlayBounds, PublishedKeys8>, PublishedKeys8>
>;
type Contract51 = Assert<
	Equal<keyof Pick<Upstream1.ReactGrabRendererProps, PublishedKeys27>, PublishedKeys27>
>;
type Contract52 = Assert<Equal<keyof Pick<Upstream1.ReactGrabAPI, PublishedKeys4>, PublishedKeys4>>;
type Contract53 = Assert<Equal<keyof Pick<Upstream1.SourceInfo, PublishedKeys5>, PublishedKeys5>>;
type Contract54 = Assert<
	Equal<keyof Pick<Upstream1.AgentContext, PublishedKeys17>, PublishedKeys17>
>;
type Contract55 = Assert<
	Equal<keyof Pick<Upstream1.SettableOptions, PublishedKeys3>, PublishedKeys3>
>;
type Contract56 = Assert<
	Equal<keyof Pick<Upstream1.ContextMenuAction, PublishedKeys18>, PublishedKeys18>
>;
type Contract57 = Assert<
	Equal<keyof Pick<Upstream1.ActionContext, PublishedKeys20>, PublishedKeys20>
>;
type Contract58 = Assert<Equal<keyof Pick<Upstream1.Plugin, PublishedKeys1>, PublishedKeys1>>;
type Contract59 = Assert<
	Equal<keyof Pick<Upstream1.PluginConfig, PublishedKeys23>, PublishedKeys23>
>;
type Contract60 = Assert<
	Equal<keyof Pick<Upstream1.PluginHooks, PublishedKeys24>, PublishedKeys24>
>;
type Contract61 = Assert<Equal<Parameters<typeof Upstream1.generateSnippet>['length'], 1 | 2>>;
type Contract62 = Assert<Equal<Parameters<typeof Upstream1.copyContent>['length'], 1 | 2>>;
type Contract63 = Assert<Equal<keyof Pick<Upstream2.StackFrame, PublishedKeys28>, PublishedKeys28>>;
type Contract64 = Assert<
	Equal<keyof Pick<Upstream2.ElementAtPointOptions, PublishedKeys29>, PublishedKeys29>
>;
type Contract65 = Assert<
	Equal<keyof Pick<Upstream2.ElementBounds, PublishedKeys8>, PublishedKeys8>
>;
type Contract66 = Assert<
	Equal<keyof Pick<typeof Upstream2.OpenFileError, PublishedKeys2>, PublishedKeys2>
>;
type Contract67 = Assert<
	Equal<keyof Pick<Upstream2.ReactGrabElementContext, PublishedKeys30>, PublishedKeys30>
>;
type Contract68 = Assert<Equal<Parameters<typeof Upstream2.isElementGrabbable>['length'], 1>>;
type Contract69 = Assert<Equal<Parameters<typeof Upstream2.getElementBounds>['length'], 1>>;
type Contract70 = Assert<Equal<Parameters<typeof Upstream2.getElementSelector>['length'], 1>>;
type Contract71 = Assert<Equal<Parameters<typeof Upstream2.getElementContext>['length'], 1>>;
type Contract72 = Assert<Equal<Parameters<typeof Upstream2.copyContent>['length'], 1 | 2>>;
type Contract73 = Assert<Equal<Parameters<typeof Upstream2.getElementAtPoint>['length'], 2 | 3>>;
type Contract74 = Assert<Equal<Parameters<typeof Upstream2.getElementsAtPoint>['length'], 2 | 3>>;
type Contract75 = Assert<Equal<Parameters<typeof Upstream2.getElementsAtPosition>['length'], 2>>;
type Contract76 = Assert<Equal<Parameters<typeof Upstream2.freeze>['length'], 0 | 1>>;
type Contract77 = Assert<Equal<Parameters<typeof Upstream2.unfreeze>['length'], 0>>;
type Contract78 = Assert<Equal<Parameters<typeof Upstream2.isFreezeActive>['length'], 0>>;
type Contract79 = Assert<Equal<Parameters<typeof Upstream2.openFile>['length'], 1 | 2>>;
type Contract80 = Assert<
	Equal<keyof Pick<typeof Upstream2.FreezeError, PublishedKeys2>, PublishedKeys2>
>;
type Contract81 = Assert<Equal<Parameters<typeof Upstream2.disposeBaselineStyles>['length'], 0>>;
