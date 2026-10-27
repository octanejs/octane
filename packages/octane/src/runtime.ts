/**
 * octane runtime — template-clone renderer with React-shape state model.
 *
 * Architecture overview: see /README.md (project positioning + `.tsrx` syntax) and
 * the section headers throughout this file — the comments here are the design spec.
 *
 * Block = mount/unmount boundary (Root / control-flow / dynamic / portal).
 * Scope = per-call-site hook bag inside a Block.
 * Hooks key by compile-time Symbol per call site (conditional-safe).
 * State: React-shape immutable values + setters that schedule the enclosing Block.
 * Updates: microtask-flushed queue with automatic batching.
 * Effects: three-phase pipeline (insertion sync → layout sync → passive post-paint).
 * Reconciliation: LIS-based keyed list inside forBlock (ported from Ripple's patchKeyedChildrenComplex).
 */

// This module is the runtime's facade. The runtime lives in ./runtime/, one
// module per concept, and those modules are the source to edit. The exports
// below are the runtime's surface. `node scripts/split-runtime.mjs check`
// enforces the rules below on the split layout; the tool's map and its other
// commands were for the one-time split.
//
// The links before them pin evaluation order. First come this runtime's
// dependencies, in the order the single-file runtime imported them, then the
// last module of the chain. Each runtime module first names the module that
// evaluates before it, back to the first. A link that imports nothing is an
// empty re-export: esbuild warns about a bare import of a side-effect-free
// module, a named import would be unused, and an ESTree printer rewrites
// `import {} from` as a bare import. verbatimModuleSyntax keeps these links
// through every transpile. Rolldown emits modules in evaluation order, so the
// chain keeps every optional driver and module-scope constant above the reads
// oxc folds or inlines. A module-scope initializer reads only its own module,
// so no bundler's order can reach a binding before its declaration.

export {} from './hydration-flag.js';
export {} from './render-slice.js';
export {} from './hook-slot-cache.js';
export {} from './dom-binding-claims.js';
export {} from './dom-binding-styles.js';
export {} from './dom-binding-handoff.js';
export {} from './context-epoch.js';
export {} from './signals/control-handoff.js';
export {} from './constants.js';
export {} from './event-names.js';
export {} from './has-own.js';
export {} from './host-task.js';
export {} from './host-budget.js';
export {} from './head-ownership.js';
export {} from './resource-hint-diagnostics.js';
export {} from './aria-diagnostics.js';
export {} from './host-property-diagnostics.js';
export {} from './shared-value-helpers.js';
export {} from './hydration/replay-event.js';
export {} from './hydration/interaction-config.js';
export {} from './hydration/event-capture.js';
export {} from './hydration/control-capture.js';
export {} from './hydration/use-seeds.js';
export {} from './hydration/dev-values.js';
export {} from './sanitize-url.js';
export {} from './html-tree-validation.js';
export {} from './component-flags.js';
export {} from './error-codes.client.generated.js';
export {} from './form-diagnostics.js';
export {} from './dom-binding-protocol.js';
export {} from './hydration-protocol.js';
export {} from './runtime-tags.js';
export {} from './dom-focused-move.js';
export {} from './data-encoding.js';
export {} from './stream-protocol.js';
export {} from './renderer-bridge.js';
export {} from './context-identity.js';
export {} from './signals/native-read-client.js';
export {} from './signals/native-read-collector.js';
export {} from './signals/native-read-retry.js';
export {} from './signals/transition-state.js';
// The graph registers pending signal state by default; an islands build bundles it here.
export {} from '#octane/signal-actions/renderer';
export {} from './signals/read-protocol.js';
export {} from './signals/native-read-events.js';
export {} from './signals/native-read-seeds.js';
export {} from './signals/owner-context.js';
export {} from './signals/declaration-path.js';
export {} from './signals/document-owner.js';
export {} from './signals/early-values.js';
export {} from './signals/types.js';
// clsx-style `class`/`className` composition — shared with the SSR serializer
// via css.ts so client and server compose byte-equal class strings (hydration
// parity). Re-exported here because it is part of the semi-public surface.
export {} from './css.js';
export {} from './runtime/forms.js';

export type {
	ComponentBody,
	RendererRegionOwnerBridge,
	Scope,
	Block,
	ViewTransitionProps,
	ElementDescriptor,
	RootContainer,
} from './runtime/types.js';
export {
	enableSignalBindings,
	enableHostDescriptors,
	queueRefAttach,
	invokeManualHook,
	withSlot,
	useEffectEvent,
} from './runtime/drivers.js';
export {
	nativeStyleBinding,
	nativeProjectionBinding,
	enableNativeReadCollection,
	beginNativeReadScope,
	endNativeReadScope,
	beginNativeReadWitness,
	finishNativeReadWitness,
	replayNativeReadWitness,
	renderBlock,
} from './runtime/signal-owners.js';
export {
	queueRefDetach,
	replaceRef,
	queueOwnRefDetach,
	attachRef,
	FragmentInstance,
	mountFragmentRef,
} from './runtime/refs.js';
export {
	getRootRenderRetryKey,
	scheduleRenderCleanup,
	isInActScope,
	setIsOctaneActEnvironment,
	flushSync,
	__useCommittedState,
	__createDiscreteEventListener,
	act,
	useSyncExternalStore,
	useTransition,
} from './runtime/engine.js';
export { renderWritesForbidden, drainPassiveEffects, hasPendingWork } from './runtime/effects.js';
export {
	ViewTransitionPseudoElement,
	addTransitionType,
	__vtSeen,
} from './runtime/view-transition.js';
export type { ViewTransitionInstance } from './runtime/view-transition.js';
export {
	hookSlots,
	manualHook,
	callWithReceiver,
	signalHookSite,
	nativeLocalHook,
	useState,
	__useStateWithGetter,
	useLinkedState,
	__useLinkedStateWithGetter,
	useReducer,
	__useReducerWithGetter,
	useEffect,
	useLayoutEffect,
	useLayoutSnapshot,
	useInsertionEffect,
	useMemo,
	useCallback,
	hookMemoEqual,
	markCompilerMemo,
	compilerMemoWitness,
	compilerMemoRegion,
	hookMemoCreate,
	hookMemoPublish0,
	hookMemoPublish1,
	hookMemoPublish2,
	hookMemoPublish3,
	hookMemoPublish4,
	hookMemoPublish,
	hookMemoPublishInvariant,
	useRef,
	useLazyRef,
	useDebugValue,
	useImperativeHandle,
	useId,
} from './runtime/hooks.js';
export type { LinkedStatePrevious, LinkedStateOptions } from './runtime/hooks.js';
export {
	seedOrCreate,
	useBatch,
	registerWarmPlan,
	warmMemo,
	nativeWarmMemo,
	warmChild,
	markWarm,
	puMiss,
	puTake0,
	puTake1,
	puTake2,
	puTake3,
	puTake4,
	puPub,
	nativePuMemo,
	nativePuTake0,
	nativePuTake1,
	nativePuTake2,
	nativePuTake3,
	nativePuTake4,
	nativePuPub,
	memoSlot,
	memoTake0,
	memoTake1,
	memoTake2,
	memoTake3,
	memoTake4,
} from './runtime/use.js';
export { startTransition, useDeferredValue } from './runtime/transitions.js';
export {
	createContext,
	__createCompiledContext,
	createCompiledContext,
	CompiledContext,
	compilerOwnsContextProvider,
	renderClientContextProvider,
	use,
	useRendererThenable,
	useContext,
	bindRendererRegionOwner,
	createHostContextRequest,
	readContextFromScope,
	getRendererOwnerVisibility,
	reportRendererOwnerError,
} from './runtime/context.js';
export type { Context, ForeignHostContext } from './runtime/context.js';
export { portal, createPortal } from './runtime/portals.js';
export type { PortalDescriptor } from './runtime/portals.js';
export {
	Hydrate,
	__HydrateCompiled,
	__PermanentStaticHydrate,
} from './runtime/hydrate-boundary.js';
export {
	Suspense,
	ViewTransition,
	ErrorBoundary,
	__runOnCatch,
	TsrxErrorBoundary,
	setTransitionFallbackTimeout,
	getTransitionFallbackTimeout,
	errorBlock,
	tryBlock,
} from './runtime/suspense.js';
export { componentSlotLite, commitHostSources } from './runtime/render.js';
export {
	createRoot,
	__createRootDefaultOptions,
	__createVoidRoot,
	__createVoidRootDefaultOptions,
	__voidRootProps,
	hydrateRoot,
	__hydrateVoidRoot,
	createIndependentHydrateActivator,
} from './runtime/roots.js';
export type { Root, RootOptions } from './runtime/roots.js';
export {
	presentationFailure,
	beginPresentationHydration,
	endPresentationHydration,
	presentationHostWrite,
	renderWrite,
	presentationWrite,
	presentationFixedWrite,
	bindPresentationView,
	markBindingChildren,
	presentationStructure,
	setBindingClass,
	setBindingClassIfChanged,
	setEventHandler,
} from './runtime/hydration-presentation.js';
export {
	hydrateClaimedBindingCaches,
	bindSignalText,
	bindSignalAttribute,
	bindSignalValue,
	bindSignalChecked,
	bagRecordSignal,
	bindSignalHostPropSources,
	bindSignalChild,
} from './runtime/signal-bindings.js';
export {
	setText,
	setRenderText,
	setAttributeIfChanged,
	setPlainAttributeIfChanged,
	setURLAttributeIfChanged,
	setStringDataIfChanged,
	setBooleanAttributeIfChanged,
	setAriaAttributeIfChanged,
	setClassNameIfChanged,
	setClassAttrIfChanged,
	updateFreshClassName,
	updateFreshClassAttr,
	setScriptText,
	setHTML,
	setDangerouslySetInnerHTML,
	setDangerouslySetInnerHTMLSources,
	markDangerouslySetInnerHTMLChildren,
	setAttribute,
	setPlainAttribute,
	setURLAttribute,
	setStringData,
	setBooleanAttribute,
	setAriaAttribute,
	setClassName,
	setClassAttr,
	isHydratingStyle,
	styleObjectPrototype,
	canSplitStyleProperties,
	setStyle,
	setStyleProperty,
	setRenderStyle,
	setRenderStyleProperty,
	setStyleProperties,
	snapshotSpread,
	setHostPropSources,
	bagRecordHost,
	hostSourceChildren,
	setSpread,
	enableDescriptorFormActions,
} from './runtime/host-props.js';
export {
	Fragment,
	Activity,
	createScopedValue,
	isRenderCall,
	deferRecord,
	nativeCreateScopedValue,
	createScopedElement,
	nativeCreateScopedElement,
	createElement,
	createHostElement,
	createElementAt,
	createElementFromConfig,
	componentSlotFromConfig,
	isValidElement,
	cloneElement,
	Children,
} from './runtime/elements.js';
export type { OctaneNode } from './runtime/elements.js';
export { devHtmlNesting } from './runtime/diagnostics.js';
export {
	provideContext,
	markSingleRoot,
	markChildrenBlock,
	descriptorChildren,
	isChildrenBlock,
	memoPublish,
	memoPublishAlways,
	lazy,
	componentSlot,
	componentSlotVoid,
	componentSlotFunction,
	CompiledOutlet,
	compilerCacheContext,
	compilerOpaqueTag,
	memo,
	HMR,
	hmr,
} from './runtime/component-slots.js';
export type { CompiledComponent } from './runtime/component-slots.js';
export {
	compilerCacheArray,
	compilerCacheImmutableArrayFilter,
	compilerCacheMappedArray,
	mapSlot,
	bindingChildSlot,
	childSlot,
	textSlot,
	textHole,
	textHoleUpdate,
	childTextHoleUpdate,
	bagHole,
	bagChildHole,
	commitHole,
	childTextHole,
} from './runtime/child-slots.js';
export { ownSlotAnchor, ifBlock, switchBlock } from './runtime/branches.js';
export {
	positionalChildren,
	hostComponent,
	enableDescriptorFragmentRefs,
} from './runtime/deopt.js';
export { activityBlock } from './runtime/activity.js';
export type { FragmentProps } from './runtime/activity.js';
export {
	forBlock,
	keyedForBlock,
	fastForBlock,
	fastKeyedForBlock,
	fastMapSlot,
} from './runtime/lists.js';
export {
	headBlock,
	namespaceHead,
	namespaceHeadElement,
	injectStyle,
	preload,
	preinit,
	preconnect,
	prefetchDNS,
	preloadModule,
	preinitModule,
	stylesheetResource,
	styleResource,
	resetFloatResourceState,
	scriptResource,
} from './runtime/head.js';
export { bagRecord, bagDone } from './runtime/commit.js';
export {
	template,
	scriptTemplate,
	clone,
	drainFrag,
	bag0,
	bag1,
	bag2,
	bag3,
	bag4,
	bag5,
	bag6,
	bag7,
	bag8,
	bag9,
	bag10,
	bag11,
	bag12,
	bag13,
	bag14,
	bag15,
	bag16,
	bagOf,
	htext,
	htextSwap,
	textareaText,
	bindingText,
	child,
	sibling,
} from './runtime/templates.js';
export {
	requestFormReset,
	setFormAction,
	useActionState,
	useFormStatus,
	useOptimistic,
} from './runtime/actions.js';
export type { FormStatus } from './runtime/actions.js';
export {
	devEventListener,
	setEventSlot,
	commitEventBundle,
	evt0,
	evt0u,
	evt1,
	evt1u,
	evt2,
	evt2u,
	evt1e,
	evt2e,
	evtN,
	evtNu,
	delegateEvents,
	__delegateEvents,
	delegateCaptureEvents,
	__delegateCaptureEvents,
} from './runtime/events.js';
export {
	setAutoFocus,
	queueFormAuthoringDiagnostic,
	queueNativeChangeDiagnostic,
	markNativeChangeDiagnosticStatic,
	setValue,
	setChecked,
	setCheckedCheckable,
	setSelectValue,
	setDefaultValue,
	setDefaultValueUncontrolled,
	setDefaultChecked,
	setFormControlSources,
} from './runtime/forms.js';
export {
	documentSignalOwner,
	installStreamedSignalOwnerActivator,
} from './signals/document-owner.js';
export { EXTERNAL_HYDRATION_PROMISE, HYDRATION_RANGE_BOUNDARY } from './constants.js';
export { validateNativeReadWitness } from './signals/native-read-collector.js';
export { readNativeDomStyle, readNativeDomProps } from './signals/read-protocol.js';
export { normalizeClass } from './css.js';
